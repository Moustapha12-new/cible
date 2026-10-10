# Validation préproduction — 10 octobre 2026

## Verdict

**Non prêt pour le déploiement.** Le lot de correction locale est compilé et testé, mais l’intégration Supabase Auth/SMTP/PostgREST/Gmail avec des comptes de test autorisés n’a pas été réalisée. Les anciens secrets/données de l’historique Git restent sensibles. Aucun commit, push ou déploiement effectué.

## Périmètre réel

Validation sur une copie isolée de la copie de travail actuelle, sans `.env.local` ni production. Cette copie inclut les changements non validés antérieurs ; le test ne prouve pas leur fonctionnement sur la production actuelle. La clé Gemini déjà configurée a été lue sans être affichée ; seules des annonces synthétiques lui ont été envoyées. Les fixtures Gmail n’ont envoyé aucune requête à une vraie boîte.

Un défaut d’isolation a été détecté : les répertoires d’anciennes sauvegardes `_backup_secrets_*` étaient initialement copiés. Ils ont été mis à l’écart dans un répertoire privé temporaire avant toute exécution Gemini. Les originaux restent intacts. Les suites ont été relancées sans ces copies ; le test optionnel dépendant de l’ancien corpus privé est alors ignoré.

## Changements du premier lot, vérifiés puis reportés dans le projet

| Fichier | Correction |
|---|---|
| `src/lib/offer-quality.ts` | Missions et compétences obligatoires ; rubrique de prérequis facultative lorsque l’offre est exploitable. |
| `src/lib/pfe-target.ts` | Six mois écrit en lettres, janvier/mars 2027 marqués « à vérifier », maintenance industrielle, gaz, géothermie, biomasse et pétrole reconnus. |
| `src/lib/data.ts` | Lecture ou structure locale invalide signalée ; empêche la création/remplacement automatique d’un dossier existant illisible. Migration des anciens dossiers v2 conservant la copie précédente. |
| `src/lib/gmail-snapshot.ts`, `src/app/api/gmail/dashboard/route.ts` | Catalogue illisible signalé et protégé contre l’écrasement par une nouvelle synchronisation ; erreur servie comme erreur et non comme catalogue vide. |
| `src/lib/audit-behavior.test.ts`, `src/lib/preprod-validation.test.ts`, `src/lib/preprod-user-data.test.ts`, `src/lib/gemini-live.test.ts`, `scripts/validate-preprod-sql.mjs` | Tests de comportement, d’API/données, de SQL et d’intégration Gemini reproductibles. |
| `.gitignore`, `.vercelignore` | Exclusion des dépendances temporaires de validation. |

Aucune nouvelle fonctionnalité produit développée pendant cette validation. Aucune donnée utilisateur supprimée.

## Commandes et résultats réellement exécutés

- `npm ci --no-audit --no-fund` dans la copie isolée : 428 dépendances installées.
- `npm install --prefix .validation-tools --no-audit --no-fund @electric-sql/pglite` dans la copie isolée : PGlite 0.5.8 installé pour PostgreSQL local ; Docker présent mais démon indisponible.
- `node scripts/validate-preprod-sql.mjs` : **8/8 passés**. Script SQL original installé et rejoué ; seuil du quota, comptes distincts, bail exclusif/token/expiration, historique et restauration CV/candidatures, conflit de version, rôles anonymes refusés, rôle serveur autorisé. PGlite sérialise ses appels ; ce résultat ne prouve pas une charge multiprocessus Supabase réelle.
- `node scripts/test-security.mjs preprod-validation preprod-user-data audit-behavior auth-security gmail-core gmail-module2 gmail-bridge gmail-storage gmail-sync-batch cv-design cv-keywords grounded-offer offer-location scrape text-repair` : **15 suites passées** après corrections et retrait des sauvegardes privées ; `preprod-validation` **27/27**, puis **28/28** après ajout du scénario d’interruption du second checkpoint ; `gmail-core` **143/143**, `gmail-module2` **71 passés, un test optionnel ignoré** en absence de corpus privé, autres suites sans échec. `preprod-user-data` exerce les handlers réels avec une couche Auth/REST de test reliée au SQL PGlite : deux utilisateurs, 401/403, 200/409, sauvegarde/restauration de CV et candidatures.
- `node scripts/test-security.mjs gemini-live`, lancé uniquement avec la clé configurée dans l’environnement du processus : **2 appels réels, HTTP 200**, modèle `gemini-3-flash-preview`. Un e-mail synthétique produit deux offres distinctes et conserve les deux URLs fournies ; une annonce synthétique donne missions et compétences. Dans ces exemples, durée/date/salaire/profil inconnus ne sont pas inventés. Ce contrôle ne garantit pas qu’aucune génération future ne puisse inventer un fait.
- `npm run lint` : zéro erreur/avertissement. `npm run build` : compilation de production réussie avec dépendances installées localement (la première tentative a échoué à cause d’un lien de dépendances hors du dossier Next ; environnement corrigé, code inchangé).
- Serveur local issu du build : 14 API privées répondent JSON 401 sans session ; `/app/alertes-gmail` redirige vers la connexion.
- `node scripts/audit-repository.mjs` : index courant zéro fichier privé suivi/signature détectée. `--history` : échec attendu, **484 versions de fichiers privés et une clé Supabase historique**.

### Scénarios effectivement contrôlés

Le Gmail synthétique sur HTTP récupère deux offres dans un e-mail, conserve les URL distinctes et reprend après un lot limité. Une panne injectée à l’écriture du second checkpoint laisse le premier enregistré et permet de reprendre le second sans relire le premier. L’enrichissement complet/partiel/impossible a trois états distincts ; un champ absent dans les exemples reste vide. Une offre valide sans rubrique « prérequis » est complète. Un catalogue ancien conserve ses offres et rétrograde un faux `ok` ; un catalogue illisible n’est plus écrasé. Un dossier local v2 conserve CV maître/adapté, candidature envoyée et copie ancienne ; lecture refusée, JSON corrompu ou stockage plein n’effacent rien.

Le corpus PFE vérifie : ingénieur compatible, technicien, alternance, CDI, durée absente, six mois en lettres, janvier/mars et septembre 2027, nucléaire, renouvelable, maintenance industrielle, automatisme, gaz, localisation absente/hors France. Les villes connues Paris/Bordeaux et d’autres régions restent dans la recherche France. Les branches énergétiques sont reconnues par vocabulaire, sans garantie exhaustive sur toutes les formulations futures.

## Vérifications impossibles et risques restants

- **Gmail réel** : aucun compte/boîte de test autorisé ni OAuth test communiqué. Pas de lecture de la boîte personnelle en production, donc permissions Google, étiquette, rafraîchissement de token et pagination réelle non vérifiés.
- **Supabase réel de préproduction** : aucun projet isolé communiqué ; SQL non appliqué à la production. Confirmation e-mail/SMTP/template, `getUser` réel, cookies sur HTTPS, RLS/PostgREST et concurrence de plusieurs instances restent à vérifier.
- **Parcours navigateur authentifié** : pas de session test connectée. Boutons de sauvegarde/restauration, CV imprimé une page et parcours complet de candidature non testés dans un navigateur authentifié pendant cette phase.
- **Secrets** : 484 anciennes versions privées et une ancienne clé subsistent dans l’historique ; les clés déjà partagées doivent être inventoriées puis renouvelées. Aucune rotation effectuée. `GMAIL_ENC` requiert une sauvegarde et une réencryption coordonnée avant changement.
- **Données locales historiques** : la clé de stockage porte l’adresse, mais une ancienne copie locale n’a pas de preuve cryptographique de propriétaire. Le nouveau dossier serveur est lié à l’UUID vérifié ; l’import d’une ancienne copie doit rester explicite et vérifié.
- **IA** : deux cas synthétiques passés ne prouvent pas l’absence universelle d’invention. La confirmation humaine reste indispensable avant d’envoyer CV/candidature.
- Sauvegarde serveur de dossier encore explicite, sans synchronisation automatique ; la version SQL est préparée et testée localement seulement.

## Autorisations et retour arrière

La demande interdit commit, push et déploiement sans accord. Le nettoyage de l’historique Git, la révocation/rotation de clés et tout changement de services de production doivent faire l’objet d’une validation explicite. Les essais sur un compte Gmail de test et un projet Supabase de préproduction nécessitent leurs identifiants autorisés ; aucune clé ne doit être collée dans le chat.

Avant toute mise en production : export des catalogues Supabase Storage et dossiers, conservation de l’ancienne version Vercel, test de migration sur copies, vérification du compte propriétaire. En cas de régression après un déploiement ultérieurement approuvé : restaurer la version Vercel précédente, rétablir les variables antérieures pertinentes, et conserver les tables/objets nouveaux pour récupération des données. Ne pas restaurer `GMAIL_ENC` indépendamment des connexions chiffrées. Pour annuler **ce seul lot local**, les six fichiers antérieurs ont été sauvegardés et vérifiés par SHA-256 dans le répertoire privé temporaire `validation-rollback` ; remettre ces fichiers et retirer les nouveaux tests après accord, sans `git reset` global car la copie de travail contenait déjà d’autres changements.

**Conclusion : non prêt pour le déploiement**, en raison des vérifications réelles Auth/Supabase/Gmail manquantes et des secrets historiques encore exposés. Le premier lot local est prêt pour revue.
