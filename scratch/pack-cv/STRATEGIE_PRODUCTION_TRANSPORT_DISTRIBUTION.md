# CIBLE. — STRATÉGIE MÉTIERS PRODUCTION · TRANSPORT · DISTRIBUTION ÉLECTRIQUE

**Date :** 17 octobre 2026  
**Statut :** recommandations métiers et plan de développement, **pas des compétences automatiquement acquises**.  
**Objet :** compléter `DOSSIER_CANDIDAT_CIBLE.json` et `GUIDE_GEMINI_CIBLE_IMPLEMENTATION.md` en restant centré sur les stages d'ingénieur en électricité, énergie, infrastructures électriques, réseaux et production ENR.

## 1. Cap professionnel non négociable

Rechercher en priorité les stages suivants, d'une durée de **6 mois à partir de février 2027** :

1. **Production d'électricité :** parcs photovoltaïques/éoliens, centrales de production, analyse de productible, exploitation et performance, essais, intégration ENR, stockage électrique/BESS.
2. **Transport de l'électricité :** études de réseau HTB/haute tension, transit de puissance, postes et transformateurs, raccordement de production, stabilité et protections (dans la limite du niveau étudiant).
3. **Distribution de l'électricité :** réseaux HTA/BT, dimensionnement, notes de calcul, protections, schémas, postes HTA/BT, raccordements, exploitation et qualité de l'alimentation.
4. **Transversal utile :** bureau d'études électriques industriel/tertiaire, systèmes électriques de bâtiments, automatisation, supervision énergétique, contrôle/essais et analyse de données de production/consommation.

Les postes purement web, marketing, consulting généraliste, HSE spécialisé, Data Science pure ou électronique/FPGA sans lien avec un système énergétique ne deviennent **pas** prioritaires par simple similarité de mots-clés. Les postes pluridisciplinaires comme FAYAT GO7/GO8 CVC peuvent rester secondaires si l'électricité, l'analyse fonctionnelle et les fiches d'essais en constituent une part pertinente ; ne pas masquer une dominante thermique/CVC, plomberie ou incendie.

## 2. Recettes de sélection : quelle preuve mettre en avant ?

| Famille de poste | Exigences à rechercher dans l'offre | Preuves personnelles prioritaires | Lacunes à garder explicites |
|---|---|---|---|
| Études BT / bureau d'études / bâtiments / industrie | Dimensionnement, bilan de puissance, schémas unifilaires, protections, court-circuit, sélectivité, notes de calcul | Projet réseau BT, cours machines/transformateurs, AutoCAD Electrical et Caneco BT **déclarés** | Essais terrain, normes maîtrisées professionnellement, chantier, Revit/DIALux si non validés |
| Distribution HTA/BT | Postes, câbles, transformateurs, raccordement, protections, SLT, continuité de service | Projet BT + électrotechnique et transformateurs (cours), rapport de dimensionnement | Expérience d'exploitation réseau public, études HTA réalisées, schémas de liaison à la terre pratiqués si non prouvés |
| Transport HTB / études réseaux | Load flow, transit P/Q, courts-circuits, tenue de tension, études dynamiques, raccordements | Formation électrotechnique, calculs BT comme fondation, Python/numérique comme compétence transférable | Études HTB réelles, DIgSILENT/ETAP, RMS/EMT, protections HTB si non démontrés |
| Production ENR / exploitation | Parc PV/éolien, productible, prévision/réalisé, disponibilité, pertes, indicateurs, diagnostic | EDD : données éolien/PV, Excel/Python/SQL, tableaux et écarts ; TP PSIM PV (académique) ; étude Weibull (académique) | Gestion d'actifs/SCADA terrain non prouvée, résultats chiffrés non certifiés |
| Stockage / intégration BESS | Batterie, convertisseurs, gestion de puissance, raccordement, capacité, stabilité, simulation | Cours électronique de puissance, PSIM PV, stockage (cours/projet à documenter), EDD | GFM, black-start, EMS/BESS avancé, RMS/EMT non démontrés |
| Efficacité énergétique / audit | Mesures/consommations, KPI, diagnostic, scénarios, efficacité, coûts | Audit de bâtiment, EDD, Excel, Power BI (déclaré autonome) | Audit réglementaire certifié, économies effectivement obtenues, chantier non prouvés |
| Essais / automatisation électrique | Mesures, validation, procédures, contrôle, chaîne de commande | TP machines électriques, PSIM, automatique/STM32 (cours/TP), analyses EDD | Essais sur banc industriel, automate Siemens/TIA Portal, mise en service si non prouvés |

### Ordre de construction d'un CV d'une page
1. Vérifier éligibilité (dates, 6 mois, niveau, mobilité, critères impératifs).
2. Déterminer une seule famille métier principale et une éventuelle famille secondaire.
3. Choisir l'une des deux bases : **ÉLECTRICITÉ/RÉSEAUX** ou **ÉNERGIE/PRODUCTION/ENR**.
4. Réserver le plus d'espace aux preuves de cette famille : une expérience et un ou deux projets.
5. Adapter le titre, le profil, l'ordre des projets/compétences ; conserver tous les faits verrouillés.
6. Contrôler chaque affirmation par un identifiant de preuve dans le JSON.
7. Produire un PDF A4 d'une page dans le design de référence, avec texte sélectionnable, liens fonctionnels, sans collisions.
8. Ne jamais fusionner des lignes d'anciens CV ou attribuer au candidat des compétences figurant uniquement dans une offre.

## 3. Taxonomie des mots-clés — *index de matching, pas liste de compétences possédées*

- **Production** : photovoltaïque, centrale PV, onduleur, productible, éolien, WTG, production, prévision/réalisé, irradiation, courbe I-V/P-V, disponibilité, facteur de charge, énergie annuelle, O&M, monitoring, SCADA, PPA.
- **Transport HTB** : haute tension, HTB, ligne aérienne/souterraine, poste source, réseau de transport, load flow, transit P/Q, court-circuit, protection, sélectivité, stabilité, raccordement, compensation réactive, transformateur, qualité de l'énergie.
- **Distribution HTA/BT** : distribution, HTA, BT, poste HTA/BT, TGBT, bilan de puissance, sections de câbles, échauffement, chutes de tension, Ik3, Ik1, protection, SLT, schéma unifilaire, NF C 15-100, NF C 13-100, continuité de service.
- **Stockage** : BESS, ESS, batterie, SOC, gestion énergétique, EMS, convertisseur DC/DC, onduleur, intégration réseau, contrôle GFM, îlotage, black-start, stockage stationnaire.
- **Études & essais** : études d'exécution, note de calcul, dossier technique, essais de réception, protocole de test, analyse fonctionnelle, contrôles, qualité, maintenance, instrumentation.

**IMPORTANT :** la présence de `HTB`, `BESS`, `SCADA`, `EMS`, `NF C 13-100` ou `PowerFactory` dans ce dictionnaire n'autorise **jamais** Gemini à écrire que l'utilisateur les maîtrise. Les termes servent à comprendre l'annonce et à proposer des apprentissages.

## 4. Outils et compétences à acquérir : séparés des acquis confirmés

Ces suggestions sont ajoutées pour aider à se démarquer **sans falsifier le CV**.

| Priorité | Logiciel / compétence future | Pourquoi c'est utile | Mini-preuve à réaliser avant de l'ajouter au CV |
|---|---|---|---|
| **P1** | **pandapower (Python)** | Études de transit de puissance, tension, pertes et courts-circuits sur des réseaux tests ; un pont naturel avec ton Python existant. | Modèle d'un réseau HTA/BT simple : cas nominal, charge augmentée, résultats commentés, dépôt GitHub |
| **P1** | **Ecodial (Schneider Electric)** | Conception et calcul d'installations électriques basse tension ; complément de Caneco BT déclaré. | Étude unifilaire d'un petit site, note de calcul, dimensionnement, protections et vérification des hypothèses |
| **P1** | **Excel avancé / Power Query + Power BI** | Reporting énergie, KPI, qualité de données, analyse production/consommation. | Tableau de bord production PV/éolien avec données sourcées et indicateurs définis ; préciser si données simulées |
| P2 | **DIgSILENT PowerFactory ou ETAP** | Études de réseaux, load flow, court-circuit, protection et raccordement en transport/distribution. | TP tutoriel/licence école + rapport démontrant les calculs réellement effectués |
| P2 | **PVsyst** | Études de production photovoltaïque et productible. | Simulation documentée d'un système PV et validation des hypothèses d'irradiation/pertes |
| P2 | **Normes / méthodes : NF C 15-100, IEC 60909, SLT** | Lire, appliquer et justifier les choix BT, protections et courts-circuits. | Notes de calcul traçables à une documentation normative consultée ; ne jamais revendiquer certification sans diplôme adéquat |
| P3 | **SCADA / supervision — initiation** | Contexte exploitation et suivi d'installations, pas logiciel possédé. | Démonstrateur didactique d'acquisition, alarmes et historisation, clairement identifié comme projet personnel |
| P3 | **Réseaux HTA/HTB : per unit, P/Q, protection** | Ouvrir des candidatures d'études réseau plus ambitieuses. | Étude chiffrée sur réseau académique, hypothèses et analyse de limites |

**Ne pas tout apprendre à la fois.** Pour les trois à six prochaines semaines : privilégier `pandapower` + consolidation du projet BT existant + tableau de bord énergétique. Ils fournissent trois preuves qui couvrent réseaux, électricité et production ENR. `Ecodial` est pertinent si la priorité devient le bureau d'études BT ; vérifier les conditions d'accès et de licence. Les solutions professionnelles peuvent être payantes ou nécessiter une licence établissement.

**Références officielles à consulter :**
- Schneider Electric, EcoStruxure Power Design Ecodial : https://www.se.com/fr/fr/product-range/61013-ecostruxure-power-design-ecodial/
- ETAP, études des systèmes électriques : https://etap.com/sectors/low-voltage
- pandapower, documentation Power Flow : https://pandapower.readthedocs.io/en/stable/powerflow.html

## 5. Priorité pratique pour le portfolio : trois preuves, pas vingt certificats

### Projet démonstrateur A — Réseau électrique industriel BT (déjà réalisé ; améliorer la preuve)
**État :** existant. Ajouter si possible hypothèses de bilan, tableau de charges, sélectivité, note de calcul datée et schéma lisible. Ne pas introduire des chiffres de dimensionnement issus de captures non vérifiées comme résultats mesurés.

### Projet démonstrateur B — Analyse de production ENR (prolongement de l'expérience EDD)
**État :** à construire / enrichir, sans exploiter de données confidentielles de l'employeur. Données ouvertes, consolidation avec Python/Excel, courbe prévision/réalisé, indicateurs qualité, rapport et tableau de bord Power BI. Mentionner provenance et limites des données.

### Projet démonstrateur C — Étude de réseau HTA/BT avec pandapower
**État :** suggestion future, non acquis. Modéliser un petit réseau test avec source/transformateur/lignes/charges, lancer un load flow, analyser tension et chargement, comparer deux scénarios. Produire notebook, schéma et note de synthèse. Ne l'ajouter au CV maître qu'après réalisation documentée et confirmation.

## 6. Algorithme de décision que Gemini doit suivre

1. Détecter famille métier principale et critères rédhibitoires.
2. Extraire cinq attentes techniques et les classer par priorité ; séparer exigences de souhaits.
3. Pour chaque attente, trouver zéro à trois preuves admissibles par `fact_id`/`project_id`. L'absence d'une preuve est un écart, pas une invitation à inventer.
4. Calculer un **classement interne de pertinence** avec `importance`, `proximité technique`, `preuve`, `capacité à défendre`, et **pénalité** de sur-adaptation. Jamais score ATS réel.
5. Générer un `change_plan` strict : `keep`, `rewrite_summary`, `replace_headline`, `reorder_projects`, `select_project_bullets`, `reorder_skills`, `select_courses`.
6. Vérification déterministe : aucun `skill_id` classé `learning_target` / `mention_to_confirm` ne peut entrer comme compétence affirmée dans le PDF ; faits du CV source verrouillés.
7. Vérification sémantique indépendante, affichage du diff et approbation avant génération finale.
8. Rendu PDF fixe et contrôle typographique, nombre de pages et liens.
9. Enregistrer l'offre, les besoins, les preuves retenues, la stratégie, le diff, la version du JSON et le PDF exact envoyé.
10. Analyser les candidatures par famille pour apprendre de vrais retours, sans conclure qu'un rejet prouve que le CV est mauvais.

## 7. Cas de recette complémentaire : FAYAT Grands Projets

**Offre fournie :** bureau d'études de gares/ouvrages de service, CVC / désenfumage / plomberie / incendie ; analyses fonctionnelles, notes de calcul et fiches d'essais, connaissances électrique/BIM.

**Attendu du moteur :** classer en *piste secondaire avec réserves* pour le profil électricité/énergie : bonne transférabilité sur notes de calcul, analyse fonctionnelle, automatisation, rigueur et essais ; spécialisations CVC/BIM/chantier non démontrées. Ne pas présenter le candidat comme ingénieur CVC confirmé et ne pas automatiquement classer l'offre avant un vrai stage de réseaux électriques.
