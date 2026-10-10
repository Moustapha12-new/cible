# Stockage Gmail avec Supabase

Le serveur utilise le bucket **privé** `cible-gmail-storage` pour les connexions OAuth chiffrées, les checkpoints des messages, les analyses d’annonces et le catalogue mis en cache. Les liens, descriptions et mots-clés extraits sont conservés : une analyse réussie est réutilisée pendant les synchronisations normales.

Variables serveur dans `.env.local` ou dans l’environnement du déploiement :

```dotenv
GMAIL_STORAGE_PROVIDER=supabase
SUPABASE_URL=https://<projet>.supabase.co
SUPABASE_BUCKET=cible-gmail-storage
SUPABASE_SERVICE_ROLE_KEY=<clé privée du projet>
GMAIL_MAX_MESSAGES=2000
```

`SUPABASE_SECRET_KEY` est aussi accepté et prend priorité sur `SUPABASE_SERVICE_ROLE_KEY`. Ne pas conserver une ancienne clé sous ce nom. Ne jamais préfixer une clé privée par `NEXT_PUBLIC_`. Les clés `sb_secret_` utilisent l’en-tête `apikey` ; les anciennes clés JWT `service_role` utilisent également `Authorization`.

La configuration Supabase incomplète produit une erreur explicite et ne bascule pas sur Vercel Blob. Le bucket doit rester privé. La clé `GMAIL_ENC` sert au chiffrement des connexions existantes : la changer sans migration rend ces connexions illisibles.

Diagnostic sans affichage des clés :

```sh
node scripts/probe-supabase.mjs
```

L’option `--create-bucket` crée le bucket privé seulement s’il manque. Le diagnostic écrit un fichier temporaire, vérifie sa lecture puis le supprime.

Le catalogue est compressé au-delà de 512 Ko ; la taille décompressée est bornée à 20 Mo. Les anciens catalogues JSON restent lisibles. L’interface affiche 24 offres par page et recherche aussi dans leurs mots-clés. La limite de 2 000 porte sur les **messages** Gmail, qui peuvent chacun contenir plusieurs offres. La première synchronisation peut rester longue puisqu’elle extrait et analyse les nouvelles annonces ; les suivantes réutilisent les checkpoints et le catalogue.

Sur Vercel, appliquer les mêmes variables serveur et redéployer pour qu’elles prennent effet. Les changements de `.env.local` ne modifient pas les variables du déploiement. Une nouvelle connexion Google reste nécessaire lorsqu’aucun token Gmail n’a été enregistré dans le nouveau stockage.
