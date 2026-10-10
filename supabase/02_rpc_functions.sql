-- ============================================================================
-- CIBLE — Fonctions RPC (PostgreSQL)
-- À exécuter dans l'éditeur SQL de Supabase APRÈS 01_tables.sql
-- ============================================================================

-- ============================================================================
-- 1. Sauvegarde données utilisateur (optimistic locking)
-- ============================================================================
create or replace function public.cible_save_user_data(
  p_user_id uuid,
  p_version integer,
  p_data jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_version integer;
begin
  -- Tentative de mise à jour avec version exacte (optimistic lock)
  update public.cible_user_data
  set
    data = p_data,
    version = version + 1,
    updated_at = now()
  where user_id = p_user_id
    and version = p_version
  returning version into v_new_version;

  if found then
    return v_new_version;
  end if;

  -- Échec : version différente (conflit) ou ligne inexistante
  -- Vérifier si la ligne existe
  if exists (select 1 from public.cible_user_data where user_id = p_user_id) then
    return null; -- Conflit de version (409 côté client)
  end if;

  -- Première insertion
  insert into public.cible_user_data (user_id, version, data)
  values (p_user_id, 1, p_data)
  returning version into v_new_version;

  return v_new_version;
end;
$$;

-- ============================================================================
-- 2. Quota atomique (sliding window 1 min)
-- ============================================================================
create or replace function public.cible_take_quota(
  p_key text,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
begin
  -- Nettoyage entrées expirées (best effort)
  delete from public.cible_quotas where expires_at < v_now;

  -- Fenêtre glissante : 60 secondes
  v_window_start := v_now - interval '60 seconds';

  -- Tentative d'incrémentation atomique
  with upserted as (
    insert into public.cible_quotas (key, count, window_start, expires_at)
    values (p_key, 1, v_window_start, v_now + interval '2 minutes')
    on conflict (key) do update set
      count = case
        when cible_quotas.window_start < v_window_start then 1
        else cible_quotas.count + 1
      end,
      window_start = case
        when cible_quotas.window_start < v_window_start then v_window_start
        else cible_quotas.window_start
      end,
      expires_at = v_now + interval '2 minutes'
    returning count
  )
  select count into v_count from upserted;

  return v_count <= p_limit;
end;
$$;

-- ============================================================================
-- 3. Verrou de synchronisation (acquisition atomique)
-- ============================================================================
create or replace function public.cible_take_sync_lease(
  p_owner text,
  p_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_expires timestamptz := v_now + interval '5 minutes';
begin
  -- Nettoyage verrous expirés
  delete from public.cible_sync_leases where expires_at < v_now;

  -- Tentative d'insertion (échec si owner existe déjà avec verrou valide)
  insert into public.cible_sync_leases (owner, token, acquired_at, expires_at)
  values (p_owner, p_token, now(), v_expires)
  on conflict (owner) do update set
    token = case
      when cible_sync_leases.expires_at < v_now then excluded.token
      else cible_sync_leases.token
    end,
    acquired_at = case
      when cible_sync_leases.expires_at < v_now then excluded.acquired_at
      else cible_sync_leases.acquired_at
    end,
    expires_at = case
      when cible_sync_leases.expires_at < v_now then excluded.expires_at
      else cible_sync_leases.expires_at
    end
  where cible_sync_leases.expires_at < v_now
    or cible_sync_leases.token = excluded.token;

  -- Vérifier si on a obtenu le verrou
  return exists (
    select 1 from public.cible_sync_leases
    where owner = p_owner and token = p_token and expires_at > v_now
  );
end;
$$;

-- ============================================================================
-- 4. Libération verrou (avec vérification token)
-- ============================================================================
create or replace function public.cible_release_sync_lease(
  p_owner text,
  p_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.cible_sync_leases
  where owner = p_owner and token = p_token;
end;
$$;

-- ============================================================================
-- 5. Import catalogue par lots (P4)
-- ============================================================================
create or replace function public.cible_import_catalog_batch(
  p_user_id uuid,
  p_offers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer jsonb;
  v_count integer := 0;
  v_skipped integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if p_offers is null or jsonb_typeof(p_offers) <> 'array' then
    return jsonb_build_object(
      'created', 0,
      'skipped', 0,
      'errors', jsonb_build_array('Invalid input: expected JSON array')
    );
  end if;

  for v_offer in select * from jsonb_array_elements(p_offers)
  loop
    begin
      -- Construire la clé de déduplication
      declare
        v_dedup_key text := lower(v_offer->>'title') || '|' || lower(v_offer->>'company') || '|' || lower(coalesce(v_offer->>'location_city', v_offer->>'location', ''));
        v_url_key text;
      begin
        if v_offer->>'canonical_url' is not null then
          v_url_key := lower(v_offer->>'canonical_url');
        end if;
      end;

      -- Tentative d'insertion
      insert into public.cible_catalog_offers (
        user_id,
        dedup_key,
        url_dedup_key,
        title,
        company,
        location_city,
        location_region,
        location_country,
        contract_type,
        duration_months,
        start_date,
        salary,
        description,
        missions,
        required_skills,
        desired_skills,
        prerequisites,
        domain_primary,
        domain_secondary,
        technical_keywords,
        source_type,
        source_native_id,
        canonical_url,
        raw_url,
        detected_at,
        last_synced_at,
        enrich_status,
        enrich_error
      ) values (
        p_user_id,
        v_dedup_key,
        v_url_key,
        v_offer->>'title',
        v_offer->>'company',
        v_offer->>'location_city',
        v_offer->>'location_region',
        coalesce(v_offer->>'location_country', 'France'),
        v_offer->>'contract_type',
        nullif(v_offer->>'duration_months', '')::int,
        nullif(v_offer->>'start_date', '')::date,
        v_offer->>'salary',
        v_offer->>'description',
        (v_offer->'missions')::text[],
        (v_offer->'required_skills')::text[],
        (v_offer->'desired_skills')::text[],
        (v_offer->'prerequisites')::text[],
        v_offer->>'domain_primary',
        (v_offer->'domain_secondary')::text[],
        (v_offer->'technical_keywords')::text[],
        v_offer->>'source_type',
        v_offer->>'source_native_id',
        v_offer->>'canonical_url',
        v_offer->>'raw_url',
        coalesce(nullif(v_offer->>'detected_at', '')::timestamptz, now()),
        nullif(v_offer->>'last_synced_at', '')::timestamptz,
        coalesce(v_offer->>'enrich_status', 'none'),
        v_offer->>'enrich_error'
      )
      on conflict (user_id, dedup_key) do update set
        url_dedup_key = coalesce(excluded.url_dedup_key, cible_catalog_offers.url_dedup_key),
        title = excluded.title,
        company = excluded.company,
        location_city = excluded.location_city,
        location_region = excluded.location_region,
        location_country = excluded.location_country,
        contract_type = excluded.contract_type,
        duration_months = excluded.duration_months,
        start_date = excluded.start_date,
        salary = excluded.salary,
        description = excluded.description,
        missions = excluded.missions,
        required_skills = excluded.required_skills,
        desired_skills = excluded.desired_skills,
        prerequisites = excluded.prerequisites,
        domain_primary = excluded.domain_primary,
        domain_secondary = excluded.domain_secondary,
        technical_keywords = excluded.technical_keywords,
        canonical_url = excluded.canonical_url,
        raw_url = excluded.raw_url,
        last_synced_at = excluded.last_synced_at,
        enrich_status = excluded.enrich_status,
        enrich_error = excluded.enrich_error,
        updated_at = now()
      returning 1 into v_count;

      if v_count = 1 then
        v_count := v_count + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('error', sqlerrm, 'offer', v_offer->>'title');
      v_skipped := v_skipped + 1;
    end;
  end loop;

  return jsonb_build_object(
    'created', v_count,
    'skipped', v_skipped,
    'errors', v_errors
  );
end;
$$;

-- ============================================================================
-- Droits d'exécution pour les rôles authentifiés
-- ============================================================================
grant execute on function public.cible_save_user_data(uuid, integer, jsonb) to authenticated;
grant execute on function public.cible_take_quota(text, integer) to authenticated;
grant execute on function public.cible_take_sync_lease(text, text) to authenticated;
grant execute on function public.cible_release_sync_lease(text, text) to authenticated;
grant execute on function public.cible_import_catalog_batch(uuid, jsonb) to authenticated;

-- ============================================================================
-- Fonction utilitaire : nettoyage périodique (à appeler via pg_cron ou job externe)
-- ============================================================================
create or replace function public.cible_cleanup_expired()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.cible_quotas where expires_at < now();
  delete from public.cible_sync_leases where expires_at < now();
end;
$$;