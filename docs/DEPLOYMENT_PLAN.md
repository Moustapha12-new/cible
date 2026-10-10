# Cible — plan de mise en production (11 octobre 2026)

Statut : préparation seulement. Aucun commit, push, changement Vercel ou déploiement autorisé dans cette session.

## Conditions avant déploiement

1. Dans **Supabase Auth** du projet `ucgetwemaxigkblzvndo`, vérifier Site URL `https://cible-mu.vercel.app`, confirmation e-mail activée, redirection `/connexion`, template de confirmation (par défaut Supabase ou `token_hash` vers `/api/auth/confirm`) et capacité SMTP d'envoyer un e-mail de test. La lecture seule de `/auth/v1/settings` confirme que l'inscription est ouverte et que la confirmation est exigée ; elle ne confirme pas les URLs ou SMTP.
2. Dans **Google Cloud**, vérifier l'URI autorisée exacte `https://cible-mu.vercel.app/api/gmail/auth/callback`, l'API Gmail activée et les comptes de test OAuth autorisés si l'application est en mode test. Le code demande `gmail.readonly`, `access_type=offline`, `prompt=select_account consent` et un `state` CSRF.
3. Dans **Vercel Production**, vérifier manuellement les **valeurs** de `SUPABASE_URL` (nouveau projet), `SUPABASE_SERVICE_ROLE_KEY` (clé privée du même projet), `SUPABASE_BUCKET=cible-gmail-storage`, `GMAIL_STORAGE_PROVIDER=supabase`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_ENC` (compatible avec les connexions déjà chiffrées). Les noms sont présents ; les valeurs n'ont pas pu être lues par l'agent. Ne pas créer `SUPABASE_SECRET_KEY` avec une ancienne clé : elle prendrait priorité. Si une Preview doit servir aux tests, y ajouter les quatre variables Supabase manquantes avec les valeurs d'un environnement de test autorisé.
4. Préparer un compte cible et une boîte Gmail de **test**. Ne pas utiliser la boîte personnelle sans nouvelle autorisation. Le bucket Gmail neuf étant vide, prévoir une nouvelle autorisation Google ; ne pas changer `GMAIL_ENC` pour forcer une reconnexion.
5. Avant tout commit/push, retirer des fichiers suivis les anciens journaux et scripts de diagnostic si leur contenu est privé. `.env.local`, `.gmail-tokens/`, `supabase/.temp/` et `validation-sql.json` sont ignorés ; l'historique Git contient encore d'anciens fichiers `.gmail-tokens`, donc un nouveau commit ordinaire n'efface pas leur exposition passée. Révoquer toute clé précédemment exposée.

## Séquence après autorisations distinctes

1. Enregistrer l'identifiant du déploiement Production actuellement actif et les réglages d'environnement dans un espace sécurisé ; conserver les données Supabase et Storage sans modification destructive.
2. Déployer une Preview **après** configuration de ses variables et tester inscription → confirmation → connexion → session au rechargement, puis OAuth avec la boîte de test → rechargement → expiration/refresh → libellé → synchronisation → offres/qualification → réimport sans doublon. Vérifier que deux comptes de test ne voient pas les données l'un de l'autre.
3. Après validation de la Preview et accord de mise en production, déployer sur Production et refaire le parcours minimal avec des comptes de test. Contrôler les journaux d'erreur et les volumes d'offres sans lire d'e-mails personnels.

## Retour arrière

Si le nouveau déploiement échoue, rétablir le déploiement Production précédent avec **Vercel Rollback** et vérifier l'application. Les migrations Supabase sont additives : **ne pas supprimer les tables, les buckets ou les objets** pour revenir en arrière. Si des variables Vercel ont été modifiées, les remettre à leurs valeurs précédemment sauvegardées, puis redéployer si nécessaire : un rollback de code ne garantit pas à lui seul le retour des valeurs d'environnement. Préserver `GMAIL_ENC` avec les connexions chiffrées correspondantes.
