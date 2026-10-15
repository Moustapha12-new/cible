-- Migration: Table des candidatures pour persistance multi-appareils
-- À appliquer après validation. Ne supprime aucune donnée existante.

create table if not exists public.cible_candidatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  offer_id text,
  company text not null,
  role text not null,
  status text not null check (status in ('sent','interview','offer','rejected')),
  source text not null default 'cible',
  cv_name text,
  cv_text text,
  date timestamptz not null default now(),
  notes text,
  sent_cv_adaptation_id text,
  sent_document_versions jsonb not null default '[]'::jsonb,
  status_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cible_candidatures enable row level security;
revoke all on public.cible_candidatures from anon, authenticated;

create index if not exists idx_cible_candidatures_user_id on public.cible_candidatures(user_id);
create index if not exists idx_cible_candidatures_offer_id on public.cible_candidatures(offer_id);
create index if not exists idx_cible_candidatures_date on public.cible_candidatures(date desc);

-- RLS: l'utilisateur ne voit que ses propres candidatures
create policy "Candidatures : lecture propre" on public.cible_candidatures
  for select using (auth.uid() = user_id);
create policy "Candidatures : insertion propre" on public.cible_candidatures
  for insert with check (auth.uid() = user_id);
create policy "Candidatures : mise à jour propre" on public.cible_candidatures
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Candidatures : suppression propre" on public.cible_candidatures
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.cible_candidatures to service_role;

-- Trigger pour updated_at
create or replace function public.cible_set_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_cible_candidatures_updated_at on public.cible_candidatures;
create trigger trigger_cible_candidatures_updated_at
  before update on public.cible_candidatures
  for each row execute function public.cible_set_updated_at();

-- Fonction pour upsert candidature (anti-doublon par offer_id + user_id)
create or replace function public.cible_upsert_candidature(
  p_user_id uuid,
  p_offer_id text,
  p_company text,
  p_role text,
  p_status text,
  p_source text,
  p_cv_name text,
  p_cv_text text,
  p_date timestamptz,
  p_notes text,
  p_sent_cv_adaptation_id text,
  p_sent_document_versions jsonb,
  p_status_history jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  -- Tentative de mise à jour existante par offer_id + user_id
  if p_offer_id is not null then
    update public.cible_candidatures
    set company = p_company,
        role = p_role,
        status = p_status,
        source = p_source,
        cv_name = p_cv_name,
        cv_text = p_cv_text,
        date = p_date,
        notes = p_notes,
        sent_cv_adaptation_id = p_sent_cv_adaptation_id,
        sent_document_versions = p_sent_document_versions,
        status_history = p_status_history,
        updated_at = now()
    where user_id = p_user_id and offer_id = p_offer_id
    returning id into v_id;
    
    if found then return v_id; end if;
  end if;
  
  -- Sinon insertion
  insert into public.cible_candidatures (
    user_id, offer_id, company, role, status, source, cv_name, cv_text,
    date, notes, sent_cv_adaptation_id, sent_document_versions, status_history
  ) values (
    p_user_id, p_offer_id, p_company, p_role, p_status, p_source, p_cv_name, p_cv_text,
    p_date, p_notes, p_sent_cv_adaptation_id, p_sent_document_versions, p_status_history
  ) returning id into v_id;
  
  return v_id;
end;
$$;

revoke all on function public.cible_upsert_candidature(uuid,text,text,text,text,text,text,text,timestamptz,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.cible_upsert_candidature(uuid,text,text,text,text,text,text,text,timestamptz,text,text,jsonb,jsonb) to service_role;