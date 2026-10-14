import assert from "node:assert/strict";
import { emptyData, type DetectedOffer } from "./data";
import { eligibleOffers, fallbackSelection, selectionSignature, validateAiSelection } from "./daily-recommendations";

const data = emptyData("Test Ingénieur", "test@example.com");
const offers: DetectedOffer[] = Array.from({ length: 12 }, (_, i) => ({
  id: `offer-${i}`, title: `Stage génie électrique ${i}`, company: `Entreprise ${i}`,
  location: "Paris", salary: "", match: 0, keywords: [], url: `https://example.com/${i}`,
  text: "Stage de six mois en dimensionnement électrique et analyse énergétique.",
  skills: i % 2 ? ["Python", "AutoCAD"] : ["MATLAB"], duration: "6 mois",
}));
offers.push({ ...offers[0], id: "duplicate" });
data.applications.push({ id: "app", offerId: "offer-1", company: "Entreprise 1", role: offers[1].title, status: "sent", daysAgo: 0, source: "test" });
const pool = eligibleOffers(offers, data);
assert.equal(pool.length, 11, "candidature envoyée et doublon exclus");
const cv = "Projet de dimensionnement électrique, Python et analyse énergétique chez EDD.";
const signature = selectionSignature(pool, cv);
const fallback = fallbackSelection(pool, cv, "2026-10-12", signature);
assert.equal(fallback.picks.length, 10);
assert.equal(fallback.picks.filter(p => p.priority).length, 4);
assert.ok(!fallback.picks.some(p => p.id === "offer-1"));
const ai = validateAiSelection({ results: pool.map((o, i) => ({ id: o.id, score: 100 - i, present: ["Python", "Compétence inventée"], missing: ["MATLAB"] })) }, pool, cv, "2026-10-12", signature);
assert.equal(ai.picks.length, 10);
assert.equal(ai.picks.filter(p => p.priority).length, 4);
assert.ok(ai.picks.every(p => !p.present.includes("Compétence inventée")), "aucune compétence absente du CV n'est présentée comme prouvée");
assert.equal(fallbackSelection(pool, "", "2026-10-12", signature).picks.filter(p => p.priority).length, 0);
console.log("Sélection quotidienne vérifiée : 10 dont 4, exclusions et absence de preuves inventées.");
