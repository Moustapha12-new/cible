-- P4-A. Additive only: apply to a dedicated preproduction project first.
-- Existing Gmail snapshots and cible_user_data are never modified.
create table if not exists public.cible_catalog_offers (
  user_id uuid not null,
  id text not null check (length(id) between 1 and 500),
  source_payload jsonb not null check (jsonb_typeof(source_payload) = 'object'),
  qualification jsonb,
  application_id text,
  dossier_id text,
  archived boolean not null default false,
  first_detected_at timestamptz,
  last_detected_at timestamptz,
  published_at timestamptz,
  title text not null,
  company text not null,
  location_text text not null default '',
  domain_text text not null default '',
  search_text text not null default '',
  source_types text[] not null default '{}',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists public.cible_catalog_import_batches (
  user_id uuid not null,
  batch_id text not null check (length(batch_id) between 1 and 150),
  source_name text not null,
  source_snapshot jsonb not null,
  imported_count integer not null,
  imported_at timestamptz not null default now(),
  primary key (user_id, batch_id)
);
create index if not exists cible_catalog_updated_idx on public.cible_catalog_offers (user_id, updated_at desc, id);
create index if not exists cible_catalog_archive_idx on public.cible_catalog_offers (user_id, archived, updated_at desc, id);
create index if not exists cible_catalog_company_idx on public.cible_catalog_offers (user_id, lower(company));
create index if not exists cible_catalog_search_idx on public.cible_catalog_offers using gin (to_tsvector('simple', search_text));
alter table public.cible_catalog_offers enable row level security;
alter table public.cible_catalog_import_batches enable row level security;
revoke all on public.cible_catalog_offers, public.cible_catalog_import_batches from anon, authenticated;
grant select on public.cible_catalog_offers, public.cible_catalog_import_batches to service_role;

create or replace function public.cible_import_catalog_batch(p_user_id uuid, p_batch_id text, p_source text, p_records jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb; old_record public.cible_catalog_offers; saved integer := 0; skipped integer := 0; prior public.cible_catalog_import_batches;
begin
  if p_user_id is null or length(p_batch_id) not between 1 and 150 or p_source not in ('local','server','gmail')
     or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 50 then
    raise exception 'Invalid catalog import batch';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 17));
  select * into prior from public.cible_catalog_import_batches where user_id=p_user_id and batch_id=p_batch_id;
  if found then
    if prior.source_snapshot <> p_records then raise exception 'Import batch ID reused with different content'; end if;
    return jsonb_build_object('saved',0,'skipped',prior.imported_count,'replayed',true);
  end if;
  for r in select value from jsonb_array_elements(p_records) loop
    if jsonb_typeof(r) <> 'object' or length(coalesce(r->>'id','')) not between 1 and 500
       or length(coalesce(r->>'title','')) > 1000 or length(coalesce(r->>'company','')) > 1000 then
      raise exception 'Invalid catalog offer';
    end if;
    select * into old_record from public.cible_catalog_offers where user_id=p_user_id and id=r->>'id' for update;
    if found then
      -- Source facts may improve; manual decisions and links remain authoritative.
      update public.cible_catalog_offers set
        source_payload = jsonb_set(old_record.source_payload || (r - 'qualification' - 'applicationId' - 'dossierId' - 'archived'),
          '{sources}', (select coalesce(jsonb_agg(distinct source_ref),'[]'::jsonb)
                        from jsonb_array_elements(coalesce(old_record.source_payload->'sources','[]'::jsonb) || coalesce(r->'sources','[]'::jsonb)) source_ref)),
        qualification = case when r ? 'qualification' and (
          old_record.qualification is null or
          coalesce(nullif(r->'qualification'->>'updatedAt','')::timestamptz, '-infinity'::timestamptz) >
          coalesce(nullif(old_record.qualification->>'updatedAt','')::timestamptz, '-infinity'::timestamptz)
        ) then r->'qualification' else old_record.qualification end,
        application_id = coalesce(old_record.application_id, nullif(r->>'applicationId','')),
        dossier_id = coalesce(old_record.dossier_id, nullif(r->>'dossierId','')),
        title = coalesce(nullif(r->>'title',''), old_record.title),
        company = coalesce(nullif(r->>'company',''), old_record.company),
        location_text = coalesce(nullif(r->>'location',''), old_record.location_text),
        domain_text = coalesce(nullif(r->>'domain',''), old_record.domain_text),
        search_text = coalesce(nullif(r->>'searchText',''), old_record.search_text),
        source_types = array(select distinct unnest(old_record.source_types || array[p_source])),
        last_detected_at = greatest(old_record.last_detected_at, nullif(r->>'detectedAt','')::timestamptz),
        updated_at = now(), version = old_record.version + 1
      where user_id=p_user_id and id=r->>'id';
      skipped := skipped + 1;
    else
      insert into public.cible_catalog_offers(user_id,id,source_payload,qualification,application_id,dossier_id,
        archived,first_detected_at,last_detected_at,published_at,title,company,location_text,domain_text,search_text,source_types)
      values(p_user_id,r->>'id',r,r->'qualification',nullif(r->>'applicationId',''),nullif(r->>'dossierId',''),false,
        nullif(r->>'detectedAt','')::timestamptz,nullif(r->>'detectedAt','')::timestamptz,
        nullif(r->>'publishedAt','')::timestamptz,coalesce(r->>'title',''),coalesce(r->>'company',''),
        coalesce(r->>'location',''),coalesce(r->>'domain',''),coalesce(r->>'searchText',''),array[p_source]);
      saved := saved + 1;
    end if;
  end loop;
  insert into public.cible_catalog_import_batches(user_id,batch_id,source_name,source_snapshot,imported_count)
    values(p_user_id,p_batch_id,p_source,p_records,saved+skipped);
  return jsonb_build_object('saved',saved,'skipped',skipped,'replayed',false);
end;
$$;
revoke all on function public.cible_import_catalog_batch(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.cible_import_catalog_batch(uuid,text,text,jsonb) to service_role;
