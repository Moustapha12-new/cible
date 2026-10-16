import assert from "node:assert/strict";
import { discoverSmartRecruiters, validatePosting } from "./discovery-offers";
import { discoveryToDetectedOffer } from "./discovery-view";
import { discoveryUrlKey } from "./discovery-identity";
import { emptyData } from "./data";
import { analyzeAndPlan } from "./cv-engine";

const description = "Études de réseaux électriques HTA/BT, dimensionnement des postes de distribution et simulation des flux. " .repeat(3);
const detail = (id: string, name = "Stage PFE – Ingénieur réseaux électriques") => ({
  id, name, active: true, company: { name: "Société Exemple" }, location: { city: "Paris", country: "fr" },
  jobAd: { sections: { jobDescription: { text: description }, additionalInformation: { text: "Durée du stage : 6 mois. Démarrage en février 2027." } } },
  applyUrl: `https://jobs.smartrecruiters.com/Exemple/${id}?oga=true`,
});

async function main() {
  const first = validatePosting("Exemple", { id: "744000000000001" }, detail("744000000000001"), "2026-10-15T00:00:00Z");
  assert.ok(first);
  assert.equal(first.durationMonths, 6);
  assert.equal(first.profileCompatible, true);
  assert.ok(first.description.includes("HTA/BT"));
  assert.equal(discoveryToDetectedOffer(first).id, first.id);
  assert.ok(discoveryToDetectedOffer(first).text.includes("dimensionnement des postes"));
  assert.equal(discoveryUrlKey(first.applicationUrl), discoveryUrlKey(first.sourceUrl), "même identifiant ATS malgré le slug et le suivi de candidature");
  assert.notEqual(discoveryUrlKey(first.applicationUrl), discoveryUrlKey("https://jobs.smartrecruiters.com/Exemple/744000000000002"), "deux fiches distinctes ne fusionnent pas");
  const dossier = emptyData("Candidat Test", "test@example.invalid");
  dossier.originalCv = { name: "CV synthétique", text: "Élève ingénieur en génie électrique. Projet : dimensionnement d'un réseau BT et simulation des protections sous MATLAB." };
  const cvFlow = analyzeAndPlan(discoveryToDetectedOffer(first), dossier);
  assert.ok(cvFlow.analysis.topNeeds.length > 0 && cvFlow.masterText.includes("MATLAB"), "Discovery → offre détaillée → moteur CV avec un CV maître synthétique");
  assert.equal(validatePosting("Exemple", { id: "744000000000001" }, detail("744000000000002"), "t"), null, "identifiant de la fiche différent");
  assert.equal(validatePosting("Exemple", { id: "744000000000001" }, detail("744000000000001", "Stage géotechnique"), "t"), null, "mention électrique secondaire dans une annonce hors domaine");
  assert.equal(validatePosting("Exemple", { id: "744000000000001" }, { ...detail("744000000000001"), active: false }, "t"), null, "fiche désactivée");
  assert.equal(validatePosting("Exemple", { id: "744000000000001" }, { ...detail("744000000000001"), active: undefined }, "t"), null, "activité non confirmée");
  assert.equal(validatePosting("Exemple", { id: "744000000000001" }, detail("744000000000001", "Alternance ingénieur réseaux électriques"), "t"), null, "alternance exclue");

  const ids = ["744000000000001", "744000000000002"];
  const fetcher = async (url: string) => {
    const isDetail = ids.some(id => url.endsWith(`/${id}`));
    const payload = isDetail ? detail(url.slice(-15)) : { totalFound: 2, content: ids.map(id => ({ id, name: "Stage PFE – Ingénieur réseaux électriques" })) };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await discoverSmartRecruiters(["Exemple"], fetcher);
  assert.equal(result.offers.length, 2, "deux IDs distincts conservés même avec titre, employeur et lieu identiques");
  assert.equal(result.detailChecked, 2, "les quatre recherches de listes ne redemandent pas les mêmes fiches");
  const inaccessible = await discoverSmartRecruiters(["Exemple"], async url => url.includes("/postings/")
    ? new Response("", { status: 403 }) : fetcher(url));
  assert.equal(inaccessible.offers.length, 0, "HTTP 403 ne crée aucune offre");
  assert.equal(inaccessible.failures.filter(f => f.reason === "HTTP 403").length, 2);
  console.log("Discovery : identité ATS, fiche active, contrat, domaine, durée, lien CV et échecs HTTP vérifiés.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
