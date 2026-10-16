# Discovery — jalon 2 (15 octobre 2026)

## Résultat vérifié

- Projet Supabase utilisé : `ucgetwemaxigkblzvndo` seulement.
- Registre de 199 entreprises corrigé et relu par SIREN, sans relancer les 45 appels initiaux à l'API des entreprises. Le code NAF `71.12B` signale une ingénierie connexe, sans prouver une spécialité électrique. Les 18 entreprises en tranche `32` sont classées ETI (250 à 499 salariés).
- Deux domaines confirmés par une page de l'entreprise mentionnant son SIREN : Ingérop (`489626135`) et ENGIE Mobilités Électriques (`909073363`). ERESE et WPD restent probables, avec cette incertitude enregistrée. Aucun domaine n'est déduit du seul nom.
- Source directe indépendante de Gmail : [API publique SmartRecruiters](https://developers.smartrecruiters.com/docs/endpoints). Sept espaces employeur interrogés, 826 lignes de listes examinées (avec répétitions entre recherches), 40 fiches détaillées lues, 11 annonces de stage actives validées. Dix passent le filtre de pertinence technique et de date ; six des onze annoncent exactement six mois. Les durées en plage (4–6 ou 5–6 mois) et dates absentes restent incertaines.
- Les onze fiches, leurs URLs individuelles, descriptions et indices sont dans `scratch/pilot-discovery-offers-report.json`. La sauvegarde privée Supabase `discovery:offers:v1` a été relue après écriture et contient onze offres. L'API authentifiée `/api/offres/discovery` transmet les dix compatibles à « Mes offres » ; le clic « Adapter mon CV » fournit la description complète au moteur CV.
- Aucune recherche ou lecture de messages Gmail réels. Le catalogue Gmail sauvegardé de ce compte est absent : le nombre de doublons entre ces offres web et Gmail est **inconnu**, pas zéro. L'identité forte SmartRecruiters évite les doublons entre URLs qui partagent le même ID.

## Preuves et tests

- `node --experimental-strip-types scripts/pilot-discovery-offers.mjs` : exécution live, 11 offres persistées et relues.
- `node --experimental-strip-types scripts/repair-discovery-companies.mjs` : 199 lignes corrigées et relues.
- `npx tsx src/lib/discovery.test.ts` : règles NAF, SIREN et domaine.
- `npx tsx src/lib/discovery-offers.test.ts` : fiche active, contrat stage, pertinence, durée, identité ATS, erreur HTTP et transmission à l'adaptation CV sur données synthétiques.
- `npx tsx src/lib/cv-engine.test.ts`, `npx tsc --noEmit` et `npm run build` : réussis. Aucun test visuel du parcours authentifié : le navigateur local était sur `/connexion`.

## Limites et suite exacte

Le pilote inspecte les premières pages et au plus douze fiches candidates par employeur ; il ne démontre pas une recherche exhaustive sur tous les ATS. Le registre des 199 entreprises est très concentré sur `71.12B` et seuls deux sites y ont une confirmation légale. Les sept espaces ATS interrogés sont une seconde voie indépendante : une relation juridique SIREN ↔ espace ATS n'est affirmée que si prouvée.

Prochaine tâche : poursuivre la validation des sites/carrières des 25 entreprises échantillonnées, ajouter au moins un autre ATS documenté avec pagination et contrôle d'URL active, puis vérifier depuis une session utilisateur authentifiée le trajet offre Discovery → adaptation CV → aperçu/PDF. Conserver les données existantes. Ne pas déployer, committer ou pousser sans l'accord de l'utilisateur.
