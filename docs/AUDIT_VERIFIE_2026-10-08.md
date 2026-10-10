# Audit vérifié dans le code actuel — 8 octobre 2026

Les onze constats ont été confrontés au code actuel. Corrections locales des six lots réalisées ; **aucun déploiement**, aucune suppression de production, aucune révocation ni réécriture Git. Les modifications antérieures sont conservées.

## Résultats

| Constat | Vérification et résultat local |
|---|---|
| P0-1 Authentification/API | Risque confirmé : ancienne session/mots de passe navigateur et API sans contrôle serveur. Supabase Auth, utilisateur confirmé, cookies HttpOnly, contrôle serveur des pages/API, CSRF, quotas partagés et accès par propriétaire ajoutés. Auth/SMTP réels restent à configurer et tester avant déploiement. |
| P0-2 Données/secrets | Le dossier privé était déjà ignoré, mais 242 fichiers restaient suivis. Retirés du suivi avec sauvegarde privée hors dépôt et empreintes locales identiques ; aucun fichier local effacé. Index courant : zéro fichier privé suivi et zéro signature de secret. Historique : 484 versions privées et une ancienne clé Supabase, encore présents ; nettoyage/révocation après accord. |
| P0-3 Complétude | Un titre/page accessible pouvait suffire à « enrichie ». Le cache refusait déjà partial, contrairement à l’ancien audit. Désormais titre, description significative, missions, compétences et prérequis/profil requis. Anciens faux ok remis à compléter sans effacer leurs données. Cache complet, daté et isolé par compte. |
| P0-4 Permission Gmail | Commentaire trompeur confirmé. Corrigé : Google autorise la lecture de la boîte, Cible choisit les messages du libellé ; aucun élargissement des droits. |
| P1-1 Plafond Gmail | Défaut actuel 2 000, pas 500. Curseur persistant par compte/libellé ajouté : avance après traitement durable de la fenêtre ; nouveaux messages consultés pendant le rattrapage ; token expiré repris. Test d’une archive fictive de 2 050 messages. |
| P1-2 Persistance/verrou | Erreurs masquées et verrou non atomique confirmés. Échecs de sauvegarde remontés, cache par requête, verrou Supabase atomique avec bail six minutes/libération par token, aucun secours permissif. SQL préparé, non installé ni vérifié sur une vraie base. |
| P1-3 PFE | Défaut alternance/coupe à 24 confirmés. Cible : stage ingénieur, six mois, février 2027, France, énergie/électricité ; recherche nucléaire, renouvelables, réseaux/automatisme étendue. Filtre Gmail ciblé/confirmé/toutes offres. Critères absents à vérifier, incompatibilités explicites écartées de la vue ciblée ; catalogue conservé. |
| P1-4 ATS | Score lexical interne confirmé. Affichage correspondance interne, aucune promesse d’ATS recruteur/probabilité d’embauche. Expressions entières : Git ne correspond plus à digital. Champs internes conservés pour compatibilité. |
| P2-1 Dossiers navigateur | Dépendance locale confirmée. Export JSON privé, sauvegarde serveur par UUID vérifié/version avec historique, conflit contrôlé, restauration avec copie locale préalable. **Sauvegarde explicite, pas migration automatique ni synchronisation continue.** SQL requis avant usage serveur ; données locales conservées, échec local signalé. |
| P2-2 Preuves | Confirmation de maîtrise déjà présente, preuve/autonomie absentes. Registre démontrée/déclarée/étudiée/à vérifier/non acquise ajouté avec preuve/autonomie ; démontrée exige preuve renseignée. IA informée de ces statuts ; une preuve utilisateur n’est pas une certification externe. |
| P2-3 Modules utiles | Dashboard, géographie, dossiers, lettres, suivi, deux designs CV A4 conservés et testés. Connexion démo à mot de passe public retirée des données privées. Anciennes fonctions Supabase directes inutilisées de data.ts retirées au profit de l’API authentifiée ; aucune table/document supprimé. |

## Conservation et sécurité

- Compte Cible et boîte Gmail peuvent rester différents. Recréer/confirmer le compte sécurisé avec la **même adresse Cible** conserve l’accès aux dossiers locaux. Anciennes sessions/mots de passe locaux ignorés, aucune purge.
- OAuth lié au compte serveur et au navigateur. Identité vérifiée selon la [documentation officielle Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser).
- Checkpoints/caches nouveaux isolés par propriétaire. Anciens checkpoints globaux non importés automatiquement car leur propriétaire n’est pas prouvé ; catalogues propres au compte et objets existants conservés.
- Exclusions d’archive/déploiement et scan sans affichage de secrets ajoutés. Archive vérifiée : zéro entrée privée connue. CI historique échouera tant que les anciens commits restent sensibles.
- Clé historique différente de la clé locale : cela ne prouve pas sa révocation. Ne jamais changer GMAIL_ENC seul sans sauvegarder/réencrypter les connexions.

## Tests

Copie isolée, dépendances installées, aucune variable privée ni donnée Gmail réelle copiée. TypeScript, compilation production et lint réussis ; lint sans avertissement.

13 suites passées : audit-behavior, auth-security, gmail-core, gmail-module2, gmail-bridge, gmail-storage, gmail-sync-batch, cv-design, cv-keywords, grounded-offer, offer-location, scrape, text-repair. Un test optionnel ignoré : ancienne sauvegarde privée absente de l’environnement isolé.

Contrôles : sessions absentes/falsifiées/non confirmées, accès croisés, CSRF, appartenance des messages, OAuth, quotas absents/épuisés, isolation concurrente des checkpoints, cache par compte, pannes de sauvegarde, bail/token, reprise au-delà de 2 000 messages, qualité, corpus PFE contradictoire, expressions entières, conservation des CV originaux/envoyés.

Tests fournisseurs sur fixtures uniquement. Le test de bail valide le contrat API, **pas la concurrence PostgreSQL réelle**. Aucun essai SMTP, OAuth Gmail réel, Gemini réel ou vraie base ; aucune production modifiée.

## Validation requise avant production

1. Après accord, sauvegarder un miroir Git privé et nettoyer l’historique dans une copie séparée : retirer chemins privés et clé historique, rescanner et présenter le résultat. Aucun push forcé avant accord spécifique ; aucun objet Gmail de production supprimé.
2. Identifier les consommateurs des clés exposées, puis renouveler avec accord et vérification ; chiffrement Gmail traité avec sauvegarde/réencryption coordonnée.
3. Sur environnement séparé, activer confirmation e-mail/SMTP et configurer Site URL/redirections. Template : {{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=email. Vérifier le propriétaire et ses dossiers locaux.
4. Installer docs/security-rpc.sql sur environnement de test, puis vérifier droits, quotas/baux concurrents et conflits/historique de sauvegarde avec une vraie base. Le script ajoute des tables/fonctions sans modifier les objets Gmail.
5. Tester connexion Gmail, reprise interrompue, panne de stockage, anciennes fiches et dossier CV une page. Informations inconnues à vérifier, jamais inventées.
6. Présenter les résultats d’intégration et obtenir validation **avant déploiement production**. Ne pas déployer avant fonctionnement réel du SQL/Auth requis.

Les corrections locales sont prêtes à revoir ; nettoyage historique, configuration des services et validation de production restent ouverts.
