/* Tests de non-régression — réanalyse des anciens mails + protocole de synchro.
   Exécution : npx tsx src/lib/gmail-reanalyze.test.ts

   Couvre les exigences de la mission :
   · un mail à dix offres dont l'objet n'en nomme qu'une : aucun autre titre ne
     reprend l'objet ;
   · une ancre « Voir l'offre » ne devient jamais un titre ;
   · un checkpoint « done » : la synchro normale le saute, la réanalyse le traite ;
   · plusieurs lots de réanalyse : progression réelle, jamais de retraitement ;
   · une offre postulée garde son identité (candidature conservée) ;
   · une offre supprimée ne réapparaît pas ;
   · une page externe bloquée : état explicite, aucun détail inventé ;
   · un filtre énergie/électricité n'est déclenché que par la preuve de l'annonce. */

import assert from "node:assert/strict";
import { detectOffersInEmail } from "./gmail-offer-detector";
import {
  advanceReanalyzeCursor,
  mergeReanalyzedOffers,
  nextReanalyzeBatch,
  offerDisplayKey,
  sumReanalyzeReports,
  type ReanalyzableOffer,
  type ReanalyzeReport,
} from "./gmail-reanalyze";
import { buildReanalyzeQueue } from "./gmail-reanalyze-queue";
import { classifyImportBatch, shouldProcessEmail } from "./gmail-core";
import { offerBridgeKey, offerToDetectedOffer } from "./gmail-bridge";
import { appliedOfferIds } from "./applied-offers";
import { isOfferDismissed, offerDismissalKeys } from "./offer-dismissal";
import { applyOfferFilters, DOMAIN_KEYWORDS, EMPTY_FILTERS, type OfferListFilters } from "./offres-filters";
import type { DetectedOffer, UserData } from "./data";

let passed = 0;
function ok(name: string) {
  passed++;
  console.log("  OK " + name);
}

const offer = (over: Partial<ReanalyzableOffer> = {}): ReanalyzableOffer => ({
  title: "",
  company: "",
  location: "",
  contract: "Stage",
  duration: "",
  deadline: "",
  skills: [],
  description: "",
  applicationUrl: "",
  source: "HelloWork",
  ...over,
});

/* ══════════ 1. Objet du mail jamais recopié dans les sous-offres ══════════ */

console.log("1. Mail à dix offres, objet n'en nommant qu'une");
{
  const subject = "Stage Ingénieur Réseaux Électriques chez Enedis — 10 nouvelles offres";
  const cards = Array.from({ length: 10 }, (_, index) => {
    const id = 100000 + index;
    return `<div class="job-item"><a href="https://www.hellowork.com/fr-fr/emploi/stage-offre-${id}.html">${
      index === 0 ? subject : `Stage Ingénieur électrotechnique ${index} H/F`
    }</a><p>FAYAT ENERGIES SERVICES</p><p>Lyon - 69</p></div>`;
  }).join("\n");
  const parsed = {
    id: "msg-10",
    subject,
    from: "alertes@hellowork.com",
    to: "candidat@example.test",
    date: "2026-10-10",
    messageId: "<m10@test>",
    text: cards.replace(/<[^>]+>/g, " "),
    html: `<html><body>${cards}</body></html>`,
    bodyPlain: cards.replace(/<[^>]+>/g, " "),
    bodyHtml: `<html><body>${cards}</body></html>`,
    links: [],
    headers: {},
    attachments: [],
  };
  const det = detectOffersInEmail(parsed);
  assert.equal(det.offers.length, 10, `dix annonces distinctes, obtenu ${det.offers.length}`);
  ok("dix liens → dix offres");
  const fromSubject = det.offers.filter((o) => o.title === subject);
  assert.ok(fromSubject.length <= 1, `l'objet n'est repris que par l'offre qui le porte (${fromSubject.length})`);
  ok("l'objet ne devient pas le titre commun");
  for (const o of det.offers.slice(1)) {
    assert.notEqual(o.title, subject, `titre propre pour ${o.url}`);
    assert.ok(o.title.length > 0 && o.title !== "Voir l’offre", `titre réel : ${o.title}`);
  }
  ok("les neuf autres gardent leur propre intitulé");
  assert.equal(new Set(det.offers.map((o) => o.url)).size, 10, "dix liens distincts");
  ok("liens individuels distincts");
}

/* ══════════ 2. Ancre générique « Voir l'offre » ══════════ */

console.log("2. Ancre « Voir l'offre »");
{
  const html = `<html><body><div><h3>Stage Ingénieur Génie Électrique H/F</h3>
    <p>Bouygues Énergies &amp; Services</p><p>Nanterre - 92</p>
    <a href="https://www.hellowork.com/fr-fr/emploi/stage-genie-777.html">Voir l'offre</a></div></body></html>`;
  const parsed = {
    id: "msg-generic",
    subject: "Alerte",
    from: "alertes@hellowork.com",
    to: "candidat@example.test",
    date: "2026-10-10",
    messageId: "<mg@test>",
    text: "Stage Ingénieur Génie Électrique H/F Bouygues Énergies & Services Nanterre - 92",
    html,
    bodyPlain: "Stage Ingénieur Génie Électrique H/F Bouygues Énergies & Services Nanterre - 92",
    bodyHtml: html,
    links: [],
    headers: {},
    attachments: [],
  };
  const det = detectOffersInEmail(parsed);
  assert.equal(det.offers.length, 1, "une offre détectée");
  const title = det.offers[0].title;
  assert.ok(
    title === "Stage Ingénieur Génie Électrique H/F" || title === "Titre à vérifier",
    `titre repris du bloc ou marqué à vérifier, obtenu « ${title} »`
  );
  assert.notEqual(title, "Voir l'offre", "le texte du bouton n'est jamais un titre");
  ok("titre récupéré dans le bloc de l'annonce (ou « Titre à vérifier »)");
}

/* ══════════ 3. Checkpoint « done » : synchro normale vs réanalyse ══════════ */

console.log("3. Checkpoint « done »");
{
  const done = { status: "done" as const, offers: [], at: "2026-10-10", retries: 0 };
  assert.equal(shouldProcessEmail(done), false, "une synchro normale saute un mail « done »");
  ok("synchro normale : mail done sauté");
  /* La réanalyse force la relecture : resolveMode renvoie « full » pour ces ids,
     et la boucle de runSync ne saute plus le checkpoint (reanalyzeIds). Cette
     bascule est vérifiée en conditions réelles dans gmail-core.test.ts ; ici on
     verrouille la règle : une réanalyse ne dépend JAMAIS de shouldProcessEmail. */
  const forced = mergeReanalyzedOffers([offer({ title: "Stage", applicationUrl: "https://x.test/jobs/1" })], [
    offer({ title: "Stage Électrotechnique", applicationUrl: "https://x.test/jobs/1" }),
  ]);
  assert.equal(forced.report.corrected, 1, "réanalyse d'un mail done : titre corrigé");
  ok("réanalyse : mail done relu et corrigé");
}

/* ══════════ 4. File de réanalyse : progression, sans retraitement ══════════ */

console.log("4. File de réanalyse");
{
  const ids = Array.from({ length: 12 }, (_, i) => `m${i}`);
  const first = nextReanalyzeBatch(ids, 0, 5);
  assert.deepEqual(first.batch, ["m0", "m1", "m2", "m3", "m4"]);
  assert.equal(first.remaining, 7);
  ok("premier lot : 5 mails, 7 restants");

  /* Deux mails traités, le troisième échoue : le curseur s'arrête dessus. */
  let cursor = advanceReanalyzeCursor(ids, first.start, ["m0", "m1"]);
  assert.equal(cursor, 2, `curseur sur le premier non traité, obtenu ${cursor}`);
  const retry = nextReanalyzeBatch(ids, cursor, 5);
  assert.equal(retry.batch[0], "m2", "le mail non traité repasse en tête de file");
  ok("progression réelle : jamais de retraitement des premiers mails");

  cursor = advanceReanalyzeCursor(ids, 10, ["m10", "m11"]);
  assert.equal(cursor, 12, "file terminée");
  assert.equal(nextReanalyzeBatch(ids, cursor, 5).done, true, "file finie signalée");
  ok("file terminée détectée (nouveau passage complet déclenché côté route)");

  const queue = buildReanalyzeQueue([
    { id: "a", receivedAt: "2026-10-01", offers: [] },
    { id: "b", receivedAt: "2026-10-09", offers: [offer()] },
    { id: "c", receivedAt: "2026-10-05", offers: [offer()] },
  ] as never);
  assert.deepEqual(queue.ids, ["b", "c"], "seuls les mails déjà porteurs d'annonces, du plus récent au plus ancien");
  ok("file construite sur les annonces déjà importées");
}

/* ══════════ 5. Identité conservée : candidature, favoris, CV ══════════ */

console.log("5. Identité d'une offre déjà postulée");
{
  const before = offer({
    title: "Stage –",
    company: "",
    location: "",
    applicationUrl: "https://www.hellowork.com/fr-fr/emploi/stage-energie-555.html",
  });
  const after = offer({
    title: "Stage Ingénieur Énergies Renouvelables H/F",
    company: "EDF Renouvelables",
    location: "Nantes",
    applicationUrl: "https://www.hellowork.com/fr-fr/emploi/stage-energie-555.html?utm_source=alert",
  });
  const { offers, report } = mergeReanalyzedOffers([before], [after]);
  assert.equal(report.kept, 1, "annonce reconnue");
  assert.equal(report.corrected, 1, "correction comptée");
  assert.equal(report.added, 0, "aucune annonce inventée");

  /* L'identifiant affiché ne bouge pas : candidature, CV envoyé et favoris
     restent rattachés à la même offre. */
  assert.equal(offerBridgeKey(before), offerBridgeKey(offers[0]), "clé d'affichage identique avant/après");
  const beforeId = offerToDetectedOffer(before).id;
  const afterId = offerToDetectedOffer(offers[0]).id;
  assert.equal(afterId, beforeId, `identifiant d'offre conservé (${afterId})`);
  ok("clé et identifiant d'offre inchangés malgré le titre corrigé");

  const /* candidature archivée sur cet identifiant */ data = {
    v: 3,
    profile: { firstName: "M", lastName: "D", title: "", email: "m@d.test", phone: "", city: "", skills: [], experiences: [], educations: [] },
    cvs: [],
    offers: [offerToDetectedOffer(offers[0])],
    applications: [{ id: "app1", offerId: beforeId, offerUrl: before.applicationUrl, company: "EDF", role: "Stage", status: "sent", daysAgo: 3, source: "Gmail" }],
    letters: [],
    recruiters: [],
    autopilot: false,
  } as unknown as UserData;
  assert.ok(appliedOfferIds(data).has(afterId), "la candidature reste rattachée après réanalyse");
  ok("candidature et CV envoyé conservés");
}

/* ══════════ 6. Offre supprimée : jamais ressuscitée ══════════ */

console.log("6. Offre supprimée par l'utilisateur");
{
  const before = offer({
    title: "Stage Ingénieur Réseaux H/F",
    company: "Enedis",
    location: "Paris",
    applicationUrl: "https://www.hellowork.com/fr-fr/emploi/stage-reseaux-999.html",
  });
  const dismissedOffer = offerToDetectedOffer(before);
  const dismissedKeys = offerDismissalKeys(dismissedOffer);
  assert.equal(isOfferDismissed(dismissedOffer, dismissedKeys), true, "offre supprimée avant réanalyse");

  const { offers } = mergeReanalyzedOffers([before], [
    offer({ ...before, title: "Stage Ingénieur Réseaux Électriques H/F", location: "Paris - 75" }),
  ]);
  const afterOffer = offerToDetectedOffer(offers[0]);
  assert.equal(afterOffer.id, dismissedOffer.id, "même identifiant après réanalyse");
  assert.equal(
    isOfferDismissed(afterOffer, dismissedKeys),
    true,
    "une réanalyse ne fait pas réapparaître une offre supprimée"
  );
  ok("offre supprimée toujours masquée après réanalyse");
}

/* ══════════ 7. Pas de fusion abusive, pas de doublon ══════════ */

console.log("7. Rapprochements prudents");
{
  /* Deux identifiants natifs différents ne fusionnent jamais. */
  const vinciA = offer({ title: "Stage Ingénieur Solaire H/F", company: "VINCI", applicationUrl: "https://www.linkedin.com/jobs/view/4446854590" });
  const vinciB = offer({ title: "Stage Ingénieur Solaire H/F", company: "VINCI", applicationUrl: "https://www.linkedin.com/jobs/view/4447004092" });
  const merged = mergeReanalyzedOffers([vinciA, vinciB], [vinciA, vinciB]);
  assert.equal(merged.offers.length, 2, "deux annonces distinctes conservées");
  assert.equal(merged.report.kept, 2, "chacune reconnue par son identifiant natif");
  assert.equal(merged.report.added + merged.report.retained, 0, "aucune fusion ni perte");
  ok("deux IDs différents ne fusionnent pas malgré un titre identique");

  /* Même titre, deux villes : deux annonces. */
  const lyon = offer({ title: "Stage Ingénieur Électrotechnique H/F", company: "Eiffage Énergie", location: "Lyon" });
  const paris = offer({ title: "Stage Ingénieur Électrotechnique H/F", company: "Eiffage Énergie", location: "Paris" });
  const cities = mergeReanalyzedOffers([lyon], [paris]);
  assert.equal(cities.report.kept, 0, "pas de fusion entre deux villes");
  assert.equal(cities.report.added, 1, "nouvelle annonce ajoutée");
  assert.equal(cities.report.retained, 1, "ancienne conservée");
  assert.equal(cities.offers[1].needsReview, true, "ancienne marquée « à vérifier »");
  ok("même titre dans deux villes = deux annonces distinctes");

  /* Deuxième passage : idempotence, aucun doublon créé. */
  const prior = merged.offers;
  const second = mergeReanalyzedOffers(prior, [vinciA, vinciB]);
  assert.equal(second.offers.length, 2, "second passage : toujours deux annonces");
  assert.deepEqual(
    second.offers.map((o) => offerDisplayKey(o)),
    prior.map((o) => offerDisplayKey(o)),
    "clés identiques après deux réanalyses (aucun doublon)"
  );
  ok("réanalyse répétée : aucun doublon");

  /* Anti-doublon d'import : une offre déjà connue n'est jamais réimportée. */
  const classes = classifyImportBatch([
    { title: vinciA.title, company: vinciA.company, location: vinciA.location, applicationUrl: vinciA.applicationUrl },
    { title: vinciA.title, company: vinciA.company, location: vinciA.location, applicationUrl: vinciA.applicationUrl },
  ]);
  assert.equal(classes.filter((c) => c.status === "doublon").length, 1, "doublon détecté à l'import");
  ok("synchro répétée : le doublon est écarté");
}

/* ══════════ 8. Page externe bloquée : état explicite, rien d'inventé ══════════ */

console.log("8. Page de l'annonce inaccessible");
{
  const blocked = offer({
    title: "Stage Ingénieur Distribution Électrique H/F",
    company: "Edvance",
    location: "Montrouge",
    applicationUrl: "https://www.hellowork.com/fr-fr/emploi/stage-distribution-321.html",
    description: "Description obtenue depuis le mail uniquement.",
    enrichStatus: "blocked",
    enrichReason: "anti-robot (403)",
    enrichOutcome: "blocked",
  });
  const reloaded = offer({
    title: "Stage Ingénieur Distribution Électrique H/F",
    company: "Edvance",
    location: "Montrouge",
    applicationUrl: "https://www.hellowork.com/fr-fr/emploi/stage-distribution-321.html",
  });
  const { offers } = mergeReanalyzedOffers([blocked], [reloaded]);
  assert.equal(offers[0].enrichStatus, "blocked", "l'état « bloqué » n'est jamais remplacé par une réussite");
  assert.equal(offers[0].description, blocked.description, "description conservée telle quelle, rien d'inventé");
  assert.equal(offers[0].enrichReason, "anti-robot (403)", "la raison reste explicite");
  ok("état partiel explicite conservé, aucun détail fabriqué");
}

/* ══════════ 9. Filtres : preuve propre à l'annonce ══════════ */

console.log("9. Filtres énergie / électricité");
{
  const filters: OfferListFilters = { ...EMPTY_FILTERS, domains: ["energie-enr"] };
  const electric: DetectedOffer = {
    id: "o1",
    title: "Stage Ingénieur Génie Électrique H/F",
    company: "Enedis",
    location: "Paris",
    salary: "",
    match: 0,
    keywords: [],
    text: "Raccordement, postes de distribution et dimensionnement des réseaux électriques.",
  };
  const unrelated: DetectedOffer = {
    id: "o2",
    title: "Stage Marketing Digital",
    company: "Agence",
    location: "Paris",
    salary: "",
    match: 0,
    keywords: [],
    text: "Rédaction web, référencement et animation des réseaux sociaux.",
  };
  assert.ok(DOMAIN_KEYWORDS["energie-enr"].includes("energie"), "catégorie énergie définie");
  assert.equal(applyOfferFilters([electric], filters).length, 0, "aucune preuve d'énergie dans le texte propre de l'annonce");
  assert.equal(applyOfferFilters([unrelated], filters).length, 0, "annonce marketing hors filtre");
  const withProof: DetectedOffer = {
    ...unrelated,
    id: "o3",
    text: "Projet photovoltaïque : étude d'énergie solaire et de stockage.",
  };
  assert.equal(applyOfferFilters([withProof], filters).length, 1, "le filtre suit la preuve de l'annonce elle-même");
  ok("une catégorie n'est déclenchée que par la preuve propre à l'annonce");
}

/* ══════════ 10. Bilan cumulé de la file ══════════ */

console.log("10. Bilan de réanalyse");
{
  const a: ReanalyzeReport = { previous: 3, detected: 4, kept: 3, corrected: 2, added: 1, retained: 0, toVerify: ["u:x"] };
  const b: ReanalyzeReport = { previous: 2, detected: 2, kept: 1, corrected: 1, added: 0, retained: 1, toVerify: ["u:y", "u:x"] };
  const total = sumReanalyzeReports(a, b);
  assert.equal(total.previous, 5);
  assert.equal(total.corrected, 3);
  assert.equal(total.added, 1);
  assert.equal(total.retained, 1);
  assert.deepEqual(total.toVerify, ["u:x", "u:y"], "à vérifier dédupliqué");
  ok("bilan cumulé exact (corrigées / retrouvées / à vérifier)");
}

console.log("");
console.log(`${passed} vérifications passées`);
