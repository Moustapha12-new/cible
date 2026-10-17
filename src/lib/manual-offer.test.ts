import assert from "node:assert/strict";
import { prepareManualOffer, sameManualOfferUrl } from "./manual-offer";
import { extractJobPostingText } from "./scrape";
import { emptyData } from "./data";
import { offerCvCoverage } from "./offer-cv-coverage";
import { analyzeAndPlan } from "./cv-engine";

const html = `<script type="application/ld+json">${JSON.stringify({
  "@type": "JobPosting", title: "Stage réseaux électriques", hiringOrganization: { name: "Entreprise Test" },
  jobLocation: { address: { addressLocality: "Lille", addressCountry: "France" } },
  description: "Stage de 6 mois. Études de réseaux électriques avec Python et MATLAB. Réaliser les simulations et rédiger un rapport technique.",
})}</script>`;
const text = extractJobPostingText(html);
const offer = prepareManualOffer({ text, url: "https://jobs.smartrecruiters.com/Test/744000155712169-stage?utm_source=mail" }, "manual-test", "2026-10-17T00:00:00Z");
assert.equal(offer.title, "Stage réseaux électriques");
assert.equal(offer.company, "Entreprise Test");
assert.equal(offer.location, "Lille, France");
assert.equal(offer.duration, "6 mois");
assert.ok(offer.skills?.includes("Python"));
assert.equal(offer.text, text);
assert.ok(sameManualOfferUrl(offer.url, "https://jobs.smartrecruiters.com/Test/744000155712169-autre-titre?oga=true"));
assert.equal(sameManualOfferUrl(offer.url, "https://jobs.smartrecruiters.com/Test/744000155712170-stage"), false);
const missing = prepareManualOffer({ text: "Description sans entreprise ni lieu. Python est demandé." }, "manual-2", "now");
assert.equal(missing.company, "");
assert.equal(missing.location, "");
const ambiguous = prepareManualOffer({ text: "Entreprise :\nLieu : Paris\nExpérience de 6 mois en stage appréciée.", title: "Ingénieur CDI" }, "manual-3", "now");
assert.equal(ambiguous.company, "");
assert.equal(ambiguous.contract, undefined);
assert.equal(ambiguous.duration, undefined);
assert.ok(sameManualOfferUrl("https://www.linkedin.com/comm/jobs/view/12345/?trackingId=abc", "https://www.linkedin.com/jobs/view/12345/"));
assert.equal(sameManualOfferUrl("https://www.linkedin.com/jobs/view/12345/", "https://www.linkedin.com/jobs/view/12346/"), false);
const data = emptyData("Test", "test@example.test");
data.originalCv = { name: "CV", text: "Formation en réseaux électriques. Projet de simulation avec Python." } as NonNullable<typeof data.originalCv>;
assert.notEqual(offerCvCoverage(offer, data).score, null);
assert.equal(analyzeAndPlan(offer, data).analysis.offerId, offer.id);
console.log("Ajout par lien : JobPosting → champs → identité → couverture CV → analyse CV validé ; aucune donnée manquante inventée.");
