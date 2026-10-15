# Comment je transforme une offre d'emploi en CV adapté — La méthode complète à transmettre à l'IA de cible.

Je vais te donner quelque chose de plus précis qu'un prompt pour Gemini : un système de décision, de rédaction et de vérification permettant à ton application de reproduire la manière dont j'adapte tes CV.

L'objectif n'est pas de demander à Gemini de m'imiter superficiellement. C'est de rendre le processus reproductible, même lorsque tu lui envoies une offre dans un domaine très différent : électrotechnique, électronique, automatisation, énergie, R&D ou analyse de données.

Il faut distinguer deux choses :

- Ce que je fais au niveau éditorial : comprendre l'offre, sélectionner les preuves pertinentes, choisir les modifications et rédiger naturellement.
- Ce que ton application doit faire techniquement : conserver une source fiable, contrôler Gemini, appliquer les modifications au document, produire le PDF et vérifier le résultat.

Je peux te transmettre une méthode explicite et très détaillée, mais pas transférer directement mes paramètres internes ou mon mécanisme de raisonnement dans Gemini. En revanche, ton développeur peut implémenter les règles ci-dessous.

## 1. Le principe fondamental

La plupart des générateurs de CV fonctionnent ainsi :

CV original

Offre

Gemini ajoute les mots-clés de l'offre et réécrit plusieurs phrases.

Un CV parfois générique, artificiel ou excessivement ciblé.

La méthode que je recommande est différente :

1

Comprendre le besoin réel de l'entreprise

2

Établir ce que le candidat a véritablement fait

3

Relier les exigences aux preuves du parcours

4

Classer les preuves selon leur pertinence

5

Construire une stratégie de présentation

6

Effectuer uniquement les retouches utiles

7

Vérifier la vérité, la pertinence et la lisibilité

8

Générer et contrôler le PDF final

La règle centrale est la suivante : une adaptation réussie doit rendre le candidat plus pertinent aux yeux du recruteur sans modifier ce qu'il a réellement accompli.

# Partie I — Comment je prends les décisions

## Étape 1. Je lis l'offre comme un ingénieur, pas comme un détecteur de mots-clés

Lorsque tu m'envoies une annonce, je cherche d'abord à comprendre le travail que le futur stagiaire devra réaliser.

Je sépare les informations en six catégories.

| Catégorie               | Ce que je recherche                                            |
| ----------------------- | -------------------------------------------------------------- |
| Conditions obligatoires | Diplôme, spécialité, dates, durée, localisation                |
| Objectif professionnel  | Pourquoi le poste existe, quel problème doit être résolu       |
| Missions principales    | Ce que le stagiaire devra concrètement faire                   |
| Compétences techniques  | Connaissances, calculs, méthodes et logiciels demandés         |
| Livrables               | Plans, modèles, notes de calcul, rapports, simulations, essais |
| Critères secondaires    | Anglais, communication, autonomie, organisation                |

### Exemple : MBDA — Architecture électrique industrielle

L'offre demandait d'optimiser et de standardiser l'architecture électrique des bâtiments de production.

Elle mentionnait notamment :

- Analyse des architectures existantes.
- Modernisation des infrastructures électriques.
- Fiabilisation des installations.
- Standardisation des méthodes.
- Maintenance préventive.
- Dimensionnement électrique et schémas de liaison à la terre.

Un générateur superficiel récupère ces expressions et les ajoute au CV.

Moi, je cherche le besoin sous-jacent.

| Mission annoncée                      | Besoin technique que j'en déduis                                            |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Comparer les architectures existantes | Capacité à analyser des installations électriques                           |
| Moderniser l'infrastructure           | Compréhension des contraintes de dimensionnement et de protection           |
| Fiabiliser les installations          | Connaissance des défauts, protections et équipements                        |
| Standardiser les solutions            | Rigueur, formalisation et documentation technique                           |
| Préparer la maintenance préventive    | Compréhension de l'exploitation et de la fiabilité, à développer si absente |

Ces besoins sont des interprétations techniques de l'annonce, pas des compétences que je peux automatiquement attribuer au candidat.

### La question essentielle

Au lieu de demander « Quels mots-clés faut-il mettre dans le CV ? », l'IA doit demander :

« Quelles connaissances et réalisations permettraient à un stagiaire de contribuer concrètement à ces missions ? »

C'est ce qui oriente toute la suite.

## Étape 2. Je construis une représentation fiable de ton parcours

Je ne dois pas partir du principe que toutes les informations de ton CV sont équivalentes.

Ton parcours contient plusieurs types de connaissances.

Expérience professionnelle

EDD : analyse des données de production énergétique, utilisation de Python, SQL et Excel, création d'indicateurs et rédaction de synthèses.

Réalisations techniques

Étude de réseau industriel BT, dimensionnement de câbles, calculs de court-circuit, sélectivité et schéma unifilaire.

Connaissances académiques

Électrotechnique, électronique de puissance, automatique, traitement du signal, mathématiques et probabilités.

Compétences déclarées

Par exemple, tu as confirmé être autonome avec Power BI. Cela permet de l'indiquer parmi tes compétences, mais pas d'affirmer que tu l'as utilisé chez EDD.

Je distingue donc avoir étudié, savoir utiliser, avoir pratiqué dans un projet et avoir utilisé dans une entreprise.

C'est essentiel.

Connaître les transformateurs dans le cadre de sa formation ne signifie pas avoir conçu une architecture de réseau HTA. Utiliser PSIM ne signifie pas maîtriser les simulations RMS/EMT. Avoir réalisé un audit énergétique ne signifie pas avoir piloté des travaux de rénovation.

### Comment enseigner cela à Gemini

Chaque compétence doit avoir un statut :

| Statut        | Signification                                       | Utilisation autorisée        |
| ------------- | --------------------------------------------------- | ---------------------------- |
| Démontrée     | Utilisée dans une expérience ou un projet documenté | Réalisation ou compétence    |
| Déclarée      | Confirmée par le candidat                           | Compétence au niveau déclaré |
| Théorique     | Étudiée, sans pratique confirmée                    | Connaissance ou enseignement |
| Non démontrée | Aucune information fiable                           | Ne pas l'affirmer            |

Il faut également enregistrer l'origine de chaque information : CV maître, portfolio, rapport de projet ou confirmation explicite.

Une ancienne adaptation générée par Gemini ne doit jamais devenir automatiquement une nouvelle source de vérité.

## Étape 3. Je crée une correspondance entre l'offre et ton parcours

C'est le cœur de la méthode.

Pour chaque besoin important du recruteur, je recherche une preuve précise.

### Exemple appliqué à MBDA

| Besoin                        | Preuve dans ton parcours     | Correspondance |
| ----------------------------- | ---------------------------- | -------------- |
| Dimensionnement de réseau     | Projet industriel BT         | Directe        |
| Protections électriques       | Court-circuit et sélectivité | Directe        |
| Analyse technique             | Projet BT et formation       | Pertinente     |
| Fiabilisation des équipements | Connaissances en protections | Partielle      |
| Maintenance préventive        | Pas d'expérience démontrée   | Non démontrée  |
| Coordination de travaux       | Pas d'expérience démontrée   | Non démontrée  |
| Schémas de liaison à la terre | À confirmer                  | Non établie    |

À ce stade, je ne réécris toujours rien.

Je cherche d'abord à savoir quelles preuves doivent être visibles, lesquelles sont secondaires et quels écarts ne peuvent pas être comblés par une reformulation.

## Étape 4. Je détermine la force de chaque preuve

Toutes les preuves n'ont pas la même valeur pour un poste donné.

Je prends en compte cinq critères :

1. L'importance de la mission pour l'employeur.
2. La proximité technique entre l'expérience et la mission.
3. La solidité de la preuve.
4. La capacité à expliquer cette expérience en entretien.
5. La place nécessaire dans le CV pour la présenter.

Prenons ton expérience EDD et ton projet de réseau électrique.

Comparaison selon le type de poste

| Offre                                       | Preuve à privilégier                    |
| ------------------------------------------- | --------------------------------------- |
| MBDA — Bâtiments de production              | Projet de réseau industriel BT          |
| TotalEnergies — Production éolienne et BESS | EDD + connaissances réseaux et stockage |
| WSP — CFO/CFA                               | Dimensionnement BT et protections       |
| Mews Labs — Criticité des réseaux           | Python + mathématiques et probabilités  |

Ton parcours n'a pas changé. C'est simplement l'ordre de pertinence des preuves qui change.

L'IA de ton site doit apprendre à faire ce classement avant de produire la moindre phrase.

## Étape 5. Je construis la stratégie du CV avant de rédiger

À ce stade, j'ai compris l'offre et sélectionné les preuves importantes.

Je décide maintenant comment organiser les informations pour qu'elles produisent la meilleure première impression possible.

Je travaille sur six éléments.

### A. Le titre professionnel

Je ne copie pas systématiquement l'intitulé du poste.

Je cherche l'intersection entre ta véritable spécialisation et le métier visé.

Par exemple :

| Offre                                | Titre pertinent                                           |
| ------------------------------------ | --------------------------------------------------------- |
| MBDA — Infrastructures industrielles | Élève-ingénieur — Génie électrique & installations BT     |
| TotalEnergies — BESS éolien          | Élève-ingénieur — Génie électrique & énergie              |
| WSP — CFO/CFA                        | Élève-ingénieur — Génie électrique & réseaux BT           |
| Mews Labs — Analyse de criticité     | Élève-ingénieur — Énergie, données & systèmes électriques |

Je ne mettrais pas « Expert en fiabilité des réseaux » pour Mews Labs, puisque ton parcours ne démontre pas cette expertise.

En dessous, je conserve ta formulation :

Stage de 6 mois · [spécialité pertinente] · à partir de février 2027

La spécialité est facultative. La disponibilité reste stable.

### B. Le profil professionnel

C'est une partie essentielle, car c'est là que le recruteur comprend l'intérêt de ta candidature.

Je recommande une longueur de 45 à 70 mots environ.

Ma structure :

Phrase 1 — Qui es-tu ?

Formation et spécialisation réelles.

Phrase 2 — Qu'as-tu déjà réalisé de pertinent ?

Une ou deux preuves techniques précises.

Phrase 3 — Vers quelles missions veux-tu contribuer ?

Une orientation crédible, directement liée à l'offre.

Comparons ton profil général et celui que je choisirais pour MBDA.

CV général

« Je recherche un stage de six mois dans les métiers de l'énergie et de l'électricité, en études, essais, exploitation ou suivi de performance, en bureau d'études comme sur le terrain. »

CV adapté à MBDA

« Élève-ingénieur à l'ECAM-EPMI, spécialisé en génie électrique, énergie et automatisation. J'ai réalisé une étude de dimensionnement d'un réseau électrique industriel BT : sections de câbles, chutes de tension, courts-circuits, protections et schéma unifilaire. Après une première expérience en analyse de données énergétiques chez EDD, je souhaite contribuer à l'amélioration et à la fiabilité des installations électriques de bâtiments de production. »

La deuxième version fonctionne mieux pour cette offre parce qu'elle relie immédiatement ta formation, une réalisation pertinente et le besoin industriel.

Elle ne prétend pas que tu as déjà modernisé une usine.

### C. L'expérience professionnelle

Je conserve toujours l'intitulé réel du poste et les missions réellement effectuées.

Mais je peux changer l'ordre des responsabilités ou rendre certaines formulations plus précises.

Pour ton stage chez EDD :

- Une offre en analyse de données : mettre en premier le nettoyage, la consolidation et l'exploitation des données.
- Une offre en performance énergétique : mettre en avant les indicateurs de production et l'analyse des écarts.
- Une offre en documentation technique : valoriser la rédaction des synthèses.

Il faut néanmoins éviter une suradaptation.

Pour MBDA architecture électrique, ton stage EDD ne devient pas une expérience en maintenance industrielle.

Une expérience secondaire peut rester secondaire. Il n'est pas obligatoire que chaque ligne de ton CV corresponde directement à l'offre.

### D. Les projets techniques

C'est parfois la partie qui apporte le plus de valeur à un CV étudiant.

Je me pose quatre questions :

1. Quel projet démontre le mieux une compétence recherchée ?
2. Le recruteur comprend-il immédiatement ce qui a été réalisé ?
3. Les méthodes et résultats sont-ils suffisamment précis ?
4. Ce projet peut-il être expliqué et montré pendant l'entretien ?

Si l'offre porte sur les réseaux BT, ton projet industriel devient prioritaire.

Si elle porte sur l'efficacité énergétique, ton audit de bâtiment devient plus important.

Si elle porte sur l'analyse de données, je peux conserver ton projet BT mais mettre davantage en avant ton expérience EDD et tes enseignements de mathématiques.

Je peux également proposer de remplacer un projet peu pertinent par un autre, uniquement si son existence et son contenu sont confirmés.

### E. Les compétences techniques

Je ne classe pas les compétences par ordre alphabétique.

Je les classe selon leur utilité pour le poste.

Exemple pour MBDA :

Ordre recommandé

Génie électrique : réseaux BT, dimensionnement de câbles, chutes de tension, courts-circuits, protections, sélectivité.

Schémas et équipements : schémas unifilaires, transformateurs, machines électriques.

Conception et simulation : AutoCAD Electrical, Caneco BT, PSIM, PSpice, MATLAB/Simulink.

Énergie : efficacité énergétique, photovoltaïque, éolien, audit énergétique.

Données et bureautique : Excel, Python, SQL, Power BI.

Remarque que je n'ai pas créé une nouvelle rubrique « Maintenance préventive » ni ajouté des compétences en schémas de liaison à la terre non confirmées.

J'ai simplement réorganisé ce que tu possèdes.

### F. La formation

Je ne change pas ton diplôme.

En revanche, je peux sélectionner les enseignements les plus intéressants pour le poste.

Pour MBDA, je valorise l'électrotechnique et les réseaux électriques.

Pour Mews Labs, les mathématiques, probabilités, statistiques, algorithmique et analyse numérique peuvent devenir plus visibles.

Pour une offre en électronique, les enseignements d'électronique, de systèmes embarqués et de traitement du signal sont plus pertinents.

Il s'agit d'une sélection de cours réels, pas d'une modification de spécialisation.

## Étape 6. Je réécris en utilisant une logique de preuve

Une phrase de CV doit transmettre une information utile.

Je privilégie la structure :

Action réalisée + objet technique + méthode employée + résultat ou livrable, lorsqu'il est connu.

Cela ne signifie pas qu'il faut obligatoirement quatre éléments dans chaque phrase. Les meilleurs CV restent concis.

### Exemple 1 — Mauvaise formulation

« Participation à différents projets techniques de génie électrique. »

Cette phrase est trop générale.

### Exemple 2 — Meilleure formulation

« Calcul des courants de court-circuit, sélection des protections et réalisation d'un schéma unifilaire pour une installation industrielle basse tension. »

Elle indique précisément ce qui a été réalisé.

### Exemple 3 — Formulation excessive à éviter

« Optimisation complète de la sécurité et de la fiabilité d'un réseau industriel permettant une réduction significative des incidents. »

Cette formulation ajoute des résultats et une portée que ton projet ne démontre pas.

L'IA doit être capable de rejeter ce troisième type de phrase, même si elle paraît impressionnante.

### Le dictionnaire de transformation à intégrer

| Formulation source          | Transformation autorisée                          |
| --------------------------- | ------------------------------------------------- |
| « A travaillé sur »         | Remplacer par l'action exacte, si connue          |
| « A participé à »           | Conserver la notion de participation              |
| « A étudié »                | Ne pas transformer en « a maîtrisé »              |
| « Connaissances en »        | Ne pas transformer en « expérience en »           |
| « Analyse de données »      | Préciser les données, outils et analyses réalisés |
| « Projet de simulation »    | Indiquer le logiciel et l'objet simulé, si connus |
| « A proposé des solutions » | Ne pas affirmer qu'elles ont été mises en œuvre   |
| « A conçu un schéma »       | Ne pas affirmer que l'installation a été réalisée |

La réécriture doit augmenter la précision, pas la grandeur supposée de l'accomplissement.

# Partie II — Comment transformer cette méthode en logiciel

C'est ici que ton application peut réellement devenir meilleure.

Un prompt unique, même extrêmement détaillé, peut produire des résultats variables.

Il faut donc répartir les responsabilités entre Gemini et le code de ton application.

## 1. Créer un véritable dossier maître structuré

Ton CV original doit devenir une base de données fiable.

Je recommande une structure conceptuelle comme celle-ci :

```

{
  "candidate": {
    "name": "Moustapha Ibrahim Djama",
    "school": "ECAM-EPMI",
    "specialization": [
      "Génie électrique",
      "Énergie",
      "Automatisation"
    ],
    "availability": {
      "duration_months": 6,
      "start": "2027-02",
      "preferred_wording": "à partir de février 2027"
    }
  },
  "experiences": [
    {
      "id": "exp_edd",
      "employer": "EDD",
      "role": "Stagiaire en analyse de données énergétiques",
      "start": "2025-11",
      "end": "2026-02",
      "facts": [
        {
          "id": "edd_data",
          "action": "Nettoyage et consolidation",
          "object": "Données de production énergétique",
          "tools": ["Python", "SQL", "Excel"]
        },
        {
          "id": "edd_kpi",
          "action": "Création",
          "object": "Indicateurs de suivi et tableaux de synthèse"
        }
      ]
    }
  ],
  "projects": [
    {
      "id": "project_bt",
      "name": "Dimensionnement d'un réseau électrique industriel",
      "type": "personnel",
      "facts": [
        "Dimensionnement de câbles BT",
        "Vérification des chutes de tension",
        "Calcul de courants de court-circuit",
        "Choix de protections",
        "Schéma unifilaire"
      ]
    }
  ]
}

```

C'est une structure illustrative, qui devra être complétée avec l'ensemble de tes données.

Le point fondamental est que chaque fait doit posséder un identifiant stable.

Ainsi, Gemini pourra justifier une phrase par une référence à `project_bt` ou `edd_kpi`.

Il ne devra plus se contenter de dire : « Cette compétence semble cohérente avec le profil. »

## 2. Ajouter une vraie traçabilité des compétences

Pour chaque compétence, ton application devrait conserver au minimum :

| Champ                | Exemple                       |
| -------------------- | ----------------------------- |
| Compétence           | Python                        |
| Niveau déclaré       | À confirmer précisément       |
| Nature               | Utilisé en entreprise         |
| Preuve               | Stage EDD                     |
| Source               | CV maître                     |
| Vérification         | Confirmé dans le dossier      |
| Catégories associées | Data, énergie, automatisation |
| Date de mise à jour  | Date de dernière validation   |

Autre exemple :

| Champ                  | Exemple                         |
| ---------------------- | ------------------------------- |
| Compétence             | Power BI                        |
| Niveau déclaré         | Utilisation autonome            |
| Nature                 | Déclaration personnelle         |
| Preuve professionnelle | Non fournie                     |
| Vérification           | Confirmé par l'utilisateur      |
| Restriction            | Ne pas l'attribuer au stage EDD |

C'est beaucoup plus fiable qu'un champ unique contenant une longue liste de logiciels.

### Pourquoi cette distinction est importante

Supposons que Gemini reçoive une offre exigeant Python, SQL, PyTorch et NetworkX.

Sans base structurée, il peut rapprocher toutes ces technologies et produire une phrase comme :

« Maîtrise de Python et des bibliothèques de modélisation scientifique et de réseaux. »

Le problème est que cette phrase risque de laisser croire à une maîtrise d'outils non établis.

Avec une base structurée, l'application peut autoriser Python et SQL, puis demander une confirmation pour les autres outils.

## 3. Découper le travail de Gemini en plusieurs étapes contrôlées

Je recommande six modules logiques.

Ils peuvent utiliser le même modèle Gemini, sans qu'il soit nécessaire d'installer six IA différentes.

A

Module A — Analyse de l'offre

Produit une liste structurée des exigences, missions, livrables et critères d'éligibilité.

B

Module B — Correspondance

Associe chaque exigence à une ou plusieurs preuves réelles du dossier maître.

C

Module C — Stratégie

Décide du titre, du profil, des projets prioritaires et de l'ordre des compétences.

D

Module D — Rédaction

Propose des modifications limitées, chacune associée à des preuves.

E

Module E — Vérification

Contrôle les affirmations, détecte les inventions et compare avec la source de vérité.

F

Module F — Export PDF

Applique les modifications validées au modèle graphique et contrôle le document produit.

Le module F ne devrait pas laisser Gemini créer librement le HTML ou le PDF. Le design doit être géré par ton application.

# Partie III — Les règles de décision exactes

## 1. Vérifier l'éligibilité avant d'adapter

Imagine une offre qui demande :

- Stage de six mois à partir de mars 2027.
- Étudiant de dernière année.
- Spécialisation en génie électrique.
- Expérience souhaitée en réseaux BT.

Elle semble compatible avec ton profil, sous réserve des disponibilités exactes.

Mais si une autre offre exige impérativement un démarrage en octobre 2026, il faut signaler l'incompatibilité avant de réécrire le CV.

Trois résultats possibles :

Compatible — l'adaptation peut commencer.

À confirmer — une condition importante est ambiguë.

Incompatible — un critère obligatoire connu n'est pas satisfait.

L'IA ne doit pas masquer un critère éliminatoire par une meilleure rédaction.

## 2. Attribuer une priorité aux exigences

L'application peut calculer une priorité interne pour organiser son travail.

Par exemple :

| Critère                                   | Importance indicative |
| ----------------------------------------- | --------------------- |
| Importance de la mission dans l'offre     | 35 %                  |
| Correspondance technique avec le parcours | 30 %                  |
| Force de la preuve disponible             | 25 %                  |
| Pertinence pour la présentation du CV     | 10 %                  |

Ces pondérations sont une proposition de conception à ajuster, pas les critères secrets d'un recruteur ou d'un ATS.

Elles doivent servir uniquement à décider de l'ordre des preuves.

Exemple : un projet de dimensionnement BT recevra logiquement une priorité supérieure pour MBDA architecture électrique que le projet d'audit énergétique.

Un logiciel absent ne doit pas obtenir une priorité élevée sous prétexte qu'il est répété plusieurs fois dans l'annonce.

## 3. Calculer la correspondance sans confondre les domaines

L'IA doit apprendre les relations suivantes :

Dimensionnement BT → études électriques BT

Correspondance directe

Analyse de données énergétiques → reporting HSE

Transférable

MATLAB/Simulink → études RMS/EMT spécialisées

Partielle

AutoCAD Electrical → maîtrise de Revit

Non démontrée

C'est cette interprétation sémantique qui fait la différence entre une IA spécialisée et un simple moteur de mots-clés.

Le modèle peut proposer une relation technique, mais seule une preuve du dossier maître peut autoriser une affirmation personnelle.

## 4. Choisir explicitement les modifications

Je ne conseillerais pas de laisser Gemini renvoyer tout le CV sous forme de texte libre.

Il doit produire un plan de modifications.

Exemple pour MBDA :

```

{
  "job": "MBDA - Architecture électrique industrielle",
  "decision": "compatible",
  "strategy": {
    "main_angle": "Dimensionnement et analyse des installations BT",
    "primary_evidence": [
      "project_bt"
    ],
    "secondary_evidence": [
      "exp_edd"
    ]
  },
  "changes": [
    {
      "section": "headline",
      "operation": "replace",
      "proposed": "ÉLÈVE-INGÉNIEUR | GÉNIE ÉLECTRIQUE & INSTALLATIONS BT",
      "reason": "Aligner le titre sur la spécialisation et les missions",
      "evidence_ids": [
        "project_bt"
      ]
    },
    {
      "section": "profile",
      "operation": "rewrite",
      "reason": "Faire ressortir l'étude de réseau industriel",
      "evidence_ids": [
        "project_bt",
        "exp_edd"
      ]
    },
    {
      "section": "skills",
      "operation": "reorder",
      "first_category": "Génie électrique"
    }
  ],
  "forbidden_additions": [
    "Expérience de modernisation de bâtiments",
    "Pilotage de travaux",
    "Maintenance préventive réalisée"
  ]
}

```

Ce résultat devrait ensuite être validé par du code avant d'être appliqué.

Par exemple, une modification de type `rewrite` ne doit pas pouvoir changer le nom d'un employeur ou la date d'un stage.

Il faut une liste blanche des opérations autorisées, plutôt que de demander à Gemini de ne pas faire d'erreur en espérant qu'il obéisse toujours.

## 5. Appliquer une politique stricte de modification

Voici la politique que je mettrais dans ton application.

| Élément                    | Autorisation                             |
| -------------------------- | ---------------------------------------- |
| Nom du candidat            | Verrouillé                               |
| Coordonnées                | Verrouillées, sauf modification demandée |
| Employeurs                 | Verrouillés                              |
| Dates d'expérience         | Verrouillées                             |
| Diplômes et établissements | Verrouillés                              |
| Titre professionnel        | Adaptable                                |
| Profil                     | Adaptable                                |
| Ordre des projets          | Adaptable                                |
| Description des projets    | Reformulation contrôlée                  |
| Ordre des compétences      | Adaptable                                |
| Ajout de compétence        | Uniquement après confirmation            |
| Réalisations chiffrées     | Chiffres sourcés uniquement              |
| Design du PDF              | Verrouillé par défaut                    |

J'ajouterais une règle de non-modification :

Lorsque le texte actuel est déjà correct, clair et pertinent, l'IA doit pouvoir décider de le conserver tel quel.

C'est un détail essentiel. Un générateur qui réécrit obligatoirement toutes les sections crée souvent plus de problèmes qu'il n'en résout.

# Partie IV — Comment je décide qu'une adaptation est vraiment bonne

## Le test du recruteur

Je relis le CV en vérifiant successivement :

- Le métier ciblé est-il identifiable immédiatement ?
- Les compétences principales correspondent-elles aux missions centrales de l'offre ?
- La meilleure réalisation apparaît-elle suffisamment tôt ?
- Le profil reste-t-il naturel pour un étudiant ?
- Les expériences sont-elles cohérentes entre elles ?
- Est-ce que je peux justifier chaque compétence importante ?
- Y a-t-il des affirmations qui seraient difficiles à défendre en entretien ?

Le dernier point est particulièrement important.

Si ton CV dit « maîtrise de la fiabilité des réseaux électriques », un ingénieur peut te demander quelles méthodes de fiabilité tu connais.

Si tu ne peux pas répondre, l'adaptation t'a desservi.

Il vaut mieux écrire une formulation plus modeste, mais solide.

## Le test de pertinence

L'IA doit aussi comparer les versions avant et après.

Une modification est utile si elle :

- Rend une compétence pertinente plus visible.
- Précise une réalisation déjà existante.
- Réduit les éléments secondaires.
- Clarifie la relation entre ton parcours et l'offre.
- Améliore la lecture sans introduire de nouvelle affirmation non prouvée.

Si une reformulation ne satisfait aucun de ces critères, il faut la rejeter.

## Le test de vérité

Chaque affirmation importante doit être reliée à une preuve.

Exemple :

| Phrase proposée                          | Source                       | Décision                                          |
| ---------------------------------------- | ---------------------------- | ------------------------------------------------- |
| « Calcul de courants de court-circuit »  | Projet BT                    | Accepter                                          |
| « Analyse d'écarts de production »       | EDD                          | Accepter                                          |
| « Pilotage de maintenance industrielle » | Aucune                       | Rejeter                                           |
| « Programmation FPGA en VHDL »           | Non confirmé dans le dossier | Ne pas affirmer                                   |
| « Power BI »                             | Compétence déclarée          | Accepter comme compétence, sans attribution à EDD |

Ce contrôle doit être effectué indépendamment de la rédaction.

Le modèle qui rédige ne devrait pas être le seul à décider si sa propre sortie est correcte.

# Partie V — Comment garantir le même design PDF

Ton problème avec `CV-cible.pdf` ne se résout pas uniquement avec un meilleur prompt.

Même avec un texte parfait, un générateur peut produire un mauvais PDF si le moteur de mise en page est instable.

## 1. Séparer entièrement le texte et le design

Je recommande cette architecture :

Gemini

Produit uniquement les modifications structurées du contenu.

Moteur de validation

Contrôle les données, les preuves et les modifications autorisées.

Modèle PDF fixe

Gère la police, les marges, les couleurs, les positions et les rubriques.

Vérificateur PDF

Contrôle la page, les débordements, les liens, le texte et le rendu visuel.

Le modèle graphique doit être indépendant de Gemini.

Ainsi, une nouvelle adaptation ne change pas accidentellement la police, les espacements ou l'organisation du document.

## 2. Définir des contraintes de mise en page

Pour ton CV :

| Paramètre       | Règle                                                                         |
| --------------- | ----------------------------------------------------------------------------- |
| Format          | A4                                                                            |
| Nombre de pages | 1                                                                             |
| Palette         | Vert discret et texte foncé                                                   |
| Hiérarchie      | Identité, titre, profil, expérience, projets, compétences, formation, langues |
| Police          | Stable, identique ou visuellement fidèle à la référence                       |
| Dates           | Alignées de façon cohérente                                                   |
| Projets         | Intitulés distingués des descriptions                                         |
| Portfolio       | Lien cliquable                                                                |
| Texte           | Sélectionnable et extractible                                                 |
| Débordements    | Interdits                                                                     |

Il faut aussi mesurer la hauteur des paragraphes avant d'exporter.

Si un profil devient trop long, le moteur ne doit pas simplement réduire toute la police à une taille minuscule.

L'ordre de correction doit être :

1. Raccourcir les formulations redondantes.
2. Retirer les détails secondaires.
3. Optimiser légèrement les espacements.
4. Réorganiser les retours à la ligne.
5. Ne réduire la typographie qu'en dernier recours, dans des limites prédéfinies.

## 3. Comparer automatiquement le PDF au modèle de référence

Je recommanderais à ton développeur de créer des tests qui contrôlent :

- Le nombre de pages.
- La présence de toutes les rubriques attendues.
- La présence des coordonnées.
- L'absence de texte hors page.
- Les liens actifs.
- L'absence de chevauchements.
- La cohérence des alignements.
- La fidélité visuelle au modèle de référence.

Le contrôle visuel peut se faire en convertissant les PDF en images pour comparer leur structure. Il faut tenir compte du fait que le contenu change : une comparaison pixel par pixel ne doit pas exiger deux pages identiques.

Le plus utile est de vérifier les positions, la typographie et les débordements.

# Partie VI — Le prompt système à installer dans Gemini

Voici le cœur rédactionnel que je transmettrais à ton moteur.

Il ne remplace pas les validations techniques décrites précédemment.

# CIBLE — MOTEUR EXPERT D'ADAPTATION DE CV

## IDENTITÉ

Tu es un moteur d'adaptation de CV spécialisé dans les candidatures techniques, scientifiques et d'ingénieurs.

Tu combines les compétences d'un recruteur technique, d'un ingénieur métier, d'un rédacteur professionnel et d'un auditeur de conformité.

Tu ne dois pas produire le CV le plus impressionnant possible.

Tu dois produire le CV le plus pertinent possible **à partir des seules compétences, expériences et réalisations réelles du candidat**.

## OBJECTIF

Pour chaque offre :

1. Comprendre ce que l'entreprise attend réellement.
2. Identifier les missions et exigences les plus déterminantes.
3. Rechercher les preuves correspondantes dans le dossier maître.
4. Distinguer expériences directes, compétences transférables, connaissances théoriques et lacunes.
5. Choisir les informations qui méritent le plus de visibilité.
6. Élaborer une stratégie d'adaptation.
7. Proposer des modifications minimales et justifiées.
8. Contrôler que chaque affirmation reste défendable en entretien.

## SOURCE DE VÉRITÉ

Le dossier maître validé est la source principale des données personnelles et professionnelles.

Une annonce ne constitue jamais une preuve que le candidat possède une compétence.

Un ancien CV généré par IA ne constitue pas une nouvelle preuve.

Toute nouvelle compétence doit être confirmée par une source autorisée ou par le candidat.

Ne déduis jamais une maîtrise technique simplement à partir d'une formation générale ou d'un logiciel voisin.

## ANALYSE DE L'OFFRE

Analyse l'offre en distinguant :

- Critères d'éligibilité.
- Objectif réel du stage.
- Missions principales.
- Méthodes scientifiques et techniques.
- Logiciels demandés.
- Livrables.
- Compétences obligatoires.
- Compétences secondaires.
- Connaissances souhaitables.

Identifie les cinq besoins les plus importants.

Pour chacun, explique le résultat attendu et le type de preuve qui permettrait de démontrer l'aptitude du candidat.

Ignore les mots-clés qui ne correspondent qu'à des formulations commerciales ou génériques.

## CORRESPONDANCE DES COMPÉTENCES

Pour chaque exigence, utilise l'une des classifications :

DIRECTE : preuve précise d'un travail similaire.

TRANSFÉRABLE : méthode ou compétence applicable dans un domaine voisin.

PARTIELLE : certaines bases sont présentes, mais la compétence complète n'est pas démontrée.

NON DÉMONTRÉE : aucune preuve suffisante.

Ne convertis pas une compétence transférable en expérience directe.

Ne transforme pas un cours en responsabilité professionnelle.

## STRATÉGIE

Avant toute rédaction, détermine :

- Le meilleur positionnement professionnel crédible.
- Les trois compétences les plus pertinentes.
- La principale réalisation à mettre en avant.
- La seconde réalisation éventuelle.
- Les éléments à raccourcir ou déplacer.
- Les lacunes qui doivent rester visibles dans l'analyse, sans être artificiellement compensées.

N'adapte pas mécaniquement toutes les rubriques.

Conserve les sections qui sont déjà claires et pertinentes.

## TITRE

Le titre doit refléter la spécialisation réelle du candidat et le domaine visé.

Ne présente jamais le candidat comme un expert non confirmé.

Pour Moustapha Ibrahim Djama, utilise la formulation de disponibilité :

« Stage de 6 mois · à partir de février 2027 »

Une spécialité professionnelle peut être insérée entre ces deux éléments si elle améliore le ciblage.

N'utilise pas « dès février 2027 ».

N'utilise pas « Stage PFE » ou « Stage de fin d'études » comme intitulé principal.

## PROFIL

Rédige environ 45 à 70 mots.

Structure :

1. Formation et spécialisation réelle.
2. Expérience ou projet particulièrement pertinent.
3. Contribution recherchée en lien avec les missions de l'offre.

Le profil doit montrer la continuité entre le parcours et le poste.

Évite les formulations génériques, les superlatifs et les promesses excessives.

## EXPÉRIENCES

Conserve les noms, les fonctions et les dates.

Réorganise les missions si cela améliore la pertinence.

Rédige selon le modèle :

Action réelle + objet technique + méthode + résultat ou livrable confirmé.

Ne crée jamais de chiffre, de responsabilité ou de résultat non documenté.

Conserve la notion de participation lorsque le candidat ne portait pas seul la responsabilité.

## PROJETS

Classe les projets en fonction de leur lien avec le poste.

Privilégie les réalisations techniques vérifiables.

Précise les calculs, méthodes, outils ou résultats réellement présents dans le dossier maître.

Ne crée jamais un projet fictif.

## COMPÉTENCES

Réorganise les compétences confirmées.

Ne crée pas de catégorie de mots-clés artificiels.

Ne répète pas inutilement les mêmes logiciels.

Ne déduis pas la maîtrise de Revit à partir d'AutoCAD.

Ne déduis pas la maîtrise de RMS/EMT à partir de MATLAB.

Ne déduis pas la maîtrise de NetworkX à partir de Python.

## CONTRÔLE FINAL

Avant de proposer une adaptation :

- Vérifie la compatibilité des conditions de stage.
- Vérifie chaque affirmation nouvelle.
- Vérifie les sources associées.
- Compare le CV maître et la version proposée.
- Supprime les formulations excessives.
- Supprime les mots-clés non justifiés.
- Vérifie que le CV est compréhensible rapidement.
- Vérifie que les meilleures preuves sont visibles.
- Vérifie que le langage est naturel et professionnel.

Ne donne jamais un score ATS fictif.

## FORMAT DE SORTIE

Retourne des modifications structurées plutôt qu'un document libre.

Pour chaque modification significative, fournis :

- Identifiant de la section concernée.
- Opération demandée.
- Texte proposé si applicable.
- Justification.
- Exigence de l'offre concernée.
- Identifiants des preuves utilisées.
- Éventuelles informations à confirmer.

N'effectue aucune modification des champs verrouillés.

Si aucune modification n'est nécessaire, indique explicitement qu'il faut conserver le texte actuel.

## RÈGLE ABSOLUE

Ne réécris pas le parcours du candidat pour qu'il corresponde artificiellement à l'annonce.

**Sélectionne les preuves les plus convaincantes, améliore leur présentation et préserve intégralement la vérité des faits.**

# Partie VII — Les exemples sur lesquels entraîner et tester ton application

Il ne suffit pas que Gemini sache appliquer les règles sur MBDA.

Il doit aussi se comporter correctement sur des offres qui demandent des compétences éloignées de ton expérience principale.

Je prendrais ces quatre annonces comme cas de référence.

Test A — MBDA, infrastructure électrique

Attendu : priorité au projet BT, calculs de court-circuit, câbles, protections et schéma unifilaire.

Interdit : inventer une expérience de maintenance préventive ou de coordination de travaux.

Test B — TotalEnergies, BESS et parc éolien

Attendu : valoriser EDD, la production éolienne, l'électrotechnique, les réseaux et les connaissances en stockage.

Interdit : inventer la maîtrise du Grid-Forming, du black-start ou de la modélisation RMS/EMT.

Test C — Mews Labs, analyse de criticité

Attendu : mettre en évidence Python, les mathématiques de prépa MP, les probabilités et l'analyse de données.

Interdit : inventer des projets PyTorch, Scikit-learn ou NetworkX.

Test D — WSP, génie électrique CFO/CFA

Attendu : privilégier le dimensionnement BT, les équipements électriques, les schémas et AutoCAD Electrical.

Interdit : ajouter Revit, DIALux, études d'éclairement ou maîtrise des réglementations ERP sans confirmation.

Pour chaque test, je vérifierais que l'application :

1. Choisit une stratégie réellement différente.
2. Conserve les informations biographiques identiques.
3. Met en avant les bonnes réalisations.
4. N'invente aucune compétence.
5. Produit un PDF fidèle au design.
6. Explique les modifications réalisées.

Il faut aussi des tests négatifs : une offre incompatible avec les dates, un CV incomplet, une annonce inaccessible, un modèle IA indisponible et un texte trop long pour une page.

## Mesurer la qualité sans faux score ATS

Je construirais une grille de contrôle de ton propre logiciel.

| Critère de recette  | Résultat attendu                                              |
| ------------------- | ------------------------------------------------------------- |
| Vérité factuelle    | Aucune affirmation non autorisée                              |
| Traçabilité         | Chaque ajout important renvoie à une preuve                   |
| Pertinence          | Les missions prioritaires sont reliées aux meilleures preuves |
| Retouches limitées  | Aucune modification inutile                                   |
| Cohérence           | Aucune contradiction avec le dossier maître                   |
| Lisibilité          | CV facilement parcourable                                     |
| Fidélité visuelle   | Même design                                                   |
| Fiabilité technique | PDF valide, une page, texte lisible                           |

Ce sont des critères de qualité internes. Ils ne permettent pas de connaître les résultats du véritable système de sélection d'une entreprise.

# Partie VIII — Les protections que ton développeur doit ajouter

C'est la partie qu'un simple prompt ne résout pas.

1\. Validation du contenu structuré. Chaque réponse Gemini doit respecter un schéma précis. Si elle contient une opération inconnue, une référence de preuve inexistante ou une modification interdite, l'application doit refuser cette modification.

2\. Confiance limitée dans les annonces. Une offre récupérée sur LinkedIn, Indeed ou un site externe est une donnée à analyser. Si son texte contient des instructions adressées à l'IA, celles-ci ne doivent jamais devenir des règles du système.

3\. Gestion des versions. Chaque adaptation doit partir du CV maître validé, jamais d'un CV déjà adapté. Sinon les petites modifications risquent de s'accumuler jusqu'à déformer ton parcours.

4\. Validation humaine. L'interface doit afficher les changements avant leur approbation, idéalement avec le texte original, le texte proposé et la raison du changement.

5\. Archivage des candidatures. Une fois le CV validé et envoyé, il faut conserver le PDF exact, l'offre associée et la date. Une mise à jour du CV maître ne doit jamais modifier rétroactivement le dossier envoyé.

6\. Mode dégradé. Si Gemini ne répond pas, l'application doit conserver le CV maître et les données existantes, signaler l'échec et permettre une nouvelle tentative. Elle ne doit pas générer silencieusement un faux CV « adapté ».

7\. Vérification de confidentialité. Les documents contiennent tes coordonnées et ton parcours personnel. Seules les données nécessaires doivent être transmises au modèle, avec gestion sécurisée des accès et des clés API.

8\. Contrôles automatiques du PDF. Le fichier doit être rendu et vérifié avant de déclarer la génération réussie. Si un débordement est détecté, le générateur doit corriger la mise en page ou demander une intervention.

# Partie IX — Instructions finales à donner à ton développeur

Je te propose maintenant un message orienté implémentation réelle. Contrairement au prompt système précédent, celui-ci s'adresse à l'agent qui a accès au code de ton application.

# MISSION D'IMPLÉMENTATION — MOTEUR CV EXPERT POUR CIBLE.

Je veux améliorer en profondeur le moteur d'adaptation de CV de mon application **cible.**

Le problème actuel n'est pas uniquement la qualité du texte généré par Gemini. Le moteur ne comprend pas suffisamment les besoins du recruteur, ne sélectionne pas toujours les meilleures preuves de mon parcours et ne conserve pas systématiquement la qualité de mon PDF de référence.

Je veux que tu modifies réellement mon application pour appliquer la méthode ci-dessous.

## 1. COMMENCER PAR AUDITER LE CODE EXISTANT

Avant toute modification :

- Identifie comment le CV maître est actuellement stocké.
- Identifie comment l'offre d'emploi est récupérée et analysée.
- Identifie les prompts envoyés à Gemini.
- Identifie comment les modifications de CV sont générées.
- Identifie comment les compétences sont stockées et validées.
- Identifie le moteur de génération PDF.
- Identifie les traitements qui risquent d'altérer le design.
- Identifie la gestion actuelle des versions, des brouillons et des candidatures.

Ne suppose pas que ces fonctionnalités sont absentes avant d'avoir inspecté leur implémentation.

Conserve les composants fiables et remplace uniquement ceux qui empêchent d'obtenir un résultat correct.

## 2. CONSTRUIRE UNE SOURCE DE VÉRITÉ

Le système doit posséder un CV maître structuré contenant les données validées.

Chaque fait important doit avoir un identifiant, une provenance et éventuellement un niveau de confiance.

Ne considère jamais un CV généré précédemment par Gemini comme une nouvelle source de vérité.

## 3. CRÉER UN ANALYSEUR D'OFFRE

Gemini doit extraire :

- Les conditions d'éligibilité.
- Les missions principales.
- Les problèmes techniques à résoudre.
- Les logiciels et méthodes.
- Les livrables attendus.
- Les compétences obligatoires et secondaires.

Il doit classer les exigences selon leur importance et distinguer les faits explicites des déductions.

## 4. CRÉER UN MOTEUR DE CORRESPONDANCE

Pour chaque exigence, retrouve les preuves correspondantes dans le dossier maître.

Classe-les en :

- Directe.
- Transférable.
- Partielle.
- Non démontrée.

Ne confonds jamais des technologies proches.

Chaque correspondance doit référencer les faits du dossier maître qui la soutiennent.

## 5. CRÉER UN PLANIFICATEUR DE MODIFICATIONS

Avant de rédiger, Gemini doit produire un plan indiquant :

- Le positionnement professionnel choisi.
- Les preuves les plus pertinentes.
- Les sections qui doivent changer.
- Les sections à conserver.
- Les rubriques à réordonner.
- Les compétences à mettre davantage en avant.
- Les lacunes qui ne doivent pas être masquées.

N'autorise pas une réécriture intégrale automatique si une modification limitée suffit.

## 6. CRÉER UN ÉDITEUR STRUCTURÉ

Gemini doit retourner des opérations structurées et validables.

Exemples :

- Remplacer le titre.
- Reformuler le profil.
- Réordonner les projets.
- Reformuler une réalisation.
- Réordonner les compétences.
- Conserver une section sans modification.

Ne lui donne pas l'autorisation de modifier librement le CV entier.

Verrouille les données biographiques, les dates, les diplômes et les expériences.

## 7. AJOUTER UN CONTRÔLE DE VÉRITÉ

Avant d'appliquer les modifications :

- Vérifie les références aux preuves.
- Détecte les compétences ajoutées sans justification.
- Détecte les nouvelles responsabilités non documentées.
- Détecte les chiffres ou résultats inventés.
- Détecte les contradictions avec le CV maître.
- Refuse les modifications non autorisées.

Une deuxième validation, distincte de la génération, doit contrôler les affirmations produites.

## 8. SÉPARER GEMINI DU MOTEUR PDF

Gemini génère uniquement du contenu et des instructions de modification.

Le rendu graphique doit être assuré par un modèle de document déterministe.

Conserve le design vert discret du CV original.

Le document doit tenir sur une page A4, rester lisible et conserver les liens.

Si le texte ne tient pas, privilégie la condensation des formulations secondaires plutôt qu'une réduction excessive de la police.

## 9. AJOUTER DES TESTS AUTOMATIQUES

Construis des tests utilisant les offres suivantes :

- MBDA — Architecture électrique industrielle.
- TotalEnergies — BESS et parc éolien.
- Mews Labs — Analyse de criticité des réseaux.
- WSP — Génie électrique CFO/CFA.

Vérifie que chaque offre conduit à une stratégie de CV différente et cohérente.

Vérifie qu'aucune compétence non confirmée n'est ajoutée.

Ajoute des tests du PDF : débordements, police, liens, nombre de pages et extraction de texte.

## 10. PRÉSERVER L'EXPÉRIENCE UTILISATEUR

Je souhaite conserver un parcours simple :

Mes offres → Mon CV → Mes candidatures.

Lorsque je sélectionne une offre :

1. L'application analyse les exigences.
2. Elle identifie les preuves de mon parcours.
3. Elle choisit une stratégie de personnalisation.
4. Elle propose les modifications.
5. Je consulte la comparaison avant/après.
6. Je valide le résultat.
7. Le PDF est généré et vérifié.
8. Je peux le récupérer pour postuler.
9. Le PDF exact peut être archivé avec la candidature.

Les brouillons doivent pouvoir être repris.

Les fonctionnalités et intégrations déjà opérationnelles doivent être conservées.

## 11. RÈGLES PERSONNELLES

Pour mes CV :

- Une page A4.
- Même design que mon CV original.
- Formulation : « Stage de 6 mois · à partir de février 2027 ».
- Aucune utilisation de « dès février 2027 ».
- Aucune expérience inventée.
- Aucun résultat chiffré inventé.
- Aucun logiciel ajouté sans confirmation.
- Des modifications limitées et justifiées.
- Un langage naturel d'élève-ingénieur.
- Une présentation professionnelle et sobre.

## 12. CRITÈRES DE RÉUSSITE

Le travail sera terminé uniquement lorsque :

- Les modifications de code auront été effectivement réalisées.
- Les tests disponibles auront été exécutés.
- La génération PDF fonctionnera.
- Le design sera fidèle au modèle.
- Les exemples MBDA, WSP, TotalEnergies et Mews Labs auront été vérifiés.
- Les informations personnelles et professionnelles resteront exactes.
- L'application expliquera pourquoi chaque modification importante est proposée.

Ne te contente pas de modifier le prompt Gemini.

Ne te contente pas d'annoncer un score de compatibilité.

Ne te contente pas de présenter un plan.

**Inspecte, implémente, teste, corrige et démontre le fonctionnement réel.**

L'objectif est de construire un moteur qui adapte intelligemment mon CV à une offre tout en respectant la vérité de mon parcours, avec une qualité de rédaction et de présentation comparable à celle d'un CV soigneusement adapté par un recruteur technique.

## Partie X — Ce que je ferais en premier dans ton site

Je classerais les travaux dans cet ordre, car tous n'apportent pas la même valeur.

Ordre de développement recommandé

Priorités

Priorité 1 — Fiabiliser les faits et la sélection

Dossier maître, preuves, analyse de l'offre, correspondance et stratégie de modification.

Priorité 2 — Corriger la rédaction et le PDF

Modifications structurées, vérification de vérité, template fixe et tests de mise en page.

Priorité 3 — Ajouter les fonctions avancées

Comparaison avant/après, historique, archivage, suivi des résultats et amélioration du moteur à partir des retours.

### Le conseil le plus important

Il faut enseigner à Gemini non seulement quand changer quelque chose, mais aussi quand ne rien changer.

Pour une offre en génie électrique, par exemple, les dates de ton stage EDD, le nom de ton école et les calculs réellement effectués dans ton projet BT n'ont pas besoin d'être transformés.

Une excellente adaptation repose souvent sur seulement quelques décisions précises : choisir le bon titre, rédiger une bonne accroche, mettre le bon projet au premier plan et réorganiser les compétences.

Tout le reste doit rester stable.

La finalité de cette méthode n'est pas de fabriquer un nouveau CV à chaque annonce. C'est de produire différentes présentations intelligentes, pertinentes et vérifiables d'un seul et même parcours réel.

C'est la règle que je placerais au centre de l'architecture de cible..