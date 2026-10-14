# CHANTIER 2 — EXTRACTEUR D'ALERTES STAGES ET ENRICHISSEMENT

## Objectif métier

Traiter les alertes emails Gmail provenant notamment d'Indeed, LinkedIn et HelloWork pour **retrouver toutes les annonces individuelles réellement affichées**, même quand une alerte contient 2, 8, 10 ou davantage de cartes, y compris les recommandations secondaires. Distinguer annonce d'origine citée dans l'objet, recommandations, doublons affichés dans le même email et offres réellement différentes malgré des titres similaires. Enrichir chaque offre par sa fiche individuelle pour alimenter l'adaptation du CV. Viser 100 % de rappel *sur le corpus de test annoté*, pas prétendre garantir 100 % sur des sites externes inaccessibles.

## Définitions non négociables

- `Email`: un message Gmail unique (identifiant Gmail et date).
- `OfferOccurrence`: présence d'une carte d'annonce dans un email, avec chemin DOM, texte, ancre et contexte exact. Plusieurs occurrences peuvent désigner une offre.
- `JobOffer`: annonce distincte d'un recruteur, identité stable. Un email n'est jamais une offre.
- `JobDetail`: fiche développée, depuis la page de destination, avec provenance par champ.
- `EnrichmentAttempt`: essai de chargement/lecture d'une fiche : état, source, échec et date.
- `JobAnalysis`: représentation structurée des missions/exigences : elle n'est pas encore un CV.
- `ImportBatch`: job asynchrone reprenable et idempotent, métriques et progression par message et par offre.

## Corpus obligatoire : vérité terrain

### Indeed

- Objet : « Stage - Ingénieur Etudes Hydraulique urbaine ... 7 offres supplémentaires ... ».
- Le HTML présente **8 cartes d'offres distinctes**, avec 8 identifiants `jk` différents.
- Exemples : SUEZ — Études hydraulique urbaine ; Groupe Solstyce — Assistant ingénieur études ; ALSTOM — Sécurité projet métro automatique ; Schneider Electric — Distribution électrique / génie électrique ; VINCI Energies — Travaux / mobilité électrique.
- La mention « 7 supplémentaires » ne signifie pas seulement 7 offres : il faut aussi compter la carte vedette. Le bouton « Afficher tous les emplois » et les liens de navigation/footer ne sont pas des cartes.

### LinkedIn

- Objet : « Nouvelles offres d'emploi similaires à Stage ... chez WSP ... ».
- **10 annonces recommandées distinctes** : Zeplug, SYSTRA, Thales, Schneider Electric, deux annonces VINCI photovoltaïque/batteries ayant des `jobId` différents, Edvance, Sagemcom, TotalEnergies, VINCI Energies.
- Le `jobId` du titre/objet WSP est une référence contextuelle **non présente dans les 10 cartes recommandées** : ne pas la créer artificiellement.
- Une même annonce a parfois trois ancres HTML (zone entière, intitulé, logo), toutes avec le même `jobId` : fusionner ces ancres au sein de la même occurrence/offre.
- **Ne pas fusionner les deux annonces VINCI** uniquement parce que leur titre est presque identique. Leurs identifiants source sont différents.

### HelloWork

- Objet : « 2 nouvelles offres ». Les deux cartes mises en avant sont répétées plus bas, à côté de recommandations.
- **11 ancres de cartes d'offre** dans cet email, mais **8 offres distinctes** après déduplication sémantique tenant compte de l'employeur et de la localisation ; il ne faut pas limiter l'extraction à 2.
- Exemples distincts : FAYAT Énergies Services (2 intitulés), Eiffage Énergie Systèmes (implantations différentes), Edvance (distribution électrique), CEA (composants de puissance), RATP (ingénieur électrique).
- Les URL de clic HelloWork peuvent changer entre deux apparitions de la même annonce : un tracking différent ne crée pas automatiquement une nouvelle offre. À l'inverse, même intitulé chez un employeur dans deux villes peut correspondre à deux offres.

## Architecture de traitement attendue

### Étape 0 — Découvrir et reprendre tous les emails

- Utiliser Gmail API et la sélection existante (label/configuration de l'utilisateur), `messages.list` avec `nextPageToken` jusqu'à la fin du périmètre demandé ; ne pas s'arrêter à la première page de 100 messages.
- Utiliser les IDs Gmail comme clés d'idempotence. Stocker les checkpoints de pagination et les emails terminés ; une panne peut être reprise sans perdre les derniers lots.
- Traiter les nouveaux emails en priorité, avec possibilité de réanalyser les anciens sans perdre les favoris, candidatures et dates originales.
- Ne pas se limiter arbitrairement à 8 ou 12 annonces pour tout un email ; appliquer les quotas aux tâches concurrentes, pas au nombre d'offres détectées.

### Étape 1 — Décodage MIME fiable

- Décoder récursivement MIME (`text/html`, `text/plain`, `multipart/alternative`), base64url Gmail, quoted-printable et UTF-8 ; réparer les mojibakes du type `IngÃ©nieur` à la source quand c'est justifié.
- Préférer l'HTML pour identifier les **cartes et leurs ancres**, utiliser le texte brut comme secours, sans compter deux fois les mêmes annonces.
- Conserver une copie minimale et un hash du message de référence pour les tests de non-régression ; ne pas confondre le titre du message avec le titre d'une offre.

### Étape 2 — Identifier les cartes et leurs métadonnées

- Parseurs déterministes par fournisseur (`IndeedParser`, `LinkedInParser`, `HelloWorkParser`) + parseur générique pour les nouveaux gabarits.
- Parcourir toutes les sections pertinentes : annonce vedette, « nouvelles offres », « autres offres », « offres similaires », « recommandées », etc.
- Regrouper par bloc DOM cohérent : titre, entreprise, lieu, modalité de travail, rémunération, durée, publication/ancienneté, lien individuel ; un simple `document.querySelectorAll('a')` peut surcompter les logos/navigation et perdre des entreprises.
- Ne pas prendre les boutons de recherche générale, unsubscribe, profil, branding, ou les liens vers les pages de résultats pour des offres.
- Ne jamais supprimer une carte parce qu'elle paraît peu pertinente : collecter d'abord, classifier et filtrer après. Les stages hors spécialité pourront être relégués, mais pas silencieusement perdus.
- Pour chaque carte, conserver `gmailMessageId`, `sourceProvider`, `cardIndex`, `domPath`, `sourceText`, `rawHref`, `sourceJobId?`, `confidence`, `detectedAt`, provenance du titre/entreprise/ville.
- Si un email annonce N offres mais que l'analyseur en trouve moins, afficher un diagnostic ; ne pas prendre N pour la vérité absolue, car les recommandations supplémentaires et répétitions peuvent modifier le décompte.

### Étape 3 — Résoudre les liens et dédupliquer avec prudence

- Capturer `rawHref` intact pour traçabilité, puis normaliser les liens (enlever tracking après extraction de l'identifiant source). Suivre les redirections accessibles et enregistrer `resolvedUrl`, `canonicalUrl`, `companyApplyUrl` si distinct.
- Idéalement clé : `(provider, sourceJobId)` ; à défaut `canonicalUrl` réellement canonique ; à défaut signature normalisée `(titre, entreprise, localisation, type + éventuellement identifiant page)`.
- Distinguer trois issues : `duplicate_confirmed`, `distinct_confirmed`, `possible_duplicate_review` ; ne pas fusionner agressivement les offres homonymes.
- Un doublon entre emails doit enregistrer toutes ses occurrences (`firstSeenAt`, `lastSeenAt`, `sourceMessageIds`), sans casser l'ID stable. Deux jobIds différents chez LinkedIn ne se fusionnent pas automatiquement.
- Les mails de LinkedIn, Indeed et HelloWork peuvent présenter la même annonce : rapprochement inter-sources prudent, provenance des liens et versions conservée.
- **Pas de déduplication par le titre seul ni par l'URL de tracking seule**.

### Étape 4 — Enrichissement approfondi, par offre individuelle

Pour chaque annonce :
1. Niveau `L0 email-only` : enregistrer immédiatement les données fiables du mail, garder l'offre visible avec `enrichmentStatus=queued`.
2. Niveau `L1 destination` : parcourir l'URL individuelle si elle est accessible, suivre une chaîne bornée de redirections, identifier la plateforme et la fiche réellement ouverte (pas une recherche générale).
3. Niveau `L2 HTML` : analyser `application/ld+json` (`JobPosting`), métadonnées, données structurées de la page, DOM principal, éventuelles données JSON sérialisées et sections de l'annonce. Ne confonds pas publicité, recommandations ou offres voisines avec la fiche cible.
4. Niveau `L3 employeur` : s'il existe un lien vers l'annonce sur le site carrière de l'entreprise, comparer les deux fiches. Préférer les informations directement attestées par l'employeur quand elles sont plus précises, mais conserver les contradictions et les dates de capture.
5. Utiliser le navigateur headless **uniquement** en secours lorsque le contenu a besoin de rendu JavaScript et que l'accès est autorisé, avec budgets, timeouts et retries bornés. Ne pas contourner connexion/CAPTCHA ni promettre une fiche complète si bloquée.
6. Ne pas appeler Gemini pour résumer avant d'avoir collecté le meilleur texte accessible ; si bloqué, résumé fondé exclusivement sur le mail, explicitement étiqueté `email_only`.

### Champs enrichis, tous avec provenance

- Titre intégral, employeur, ville/département, adresse ou télétravail, secteur, type de contrat, durée du stage, date de début, date de publication, date limite, salaire si mentionné.
- Description intégrale accessible (`descriptionRaw` + `descriptionClean`), contexte métier et objectif du stage, missions, outils/logiciels, normes/réglementations, méthodes/techniques, technologies, livrables, diplômes/niveaux, langues, compétences obligatoires versus souhaitées, conditions éliminatoires.
- `applyUrl` réelle, lien de l'annonce d'origine, indicateur de disparition/expiration lorsque constaté (ne pas déduire « expirée » d'un simple 403), date de vérification.
- Pour chaque exigence `text`, `type`, `priority`, `isMandatory`, `evidenceSnippet`, `sourceUrl`, `sourceLevel`, `confidence` ; **les déductions de Gemini sont marquées `inferred` et séparées du texte explicitement écrit**.
- Persister un `JobAnalysis` versionné, directement réutilisable par le moteur CV ; ne pas perdre le texte intégral au profit d'un résumé de 3 phrases.

### Étape 5 — IA uniquement là où elle apporte une valeur

- Extraction déterministe des métadonnées et URLs en premier. IA avec sortie JSON validée par schéma uniquement pour structurer un texte de fiche long, arbitrer les sections, classer l'importance technique et détecter des incohérences.
- Vérifier les extraits (`evidenceSnippet`) contre le texte source : aucun logiciel/mission inventé. Si le texte n'est pas accessible, laisser le champ `unknown` et non `false`.
- `cacheKey` = `(canonicalOfferId, contentHash, analysisPromptVersion, modelVersion)`. Recalculer seulement si l'annonce ou le schéma change.
- Priorisation d'enrichissement : nouvelles offres et offres sélectionnées pour adaptation d'abord ; anciennes offres ensuite. Concurrence limitée avec queue persistante, retries exponentiels sur 429/5xx, pause et relance ; checkpoint par offre et non par batch global.

### Étape 6 — Interface et métriques honnêtes

- Pour chaque offre, afficher des badges d'état : `email uniquement`, `fiche analysée`, `bloquée / login`, `à revoir`, `expirée vérifiée` ; bouton « Voir la fiche/source ».
- Quand un utilisateur veut adapter son CV : si enrichissement incomplet, tenter en priorité la fiche sélectionnée ; si toujours indisponible, proposer une adaptation limitée aux exigences connues et afficher ce qui manque.
- Afficher : emails parcourus/total, nombre de cartes détectées, offres uniques, occurrences dédoublonnées, fiches visitées, fiches entièrement analysées, fiches partielles, erreurs, file en attente. Les compteurs doivent être cohérents et réconciliables.
- « Synchronisé » n'est pas synonyme de « enrichi » ; une offre visible même avec `enrichmentStatus=blocked` n'est pas à supprimer.

## Principes de robustesse

- Parseurs isolés/testables à partir du `.eml` brut ; stockage séparé extraction vs enrichissement vs adaptation CV.
- Contrôles d'URL pour éviter de lancer le crawler vers des ressources internes, refus des protocoles autres que HTTP(S), taille de réponse et délai bornés ; cela assure la fiabilité du crawler sans changer la mission de sécurité Git.
- Toujours préserver la meilleure version connue et ses champs attestés si une nouvelle analyse échoue.
- Ne jamais inventer une offre en substituant « Nouvelle entreprise » ou en fabriquant un lien.

## Contrainte de réussite

La validation du corpus doit prouver : **Indeed 8/8**, **LinkedIn 10/10**, **HelloWork 8/8**, sans fausse offre provenant d'un pied de page, d'un bouton de recherche ou d'un objet d'email contextuel. Le test ne prouve pas la réussite universelle : le taux de rappel/precision doit être évalué sur un corpus croissant et les templates inconnus mis en file « à revoir ».
