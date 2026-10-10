-- ============================================================================
-- CIBLE — Tables de base
-- À exécuter dans l'éditeur SQL de Supabase (SQL Editor)
-- ============================================================================

-- Extension pour UUID
create extension if not exists "pgcrypto";

-- ============================================================================
-- Table : Données utilisateur (JSON versionné)
-- ============================================================================
create table if not exists public.cible_user_data (
  user_id uuid not null primary key references auth.users(id) on delete cascade,
  version integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index pour requêtes fréquentes
create index if not exists idx_cible_user_data_updated_at on public.cible_user_data (updated_at desc);

-- Trigger pour updated_at automatique
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trigger_cible_user_data_updated_at on public.cible_user_data;
create trigger trigger_cible_user_data_updated_at
  before update on public.cible_user_data
  for each row execute function public.handle_updated_at();

-- RLS : chaque utilisateur ne voit que ses propres données
alter table public.cible_user_data enable row level security;

drop policy if exists "Users can view own data" on public.cible_user_data;
create policy "Users can view own data"
  on public.cible_user_data for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own data" on public.cible_user_data;
create policy "Users can insert own data"
  on public.cible_user_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own data" on public.cible_user_data;
create policy "Users can update own data"
  on public.cible_user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own data" on public.cible_user_data;
create policy "Users can delete own data"
  on public.cible_user_data for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- Table : Catalogue permanent des offres (P4)
-- ============================================================================
create table if not exists public.cible_catalog_offers (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Identité canonique
  dedup_key text not null,
  url_dedup_key text,
  title text not null,
  company text not null,
  location_city text,
  location_region text,
  location_country text not null default 'France',
  contract_type text,
  duration_months integer,
  start_date date,
  salary text,
  description text,
  missions text[],
  required_skills text[],
  desired_skills text[],
  prerequisites text[],
  domain_primary text,
  domain_secondary text[],
  technical_keywords text[],
  -- Source
  source_type text not null,
  source_native_id text not null,
  canonical_url text,
  raw_url text,
  detected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  enrich_status text not null default 'none',
  enrich_error text,
  -- Qualification (P3-D)
  qualification_state text,
  qualification_priority integer default 0,
  qualification_note text,
  shortlist_position integer,
  justification text,
  info_to_verify text[],
  -- Liaisons
  application_id uuid,
  dossier_id uuid,
  -- Métadonnées
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index pour recherche et déduplication
create unique index if not exists idx_cible_catalog_offers_dedup on public.cible_catalog_offers (user_id, dedup_key);
create index if not exists idx_cible_catalog_offers_url_dedup on public.cible_catalog_offers (user_id, url_dedup_key) where url_dedup_key is not null;
create index if not exists idx_cible_catalog_offers_user_created on public.cible_catalog_offers (user_id, created_at desc);
create index if not exists idx_cible_catalog_offers_qualification on public.cible_catalog_offers (user_id, qualification_state);
create index if not exists idx_cible_catalog_offers_domain on public.cible_catalog_offers (user_id, domain_primary);
create index if not exists idx_cible_catalog_offers_location on public.cible_catalog_offers (user_id, location_city, location_region);
create index if not exists idx_cible_catalog_offers_enrich on public.cible_catalog_offers (enrich_status);
create index if not exists idx_cible_catalog_offers_shortlist on public.cible_catalog_offers (user_id, shortlist_position) where shortlist_position is not null;

-- Trigger updated_at
drop trigger if exists trigger_cible_catalog_offers_updated_at on public.cible_catalog_offers;
create trigger trigger_cible_catalog_offers_updated_at
  before update on public.cible_catalog_offers
  for each row execute function public.handle_updated_at();

-- RLS : isolation par utilisateur
alter table public.cible_catalog_offers enable row level security;

drop policy if exists "Users can view own offers" on public.cible_catalog_offers;
create policy "Users can view own offers"
  on public.cible_catalog_offers for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own offers" on public.cible_catalog_offers;
create policy "Users can insert own offers"
  on public.cible_catalog_offers for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own offers" on public.cible_catalog_offers;
create policy "Users can update own offers"
  on public.cible_catalog_offers for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own offers" on public.cible_catalog_offers;
create policy "Users can delete own offers"
  on public.cible_catalog_offers for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- Table : Quotas (atomicité via RPC)
-- ============================================================================
create table if not exists public.cible_quotas (
  key text not null primary key,
  count integer not null default 0,
  window_start timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_cible_quotas_expires on public.cible_quotas (expires_at);

alter table public.cible_quotas enable row level security;

-- Pas de politiques RLS directes : accès uniquement via RPC avec security definer

-- ============================================================================
-- Table : Verrous de synchronisation
-- ============================================================================
create table if not exists public.cible_sync_leases (
  owner text not null primary key,
  token text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_cible_sync_leases_expires on public.cible_sync_leases (expires_at);

alter table public.cible_sync_leases enable row level security;

-- Accès uniquement via RPC (security definer)

-- ============================================================================
-- Table : Connexions Gmail OAuth (chiffrées côté application)
-- ============================================================================
create table if not exists public.cible_gmail_connections (
  user_id uuid not null primary key references auth.users(id) on delete cascade,
  gmail_email text not null,
  access_token text not null, -- chiffré côté app
  refresh_token text, -- chiffré côté app
  expires_at timestamptz not null,
  label_id text,
  label_name text,
  last_sync timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trigger_cible_gmail_connections_updated_at on public.cible_gmail_connections;
create trigger trigger_cible_gmail_connections_updated_at
  before update on public.cible_gmail_connections
  for each row execute function public.handle_updated_at();

alter table public.cible_gmail_connections enable row level security;

drop policy if exists "Users can view own gmail connection" on public.cible_gmail_connections;
create policy "Users can view own gmail connection"
  on public.cible_gmail_connections for select
  using (auth.uid() = user_id);

drop policy if exists "Users can upsert own gmail connection" on public.cible_gmail_connections;
create policy "Users can upsert own gmail connection"
  on public.cible_gmail_connections for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own gmail connection" on public.cible_gmail_connections;
create policy "Users can update own gmail connection"
  on public.cible_gmail_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- Nettoyage automatique (optionnel, via pg_cron ou job externe)
-- ============================================================================
-- delete from public.cible_quotas where expires_at < now();
-- delete from public.cible_sync_leases where expires_at < now();