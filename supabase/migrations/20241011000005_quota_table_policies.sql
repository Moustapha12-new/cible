-- ============================================================================
-- CIBLE — Policies for quota table (service_role access)
-- À exécuter APRÈS 20241011000001_initial_schema.sql
-- ============================================================================

-- The quota table has RLS enabled but no policies for service_role.
-- The RPC function (security definer) runs as the function owner.
-- If the function owner is not a superuser, RLS blocks access.
-- Grant explicit access to service_role for the quota table.

-- Ensure service_role can access the quota table
create policy "Service role can manage quota"
  on public.cible_api_quota for all
  to service_role
  using (true)
  with check (true);

-- Also grant to postgres (superuser) for safety
create policy "Postgres can manage quota"
  on public.cible_api_quota for all
  to postgres
  using (true)
  with check (true);