-- Migration: Table des entreprises découvertes pour la persistance
-- À appliquer après validation. Ne supprime aucune donnée existante.

create table if not exists public.cible_decouvertes_entreprises (
   siren text primary key check (siren ~ '^\d{9}$'),
   name text not null,
   commune text not null,
   code_postal text,
   departement text not null,
   naf text not null,
   naf_label text not null,
   naf_tier text not null check (naf_tier in ('cœur', 'énergie', 'connexe', 'hors cible')),
   tranche text not null,
   tranche_label text not null,
   size text not null check (size in ('micro', 'petite', 'PME', 'ETI', 'grande', 'inconnue')),
   date_creation text,
   website text,
   website_status text not null check (website_status in ('confirmed', 'probable', 'unconfirmed', 'inaccessible', 'none')),
   career_page text,
   stage_confirmed boolean,
   reasons text[] not null default '{}',
   missing text[] not null default '{}',
   score integer not null default 0,
   last_checked_at timestamptz not null default now(),
   found_at timestamptz not null default now(),
   found_by text not null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists idx_cible_decouvertes_entreprises_departement on public.cible_decouvertes_entreprises(departement);
create index if not exists idx_cible_decouvertes_entreprises_naf on public.cible_decouvertes_entreprises(naf);
create index if not exists idx_cible_decouvertes_entreprises_size on public.cible_decouvertes_entreprises(size);
create index if not exists idx_cible_decouvertes_entreprises_website_status on public.cible_decouvertes_entreprises(website_status);
create index if not exists idx_cible_decouvertes_entreprises_score on public.cible_decouvertes_entreprises(score);

-- Enable row level security
alter table public.cible_decouvertes_entreprises enable row level security;
revoke all on public.cible_decouvertes_entreprises from anon, authenticated;

-- Policies: allows service role to do everything, and allows authenticated users to read their own discoveries? 
-- But note: the discoveries are not tied to a user in the pilot. We'll allow authenticated users to read all discoveries for now.
create policy "Découvertes : lecture publique" on public.cible_decouvertes_entreprises
   for select using (true);

-- Policy for insert and update by service role only (since the discovery process runs as a service)
create policy "Découvertes : insertion service role" on public.cible_decouvertes_entreprises
   for insert with check (auth.role() = 'service_role');
create policy "Découvertes : mise à jour service role" on public.cible_decouvertes_entreprises
   for update using (auth.role() = 'service_role');
create policy "Découvertes : suppression service role" on public.cible_decouvertes_entreprises
   for delete using (auth.role() = 'service_role');

-- Grant permissions to service role
grant select, insert, update, delete on public.cible_decouvertes_entreprises to service_role;

-- Trigger for updated_at
create or replace function public.cible_set_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
   new.updated_at = now();
   return new;
end;
$$;

drop trigger if exists trigger_cible_decouvertes_entreprises_updated_at on public.cible_decouvertes_entreprises;
create trigger trigger_cible_decouvertes_entreprises_updated_at
   before update on public.cible_decouvertes_entreprises
   for each row execute function public.cible_set_updated_at();