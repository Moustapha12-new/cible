# CHANTIER 3 — MOTEUR DE CV EXPERT, FONDÉ SUR DES PREUVES

Ce fichier complète mais **ne remplace pas** le document intégral `METHODE_CV_ORIGINALE.md` (source primaire, 1351 lignes environ). Tu dois lire ce document avant d'implémenter ; en particulier Partie I (décision), Partie II (architecture), Partie III (règles), Partie V (PDF), Partie VI (prompt système Gemini), Partie IX (instructions d'implémentation).

## Objectif

Pour une annonce et un CV maître : comprendre les **missions réelles**, vérifier la disponibilité/éligibilité, comparer les exigences aux faits prouvés du parcours, choisir les preuves pertinentes et proposer quelques changements intelligents et justifiés au lieu de réécrire tout le document. Le candidat doit pouvoir expliquer chaque ligne adaptée en entretien. La source d'une compétence est le parcours vérifié, **jamais le vocabulaire de l'annonce**.

## Chemin des données exigé

`JobOffer` + `JobAnalysis` (chantier 2, avec provenance) → admissibilité → besoins prioritaires → `CandidateMaster` versionné (vrai CV, portfolio, projets et expériences confirmés) → matching besoin/preuve → stratégie d'édition → `CVChangeSet` structuré et validé → diff visuel → validation utilisateur → rendu PDF stable → contrôle A4 et liens → archive de la version exacte si envoyée.

### Dossier maître et preuves (faits atomiques)

- Raccorder et réutiliser le dépôt maître existant (`GET/PUT /api/cv/reference` ou implémentation effective constatée) ; l'import PDF doit réellement enregistrer le contenu et l'attacher à l'identité du CV maître ; interdire les valeurs factices de la démo.
- Chaque expérience/projet/compétence possède ID stable, libellé, champs immuables, source (`original_cv`, `portfolio`, `project_report`, `user_confirmation`), date de validation et statut : `demonstrated`, `declared`, `theoretical`, `unverified`.
- **Ne pas confondre** appris en cours / pratiqué dans un projet / utilisé en entreprise / simple déclaration. Ne jamais attribuer à un stage un outil seulement confirmé en compétence générale.
- Les exemples de la méthode (EDD, projet BT, PSIM, Power BI, etc.) sont des **exemples rédactionnels**, pas un permis de fabriquer un dossier candidat si le CV maître ne les confirme pas.
- Une adaptation Gemini antérieure n'alimente jamais `CandidateMaster`. Toute compétence sans preuve devient « à confirmer » et n'est pas insérée silencieusement.

### Modules logiciels A-F

A. **Analyse de l'annonce** : extraction des 6 catégories de l'original (conditions, objectif, missions, compétences techniques, livrables, critères secondaires) ; 5 besoins principaux ; distinguer citations de la fiche et inférences techniques.

B. **Correspondance** : associer chaque besoin aux IDs de preuves ; étiqueter `DIRECTE`, `TRANSFÉRABLE`, `PARTIELLE`, `NON_DÉMONTRÉE`. Calculer les transferts possibles sans jamais transformer « connaissance en théorie » en « projet réalisé ».

C. **Stratégie** : lister les trois compétences les plus utiles, la principale réalisation à remonter, les sections à conserver, condenser ou réordonner ; noter les lacunes. Tenir compte du test du recruteur : saisit-il le métier, les preuves et le potentiel en 20 secondes ? Ne pas saturer le CV de mots-clés.

D. **Rédaction/plan** : faire proposer à Gemini des opérations JSON à partir d'une whitelist : `keep`, `rewrite_profile`, `set_headline`, `reorder_projects`, `rephrase_fact`, `reorder_skills`, `omit_optional_fact`. Pour chaque opération : `sourceFactIds`, avant/après, justification, type de preuve, zone concernée et impact estimé sur la place A4.

E. **Vérification indépendante** : schéma validé par code + contrôle sémantique distinct. Rejeter chiffres inventés, technologies non confirmées, responsabilités inexistantes, nouvelles entreprises, diplômes/dates et modifications non autorisées. Refuser `cv_original` fictif et les PDF factices ; si l'IA est indisponible, conserver le CV maître et afficher un échec transparent.

F. **Moteur PDF** : rendu déterministe depuis des sections structurées ; Gemini ne dessine pas librement le PDF. Garder le véritable modèle de CV de l'utilisateur, A4 une page, palette verte discrète, bon contraste, dates alignées, portfolio cliquable, texte extractible ; vérification débordement et liens avant téléchargement. Diff avant/après doit décrire le contenu **réellement présent dans le PDF exporté**.

### Conditions personnelles explicites

- Titre de disponibilité : **« Stage de 6 mois · à partir de février 2027 »**. Éviter « dès février 2027 », « Stage PFE », « Stage de fin d'études » comme titre principal.
- CV sobre, français naturel d'élève-ingénieur, aucune survente, pas d'ajout forcé, sections inchangées conservées.
- Nom, coordonnées, établissements, diplômes, dates et faits de base verrouillés, sauf correction explicitement approuvée par le candidat.
- Profil bref (~45–70 mots si cela améliore la lisibilité), 1 page A4.
- Score de correspondance **interne** possible seulement s'il est explicable et calibré ; jamais l'appeler « score ATS garanti » ni faire croire qu'on connaît l'algorithme d'un recruteur.

### Exemples métier pour les tests (voir original)

- MBDA — architecture électrique industrielle : projet réseau BT / protections en avant ; pas de maintenance industrielle prétendument pratiquée si non prouvée.
- TotalEnergies — BESS et parc éolien : liens entre énergie, production, stockage si factuellement démontrés.
- WSP — CFO/CFA : réseaux BT, dimensionnement et livrables d'études justifiés ; Revit non inféré d'AutoCAD.
- Mews Labs — criticité des réseaux : Python, mathématiques/probabilités si attestés ; ne pas inventer des bibliothèques spécifiques.
- Si les fiches intégrales de ces entreprises ne sont pas disponibles dans le dépôt, utiliser des fixtures représentatives, clairement marquées « test synthétique », et ne pas créer de fausses citations d'offres réelles.

### Parcours utilisateur et intégration au code existant

1. Depuis `Mes offres`, choisir une offre réelle ; consulter les exigences et preuves extraites du mail/page, statut d'enrichissement et source.
2. Accéder à `Mon CV` par ID d'offre stable : charger le CV maître réel et la dernière version approuvée.
3. Afficher une analyse compréhensible : éligibilité, 5 besoins, exigence → preuve, lacunes et points à confirmer.
4. Proposer un plan d'adaptation ; afficher un diff **avant/après** lisible avec raisons, la possibilité de refuser une modification, de corriger manuellement et de reprendre un brouillon.
5. Générer le **vrai PDF** correspondant exactement au contenu validé. Vérifier qualité, A4, liens, texte extractible. Préserver l'original et toutes les versions.
6. Le téléchargement n'enregistre pas automatiquement « postulé ». Après confirmation explicite de l'envoi, conserver le PDF exact (fichier réel et empreinte/hash) et relier l'archive à cette candidature.
7. Restaurer autant que possible les modules/routes existantes : `/api/cv/reference`, `/api/cv/adapt`, `/api/cv/pdf`, `/api/cv/bulk`, `/api/candidatures/apply`, `/api/candidatures/[id]/document`, selon les contrats réels constatés dans le dépôt.

### Économie de requêtes IA

- Ne pas demander à Gemini de parser le DOM ou de dédupliquer les URLs ; le code le fait.
- Analyser seulement le texte complet de l'offre sélectionnée en priorité. Réutiliser une analyse enregistrée lorsque hash texte + version de prompt et modèle n'ont pas changé.
- Une invocation de raisonnement structural, une invocation d'édition et une passe de vérification au besoin ; proposer de petites modifications plutôt que régénérer des milliers de mots.

## Critère ultime

Quatre offres métier différentes doivent produire des choix de preuves **différents**, cohérents avec le vrai dossier du candidat, sans ajouter aucune compétence non prouvée ; la génération PDF doit reproduire exactement le changement validé sur une page A4. La qualité de la stratégie compte plus que le nombre de mots-clés ajoutés.
