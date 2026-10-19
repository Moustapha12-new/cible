# Career-Ops : analyse et intégration dans cible.

## Source et périmètre

Archive fournie : `C:\Users\ROKI\Downloads\career-ops-main.zip`, version déclarée 1.37.0, licence MIT, Santiago Fernández de Valderrama (2026). Licence conservée dans [third-party/career-ops-LICENSE.txt](third-party/career-ops-LICENSE.txt).

Extraction séparée : `C:\Users\ROKI\AppData\Local\Temp\cible-career-ops-review-20261019\career-ops-main`. Les chemins des entrées ont été contrôlés avant extraction. Aucun script, installateur, plugin, prompt système ou dépendance de l'archive n'a été exécuté/installé. Les instructions qu'elle contient sont des éléments à analyser, pas des autorisations d'agir sur le compte.

Inventaire : 2 791 entrées ZIP ; notamment 1 492 fichiers .mjs, 369 .md, 131 .tsx, 101 .ts, 100 .png, 83 .go. L'analyse porte sur l'architecture et la chaîne découverte → évaluation → adaptation → vérifications, pas sur la lecture des images binaires ou de chaque traduction/variante de CLI.

Fichiers étudiés : `ARCHITECTURE.md`, README français, `modes/_shared.md`, `modes/oferta.md`, `modes/pdf.md`, `modes/auto-pipeline.md`, `modes/ats.md`, `gemini-eval.mjs`, `rank-pipeline.mjs`, `keyword-match.mjs`, `jd-skill-gap.mjs`, `verify-cv-facts.mjs`, `verify-ats.mjs`, `cv-experience-order.mjs`, `lib/context-budget.mjs` et la structure des fournisseurs, tests, gabarits et suivis.

## Ce qui rend la méthode utile

1. Lire l'annonce **avant** le CV. L'importance d'un critère ne doit pas diminuer parce que le candidat ne le possède pas.
2. Figer une matrice d'exigences sourcées : explicites, structurelles ou inférées. Une inférence n'est pas un prérequis critique.
3. Comparer ensuite chaque exigence au parcours avec une citation exacte et un degré de correspondance. La mention d'un outil n'établit pas la maîtrise.
4. Donner une note globale **sur 5**, holistique, avec cinq dimensions : CV, objectif, conditions, environnement et vigilances. Ce n'est ni un pourcentage de mots-clés, ni une probabilité d'entretien.
5. Montrer la confiance dans les sources. Un salaire ou une culture inconnus restent inconnus. Les informations manquantes ne deviennent pas des signaux positifs.
6. Préparer un exemple et une stratégie pour les écarts importants. Proposer des modifications limitées, garder l'ordre des expériences et contrôler le document final.
7. Réserver l'IA au raisonnement ; découverte, dédoublonnage et vérifications simples restent déterministes.

Le projet fournit aussi des scanners publics, des outils CLI, un suivi sur fichiers et des modèles multi-fournisseurs. cible. possède déjà sa découverte Gmail/ATS, Supabase, son comparateur et son rendu PDF. Ces infrastructures sont conservées. Aucun profil personnel de l'auteur ni donnée de démonstration n'a été importé.

## Implémentation

| Partie | Fichiers cible. |
| --- | --- |
| Types, citations, importance figée, confiance, cache | `src/lib/career-evaluation.ts` |
| Deux appels Gemini isolés et cache testable | `src/lib/career-evaluation-pipeline.ts` |
| Sauvegarde et relecture par utilisateur | `src/lib/career-evaluation-server.ts` |
| Prompts distincts des anciennes formules en pourcentage | `src/lib/ai.ts`, tâches `careerRequirements` et `careerEvaluation` |
| Évaluer sans générer de CV ; relire un résultat actuel | `src/app/api/offres/evaluate/route.ts`, POST/GET authentifiés |
| Réutiliser l'évaluation pour guider les propositions | `src/app/api/cv/adapt/route.ts` |
| Note, matrice, risques, stratégie et inconnues | `src/components/cv/CareerEvaluationCard.tsx`, page Mon CV |
| Badge et tri sur 5, séparés du tri couverture CV | `src/components/offers/OffersTable.tsx`, page Mes offres |
| Chronologie et diagnostic lexical avec frontières prudentes | `src/lib/career-cv-checks.ts` |
| Audit du **texte réellement extrait du PDF** final | `src/lib/cv-application-pdf.ts` |

Première évaluation : deux appels IA. Une adaptation peut ensuite utiliser un troisième appel de rédaction déjà présent dans cible. Résultat actuel en cache : pas de nouvel appel d'évaluation. Si le CV change, seule la comparaison est relancée ; les exigences de l'annonce restent figées. Si l'annonce change, les deux passes sont relancées.

Cache : version de méthode, texte de l'offre, texte du CV et objectif ; rapport valable sept jours. Maximum 80 rapports et 60 analyses d'exigences par dossier. Sauvegarde Supabase avec version optimiste après relecture : une modification concurrente du CV ou de l'annonce empêche d'enregistrer un rapport obsolète. Une offre locale évaluée est conservée dans le dossier pour retrouver son analyse. Aucun envoi de candidature.

La note ne bloque jamais la candidature. Si l'évaluation échoue, aucune note n'est fabriquée ; l'adaptation existante peut continuer et expose l'erreur. Le diagnostic lexical du PDF n'ajoute aucun mot-clé absent. Les PDF personnels importés restent intacts.

## Usage

Mes offres → **Évaluer** → Mon CV → **Évaluer cette offre**. Le bouton d'adaptation réutilise aussi cette analyse lorsqu'une rédaction est nécessaire. Les détails se trouvent dans « Exigences, preuves et risques » et « Conseils et informations à vérifier ». Revenir dans Mes offres et utiliser « Évaluation IA sur 5 » pour trier les offres déjà évaluées. Les autres gardent leur couverture de mots-clés ; elles ne reçoivent pas de fausse note.

## Vérification et limites

Tests dédiés : `src/lib/career-evaluation.test.ts` : citation inexistante rejetée, importance inférée plafonnée, preuve forte non sourcée refusée, mitigation des écarts importants, salaire/culture inconnus, invalidation offre/CV/âge, isolation de la première passe, réutilisation du cache, C ≠ C++, Java ≠ JavaScript, ordre des expériences et absence de mutation du maître.

Le modèle est simulé dans ces tests : ils démontrent les contrôles du code, pas la qualité d'une réponse Gemini en production. Le script `scripts/verify-application-cv.ts` vérifie aussi le PDF réel : CV maître fourni de trois pages → copie A4 d'une page, 319 mots, Python présent dans le texte rendu, terme fictif absent, maître intact et composition stable au téléchargement.

Les notes restent un jugement IA sourcé, pas une mesure objective. Une citation exacte prouve sa présence dans une source, pas la véracité de toute interprétation. Les détails de rémunération, culture et disponibilité non publiés restent à confirmer. Le système ne prétend pas détecter avec certitude une fausse annonce. Les expériences sans date restent à leur emplacement. Aucun traitement IA automatique de tout le catalogue : évaluation à la demande pour limiter les coûts.

Aucun push, déploiement, candidature ou modification de données du compte n'a été effectué pour les tests locaux. Le parcours authentifié avec Gemini et Supabase doit être distingué des tests unitaires et du rendu PDF local.

### Résultats locaux du 19 octobre 2026

- `npx tsx src/lib/career-evaluation.test.ts` : passé.
- `npx tsx src/lib/cv-engine.test.ts` : passé, quatre offres synthétiques avec choix de preuves différents et cas sans modification.
- `npx tsx src/lib/cv-recruiter.test.ts` : passé, cinq offres synthétiques et refus des faits non sourcés.
- `npx tsx src/lib/cv-application.test.ts` : passé.
- `src/lib/auth-security.test.ts` (avec résolution du marqueur `server-only` vers son module vide Next pour le runner Node) : passé, y compris GET/POST de la nouvelle API.
- `npx tsc --noEmit` : passé.
- `npm run build` : passé, nouvelle route `/api/offres/evaluate` incluse.
- `scripts/verify-application-cv.ts` sur le CV maître PDF fourni : passé ; résultat local `C:\Users\ROKI\AppData\Local\Temp\cible-career-cv-verifie.pdf`. C'est une vérification de composition, pas une démonstration d'une réponse Gemini réelle.
