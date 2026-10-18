# MISSION POUR L’AGENT QUI DÉVELOPPE CIBLE.

Lis entièrement les fichiers `DOSSIER_CANDIDAT_CIBLE.json`, `GUIDE_GEMINI_CIBLE_IMPLEMENTATION.md` et `CV_MAITRE_Moustapha_Ibrahim_Djama.pdf` et `STRATEGIE_PRODUCTION_TRANSPORT_DISTRIBUTION.md`. Le JSON est le registre de faits ; le PDF est une référence éditoriale ; le guide définit les règles.

**Ne te contente pas d'écrire un gros prompt Gemini.** Inspecte le code existant du module CV, l'extraction des offres, le stockage Supabase et le générateur PDF. Puis implémente un flux auditable : vérification d'éligibilité → extraction des exigences → correspondance preuve/exigence → stratégie → modifications structurées → validation indépendante → comparaison avant/après → PDF déterministe → archivage de la version exacte envoyée.

Contraintes : ne jamais importer comme faits confirmés les projets/compétences étiquetés « à documenter » ; distinguer compétences déclarées, matières étudiées et activités réellement réalisées ; conserver les données biographiques verrouillées ; ne jamais faire dériver le maître depuis un CV généré. Bloquer le PDF si des affirmations nouvelles n'ont pas de preuve.

Le CV envoyé doit tenir sur une page A4 et reprendre le design vert discret, avec la formulation exacte « Stage de 6 mois · à partir de février 2027 ». Gemini choisit le contenu, mais n'écrit pas du HTML libre ni un PDF à partir de zéro.

Conserve les intégrations existantes qui fonctionnent (Gmail, Gemini, Supabase, Vercel) et la navigation simple « Mes offres / Mon CV / Mes candidatures ». Préserve les brouillons et le PDF exact associé à chaque candidature.

**Démarre réellement les modifications après l'audit du dépôt.** Teste sur MBDA BT, WSP CFO/CFA, TotalEnergies BESS, Mews Labs et MBDA FPGA. Déclare les limites et les tests non exécutés. Ne dis jamais que tout est corrigé sans résultat testé et artefact de sortie consultable.

**Spécialisation de recherche :** stages d’ingénieur en **production, transport et distribution électrique**, ENR, stockage, réseau et bureau d’études. Les futures compétences proposées par le pack sont des pistes de formation, jamais des compétences acquises.
