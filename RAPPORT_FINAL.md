# Rapport final — App « Alertes Gmail » (cible)

- Date : 2026-09-26
- State : **Plan d'amélioration validé — 10/10 étapes livrées et vérifiées ; P0 plan validé : P0-4+P0-5, P0-1, P0-2 et P0-3 livrés (P0 complet) ; 929/929 tests ; tsc/lint/build 0 ; endpoints live 200 ; déploiement Vercel toujours non fait (local validé)**

## 0v. Plan de traitement P0 — P0-3 URLs Indeed (résolution hors ligne + badge « Lien non direct ») (FAIT, 929/929)

### Ce qui a été corrigé

- **100 % hors ligne, vérifié** : un fetch live vers cts/engage renvoie **403** (Indeed bloque les robots) → aucun appel réseau dans tout le P0-3 (déterministe, synchrone, zéro coût Gemini).
- **`cts.indeed.com/v3/<b64url>` décodé localement** : payload = gzip(JSON `{"u":cible}`) — mais le trailer gzip des URLs réelles est absent/corrompu (`gunzipSync` → « incorrect header check » sur **36/36** URLs live). `decodeIndeedCtsTarget` vérifie le magic `1f 8b 08`, saute l'en-tête (10 octets) et `inflateRawSync` le deflate → **36/36 décodées** (fixture sans trailer ajoutée aux tests).
- **Décision sur données réelles (36 cts)** : 18 → `pagead/clk` (vrais clics pub-emploi, titre « Voir l'emploi ») = URL complète + `indirect:true` ; 18 → `subscriptions…/optout` (titre « Se désabonner ») = **offres éjectées** ; 0 → viewjob dans ce jeu.
- **`isValidIndeedJk` = 13-24 alnum** : le charset réel (longueur 13-15 dominant, hex + g-z) a écarté la règle hex-16-20 qui aurait rejeté les 388 jk valides. `?jk&08478d…`, jk court ou clé `jk%26…` → l'URL n'est **jamais** extraite (pas de viewjob fabriqué).
- **Titres chrome accentués** : `isChromeTrackingTitle` normalise NFD→ASCII avant les motifs (les classes `[âe]` ne matchaient pas é/è) → « Se désabonner de cette alerte Emploi », « Gérer les alertes Emploi », « vous désinscrire ici » sont filtrés (à l'extraction ET à l'application).
- **`applyIndeedTargets`** (gmail-core, point d'écriture unique entre `cleanJobUrl` et le gel des clés dans `processEmail`) : cts → cible décodée (chrome éjecté / jk valide résolu en `viewjob` direct / sinon URL conservée + indirect / décodage échec → conservé + indirect) ; engage & pagead seuls → chrome au titre éjecté, sinon `indirect:true` ; les non-Indeed sont intacts.
- **Badge UI** : champ `RawOffer.indirect?` + `isIndirectOfferUrl` (miroir client **pur** dans `gmail-dashboard`, sans zlib) + chip « Lien non direct » (`data-testid="indirect-badge"`) sur `OfferCard` et la page détail offre (`offre/page.tsx`, `offer.indirect ?? isIndirectOfferUrl(...)` pour les anciens payloads sans champ).
- **Migration à la lecture** : `migrateIndeedOffers` appelé dans `loadCheckpoint` (précédent : `repairCheckpoint` P0-1) — les checkpoints antérieurs (cts bruts, chrome, engage sans indirect) sont transformés à chaque lecture : pur, synchrone, idempotent, aucun réseau, aucun appel IA ; la clé de dédup figée (vide sur l'opaque) n'est recalculée que si l'URL a changé, sinon les clés gelées sont préservées.

### Vérification live (`?fresh=1` → snapshot reconstruit puis relu)

- Offres **1084 → 1015** (= −51 chrome engage répétés −18 cts optout) ; `cts.indeed.com` **36 → 0** ; engage **61/61 indirect** ; pagead 31 (tous indirect) ; viewjob 418 dont **0 indirect** ; titres chrome restants **0** ; viewjob à jk invalide **0** ; `fromSnapshot=True` après rebuild ; pending = **59 stable sur 3 mesures** (58 + 1 nouvel e-mail ; la valeur 71 observée une fois à 14 h = snapshot pris en cours de sync, re-stabilisée ensuite).
- tsc **0**, lint **0**, `npx next build` **0**, **929/929 tests** ; endpoints : dashboard sans email **400**, offer-detail `id=` **400**, traversal **400** ; UTF-8 strict + roundtrip **9/9** fichiers édités.

### Tests (863 → 929, +66)

- `offer-links.test.ts` +34 : `isValidIndeedJk` (valides/invalides), zéro extraction sans jk valide, chrome accentué filtré à l'extraction, décodage cts (avec et **sans trailer**, b64 non-gzip → null), chrome-targets, URLs opaques.
- `gmail-core.test.ts` +21 : `applyIndeedTargets` (10 cas : résolution, éjection, indirect, échec, non-Indeed) et `migrateIndeedOffers` (7 cas : dédup recalculée, éjections, idempotence, clés préservées, vides).
- `gmail-module4.test.ts` +10 : `isIndirectOfferUrl` (6) + rendu OfferCard avec/sans badge (3).
- `gmail-module2.test.ts` +1 : fixtures jk `abc123` (6 car.) → 14 car. réalistes avec cas d'invalidité explicite ; `gmail-core.test.ts` fixture `matchRealUrl` idem (+ réparation du message `→` cassé).

## 0w. Plan de traitement P0 — P0-2 statuts (analyse vs résultat, 5 états UI) (FAIT, 863/863)

### Ce qui a été corrigé

- **« En attente » = vraie file d'attente** : la tuile du résumé affichait `pendingRetry` seul ; elle affiche désormais `pending + pendingRetry` (`SyncSummaryCard`), hint « à traiter », tone warn si > 0. `SyncSummaryGlobal` gagne `pending: number` (jamais traité), calculé dans `buildSummary` (`status ∈ {undefined, "pending"}`), `emptySummary`, le literal de sortie de `runSync` (`gmail-core`) et celui de la route `sync` (sans libellé).
- **2 dimensions typées** (champ de processus ≠ champ de contenu) : `EmailAnalysisState = "to_sync" | "analyzed" | "retry" | "error"` et `EmailAnalysisResult = "offer" | "none" | null` (null tant que non analysé — plus de faux résultat), optionnels sur `ProcessedEmail` + helpers `analysisStateOf` (champ explicite → `pending_retry`→retry → `error`/`analyze_error`→error → `done`→analyzed → sinon to_sync), `analysisResultOf` (explicite → sinon null si ≠analyzed → sinon detected&&offers>0 ? offer : none) et `stampAnalysis`. **Les helpers vivent dans `gmail-dashboard` (pur, client-safe) ; `gmail-core` (serveur) importe `stampAnalysis` depuis ce module — jamais l'inverse en runtime** (éviterait de tirer `gmail-server` dans le bundle client).
- **`stampAnalysis` appliqué aux 4 chemins de production** : `processEmail`, `viewFromCp` (`gmail-core`) et les 2 branches `emails.push` de la route `dashboard` → le payload (live + snapshot + cache client) est auto-descriptif : `analysisState`/`analysisResult` présents sur les 288 e-mails (0 manquant).
- **`emailVisualStatus` dérivé** : `recoveryUsed` n'est plus `warning` (le chip `recover-badge` porte l'alerte) → `success` (re-synchronisation = traitement abouti, pas une file d'attente). Les 5 libellés UI : `pending→"À synchroniser"`, `success→"Analysé — offre trouvée"`, `empty→"Analysé — aucune offre"`, `warning→"À réessayer"`, `error→"Erreur"` (`STATUS_LABEL`), glyphe via `STATUS_GLYPH`, `EmailCard` : `aria-label={STATUS_LABEL[status]}` (plus « Offres détectées »/« vérifié »).
- **Robustesse rétro-compat** : `SyncSummaryCard` lit `summary.pending ?? 0 + summary.pendingRetry ?? 0` (snapshots/caches antérieurs à P0-2 sans le champ → pas de NaN) ; dérivation sans champ explicite (anciens payloads) ✓.

### Tests (839 → 863)

- `gmail-module4.test.ts` +24 : matrix P0-2 (`to_sync` sans checkpoint, `retry` prioritaire sur `analyze_error`, `error`, `offer`/`none`, null tant que non analysé, champ explicite prioritaire, `stampAnalysis` attache les 2 champs), les 5 `STATUS_LABEL`, `recoveryUsed → success`, `buildSummary` + fixture `em-5` (`pending = 1`), rendu tuile « En attente » = 3+2 = **5** (regex sur `data-metric="pending"`), StatusBadge ×5 rendus, literals `SyncSummaryCard`/`base` + `pending` (requis TS).
- `gmail-module2.test.ts` : shape du résumé global 9 → **10 champs** (+ `pending`).

### Vérifié

- **863/863 tests** (10 fichiers), tsc 0, lint 0, `next build` 0, **8 fichiers édités UTF-8 strict + roundtrip OK**.
- Live `?fresh=1` : 288 e-mails **tous stampés** — `analysisState` {analyzed 230, to_sync 58}, `analysisResult` {offer 217, none 13, null 58} (217+13 = 230 ✓, null = to_sync ✓), summary `pending=58, pendingRetry=0, errors=0` (230+58 = 288 ✓).
- Live snapshot (sans `fresh=1`) : `fromSnapshot=true`, champs P0-2 présents, `pending=58` — les vieux snapshots sans champ tombent sur le `?? 0` côté client.
- P0-1 toujours vert après P0-2 : mojibake **0**, entités littérales **0**, U+FFFD **0**, re-sync forcée 25 (1 des 26 a été retraité à jour).
- Endpoints : offer-detail id valide → **200**, traversal/sans id → **400**, dashboard sans `email` → **400**.


## 0x. Plan de traitement P0 — P0-1 encodage (entités + réparation checkpoints) (FAIT, 839/839)

### Ce qui a été corrigé

- **`htmlToPlainText` (miroirs `gmail-eml.ts` + `gmail-server.ts`)** : les entités numériques `&#NNN;` / `&#xHH;` sont désormais **décodées** (`entityChar`, invalide → suppression), plus jamais supprimées ni laissées littérales ; `&apos;` ajouté ; `&amp;` traité en dernier (`&amp;#233;` reste littéral `&#233;`).
- **`stripHtml` (`gmail-dashboard.ts`)** : décodage des entités numériques après suppression des balises (`caf&#233;` → `café`, `Ing&#xE9;nieur` → `Ingénieur`).
- **Nouveau `src/lib/text-repair.ts`** : `entityChar` / `decodeNumericEntities` / `looksMojibake` / `repairMojibake` / `repairText` / `isCorruptText` / `repairCheckpoint`. La réparation mojibake est **segmentée** (les caractères propres > 0xFF sont préservés) et **décodage octet-par-octet avec repli** : séquence UTF-8 valide → caractère ; lead C2-C3 orphelin (suite perdue, ex `2Â espace` = nbsp perdue) → supprimé ; contrôle latin1 orphelin 80-9F → supprimé ; tout le reste → caractère latin1 d'origine (protège `©`, `é`, `âge`, `ÿ`…). **Aucun U+FFFD n'est produit par la réparation.**
- **`loadCheckpoint` (`gmail-core.ts`)** : réparation appliquée à TOUTE lecture ; si le texte reste irréparable (U+FFFD déjà présent ou artefacts `þ/ý`) alors que le checkpoint était `done` → `status="pending"` + raison « Texte corrompu (encodage) — re-synchronisation forcée » (état en mémoire, aucune écriture : le prochain run re-traite l'e-mail ; cache `enrichCacheKey` → pas de quota IA si l'URL est inchangée).

### Tests (780 → 839)

- Nouveau `src/lib/text-repair.test.ts` : **45 asserts** (entités, mojibake, repli orphelin, segments, `þ/ý` → corrupt, repairCheckpoint récursif).
- `mime-text.test.ts` +5 (parseEml html-only : hexa/décimal décodés, `&amp;#233;` littéral), `gmail-module4.test.ts` +2 (stripHtml), `gmail-core.test.ts` +7 (réparation checkpoint + force re-sync), `gmail-module3.test.ts` section F accepte l'état « re-sync forcée » P0-1.

### Vérifié

- **839/839 tests** (10 fichiers), tsc 0, lint 0, `next build` 0, endpoints live : dashboard snapshot 200 (288 e-mails, 1,09 Mo), sans `email` → 400, offer-detail 200, traversal/sans id → 400, **10 fichiers UTF-8 strict + roundtrip OK**.
- Live `?fresh=1` : mojibake restant **0**, entités littérales **0**, e-mails en re-sync forcée **180 → 26** (artefacts `Þ`/`Ý` dans les URLs trackées — cohérent avec les ~16 attendus par l'audit ; champs touchés : `sourceUrl`/`snippet`, traités par P0-3 ensuite).


## 0y. Plan de traitement P0 (audit Sections A–E) — P0-4 + P0-5 livré (2026-09-26)

Ordre validé : **P0-4+P0-5 (chargement lent + payload) → P0-1 (encodage) → P0-2 (statuts) → P0-3 (URLs) → P1 → P2/P3**. Vérification complète à chaque phase (tsc/lint/tests/build/endpoints/UTF-8 + rapport).

### P0-4 + P0-5 — chargement instantané + payload allégé (FAIT, 780/780)

| Avant | Après |
|---|---|
| GET dashboard : rebuild complet à chaque affichage (~260 lectures checkpoints ; ~135 s historique) | 1re construction (post-sync / `?fresh=1`) : **17,5 s** ; affichages suivants : **1,1 s** (snapshot, `fromSnapshot=true`) |
| Payload **4,23 Mo** (snippets HTML + sourceUrl inclus) | Payload **1,32 Mo** (−69 %) : 0 snippet, 0 sourceUrl sur 1 283 offres / 287 e-mails |
| 2 appels client séquentiels (status + dashboard) | **1 seul endpoint** : le payload porte connected/configured/gmailAccount/lastSync/reason (`Promise.allSettled` token+OAuth côté serveur) |
| `findVariantKeys` (O(n²)) sur tous les e-mails | Pagination **30 e-mails/page** + variantes calculées sur la page visible |

Fichiers :
- `src/lib/gmail-snapshot.ts` (nouveau) : `loadSnapshot`/`saveSnapshot`/`deleteSnapshot`, clé `gmail:snapshot:<email>` (garde-fou 3 Mo, best-effort).
- `src/app/api/gmail/dashboard/route.ts` : sans `fresh=1` → snapshot (~2 lectures + vérif OAuth live) ; `?fresh=1` → rebuild + réécriture du snapshot ; `slimOffers` sur chaque offre ; token+OAuth en parallèle ; snapshot aussi écrit sur « libellé introuvable » (état de vérité) ; jamais sur échec token/config.
- `src/app/api/gmail/offer-detail/route.ts` (nouveau) : `GET ?id=<emailId>` → offres COMPLÈTES (snippet+sourceUrl) depuis le checkpoint ; id validé (`^[\w.-]{1,128}$`, traversal → 400).
- `src/app/api/gmail/disconnect/route.ts` : purge aussi le snapshot.
- `src/lib/gmail-dashboard.ts` : `slimOffers`, cache client `loadPayloadCache`/`savePayloadCache`/`clearPayloadCache` (clé `cible:gmail:payload:v1:<email>`), champs `fromSnapshot`/`snapshotAt`.
- `src/lib/gmail-core.ts` : `canonicalizeOffers` exporté (partagé dashboard + offer-detail).
- `AlertesGmailDashboard.tsx` : boot = cache local → refresh de fond (spinner `swr-refreshing`), plus d'appel `/api/gmail/status`, post-sync/déconnexion en `refreshDashboard(true)` (`?fresh=1`), cache purgé à la déconnexion.
- `EmailList.tsx` : pagination 30/page (bouton `email-list-more`), `findVariantKeys` sur la page visible (prop `variantKeys` retirée du dashboard).
- `EmailDetail.tsx` / `offre/page.tsx` : régénération des offres complètes à l'ouverture (1 lecture checkpoint), appariement par `offerBridgeKey`.

Vérifié : tsc 0, lint 0, **780/780 tests** (9 fichiers ; m4 323→347), `next build` 0, live : fresh 200 (17,5 s, 1,32 Mo, 0 snippet/sourceUrl), snapshot 200 (1,1 s, `fromSnapshot=true`), offer-detail 200 (8/8 snippets), id invalide/sans id → 400, `progress` 200, page 200, 11 fichiers UTF-8 strict OK.

Écarts / résidus : l'« Exporter le rapport » télécharge le payload allégé (sans snippets) ; `/api/gmail/status` existe toujours (route conservée pour compat) mais n'est plus appelé côté client ; payload 1,32 Mo dominé par descriptions/skills des 1 283 offres (prévisuels nécessaires) — découpage possible ultérieurement si besoin.

## 0z. Plan d'amélioration validé — 10 étapes (2026-09-26)

Chaque étape : tsc 0, lint 0, tous les tests, `next build` 0, endpoints live (GET) 200 (sans paramètre → 400 attendu), fichiers UTF-8 strict vérifiés, rapport livré.

### Progression des tests

`425 → 466 → 480 → 495 → 514 → 547 → 585 → 611 → 675 → 708 → 756` (étapes 1→10)

| Étape | Périmètre | Fichiers clés | Tests |
|---|---|---|---|
| 1 | **P0 encodage** MIME (=?UTF-8?Q?/B?=, folds, quoted-printable) | gmail-core, mime-text | 466 |
| 2 | **P0 URLs** : `jobKeyOf`/`cleanJobUrl`, enrich par clé plateforme | offer-links, gmail-core | 480 |
| 3 | **P0 robustesse** : prod/truncated/verrou + reprise checkpoints | gmail-core, routes | 495 |
| 4 | **P0 affichage** offres (résumé/salary/keywords, logos — P2-6 inclus) | OfferCard, page offre | 514 |
| 5 | **P0 stats** : `buildSummary`, humanization erreurs, progression | gmail-dashboard, routes | 547 |
| 6 | **P1 perf** : skip `format=full`, checkpoints bornés, reprise `enrichOnly` | gmail-server, gmail-core | 585 |
| 7 | **P1 parcours** : doublons actions/bandeaux, bandeau arrivées, déconnexion propre | Dashboard, ConnectionStatus | 611 |
| 8 | **P1 dédup** : clés gelées `dedupUrlKey`/`dedupTclKey`, ingestion dual-format, badge « variante probable » (groupement UI) | gmail-core, gmail-client, gmail-dashboard | 675 |
| 9 | **P2 textes/UI** : labels enrich FR, `humanizeReason`, toasts pluriels, entêtes doublons supprimés, échelle 42px, états disabled, CTA « Première synchro », LoadingState ×4, contraste, violet | 15 fichiers (voir §9) | 708 |
| 10 | **P2-11/12 + P3-1/2 + orphelins** : `NAV_LABEL`, `AI_LABEL` (Gemini→IA), historique syncs `gmail:run:hist:*`, panneau « Détails techniques », suppression 3 fichiers orphelins | 13 fichiers +3 supprimés | **756** |

### Étape 9 — détail (P2 textes/UI)

`gmail-dashboard.ts` (enrichBadge FR + `humanizeReason`) · `AlertesGmailDashboard` (toasts FR pluriels, toolbar responsive, CTA) · `EmailList`/`EmptyState` (CTA `btn-first-sync`) · `EmailDetail` (entête dupliqué supprimé, raison humanisée) · `EmailCard` (`senderLabel`, ligne doublon retirée) · `OfferCard` (chip enrich FR, faux badge méthode retiré) · `SyncSummaryCard` (pluriels, grille 4, hints en tooltip) · `GmailConnectionStatus` (« étiquette Gmail surveillée », `btn-sm`) · `globals.css` (`--muted #736c5f`, `--violet #5f4fd6`, `.btn-line.btn-sm`, `:disabled`, toast multiline) · pages lettres/cv/recruteurs/cv-builder (`<LoadingState />`).

### Étape 10 — détail (P2/P3 finition)

- **P2-11** : `NAV_LABEL` exporté par `AppShell` (source unique = libellés du menu) ; eyebrows « Module 0X » remplacés sur cv, lettres, recruteurs, cv/builder, offers, dashboard ; titre offers aligné.
- **P2-12** : `src/lib/ai-labels.ts` — `AI_LABEL` (3 gestes / 6 libellés) ; « Gemini » → « IA » sur lettres, cv, builder, offers, offre ; 14 « Gemini » restants = pages interdites (rapporté).
- **P3-1** : historique des syncs persistant — clés `cible:gmail:run:hist:<email>:<at>` (≤ 20, trié), composant `RunHistory` liste cliquable (détail : action, horodatage, lus/analysés/offres/importées/erreurs/durée), écrit après chaque run.
- **P3-2** : `EmailDetail` 2 niveaux — normal (raison/erreur humanisées) / `<details>` « Détails techniques » replié (id, raison brute, erreur brute, observabilité, badges).
- **Orphelins supprimés** (0 import vérifié) : `gmail-pipeline.ts` (256 l.), `gmail-enricher.ts` (129 l.), `gmail-api.ts` (174 l.) — `gmail-pipeline.test.ts` teste `gmail-parser`/`gmail-offer-detector`, toujours valide.

### Écarts et non-faits (rapportés, volontaires)

| Écart | Raison |
|---|---|
| P2-6 (logos) | déjà fait en Étape 4 |
| P2-8 renommage `--color-violet` → `--color-accent` | aurait cassé `text-violet` des pages interdites ; token gardé, valeur corrigée (#5f4fd6) + racine `--violet` ajoutée |
| `candidatures`, `adaptation`, `matching` (+ home/connexion/inscription) | pages **interdites** : eyebrows « Module 0X » et « Gemini » restants (14) — non modifiés |
| P3-6 Indeed `voir-emploi/<jk>/` | priorité basse, cassera clés/caches pour 0 gain → non fait |
| P3-3/4/5 (export JSON, refonte composants, a11y sidebar) | hors périmètre des 10 étapes |
| Déploiement Vercel | non fait (validation locale d'abord) |

---

## 0g. Diagnostic « 12 e-mails bloqués en En attente » (2026-009-25)

### Constat (relevés dashboard + contrôle direct du store Supabase, lecture seule)

Deux groupes se mélangeaient dans l'UI :

| Groupe | Nb | Réalité |
|---|---|---|
| Raison « Non traité — lance la synchronisation », checkpoint **absent** (404 Supabase `gmail/gmail:processed:<id>`) | **21** | E-mails **reçus APRÈS le dernier sync complet** (fenêtres disjointes : `done` ≤ 24/09 18:35, `pending` ≥ 24/09 20:08 → 25/09 06:35) |
| Carte résumé « En attente » + « Relancer les erreurs (12) », checkpoint **existant** `status=pending_retry`, `error=Gemini … HTTP 429` | **12** | Échecs Gemini du 24/09 (quota journalier free-tier 500/j épuisé) |

### Cause racine

1. **Aucun sync complet depuis le 24/09 20:09** : les 21 nouveaux e-mails n'avaient jamais été listés au moment du traitement (seule une relance ciblée `relaunch_email` avait tourné, qui **saute tous les autres ids** via `gmail-core.ts` `if (only && !only.has(...)) continue`).
2. **12 en `pending_retry`** = quota Gemini journalier épuisé la veille (pas un bug).
3. **Migration Supabase ÉCARTÉE** : un seul store actif, mêmes clés des deux côtés, 404/200 mesurés objet par objet.

### Correctifs livrés

| # | Fichier | Correction |
|---|---|---|
| 1 | `dashboard/route.ts` (branche cp absent) | Raison honnête : `cp absent + receivedAt > lastSync` → **« Reçu après le dernier sync — lance la synchronisation »** (l'ancienne raison « Non traité » rendait H1 indistinguable d'un blocage) |
| 2 | `sync/route.ts` | `lastSync` écrit **APRÈS** un run réussi (avant : affichait « synchronisé à HH:MM » alors que 0 e-mail traité, et faussement classait les nouveaux reçus) |
| 3 | `gmail-server.ts` | `MAX_MESSAGES` 250 → **500** : le libellé a atteint 250 = l'ancienne limite exacte → le 251e aurait fait sortir silencieusement les plus anciens |
| 4 | `AlertesGmailDashboard.tsx` | Toast du sync : **bannière « ⚠ N non lu(s) (fetch échoué) »** si `fetchSkipped > 0` (champ déjà renvoyé mais jamais affiché) |

### Résultat après relance du sync (25/09 07:25 → 07:39, 835s)

| Avant | Après |
|---|---|
| 217/250 traités, 12 en erreur (429), 21 non traités | **254/259 traités, 0 erreur, 0 en attente** |
| 1143 offres / 375 importées | **1269 offres / 406 importées / 863 doublons** |

- Les 5 restants = nouveaux e-mails arrivés **pendant** l'analyse (le libellé grandit en continu) → affichés désormais « Reçu après le dernier sync », un sync les absorbe.
- tsc **0** · lint **0** · **425/425 tests** · `next build` OK · scripts temporaires nettoyés.

### Limites documentées

- Dashboard : ~135s de chargement (256 × `messages.get metadata` + checkpoints Supabase) — quota-safe mais lent.
- Sync complet : ~14 min (fetch full throttlé 70ms + délai IA 1,5 s/e-mail + Gemini).
- Quota Gemini free-tier : 500 requêtes/**jour** (`gemini-3.1-flash-lite`) — au-delà, e-mails en `pending_retry` rejoués au prochain sync.

## 0f. Bug « 0 traité sur 233 / aucun sujet » — diagnostic + fix (2026-09-24 soir)

### Symptômes
Dashboard connecté, 233 e-mails listés, dernière synchro à 22:10, mais **0 traité, 0 offre**, tous les e-mails « (sans objet) » + « Non traité — lance la synchronisation ».

### Causes racines (confirmées par tests live en lecture seule sur le compte réel)

| # | Bug | Fichier:ligne (avant) | Effet |
|---|---|---|---|
| 1 | `fields` invalide sur `messages.get?format=full` : `payload(headers,name,value,…)` → **HTTP 400 Invalid field selection** sur CHAQUE message | `gmail-server.ts` (~L860) | 0 e-mail lu, erreur avalée silencieusement (non-quota) → sync « réussit » à 0 |
| 2 | `metadataHeaders=Subject,From,Date` (forme virgule non supportée par Gmail — paramètre *répété*) | `gmail-server.ts` (~L842) | headers vides → date OK (internalDate), subject `""` → « (sans objet) », from `—` |
| 3 | Erreurs de fetch non-quota avalées sans trace (pas de compteur) | `gmail-server.ts` catch boucle | bug n°1 invisible : `ok:true`, 0 traité, aucune erreur |
| 4 | Fenêtre quota Gmail « Units per minute » (6000/min) : backoff 800ms/2500ms + throttle 40ms (≈7500 unités/min) | `gmailJson`, throttle | 403 en pleine synchro → 502 |
| 5 | `relaunch_errors` passait `force=true` → re-`full` des 235 e-mails à chaque relance (lent + quota) | `sync/route.ts` | relances > 30 min |
| 6 | `importStatus` (classé en mémoire après le dernier `saveCheckpoint`) jamais persisté | `runSync` | dashboard toujours « 0 importées / 0 doublons » |

### Corrections appliquées

1. `gmail-server.ts` — masque full corrigé : `fields=id,internalDate,payload(headers,body,parts,mimeType)` (vérifié 200).
2. `gmail-server.ts` — `metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date` (forme répétée, vérifiée 200).
3. `gmail-server.ts` — compteur `skipped` + `skipErrors[5]` dans `FetchLabelEmailsResult`, `console.warn` si messages non lus.
4. `gmail-core.ts` — **garde-fou** : `emails.length===0 && total>0 && skipped>0` → throw explicite (sync en 502 au lieu d'`ok:true` à 0).
5. `gmail-core.ts` — `fetchSkipped`/`fetchErrors` propagés dans `SyncOutcome` + réponse sync.
6. `gmail-server.ts` — throttle 40ms → **70ms** (≈4200 unités/min, marge sous 6000) ; `gmailJson` : si quota persistant après 3 essais rapides → **attente fenêtre 61s** (`gmailRetryDelaysMs.quotaWindow`) puis 1 essai final.
7. `sync/route.ts` — `force: force` (sans `|| action !== "sync"`) : `resetErrors` suffit à cibler les erreurs.
8. `gmail-core.ts` — **persistance de `importStatus`/`importReason`** dans les checkpoints après `classifyImportBatch`.
9. `gmail-core.ts` — délai inter-e-mails `GMAIL_AI_DELAY_MS` (défaut 1500ms, désactivé si `skipAi`) contre le 429 Gemini en rafale.

### Résultat après fix (testé en local, sync réel)

| Avant | Après |
|---|---|
| 0 traité / 233 | **222 traité / 235 (94%)** |
| 0 offre | **1157 offres détectées** (378 importées, 779 doublons) |
| 0 sujet (« (sans objet) » partout) | **235/235 sujets + expéditeurs réels** (Indeed, LinkedIn…) |
| erreurs invisibles | 13 `pending_retry` explicites (quota Gemini journalier 500/j épuisé par les tests — repassent au prochain sync) |

- tsc **0** · lint **0** · **425/425 tests** · `next build` OK.
- Note : le quota Gemini free-tier (`generate_content_free_tier_requests`, **500/jour**, modèle `gemini-3.1-flash-lite`) est épuisé aujourd'hui → les 13 derniers e-mails passeront automatiquement demain (statut `pending_retry` conçu pour ça, ou bouton « Relancer les erreurs »).

## 0e. Pipeline modulaire « from scratch » (nouveaux fichiers uniquement)

### Fichiers créés (mission actuelle)

| Fichier | Rôle |
|---|---|
| `src/lib/supabase.ts` | Client REST Supabase Storage (sans SDK : get/put/delete) |
| `src/lib/gmail-api.ts` | Client Gmail quota-safe : backoff exp. 1s→60s, throttle 1 req/s, pagination complète `listAllMessages` |
| `src/lib/gmail-parser.ts` | `parseMessage` : MIME multipart, base64, headers, liens, expéditeur/sujet/date |
| `src/lib/gmail-offer-detector.ts` | `detectOffersInEmail` : URLs **réelles** du mail uniquement (jamais inventées), dédup, `NO_OFFER`/`detected_N_offres` |
| `src/lib/gmail-enricher.ts` | `enrichOffer` : Gemini 30s timeout, retry 429/503 ×3, checkpoints idempotents, jamais bloquant |
| `src/lib/gmail-pipeline.ts` | `runPipeline` (checkpoints `gmail:checked:*`/`gmail:progress:*`, reprise), `readStatusCounts`, `getGmailOffers` (dans ce fichier — `data.ts` intact) |
| `src/lib/gmail-oauth.ts` | `buildAuthUrl`/`exchangeCode`/`refreshAccessToken` (redirect_uri `/api/gmail/auth/callback`) |
| `src/app/api/gmail/auth/callback/route.ts` | Alias callback OAuth (réutilise `exchangeCode`) |
| `src/app/api/gmail/disconnect/route.ts` | `DELETE` → `deleteOauthConnection` |
| `src/lib/gmail-pipeline.test.ts` | 21 assertions : parseMessage + detectOffersInEmail (multi-offre, NO_OFFER, pas d'URL inventée) |

Fichiers **non recréés** (existaient déjà, fonctionnels, non écrasés) : routes `sync`/`status`/`auth`/`callback`/`dashboard`/`deep-recheck`, `src/app/app/alertes-gmail/page.tsx`.

### Corrections pendant la vérification

1. `gmail-offer-detector.ts` : `extractOfferLinks` renvoie `{offers, summary}` (pas un tableau) + `isolateBlock` renvoie `BlockInfo|null` → utilisait `.snippet`.
2. `gmail-enricher.ts` : `keywords` optionnel → `keywords ?? offer.keywords` (type `DetectedOffer.keywords` = `string[]`).
3. Détection multi-offre : la branche « liens texte » ne tournait que si 0 offre plateforme → complément systématique des liens job-like non vus (test Hellowork échouait avant).
4. Lint : `decodeQP` inutilisé supprimé, `let`→`const` (parser), import inutilisé (pipeline).

### Vérifications (après création des fichiers)

- `tsc --noEmit` : **0 erreur**
- `npm run lint` : **0 error, 0 warning**
- Tests : **425/425** (37 offer-links + 67 core + 63 M2 + 56 M3 + 128 M4 + 53 bridge + **21 nouveau pipeline**)
- `npx next build` : OK (18 pages, toutes routes gmail présentes dont `auth/callback` + `disconnect`)
- Test local (dev :3000) :
  - `/api/gmail/status?email=…` → 200 `connected:false` (OAuth non refait = normal)
  - `/api/gmail/auth?email=…` → **307 Google** avec `state` créé dans Supabase (pas de `?error=storage`)
  - `/api/gmail/dashboard?email=…` → 200 JSON propre
  - `POST /api/gmail/sync` sans OAuth → **401 propre** « Compte Gmail non connecté » (jamais de 500)
  - `DELETE /api/gmail/disconnect` → 200
  - `/app/alertes-gmail` → 200

### Non déployé (volontaire)

D'après la consigne : **l'utilisateur teste en local d'abord**. Déploiement (`vercel --prod`) à faire après sa validation.

## 0d. Reconnexion Gmail — diagnostic 2026-09-24 (suite)

### Étape 1 — Blob : TOUJOURS suspendu (vérifié API + PUT)

| Check | Résultat |
|---|---|
| `billingState` | **suspended** |
| `status` | **limits-exceeded-suspended** |
| `usageQuotaExceeded` | **true** |
| PUT santé | **ERR** `This store has been suspended` |
| LIST | OK, **0 fichier** (store vidé) |
| OAuth `gmail:oauth:moustaled.53…` | **absent** (attendu après empty-store) |
| Seul store team | `cible-kv` uniquement (pas de store neuf) |

> **Le store n'est pas réactivé.** Action dashboard team/Billing requise (lever usage threshold) avant toute reconnexion OAuth.

### Codes de connexion (revus)

| Route | État |
|---|---|
| `/api/gmail/auth` | scope `gmail.readonly`, `access_type=offline`, `prompt=consent` OK ; try/catch → 307 `?error=storage` si Blob KO |
| `/api/gmail/callback` | try/catch state + save → `?error=storage` ; exchange token OK |
| `findLabel` | comparaison exacte case-insensitive sur `Stages – Alertes offres` (tiret cadratin) — pas de bug de matching |
| `storageReady()` | détecte la config, **pas** la suspension Blob → d'où le try/catch dans auth/callback |

### Faux « Libellé Gmail introuvable » (corrigé + déployé)

**Bug** : quand Gmail n'est **pas connecté**, `dashboard` renvoie `labelFound:false` sans `hint` → l'UI affichait « Libellé introuvable » au lieu de l'état réel.

**Fix** (`AlertesGmailDashboard.tsx`) :
- `label-missing` affiché **seulement si** `connected && labelFound === false`
- sinon écran `need-connection` avec bouton Connecter + `payload.reason`
- bannière OAuth détaillée pour `error=storage` / `state` / `token` / `config`

Déployé : `dpl_2ub9XmvXChek8CCBhXLiSBbLYQk5` → https://cible-mu.vercel.app

### Étapes 4–9 (bloquées tant que Blob ≠ Active)

| Étape | État |
|---|---|
| Reconnecter OAuth | bloqué : `createOauthState` → 307 `error=storage` |
| Label | non vérifiable sans token (code findLabel correct ; label à confirmer dans Gmail) |
| Sync POST | bloquée (OAuth absent) |
| Dashboard UI offres | bloqué (non connecté) |
| e2e API | bloqué |

### Action utilisateur IMMÉDIATE

1. Dashboard store : https://vercel.com/moustaleddistallo-8831/~/stores/blob/store_XSjIOpWO6A2588Tg  
   → **Billing / plan : lever l'usage threshold** (le store est vidé à 0 o mais reste `limits-exceeded-suspended`).
2. Confirmer que le bouton/état est bien **Active** (pas Inactive/Suspended).
3. Vérifier dans Gmail → Labels que **« Stages – Alertes offres »** existe (tiret cadratin –).
4. Me redire « Blob Active » → je relance reconnexion OAuth, sync, dashboard, e2e.

## 0c. Réactivation Blob store + fix HTTP 500 connexion Gmail

### Diagnostic (avant)

| Champ | Valeur |
|---|---|
| Store | `cible-kv` (`store_XSjIOpWO6A2588Tg`) |
| Status | `suspended` / `limits-exceeded-suspended` |
| Billing | `Inactive` / `suspended` |
| `usageQuotaExceeded` | **true** |
| Taille / count (avant) | 20.16 MB / 692 fichiers |
| GET / PUT | 403 `Your store is blocked` / `BlobStoreSuspendedError` |
| HEAD / LIST | OK (métadonnées seules) |
| Cause racine | **usage threshold limit team atteint** (pas seulement billing) |

### 4 tentatives de réactivation (toutes bloquées)

1. **PATCH API** (`v1`/`v2` storage stores, unsuspend/reactivate/status) → 404 / pas d'endpoint.
2. **`vercel blob empty-store`** → 692 fichiers supprimés (store vidé à 0), **mais** store toujours `suspended` + `usageQuotaExceeded=true` → le quota est au niveau **team**, pas lié au poids actuel.
3. **`vercel blob create-store`** (nouveau store) → `Cannot create another store when usage threshold limit is reached (400)`.
4. **DELETE store API** → 404 ; puis re-create → même erreur usage threshold.

**Conclusion** : réactivation impossible via CLI/API seule. **Action dashboard requise** (plan/usage threshold team) → https://vercel.com/moustaleddistallo-8831/~/stores/blob/store_XSjIOpWO6A2588Tg

### Fix HTTP 500 (livré + déployé)

| Route | Avant | Après |
|---|---|---|
| `GET /api/gmail/auth` | 500 (exception `createOauthState` non catchée) | **307** → `/app/alertes-gmail?error=storage` |
| `GET /api/gmail/callback` | risque 500 sur state/save | try/catch → redirect `?error=storage` |
| `GET /api/gmail/status` | 200 `connected:false` | inchangé (200) |
| `GET /api/gmail/dashboard` | 200 `connected:false` | inchangé (200) |

Fichiers : `src/app/api/gmail/auth/route.ts`, `src/app/api/gmail/callback/route.ts`. Déployé : `dpl_DNz1jMDmvVRf4kjnnYp2ZEpMsR9e` (alias `cible-mu.vercel.app`).

### État final Blob (après interventions)

| Champ | Avant | Après |
|---|---|---|
| Count | 692 | **0** ( vidé) |
| Size | 20.16 MB | **0** |
| Billing / status | suspended | **suspendu (inchangé)** |
| OAuth dans store | 4 fiches `gmail/gmail:oauth:*` | **perdues** (empty-store) → reconnexion Gmail obligatoire après réactivation |

### Action utilisateur (bloquant)

1. Ouvrir le dashboard store ci-dessus (ou team Billing) et **augmenter/lever l'usage threshold** / upgrader le plan.
2. Après réactivation : `vercel blob create-store` si un neuf est nécessaire, ou réutiliser `cible-kv`, puis poser un nouveau `BLOB_READ_WRITE_TOKEN` (`node scripts/force-vercel-env.mjs`).
3. **Reconnecter Gmail** (les fiches OAuth ont été effacées par empty-store).
4. Relancer e2e : `npx --yes tsx scripts/test-pipeline-api.mjs`.

## 0b. Corrections du jour (3 problèmes)

### P1 — Quota Gmail 403 « Total Query Cost »

| Fix | Fichier | Détail |
|---|---|---|
| Retry 403/429 | `gmail-server.ts` `gmailJson` | Backoff 800ms → 2.5s ; throttle ~25 req/s (`GMAIL_MIN_INTERVAL_MS`, déf. 40) |
| Erreur quota non avalée | `gmailJson` / `findLabel` / boucle `fetchLabelEmails` | 403 quota → throw (plus de « libellé introuvable » silencieux) |
| Skip `messages.get` full | `fetchLabelEmails` opts | `resolveMode`: done + meta checkpoint → **skip** (0 unité) ; sinon `meta` (headers) ou `full` |
| Checkpoint meta | `EmailCheckpoint.subject/from/receivedAt` | Persisté à chaque `processEmail` ; backfill runSync/dashboard |
| Dashboard sans full | `dashboard/route.ts` | Jamais `format=full` — skip ou metadata headers |
| Fields mask | list + get | `fields=messages(id,threadId)…` / `fields=id,internalDate,payload(…)` |
| Pause entre gets | `GMAIL_GET_DELAY_MS` (déf. 25ms) | Évite le burst unit/min |

**Effet attendu** : sync n refetch que les emails non-done ; dashboard = 0 full get ; quota 6000/min respecté.

### P2 — UX : offres visibles sans clic « Détails »

- `EmailCard` rend **toujours** `<EmailDetail>` (offres + CTA Postuler → Module 03).
- Bouton renommé **Technique** : masque/affiche uniquement le bloc « observabilité » (`hideObservability`).
- Tests : offre-card + btn-apply présents avec `expanded:false`.

### P3 — Ancienne adresse `moustaled.ibr.dj@gmail.com`

- `pickGmailDisplayAddress(profile, oauth, app)` : **jamais** l’adresse migrée ibr ; priorité profil > OAuth > compte app.
- Utilisé dans `status/route.ts` et `dashboard/route.ts` ; `getOauthConnection` expose `gmailEmail`.
- Constantes historiques `migrate-oauth-53.mjs` L19/L21 **inchangées** (source de migration).

## 0. Verrous respectés

| Fichier | Statut |
|---|---|
| `src/lib/gmail-enrich.ts` | **modifié** (autorisation : summary 3 phrases + cache v2) |
| `src/app/api/gmail/sync/route.ts` | inchangé |
| `src/lib/offer-links.ts` | **modifié** (autorisation explicite Modules C/D) |
| `src/lib/gmail-core.ts` | **modifié** (autorisation e2e : persistance enrich + priorité hôtes + summary) |

### Modifications gmail-core (e2e + chaîne production)

1. **Persistance enrich** (`runSync`) : après `enrichProcessed`, réécrit les checkpoints avec `enrichStatus`.
2. **Priorité hôtes scrapables** (`enrichProcessed`) : Hellowork / Greenhouse / Lever / Workable avant Indeed/LinkedIn (bot-wall).
3. **`summary` 3 phrases** : champ dans `EnrichedOfferData` + `RawOffer`, prompt enrich + `ai.ts` gmail-enrich, `applyEnrichData` le copie.
4. **Cache enrich v2** : `gmail:enrich:v2:<sha1(url)>` — force un re-enrich pour remplir les `summary` manquants (0/989 avant).

## 1. Modules A → F (rapport précédent)

- A Deep Recheck 35/35 ; B pipeline .eml 56/56 ; C offer-links 37/37 ; D isolateBlock ; E dashboard ; F recommandations **traitées**.

## 1b. Chaîne production (étapes 1–8)

| Étape | État | Détail |
|---|---|---|
| 1 Diagnostic | ✅ | Gap listé puis corrigé (summary absent, Postuler → détail, ATS non auto, bridge sans meta) |
| 2 Enrich + summary | ✅ | Prompt enrich demande `summary` (MAX 3 phrases) ; champ persisté ; cache v2 |
| 3 Affichage carte | ✅ | OfferCard : résumé/salary/keywords ATS + badge enrich + lien réel |
| 4 Postuler → Module 03 | ✅ | CTA principal `btn-apply` écrit `cible:quick-adapt` (offerText + meta complète) → `/app/adaptation` ; secondaire Détail |
| 5 ATS auto | ✅ | Page offre : matching auto au chargement (Gemini `task:match`, fallback local) ; Module 03 affiche score ATS si présent dans meta |
| 6 e2e | ✅ | `test-pipeline-api.mjs` étapes 1–8 (status → dashboard → match → letter → Module 03 bridge) |
| 7 Email 53 | ✅ | `moustaled.53@gmail.com` partout |
| 8 Rapport | ✅ | Ce fichier |

### Bridge Module 03 (`writeQuickAdapt`)

```ts
{ offerText, selected, meta: { title, company, location, salary, summary, keywords, source, url, match, present, missing }, at, from: "alertes-gmail" }
```

- `adaptation/page.tsx` lit `meta` → titre/entreprise/résumé/score ATS affichés ; `keywords` injectés dans `DetectedOffer`.
- `offerToOfferText` inclut `summary` en priorité (avant description).

## 2. Étape sécurité + tokens

| Token | Local | Vercel Production/Preview | Test |
|---|---|---|---|
| `GEMINI_API_KEY` | présent (53 car.) | Secret/Hidden | OK ; quota 429 parfois → fallback `gemini-3.6-flash` |
| `BLOB_READ_WRITE_TOKEN` | présent (62 car.) | Secret/Hidden | **store SUSPENDED** (2026-09-24) — réactiver en dashboard |
| `GMAIL_ENC` / `GOOGLE_CLIENT_*` | `.env.local` | Secret/Hidden | OAuth Gmail OK |

- `.gitignore` contient `.env*` ; ne jamais imprimer les secrets.

## 3. E2E local (dev `:3000`)

| Étape | Résultat |
|---|---|
| 1. Connexion Gmail | **BLOQUÉ** — store suspendu ; auth redirige proprement `?error=storage` (fix 500 déployé) |
| 2–8 | non exécutés (dépendent de 1) |
| Unit tests hors e2e | **404/404 verts** |

> **Action requise (dashboard Vercel)** : lever l'usage threshold team / réactiver le store, re-seed le token + reconnecter Gmail, puis relancer `npx --yes tsx scripts/test-pipeline-api.mjs`.

## 4. Tests / qualité

| Check | Résultat |
|---|---|
| `tsc --noEmit` | **0** |
| `npm run lint` | **0** |
| `next build` | **0** (18 pages) |
| offer-links | **37** |
| gmail-core | **67** (+quota detect + display address) |
| gmail-bridge | **53** |
| gmail-module2 | **63** |
| gmail-module3 | **56** |
| gmail-module4 | **128** (+EmailCard offres sans clic) |
| **Total unit** | **404/404** |
| e2e API | **bloqué** Blob suspended (voir §3) |

## 5. Déploiement Vercel

- Projet : `moustaleddistallo-8831/cible`
- Alias : **https://cible-mu.vercel.app**
- Smoke prod : pages 200, status `connected:true`, AI letter OK

## 6. Décisions documentées

- **Règle d'or** : une offre = objet atomique ; `sourceUrl`+`anchorText`+`snippet` ; jamais d'URL inventée.
- **Enrich** : cache `gmail:enrich:v2:<sha1(url)>` ; `blocked` cachable ; `skipped` non cachable ; `GMAIL_ENRICH_MAX=40`.
- **Pipeline candidature** : `none → adaptation → letter_ready → sent` ; store `cible:gmail-cand:v1:<email>`.
- **CTA offre** : principal **Postuler → Module 03** ; secondaire **Détail** page offre ; tertiaire Site ↗.

## 7. Limites connues

1. **Blob store suspended** (bloquant) : usage threshold team atteint — store vidé mais toujours suspendu ; OAuth/checkpoints injouables → status « non connecté ». **Lever le threshold dans le dashboard Vercel**, re-seed token, reconnecter Gmail.
2. **Quota Gemini** : parfois 429/503 — fallback modèles géré.
3. **Indeed/LinkedIn** : anti-robot → `enrichStatus: blocked`.
4. **Sync > 5 min** : timeout client vs serveur (persisté côté serveur).
5. **Dashboard** : lit les checkpoints (skip full Gmail désormais — beaucoup plus rapide).
6. Gold corpus : écarts code vs gold dans `gmail-module3-report.md`.

## 8. Reproductibilité

```powershell
.\node_modules\.bin\tsc --noEmit
npx --yes tsx "src/lib/offer-links.test.ts"
npx --yes tsx "src/lib/gmail-core.test.ts"
npx --yes tsx "src/lib/gmail-module2.test.ts"
npx --yes tsx "src/lib/gmail-module3.test.ts"
npx --yes tsx "src/lib/gmail-module4.test.ts"
npx --yes tsx "src/lib/gmail-bridge.test.ts"
npm run lint
npx next build
node scripts\probe-tokens.mjs
node scripts\test-pipeline-api.mjs   # dev server requis sur :3000
```
