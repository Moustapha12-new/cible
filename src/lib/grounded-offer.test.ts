import assert from "node:assert/strict";
import { groundedOfferData } from "./grounded-offer";
import { enrichProcessed, buildEnrichCandidates, type ProcessedEmail, type RawOffer } from "./gmail-core";
const offer = { title: "Stage", company: "Entreprise", location: "Paris", contract: "Stage", duration: "", deadline: "", skills: [], description: "", applicationUrl: "https://example.test/job/1", source: "Test" } as RawOffer;
const email = { id: "test", isOffer: true, subject: "Stage", offers: [offer], from: "test", receivedAt: "", reason: "test", finalStatus: "detected" } as ProcessedEmail;
async function main() {
  const text = "Stage ingénieur\nVous participez au dimensionnement et à la conception électrique avec Python et AutoCAD.\nFormation Bac+5, anglais souhaité. ".repeat(5);
  const data = groundedOfferData(text);
  assert.ok(data.keywords?.includes("Python"));
  assert.ok(data.keywords?.includes("AutoCAD"));
  assert.equal(data.keywords?.includes("SQL"), false);
  assert.ok(data.description?.includes("dimensionnement"));
  assert.ok(data.missions?.length);
  const labeled = groundedOfferData("Poste : Stage PFE génie électrique\nEntreprise : Eiffage\nLieu : Montaigu\n" + text);
  assert.equal(labeled.title, "Stage PFE génie électrique");
  assert.equal(labeled.company, "Eiffage");
  assert.equal(labeled.location, "Montaigu");
  assert.equal(groundedOfferData("Une entreprise digitale").keywords?.includes("git"), false);
  assert.ok(groundedOfferData("Git et JavaScript sont utilisés").keywords?.includes("Git"));
  assert.equal(groundedOfferData('Stage solaire <a href="https://example.com/tracking').summary, "Stage solaire");
  assert.equal(buildEnrichCandidates([{ ...email, offers: [{ ...offer, enrichStatus: "blocked" }] }], new Map()).length, 1);
  await enrichProcessed([email], new Map(), { retryOnly: true, skipCache: true,
    fetchPageImpl: async () => ({ ok: true, text }), askImpl: async () => { throw new Error("Quota IA"); } });
  assert.equal(offer.enrichStatus, "ok");
  assert.ok(offer.keywords?.includes("Python"));
  assert.equal(offer.applicationUrl, "https://example.test/job/1");
  const incomplete = { ...offer, enrichStatus: "none" as const, snippet: "Annonce courte" };
  await enrichProcessed([{ ...email, offers: [incomplete] }], new Map(), { retryOnly: true, skipCache: true, groundedOnly: true,
    fetchPageImpl: async () => ({ ok: false, reason: "Page inaccessible" }) });
  assert.equal(incomplete.enrichStatus, "blocked");
  console.log("Extraction vérifiée : mots-clés sourcés, reprise des pages bloquées, secours sans Gemini et aucun faux enrichissement d’une source vide.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
