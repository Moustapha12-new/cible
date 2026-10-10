-- ============================================================================
-- CIBLE — Buckets Storage privés
-- À exécuter dans l'éditeur SQL de Supabase APRÈS 01_tables.sql
-- ============================================================================

-- Les buckets doivent être créés via l'interface Supabase (Storage > Buckets)
-- car l'API SQL ne permet pas la création de buckets directement.
--
-- Cependant, les politiques RLS peuvent être configurées ici une fois
-- les buckets créés manuellement.

-- ============================================================================
-- BUCKET 1 : cible-gmail-storage
-- Usage : Tokens OAuth Gmail, snapshots, checkpoints, état local
-- ============================================================================
-- Nom exact : cible-gmail-storage
-- Public : NON (privé)
-- File size limit : 10 MB
-- Allowed MIME types : application/json, text/plain, application/octet-stream

-- Politiques RLS pour le bucket cible-gmail-storage
-- (À appliquer APRÈS création manuelle du bucket via l'UI Supabase)

-- Lecture : propriétaire uniquement
create policy "Users can read own Gmail storage"
  on storage.objects for select
  using (
    bucket_id = 'cible-gmail-storage'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Écriture : propriétaire uniquement
create policy "Users can write own Gmail storage"
  on storage.objects for insert
  with check (
    bucket_id = 'cible-gmail-storage'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Mise à jour : propriétaire uniquement
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
-- File size limit : 8 MB (selon config API)
-- Allowed MIME types : application/pdf, application/msword,
--   application/vnd.openxmlformats-officedocument.wordprocessingml.document,
--   application/vnd.oasis.opendocument.text, text/plain,
--   image/png, image/jpeg, image/webp

-- Politiques RLS pour le bucket cible-documents

-- Lecture : propriétaire uniquement (basé sur le préfixe du chemin)
create policy "Users can read own documents"
  on storage.objects for select
  using (
    bucket_id = 'cible-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Écriture : propriétaire uniquement
create policy "Users can write own documents"
  on storage.objects for insert
  with check (
    bucket_id = 'cible-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Mise à jour : propriétaire uniquement
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
create policy "Users can delete own documents"
  on storage.objects for delete
  using (
    bucket_id = 'cible-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- Structure des dossiers (convention d'application)
-- ============================================================================
--
-- cible-gmail-storage/
--   {user_id}/
--     oauth.json          -- Connexion Gmail chiffrée
--     snapshot.json       -- Snapshot dashboard
--     checkpoints/        -- Checkpoints Gmail par message ID
--     runs/               -- Historique runs
--
-- cible-documents/
--   {user_id}/
--     {document_id}/
--       {version_id}.pdf  -- Fichiers versionnés
--       metadata.json     -- Métadonnées document
--
-- ============================================================================
-- Note : Ces politiques supposent que l'application structure les chemins
-- avec l'user_id comme premier segment : {user_id}/...
-- L'application utilise déjà cette convention dans gmail-server.ts et
-- document-storage.ts
-- ============================================================================