-- Additive schema. Review and apply before deploying the auth/API batch.
-- Contains no production data, credentials or changes to Gmail Storage objects.
create table if not exists public.cible_api_quota (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null check (hits >= 0)
);
alter table public.cible_api_quota enable row level security;
revoke all on public.cible_api_quota from anon, authenticated;

create or replace function public.cible_take_quota(p_key text, p_limit integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare count_now integer; current_window timestamptz := date_trunc('minute', clock_timestamp());
begin
  if p_limit < 1 or p_limit > 120 or length(p_key) > 256 then
    raise exception 'Invalid quota configuration';
  end if;
  insert into public.cible_api_quota as q (key, window_start, hits)
    values (p_key, current_window, 1)
  on conflict (key) do update set
    window_start = current_window,
    hits = case when q.window_start = current_window
      then least(q.hits + 1, p_limit + 1) else 1 end
  returning hits into count_now;
  return count_now <= p_limit;
end;
$$;
revoke all on function public.cible_take_quota(text, integer) from public, anon, authenticated;
grant execute on function public.cible_take_quota(text, integer) to service_role;

create table if not exists public.cible_sync_lease (
  owner text primary key, token text not null, expires_at timestamptz not null
);
alter table public.cible_sync_lease enable row level security;
revoke all on public.cible_sync_lease from anon, authenticated;
create or replace function public.cible_take_sync_lease(p_owner text, p_token text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare taken integer;
begin
  insert into public.cible_sync_lease as l values (p_owner, p_token, clock_timestamp() + interval '6 minutes')
  on conflict (owner) do update set token = excluded.token, expires_at = excluded.expires_at
    where l.expires_at <= clock_timestamp();
  get diagnostics taken = row_count;
  return taken = 1;
end;
$$;
create or replace function public.cible_release_sync_lease(p_owner text, p_token text)
returns void language sql security definer set search_path = public, pg_temp as $$
  delete from public.cible_sync_lease where owner = p_owner and token = p_token;
$$;
revoke all on function public.cible_take_sync_lease(text, text) from public, anon, authenticated;
revoke all on function public.cible_release_sync_lease(text, text) from public, anon, authenticated;
grant execute on function public.cible_take_sync_lease(text, text) to service_role;
grant execute on function public.cible_release_sync_lease(text, text) to service_role;

create table if not exists public.cible_user_data (
 user_id uuid primary key, data jsonb not null, version integer not null, updated_at timestamptz not null default now()
);
create table if not exists public.cible_user_data_history (
 user_id uuid not null, version integer not null, data jsonb not null, archived_at timestamptz not null default now(), primary key (user_id,version)
);
alter table public.cible_user_data enable row level security;
alter table public.cible_user_data_history enable row level security;
revoke all on public.cible_user_data, public.cible_user_data_history from anon, authenticated;
create or replace function public.cible_save_user_data(p_user_id uuid, p_version integer, p_data jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare current_row public.cible_user_data; next_version integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
 select * into current_row from public.cible_user_data where user_id=p_user_id for update;
 if found then
   if current_row.version <> p_version then return null; end if;
   insert into public.cible_user_data_history(user_id,version,data) values(p_user_id,current_row.version,current_row.data);
 elsif p_version <> 0 then return null;
 end if;
 next_version := p_version + 1;
 insert into public.cible_user_data(user_id,data,version) values(p_user_id,p_data,next_version)
 on conflict(user_id) do update set data=excluded.data,version=excluded.version,updated_at=now();
 return next_version;
end;
$$;
revoke all on function public.cible_save_user_data(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.cible_save_user_data(uuid,integer,jsonb) to service_role;

grant select on public.cible_user_data, public.cible_user_data_history to service_role;
