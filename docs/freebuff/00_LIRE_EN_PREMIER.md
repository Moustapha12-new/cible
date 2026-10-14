# CIBLE. — ORDRE DE MISSION POUR FREEBUFF

Tu disposes de la version locale du dépôt `cible.` déjà reconstruite par Antigravity puis réparée pour la page « Mes offres » par Freebuff. **Tu dois implémenter deux chantiers dans le code existant : (2) extraction et enrichissement exhaustifs des annonces dans Gmail, (3) optimisation fidèle du CV aux annonces.** Ne refais ni le design des trois pages, ni le site de zéro. Préserve les API Gmail, Gemini, Supabase, Vercel et les sources persistées ; n'introduis pas de faux contenu. Le propriétaire du dépôt prend lui-même en charge la question distincte de la sécurité Git : cette mission ne porte PAS sur ce sujet.

## Documents obligatoires à lire entièrement, dans cet ordre

1. `01_EXTRACTION_ET_ENRICHISSEMENT.md` — architecture et règles métier du pipeline d'offres.
2. `02_CV_MOTEUR_EXPERT.md` — adaptation basée sur preuves, gestion des versions et PDF.
3. `METHODE_CV_ORIGINALE.md` — **texte intégral de la méthode ChatGPT fournie par l'utilisateur**, toutes les parties (1351 lignes environ). Ce fichier fait autorité pour la stratégie éditoriale ; il ne suffit pas d'en lire le début.
4. `03_TESTS_ET_CRITERES.md` — critères d'acceptation et preuves demandées.
5. `fixtures/manifest.json` + les trois fichiers `.eml` anonymisés : cas de test réels, fidèles à la structure des emails Indeed, LinkedIn et HelloWork. Les URLs de suivi ont été remplacées pour le partage : pour la résolution réelle d'URL, tester sur les messages originaux accessibles dans le compte connecté et uniquement avec autorisation.

## Constat produit, à ne pas contourner

L'audit Freebuff a constaté que la nouvelle page CV utilise encore des expériences et compétences de démonstration, que plusieurs routes serveur existantes sont déconnectées de l'interface et que l'archive PDF réelle n'est pas utilisée. La page Offres a été recâblée vers un snapshot serveur et le mode démo a été désactivé par défaut, mais le parcours réel Gmail dépend encore d'une session authentifiée. Inspecte l'état actuel du code plutôt que de considérer ces constats comme immuables.

## Ordre d'exécution (implémentation, pas seulement plan)

**Phase A — Pipeline Gmail** : inspecte les modules existants, implémente les parseurs multi-offres avec provenance et déduplication, puis les tests des fixtures. Prouve 8 Indeed + 10 LinkedIn + 8 HelloWork sans fausses offres. Conserve un état « non enrichi » explicite si la page est inaccessible.

**Phase B — Enrichissement** : relie chaque offre à son lien individuel, parcours de redirections lorsqu'accessibles, extraction de la fiche complète, traçabilité de la source des informations et relances sélectives. Ne considère jamais « l'email a été traité » comme synonyme de « toutes les offres sont enrichies ». Pas de collecte qui contourne une authentification ou un CAPTCHA.

**Phase C — Moteur CV** : réutilise les routes métier existantes ; reconnecte le vrai CV maître, ses faits et son PDF ; implémente l'analyse de l'offre, la correspondance aux preuves, le plan de changement structuré, la comparaison avant/après et le rendu PDF contrôlé. En aucun cas la démo ne doit devenir une source de vérité.

**Phase D — Validation de bout en bout** : dans l'interface existante, un utilisateur sélectionne une annonce extraite → lit ses missions/compétences → adapte son vrai CV → contrôle les modifications → exporte un PDF fidèle. Les tests sans compte authentifié doivent rester marqués comme simulés. Fournis la liste des fichiers modifiés, résultats de tests, blocages et preuves.

Préserve les changements non commités et les anciens modules fiables ; ne publie pas la production sans consentement. Travaille par étapes vérifiables et économise les appels IA : parsing déterministe d'abord, Gemini seulement pour les opérations qui exigent une interprétation.
