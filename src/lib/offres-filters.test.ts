import assert from "node:assert/strict";
import {
  applyOfferFilters,
  computeFacetCounts,
  EMPTY_FILTERS,
  isAlternance,
  isSixMonthStage,
  matchesContractOption,
  matchesDomains,
  matchesPeriod,
  matchesOfferFilters,
  matchesRegion,
  matchesSourceSite,
  nextRafaleCandidates,
  offerSourceSite,
  SOURCE_SITES,
} from "./offres-filters";
import type { DetectedOffer } from "./data";

const makeOffer = (partial: Partial<DetectedOffer>): DetectedOffer => ({
  id: partial.id || "offre-test",
  title: "Stage",
  company: "Entreprise",
  location: "",
  salary: "",
  match: 0,
  keywords: [],
  text: "Description réelle synthétique.",
  ...partial,
});

const now = Date.parse("2026-10-14T12:00:00Z");

/* Contrat : stage 6 mois, alternance, autre. */
const stage6 = makeOffer({ id: "s6", title: "Stage ingénieur", duration: "6 mois" });
const stage3 = makeOffer({ id: "s3", title: "Stage ingénieur", duration: "3 mois" });
const alternance = makeOffer({ id: "alt", title: "Alternance ingénieur", contract: "Alternance" });
assert.equal(isSixMonthStage(stage6), true);
assert.equal(isSixMonthStage(stage3), false);
assert.equal(isAlternance(alternance), true);
assert.equal(matchesContractOption(stage6, "stage-6"), true);
assert.equal(matchesContractOption(stage3, "stage-6"), false);
assert.equal(matchesContractOption(stage3, "autre"), true);
assert.equal(matchesContractOption(alternance, "autre"), false);

/* Domaines : accents insensibles, titre ou compétences. */
const elec = makeOffer({ id: "e", title: "Stage électrotechnique", skills: ["Dimensionnement"] });
assert.equal(matchesDomains(elec, ["genie-electrique"]), true);
assert.equal(matchesDomains(elec, ["energie-enr"]), false);
assert.equal(matchesDomains(elec, []), true);
const enr = makeOffer({ id: "enr", title: "Stage", description: "Projet photovoltaïque" });
assert.equal(matchesDomains(enr, ["energie-enr"]), true);

/* Régions : sur la localisation réelle. */
const paris = makeOffer({ id: "p", location: "Paris (75)" });
const lyon = makeOffer({ id: "l", location: "Lyon (69)" });
assert.equal(matchesRegion(paris, "idf"), true);
assert.equal(matchesRegion(paris, "ara"), false);
assert.equal(matchesRegion(lyon, "ara"), true);
assert.equal(matchesRegion(paris, "all"), true);

/* Périodes : sur la date réelle de réception ; sans date = exclu. */
const recent = makeOffer({ id: "r", receivedAt: new Date(now - 2 * 3_600_000).toISOString() });
const vieux = makeOffer({ id: "v", receivedAt: new Date(now - 40 * 24 * 3_600_000).toISOString() });
const sansDate = makeOffer({ id: "nd" });
assert.equal(matchesPeriod(recent, "24h", now), true);
assert.equal(matchesPeriod(vieux, "24h", now), false);
assert.equal(matchesPeriod(vieux, "30d", now), false);
assert.equal(matchesPeriod(sansDate, "7d", now), false);
assert.equal(matchesPeriod(sansDate, "all", now), true);

/* Combinaison : AND entre groupes, OR dans un groupe, vide = sans effet. */
const elecStage6 = makeOffer({ id: "es6", title: "Stage électrotechnique", duration: "6 mois" });
const offres = [stage6, stage3, alternance, elec, elecStage6, lyon, recent, vieux];
assert.equal(applyOfferFilters(offres, EMPTY_FILTERS, now).length, offres.length);
const filtered = applyOfferFilters(offres, { ...EMPTY_FILTERS, contracts: ["stage-6"], domains: ["genie-electrique"] }, now);
assert.deepEqual(filtered.map((o) => o.id), ["es6"]);
const regionOnly = applyOfferFilters(offres, { ...EMPTY_FILTERS, region: "ara" }, now);
assert.deepEqual(regionOnly.map((o) => o.id), ["l"]);
const periodOnly = applyOfferFilters(offres, { ...EMPTY_FILTERS, period: "24h" }, now);
assert.deepEqual(periodOnly.map((o) => o.id), ["r"]);

/* Source de l'offre : classification par hostname réel de l'URL. */
const linkedin = makeOffer({ id: "li", url: "https://www.linkedin.com/jobs/view/123" });
const linkedinShort = makeOffer({ id: "li2", url: "https://lnkd.in/abc" });
const indeed = makeOffer({ id: "in", url: "https://fr.indeed.com/jobs?q=stage" });
const hellowork = makeOffer({ id: "hw", url: "https://www.hellowork.com/fr-fr/offres/stage.html" });
const jobteaser = makeOffer({ id: "jt", url: "https://jobteaser.com/fr/jobs/456" });
const wttj = makeOffer({ id: "wj", url: "https://www.welcometothejungle.com/fr/jobs/stage" });
const sitePerso = makeOffer({ id: "sp", url: "https://entreprise-exemple.fr/careers/stage" });
const sansLien = makeOffer({ id: "sl" });
assert.equal(offerSourceSite(linkedin), "linkedin");
assert.equal(offerSourceSite(linkedinShort), "linkedin");
assert.equal(offerSourceSite(indeed), "indeed");
assert.equal(offerSourceSite(hellowork), "hellowork");
assert.equal(offerSourceSite(jobteaser), "jobteaser");
assert.equal(offerSourceSite(wttj), "wttj");
assert.equal(offerSourceSite(sitePerso), "autre");
assert.equal(offerSourceSite(sansLien), "sans-lien");
/* Anti-spoofing : un sous-domaine malveillant n'est pas du vrai LinkedIn. */
assert.equal(offerSourceSite(makeOffer({ id: "ph", url: "https://linkedin.com.evil.io/jobs" })), "autre");
assert.equal(offerSourceSite(makeOffer({ id: "ph2", url: "not a url linkedin.com" })), "autre");
/* Filtre : OR dans le groupe, vide = sans effet. */
const siteOffres = [linkedin, indeed, hellowork, jobteaser, wttj, sitePerso, sansLien];
assert.equal(matchesSourceSite(linkedin, []), true);
assert.equal(matchesSourceSite(linkedin, ["linkedin"]), true);
assert.equal(matchesSourceSite(indeed, ["linkedin"]), false);
assert.equal(matchesSourceSite(sansLien, ["sans-lien"]), true);
const multi = applyOfferFilters(siteOffres, { ...EMPTY_FILTERS, sources: ["linkedin", "wttj"] }, now);
assert.deepEqual(multi.map((o) => o.id), ["li", "wj"]);

/* Compteurs réels par facette. */
const counts = computeFacetCounts(offres);
assert.equal(counts.contracts["stage-6"], 2);
assert.equal(counts.contracts["alternance"], 1);
assert.equal(counts.contracts["autre"], offres.length - 3);
assert.ok(counts.domains["genie-electrique"] >= 1);
const siteCounts = computeFacetCounts(siteOffres);
for (const id of Object.keys(SOURCE_SITES)) assert.equal(siteCounts.sources[id], siteOffres.filter((o) => offerSourceSite(o) === id).length, `compteur ${id}`);

/* Mode Rafale : l'offre suivante reste dans l'ordre du filtre et exclut
   l'offre courante comme les candidatures déjà enregistrées. */
const rafaleCatalogue = [
  { id: "a", title: "Offre A" },
  { id: "b", title: "Offre B" },
  { id: "c", title: "Offre C" },
  { id: "d", title: "" },
];
assert.deepEqual(
  nextRafaleCandidates(rafaleCatalogue, new Set(["b"]), "a", ["c", "b", "a"].map(String)).map((o) => o.id),
  ["c"],
  "rafale : ordre du filtre, offre courante et déjà postulée exclues"
);
assert.deepEqual(
  nextRafaleCandidates(rafaleCatalogue, new Set(), "b").map((o) => o.id),
  ["a", "c"],
  "rafale : sans file, le dossier complète et les offres sans titre sont ignorées"
);
assert.deepEqual(
  nextRafaleCandidates(rafaleCatalogue, new Set(["a", "b", "c"]), "a").map((o) => o.id),
  [],
  "rafale : plus aucune offre disponible"
);

/* Scénario complet du mode Rafale : filtre actif, une candidature, puis
   l'offre suivante doit rester dans ce filtre (et jamais une postulée). */
{
  const catalogue = [
    makeOffer({ id: "r1", title: "Stage A", duration: "6 mois" }),
    makeOffer({ id: "r2", title: "Stage B", duration: "6 mois" }),
    makeOffer({ id: "r3", title: "Alternance C", contract: "Alternance" }),
    makeOffer({ id: "r4", title: "Stage D", duration: "6 mois" }),
  ];
  const filtre = { ...EMPTY_FILTERS, contracts: ["stage-6"] };
  const liste = catalogue.filter((offer) => matchesOfferFilters(offer, filtre));
  assert.deepEqual(liste.map((o) => o.id), ["r1", "r2", "r4"], "rafale : le filtre réduit la liste");
  const apresCandidature = new Set([liste[0].id]);
  const file = liste.map((o) => o.id);
  assert.equal(
    nextRafaleCandidates(catalogue, apresCandidature, liste[0].id, file)[0].id,
    "r2",
    "rafale : l'offre suivante reste la suivante du filtre"
  );
  /* Une offre déjà postulée ne peut pas revenir par la file. */
  assert.equal(
    nextRafaleCandidates(catalogue, apresCandidature, "r2", ["r1", "r4"])[0].id,
    "r4",
    "rafale : offre postulée écartée, file respectée"
  );
}

process.stdout.write("offres-filters: contrats, domaines, régions, périodes, sources, combinaison, compteurs, file rafale, scénario rafale passed\n");

// A completed filtered queue must never spill into unrelated catalogue jobs.
assert.deepEqual(nextRafaleCandidates(rafaleCatalogue, new Set(["c"]), "a", ["a", "c"]), []);
assert.deepEqual(nextRafaleCandidates(rafaleCatalogue, new Set(), "a", ["missing"]), []);
assert.deepEqual(nextRafaleCandidates(rafaleCatalogue, new Set(), "a", ["c", "c"]).map(o => o.id), ["c"]);
