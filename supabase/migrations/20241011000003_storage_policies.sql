-- ============================================================================
-- CIBLE — buckets privés et politiques Storage (Migration 3)
-- ============================================================================

-- ============================================================================
-- BUCKET 1 : cible-gmail-storage
-- Usage : Tokens OAuth Gmail, snapshots, checkpoints, état local
-- ============================================================================
-- Nom exact : cible-gmail-storage
-- Public : NON (privé)
-- File size limit : 10 MB
-- Allowed MIME types : application/json, text/plain, application/octet-stream

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cible-gmail-storage', 'cible-gmail-storage', false, 10485760,
        array['application/json', 'text/plain', 'application/octet-stream'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cible-documents', 'cible-documents', false, 8388608,
        array['application/pdf', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.oasis.opendocument.text', 'text/plain',
          'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

do $$ begin
  if exists (select 1 from storage.buckets where id in ('cible-gmail-storage', 'cible-documents') and public) then
    raise exception 'CIBLE requires private Storage buckets';
  end if;
end $$;

-- Lecture : propriétaire uniquement
drop policy if exists "Users can read own Gmail storage" on storage.objects;
create policy "Users can read own Gmail storage"
  on storage.objects for select
  using (
    bucket_id = 'cible-gmail-storage'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Écriture : propriétaire uniquement
drop policy if exists "Users can write own Gmail storage" on storage.objects;
create policy "Users can write own Gmail storage"
  on storage.objects for insert
  with check (
    bucket_id = 'cible-gmail-storage'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Mise à jour : propriétaire uniquement
drop policy if exists "Users can update own Gmail storage" on storage.objects;
create policy "Users can update own Gmail storage"
  on storage.objects for update
  using (
    bucket_id = 'cible-gmail-storage'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'cible-gmail-storage'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Suppression : propriétaire uniquement
drop policy if exists "Users can delete own Gmail storage" on storage.objects;
create policy "Users can delete own Gmail storage"
  on storage.objects for delete
  using (
    bucket_id = 'cible-gmail-storage'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- BUCKET 2 : cible-documents
-- Usage : Documents candidats (CV, lettres, pièces jointes)
-- ============================================================================
-- Nom exact : cible-documents
-- Public : NON (privé)
-- File size limit : 8 MB
-- Allowed MIME types : application/pdf, application/msword,
--   application/vnd.openxmlformats-officedocument.wordprocessingml.document,
--   application/vnd.oasis.opendocument.text, text/plain,
--   image/png, image/jpeg, image/webp

-- Lecture : propriétaire uniquement
drop policy if exists "Users can read own documents" on storage.objects;
create policy "Users can read own documents"
  on storage.objects for select
  using (
    bucket_id = 'cible-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Écriture : propriétaire uniquement
drop policy if exists "Users can write own documents" on storage.objects;
create policy "Users can write own documents"
  on storage.objects for insert
  with check (
    bucket_id = 'cible-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Mise à jour : propriétaire uniquement
drop policy if exists "Users can update own documents" on storage.objects;
create policy "Users can update own documents"
  on storage.objects for update
  using (
    bucket_id = 'cible-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'cible-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Suppression : propriétaire uniquement
drop policy if exists "Users can delete own documents" on storage.objects;
create policy "Users can delete own documents"
  on storage.objects for delete
  using (
    bucket_id = 'cible-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
