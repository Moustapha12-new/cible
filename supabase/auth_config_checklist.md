# CIBLE — Configuration Supabase Auth
# À configurer dans Supabase Dashboard > Authentication > Settings

# ============================================================================
-- 1. GENERAL SETTINGS
-- ============================================================================

Site URL: https://cible-mu.vercel.app

Redirect URLs (Authorized redirect URIs):
  - https://cible-mu.vercel.app/connexion
  - https://cible-mu.vercel.app/api/auth/confirm
  - https://cible-mu.vercel.app/api/gmail/auth/callback

-- Pour le développement local (optionnel, à ajouter si besoin) :
-- http://localhost:3000/connexion
-- http://localhost:3000/api/auth/confirm
-- http://localhost:3000/api/gmail/auth/callback

# ============================================================================
-- 2. EMAIL PROVIDER
-- ============================================================================

Enable Email provider: ✅ ON

Double confirm email changes: ✅ ON (recommandé)

Secure email change: ✅ ON (recommandé)

SMTP Settings (OBLIGATOIRE - ne pas utiliser le SMTP de test Supabase) :
  - Host: smtp.votre-fournisseur.com (ex: smtp.sendgrid.net, smtp.mailgun.org, smtp.resend.com)
  - Port: 587 (STARTTLS) ou 465 (SSL)
  - Username: votre_api_key_smtp
  - Password: votre_mot_de_passe_smtp
  - Sender name: Cible
  - Sender email: noreply@votre-domaine.com

# IMPORTANT : Le SMTP de test Supabase ne fonctionne pas en production.
# Configurez un vrai fournisseur : SendGrid, Mailgun, Resend, Postmark, etc.

# ============================================================================
-- 3. EMAIL TEMPLATES
-- ============================================================================

-- Confirm signup (Confirmation d'inscription)
Subject: Confirme ton inscription sur Cible

Body (HTML):
```
<h2>Bienvenue sur Cible !</h2>
<p>Clique sur le lien ci-dessous pour confirmer ton adresse e-mail :</p>
<p><a href="{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirmer mon adresse</a></p>
<p>Ce lien expire dans 24 heures.</p>
<p>Si tu n'as pas créé de compte, ignore cet e-mail.</p>
```

-- Ou version minimale (si le template par défaut est utilisé avec Site URL correct) :
-- Le template par défaut fonctionne SI Site URL est correct et Redirect URLs inclut /api/auth/confirm

# ============================================================================
-- 4. EMAIL CONFIRMATION SETTINGS
-- ============================================================================

Enable email confirmations: ✅ ON

Email confirmation redirect to:
  - https://cible-mu.vercel.app/connexion?confirmation=ok

-- Pour le développement local :
-- http://localhost:3000/connexion?confirmation=ok

# ============================================================================
-- 5. PASSWORD SETTINGS
-- ============================================================================

Password min length: 8 (correspond à la validation côté client)

Enable password strength meter: ✅ ON

# ============================================================================
-- 6. SESSION SETTINGS
-- ============================================================================

JWT expiry limit: 3600 (1 heure - par défaut)

Refresh token rotation: ✅ ON (recommandé)

Refresh token reuse interval: 10 secondes

# ============================================================================
-- 7. SECURITY SETTINGS
-- ============================================================================

Enable CAPTCHA on signup: Désactivé (optionnel, selon besoins)

Enable MFA: Désactivé (peut être activé plus tard)

# ============================================================================
-- 8. PROVIDERS
-- ============================================================================

Email: ✅ ON (configuré ci-dessus)

Google OAuth: ✅ ON (pour connexion Gmail)
  - Client ID: depuis Google Cloud Console
  - Client Secret: depuis Google Cloud Console
  - Authorized redirect URIs:
    - https://cible-mu.vercel.app/api/gmail/auth/callback
    - (développement) http://localhost:3000/api/gmail/auth/callback

# ============================================================================
-- 9. RATE LIMITS (Dashboard > Auth > Rate Limits)
-- ============================================================================

Email signup: 3 par heure par IP (par défaut)
Email signin: 10 par heure par IP
Password recovery: 2 par heure par IP
Email change: 5 par heure par IP

# ============================================================================
-- 10. HOOKS (optionnel, pour futur)
-- ============================================================================

-- Post-registration hook : pour initialiser données par défaut si nécessaire
-- (pas requis pour l'instant, l'application gère côté client)

# ============================================================================
-- ACTIONS À EFFECTUER DANS SUPABASE DASHBOARD
-- ============================================================================

☐ 1. Créer le projet (déjà fait : ucgetwemaxigkblzvndo)
☐ 2. Configurer Site URL et Redirect URLs (General > Settings)
☐ 3. Configurer SMTP réel (Auth > Settings > SMTP Settings)
☐ 4. Mettre à jour template "Confirm signup" (Auth > Email Templates)
☐ 5. Configurer Google OAuth (Auth > Providers > Google)
☐ 6. Exécuter 01_tables.sql dans SQL Editor
☐ 7. Exécuter 02_rpc_functions.sql dans SQL Editor
☐ 8. Créer bucket "cible-gmail-storage" (Storage > New bucket)
    - Privé, 10 MB, types MIME autorisés
☐ 9. Exécuter 03_storage_policies.sql (après création bucket)
☐ 10. Créer bucket "cible-documents" (Storage > New bucket)
    - Privé, 8 MB, types MIME PDF/DOCX/TXT/images
☐ 11. Exécuter 03_storage_policies.sql (après création bucket)
☐ 12. Configurer variables d'environnement Vercel (voir .env.template)
☐ 13. Tester inscription → confirmation email → connexion
☐ 14. Tester connexion Gmail (OAuth + sync)
☐ 14. Tester sauvegarde données utilisateur (user-data API)

# ============================================================================
-- VARIABLES D'ENVIRONNEMENT VERCEL (Production)
-- ============================================================================

# Dans Vercel > Settings > Environment Variables (Production)

SUPABASE_URL=https://ucgetwemaxigkblzvndo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_XXXXXXXXXXXXXXXXXXXXXXXX
SUPABASE_BUCKET=cible-gmail-storage

GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx

GMAIL_ENC=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (32+ chars, hex ou base64)

GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

BLOB_READ_WRITE_TOKEN=vercel_blob_rw_XXXXXXXXXXXXXXXXXXXXXX

GMAIL_STORAGE_PROVIDER=supabase
GMAIL_MAX_MESSAGES=2000
GMAIL_ENRICH_MAX=40

# Optionnel (si différent)
SUPABASE_SECRET_KEY=
SUPABASE_ANON_KEY=