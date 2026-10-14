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
  matchesRegion,
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
const filtered = applyOfferFilters(offres, { contracts: ["stage-6"], domains: ["genie-electrique"], region: "all", period: "all" }, now);
assert.deepEqual(filtered.map((o) => o.id), ["es6"]);
const regionOnly = applyOfferFilters(offres, { ...EMPTY_FILTERS, region: "ara" }, now);
assert.deepEqual(regionOnly.map((o) => o.id), ["l"]);
const periodOnly = applyOfferFilters(offres, { ...EMPTY_FILTERS, period: "24h" }, now);
assert.deepEqual(periodOnly.map((o) => o.id), ["r"]);

/* Compteurs réels par facette. */
const counts = computeFacetCounts(offres);
assert.equal(counts.contracts["stage-6"], 2);
assert.equal(counts.contracts["alternance"], 1);
assert.equal(counts.contracts["autre"], offres.length - 3);
assert.ok(counts.domains["genie-electrique"] >= 1);

process.stdout.write("offres-filters: contrats, domaines, régions, périodes, combinaison, compteurs passed\n");
