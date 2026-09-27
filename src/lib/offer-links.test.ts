/* Tests de régression offer-links — fixes Module A (Indeed + Hellowork).
   Exécution : npx tsx src/lib/offer-links.test.ts */

import { extractOfferLinks, extractAnchorMap, isolateBlock, canonicalizeOfferUrl, cleanJobUrl, jobKeyOf, isValidIndeedJk, decodeIndeedCtsTarget, isIndeedChromeTargetUrl, isIndeedOpaqueUrl, isChromeTrackingTitle } from "./offer-links";
import { gzipSync } from "node:zlib";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log("  OK " + msg);
  } else {
    failed++;
    console.error("  FAIL " + msg);
  }
}

console.log("1. Indeed jk corrompu");
{
  const html =
    '<html><body>' +
    '<a href="https://fr.indeed.com/rc/clk/dl?jk' + String.fromCharCode(161) + 'e7df7790db2028&from=ja">Stage A</a>' +
    '<a href="https://fr.indeed.com/rc/clk/dl?jk' + String.fromCharCode(216) + 'c9cdeacd24ba18&from=ja">Stage B</a>' +
    '<a href="https://fr.indeed.com/rc/clk/dl?jk=e7df7790db2028&from=ja">Stage C</a>' +
    "</body></html>";
  const r = extractOfferLinks(html);
  /* jk¡e7df… et jk=e7df… = même jobKey après nettoyage → 2 uniques (pas 3). */
  assert(r.summary.unique === 2, "2 offres uniques (dédup jk identique), obtenu " + r.summary.unique);
  assert(
    r.offers.every((o) => o.canonicalUrl.indexOf("viewjob?jk=") >= 0),
    "URL canoniques viewjob?jk="
  );
  assert(
    r.offers.some((o) => o.key === "in:e7df7790db2028"),
    "jobKey nettoyé e7df7790db2028"
  );
  assert(
    r.offers.some((o) => o.key === "in:c9cdeacd24ba18"),
    "jobKey nettoyé c9cdeacd24ba18"
  );
}

console.log("2. Indeed cts tracking");
{
  const p1 = "/v3/H4sIAAAAAAAA_32U2aqraBBG3yXQuWrPdo5uCI1xinEeosYbcZ7zO0bN4bx753RDXzZVUPCtgrqq9fOwHL4P5Tz30";
  const p2 = "/v3/H4sIAAAAAAAA_12Q22rjMBRF_8XQPtWNpVh2EihDBjtNcyHYTXN7MbJ8kXyRVEVOYpf-e90OzEPPy4G9NmxYH0";
  const html =
    "<html><body>" +
    '<a href="https://cts.indeed.com' + p1 + '">Flying Doc Calibration (H/F)</a>' +
    '<a href="https://cts.indeed.com' + p1 + '">Voir l\'emploi</a>' +
    '<a href="https://cts.indeed.com' + p1 + '">En savoir plus</a>' +
    '<a href="https://cts.indeed.com' + p2 + '">Ne correspond pas</a>' +
    '<a href="https://cts.indeed.com' + p2 + '">Oui</a>' +
    '<a href="https://cts.indeed.com' + p2 + '">Non</a>' +
    "</body></html>";
  const r = extractOfferLinks(html);
  assert(r.summary.unique === 1, "chrome filtre -> 1 offre, obtenu " + r.summary.unique);
  assert(
    r.offers[0] && r.offers[0].key.indexOf("incts:") === 0,
    "cle incts: " + (r.offers[0] ? r.offers[0].key : "none")
  );
}

console.log("3. Indeed engage jobalert");
{
  const html =
    "<html><body>" +
    '<a href="https://engage.indeed.com/f/a/job1~~/x~/tok1">Ing Controle-Commande</a>' +
    '<a href="https://engage.indeed.com/f/a/job1~~/x~/tok1">Ing Controle-Commande</a>' +
    '<a href="https://engage.indeed.com/f/a/job2~~/x~/tok2">Stage Automaticien</a>' +
    '<a href="https://engage.indeed.com/f/a/job2~~/x~/tok2">Stage Automaticien</a>' +
    '<a href="https://engage.indeed.com/f/a/unsub~~/x~/t">Se desabonner de cette alerte Emploi</a>' +
    '<a href="https://engage.indeed.com/f/a/list~~/x~/t">Afficher tous les emplois</a>' +
    "</body></html>";
  const r = extractOfferLinks(html);
  assert(r.summary.unique === 2, "2 offres engage, obtenu " + r.summary.unique);
  assert(
    r.offers.every((o) => o.key.indexOf("ineng:") === 0),
    "cles ineng:"
  );
}

console.log("4. Indeed pagead jrtk");
{
  const html =
    "<html><body>" +
    '<a href="https://fr.indeed.com/pagead/clk/dl?from=x&jrtk=abc123def456">Stage Neutronique</a>' +
    '<a href="https://fr.indeed.com/pagead/clk/dl?from=x&jrtk=abc123def456">Stage Neutronique</a>' +
    '<a href="https://fr.indeed.com/pagead/clk/dl?from=x&jrtk=xyz789">Stage Incertitudes</a>' +
    '<a href="https://fr.indeed.com/?co=FR">Afficher plus d\'emplois</a>' +
    "</body></html>";
  const r = extractOfferLinks(html);
  assert(r.summary.unique === 2, "2 offres jrtk, obtenu " + r.summary.unique);
  assert(
    r.offers.every((o) => o.key.indexOf("inpk:") === 0),
    "cles inpk:"
  );
}

console.log("5. Hellowork clic payload");
{
  const url1 = "https://www.hellowork.com/fr-fr/emplois/83622746.html?utm_source=jobalert";
  const url2 = "https://www.hellowork.com/fr-fr/emplois/81507247.html?utm_source=jobalert";
  const payload1 = Buffer.from("user@test.com" + url1, "utf8").toString("base64");
  const payload2 = Buffer.from("user@test.com" + url2, "utf8").toString("base64");
  const logoPayload = Buffer.from(
    "user@test.comhttps://www.hellowork.com/fr-fr/",
    "utf8"
  ).toString("base64");
  const voirPayload = Buffer.from(
    "user@test.comhttps://www.hellowork.com/fr-fr/candidat/alertes.html",
    "utf8"
  ).toString("base64");
  const html =
    "<html><body>" +
    '<a href="https://emails.hellowork.com/clic/uuid/3/deadbeef/' + payload1 + '">Stage Ing Genie Electrique</a>' +
    '<a href="https://emails.hellowork.com/clic/uuid/5/cafebabe/' + payload1 + '">Voir l\'offre</a>' +
    '<a href="https://emails.hellowork.com/clic/uuid/11/feedface/' + payload2 + '">Stage Ing CFO</a>' +
    '<a href="https://emails.hellowork.com/clic/uuid/13/badc0de/' + payload2 + '">Voir l\'offre</a>' +
    '<a href="https://emails.hellowork.com/clic/uuid/10/aaaabbbb/' + voirPayload + '">Voir toutes les offres</a>' +
    '<a href="https://emails.hellowork.com/clic/uuid/1/00000000/' + logoPayload + '">Logo Hellowork</a>' +
    "</body></html>";
  const r = extractOfferLinks(html);
  assert(r.summary.unique === 2, "2 offres HW dedup id, obtenu " + r.summary.unique);
  const keys = r.offers.map((o) => o.key);
  assert(keys.indexOf("hw:83622746") >= 0, "hw:83622746 present");
  assert(keys.indexOf("hw:81507247") >= 0, "hw:81507247 present");
  assert(
    r.offers.every((o) => o.canonicalUrl.indexOf("/emplois/") >= 0),
    "URL canoniques /emplois/"
  );
  assert(
    r.offers.every((o) => !/voir l|logo|toutes/i.test(o.rawTitle)),
    "chrome HW filtre"
  );
}

console.log("6. LinkedIn non impacte");
{
  const html =
    "<html><body>" +
    '<a href="https://www.linkedin.com/comm/jobs/view/4470469053/?trackingId=abc">Job Title</a>' +
    '<a href="https://www.linkedin.com/jobs/view/12345/">Other Job</a>' +
    '<a href="https://t1.em.linkedin.com/r/?id=xyz">Essayer gratuitement</a>' +
    "</body></html>";
  const r = extractOfferLinks(html);
  assert(r.summary.unique === 2, "2 offres LinkedIn, obtenu " + r.summary.unique);
  assert(
    r.offers.every((o) => o.key.indexOf("li:") === 0),
    "cles li:"
  );
}

console.log("7. extractAnchorMap / isolateBlock");
{
  const html =
    '<html><body><div class="job-card">' +
    '<a href="https://fr.indeed.com/viewjob?jk=abc123def"><img alt="Logo" src="l.png"><h3>Stage Test</h3></a>' +
    "<p>Paris</p></div></body></html>";
  const anchors = extractAnchorMap(html);
  assert(anchors.length >= 1, "anchors extraits " + anchors.length);
  assert(
    anchors.some((a) => a.href.indexOf("jk=abc123def") >= 0),
    "href Indeed dans anchors"
  );
  const b = isolateBlock(html, "https://fr.indeed.com/viewjob?jk=abc123def");
  assert(b !== null && typeof b.snippet === "string", "isolateBlock retourne un bloc");
}

console.log("7b. isolateBlock — tracking → clé (query string)");
{
  const html =
    "<html><body>" +
    '<div class="job"><a href="https://fr.indeed.com/rc/clk/dl?jk=a1e7df7790db2028&from=ja&qd=xyz">Stage A</a>' +
    "<span>Paris</span></div>" +
    '<div class="job"><a href="https://fr.indeed.com/rc/clk/dl?jk=b2e7df7790db2029&from=ja&qd=abc">Stage B</a>' +
    "<span>Lyon</span></div>" +
    "</body></html>";
  const b1 = isolateBlock(html, "https://fr.indeed.com/rc/clk/dl?jk=a1e7df7790db2028&from=ja&qd=xyz");
  const b2 = isolateBlock(html, "https://fr.indeed.com/rc/clk/dl?jk=b2e7df7790db2029&from=ja&qd=abc");
  assert(b1 !== null && b1.snippet.length > 0, "Indeed tracking href → snippet non vide");
  assert(b2 !== null && b2.snippet.length > 0, "2e offre tracking → snippet non vide");
  assert(
    Boolean(b1 && b1.snippet.indexOf("Stage A") >= 0 && b1.snippet.indexOf("Paris") >= 0),
    "bloc 1 contient Stage A + Paris"
  );
  assert(
    Boolean(b2 && b2.snippet.indexOf("Stage B") >= 0 && b2.snippet.indexOf("Lyon") >= 0),
    "bloc 2 contient Stage B + Lyon (pas le mauvais)"
  );

  const bCan1 = isolateBlock(html, "https://fr.indeed.com/viewjob?jk=a1e7df7790db2028");
  assert(
    Boolean(bCan1 && bCan1.snippet.indexOf("Stage A") >= 0),
    "URL canonique → même bloc via clé jk"
  );
}

console.log("7c. isolateBlock — LinkedIn comm/jobs/view");
{
  const html =
    "<html><body>" +
    '<div><a href="https://www.linkedin.com/comm/jobs/view/4468500326/?trackingId=abc"><img alt="Job" src="j.png"></a>' +
    "<h3>Stage Automaticien</h3><p>EDF</p></div>" +
    "</body></html>";
  const bOrig = isolateBlock(
    html,
    "https://www.linkedin.com/comm/jobs/view/4468500326/?trackingId=abc"
  );
  const bCan = isolateBlock(html, "https://www.linkedin.com/jobs/view/4468500326/");
  assert(bOrig !== null && bOrig.snippet.length > 0, "LinkedIn tracking → snippet");
  assert(bCan !== null && bCan.snippet.length > 0, "LinkedIn canonique → snippet via clé li:");
  assert(
    Boolean(bOrig && bOrig.snippet.indexOf("Stage Automaticien") >= 0),
    "bloc LinkedIn contient le titre"
  );
}

console.log("8. Edge cases");
{
  const e = extractOfferLinks("");
  assert(e.summary.unique === 0 && e.summary.htmlPresent === false, "HTML vide");
  const u = extractOfferLinks(undefined);
  assert(u.summary.unique === 0, "undefined");
}

console.log("9. canonicalizeOfferUrl — tracking → URL Postuler propre");
{
  const indeed = canonicalizeOfferUrl(
    "https://fr.indeed.com/rc/clk/dl?jk=e7df7790db2028&from=ja"
  );
  assert(
    indeed === "https://fr.indeed.com/viewjob?jk=e7df7790db2028",
    "Indeed rc/clk → viewjob?jk=, obtenu " + indeed
  );

  const urlHw = "https://www.hellowork.com/fr-fr/emplois/83622746.html?utm_source=jobalert";
  const payloadHw = Buffer.from("user@test.com" + urlHw, "utf8").toString("base64");
  const hw = canonicalizeOfferUrl(
    "https://emails.hellowork.com/clic/uuid/3/deadbeef/" + payloadHw
  );
  assert(
    hw === "https://www.hellowork.com/fr-fr/emplois/83622746.html",
    "HelloWork clic → /emplois/, obtenu " + hw
  );

  const li = canonicalizeOfferUrl(
    "https://www.linkedin.com/comm/jobs/view/4470469053/?trackingId=abc"
  );
  assert(
    li === "https://www.linkedin.com/jobs/view/4470469053/",
    "LinkedIn comm → jobs/view, obtenu " + li
  );

  assert(
    canonicalizeOfferUrl("https://fr.indeed.com/viewjob?jk=e7df7790db2028") ===
      "https://fr.indeed.com/viewjob?jk=e7df7790db2028",
    "idempotent sur URL déjà canonique"
  );

  assert(canonicalizeOfferUrl("https://example.com/foo") === null, "plateforme inconnue → null");
  assert(canonicalizeOfferUrl("") === null, "vide → null");
  assert(canonicalizeOfferUrl("not-a-url") !== null || true, "URL relative non throw");
}

console.log("10. cleanJobUrl + jobKeyOf — nettoyage et clé plateforme");
{
  const raw = "https://www.linkedin.com/comm/jobs/view/4470469053/?trk=email&refId=abc&lipi=x";
  assert(
    cleanJobUrl(raw) === "https://www.linkedin.com/jobs/view/4470469053/",
    "cleanJobUrl LinkedIn tracking → propre"
  );
  assert(
    cleanJobUrl("https://fr.indeed.com/viewjob?jk=e7df7790db2028&utm_source=alerte&utm_medium=email") ===
      "https://fr.indeed.com/viewjob?jk=e7df7790db2028",
    "cleanJobUrl Indeed retire utm_*"
  );
  assert(
    cleanJobUrl("https://www.linkedin.com/jobs/view/4470469053/") ===
      "https://www.linkedin.com/jobs/view/4470469053/",
    "cleanJobUrl idempotent sur déjà propre"
  );
  assert(
    cleanJobUrl("https://example.com/foo?bar=1") === "https://example.com/foo?bar=1",
    "plateforme inconnue → inchangée (pas de réécriture)"
  );
  assert(cleanJobUrl("") === "", "vide → inchangé");
  assert(jobKeyOf(raw) === "li:4470469053", "jobKeyOf LinkedIn (tracking)");
  assert(
    jobKeyOf("https://www.linkedin.com/jobs/view/4470469053/") === "li:4470469053",
    "jobKeyOf LinkedIn (canonique) — même clé"
  );
  assert(
    jobKeyOf("https://fr.indeed.com/rc/clk/dl?jk=e7df7790db2028&from=ja") === "in:e7df7790db2028",
    "jobKeyOf Indeed (rc/clk)"
  );
  assert(jobKeyOf("https://example.com/foo") === null, "jobKeyOf inconnu → null");
}

console.log("11. P0-3 : jk valide, chrome accentué, décodage cts hors ligne");
{
  /* a — validation du jobKey (13-24 alnum ; déchets rejetés). */
  assert(isValidIndeedJk("e7df7790db2028"), "jk 14 hex valides");
  assert(isValidIndeedJk("0a54608e4dacc1"), "jk 14 mixtes valides");
  assert(isValidIndeedJk("Abc123Def45678"), "jk 14 alnum valides");
  assert(isValidIndeedJk("0123456789abc"), "jk 13 min valide");
  assert(isValidIndeedJk("0123456789abcdefghij"), "jk 20 valide");
  assert(!isValidIndeedJk(""), "jk vide invalide");
  assert(!isValidIndeedJk("08478d4e2f1a"), "jk 12 car. trop court invalide");
  assert(!isValidIndeedJk("fromindeed"), "slug non-hex invalide");
  assert(!isValidIndeedJk("0123456789abcdefghijklmnop"), "jk 26 car. trop long invalide");
  assert(!isValidIndeedJk("jk=e7df7790db2028"), "avec préfixe k=v invalide");

  /* b — URL sans jk valide → JAMAIS extraite (pas de viewjob fabriqué). */
  const rej =
    '<a href="https://fr.indeed.com/rc/clk/dl?jk&08478d4e2f1a">A</a>' +
    '<a href="https://fr.indeed.com/rc/clk/dl?jk%2608478d4e2f1a">B</a>' +
    '<a href="https://fr.indeed.com/rc/clk?jk=abc">C</a>';
  const rj = extractOfferLinks("<html><body>" + rej + "</body></html>");
  assert(rj.summary.unique === 0, "sans jk valide → 0 offre, obtenu " + rj.summary.unique);
  assert(
    rj.offers.every((o) => !/viewjob\?jk=/.test(o.canonicalUrl)),
    "aucun viewjob fabriqué"
  );

  /* c — chrome engage avec ACCENTS réels (filtrés avant P0-3 via [âe]). */
  const chrome =
    '<a href="https://engage.indeed.com/f/a/job9~~/x~/t">Stage Data Engineer H/F</a>' +
    '<a href="https://engage.indeed.com/f/a/un9~~/x~/t">Se désabonner de cette alerte Emploi</a>' +
    '<a href="https://engage.indeed.com/f/a/gt9~~/x~/t">Gérer les alertes Emploi</a>' +
    '<a href="https://engage.indeed.com/f/a/ds9~~/x~/t">vous désinscrire ici</a>';
  const rc = extractOfferLinks("<html><body>" + chrome + "</body></html>");
  assert(rc.summary.unique === 1, "chrome accentué filtré → 1 offre, obtenu " + rc.summary.unique);
  assert(
    !!rc.offers[0] && rc.offers[0].rawTitle.indexOf("Stage Data") >= 0,
    "seule l'offre réelle reste (titre conservé)"
  );
  assert(
    isChromeTrackingTitle("Se désabonner de cette alerte Emploi"),
    "isChromeTrackingTitle exporté + titre accentué match"
  );
  assert(
    !isChromeTrackingTitle("Stage Data Engineer H/F"),
    "titre job réel ≠ chrome"
  );

  /* d — décodage cts hors ligne (gzip JSON{"u":…} → base64url). */
  const mk = (u: string) =>
    "https://cts.indeed.com/v3/" + gzipSync(Buffer.from(JSON.stringify({ u }), "utf8")).toString("base64url");
  assert(decodeIndeedCtsTarget(mk("https://fr.indeed.com/viewjob?jk=f1e2d3c4b5a697")) === "https://fr.indeed.com/viewjob?jk=f1e2d3c4b5a697", "cts → u viewjob décodé");
  assert(decodeIndeedCtsTarget(mk("https://fr.indeed.com/pagead/clk?jrtk=abc123def456")) === "https://fr.indeed.com/pagead/clk?jrtk=abc123def456", "cts → u pagead décodé");
  assert(decodeIndeedCtsTarget("https://cts.indeed.com/v3/truncatedgarbage===") === null, "cts tronqué → null");
  /* Cas live : trailer gzip absent/corrompu — gunzipSync échouerait,
     l'inflate brut après l'en-tête (10 octets) décoded quand même. */
  const gzNoTrailer = gzipSync(Buffer.from(JSON.stringify({ u: "https://fr.indeed.com/viewjob?jk=f1e2d3c4b5a697" }))).subarray(0, -8);
  assert(
    decodeIndeedCtsTarget("https://cts.indeed.com/v3/" + gzNoTrailer.toString("base64url")) === "https://fr.indeed.com/viewjob?jk=f1e2d3c4b5a697",
    "cts sans trailer gzip (cas live 36/36) → décodé"
  );
  assert(decodeIndeedCtsTarget("https://cts.indeed.com/v3/QUFBQQ==") === null, "b64 non-gzip (pas de magic 1f8b) → null");
  assert(decodeIndeedCtsTarget("https://engage.indeed.com/f/a/x") === null, "non-cts → null");
  assert(decodeIndeedCtsTarget(mk("ftp://example.com")) === null, "u non-http → null");
  assert(decodeIndeedCtsTarget(mk("not a url at all")) === null, "u illisible → null");

  /* e — cibles chrome / URLs opaques. */
  assert(isIndeedChromeTargetUrl("https://subscriptions.indeed.com/optout?co=FR"), "optout = chrome");
  assert(isIndeedChromeTargetUrl("https://fr.indeed.com/alerts/cancel?tk=x"), "alerts/cancel = chrome");
  assert(isIndeedChromeTargetUrl("https://fr.indeed.com/unsubscribe?id=1"), "unsubscribe = chrome");
  assert(!isIndeedChromeTargetUrl("https://fr.indeed.com/pagead/clk?jrtk=x"), "pagead ≠ chrome");
  assert(!isIndeedChromeTargetUrl("https://fr.indeed.com/viewjob?jk=f1e2d3c4b5a697"), "viewjob ≠ chrome");
  assert(isIndeedOpaqueUrl("https://engage.indeed.com/f/a/tok~~/x~/y"), "engage opaque");
  assert(isIndeedOpaqueUrl("https://cts.indeed.com/v3/H4sIAAAA"), "cts opaque");
  assert(isIndeedOpaqueUrl("https://fr.indeed.com/pagead/clk/dl?jrtk=x"), "pagead opaque");
  assert(!isIndeedOpaqueUrl("https://fr.indeed.com/viewjob?jk=f1e2d3c4b5a697"), "viewjob jk valide = direct");
  assert(!isIndeedOpaqueUrl("https://www.linkedin.com/jobs/view/123/"), "linkedin ≠ opaque");
}

console.log("");
console.log(passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
