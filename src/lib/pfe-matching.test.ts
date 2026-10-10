import assert from "node:assert/strict";
import { emptyData, loadData, saveData, type DetectedOffer, type SkillEvidence } from "./data";
import { analyzePfeOffer, canSelectProof, matchingEvidence, pfeFingerprint, proofRecordId, savePfeAnalysis } from "./pfe-matching";

async function main() {
  const email = "student@example.test";
  const offer: DetectedOffer = {
    id: "gmail-test", title: "Stage PFE ingénieur génie électrique", company: "Entreprise Test", location: "Paris",
    contract: "Stage", duration: "6 mois", startDate: "2027-02", salary: "", match: 0, source: "Gmail",
    url: "https://example.test/job", keywords: ["SCADA"], skills: ["MATLAB", "CANECO BT", "AutoCAD"],
    missions: ["Réaliser les études de dimensionnement et de simulation électrique"],
    description: "Réaliser les études de dimensionnement et de simulation électrique. MATLAB est indispensable. CANECO BT est un plus. Utilisation d’AutoCAD sur les plans électriques.",
    text: "Stage ingénieur génie électrique. Début février 2027 pour six mois. MATLAB indispensable. CANECO BT souhaité. AutoCAD utilisé pour la conception.",
  };
  const confirmed: SkillEvidence = { id: "proof-matlab", term: "MATLAB", title: "Simulation de réseau", description: "Simulation MATLAB d'un réseau électrique en projet académique", evidence: "Simulation MATLAB d'un réseau électrique en projet académique", source: "Projet universitaire", kind: "project", status: "demonstrated", autonomy: "assisted", updatedAt: "2026-10-10" };
  const draft: SkillEvidence = { id: "proof-caneco", term: "CANECO BT", evidence: "", source: "", status: "verify", autonomy: "unknown", updatedAt: "2026-10-10" };
  const data = emptyData("Étudiant Test", email);
  data.offers = [offer]; data.originalCv = { name: "CV maître", text: "Ingénieur électricité\nProjet de simulation MATLAB\nPlans AutoCAD" };
  data.profile.title = "Élève ingénieur en génie électrique";
  data.profile.educations = [{ degree: "Ingénieur génie électrique", school: "Université", period: "2022-2027" }];
  data.profile.skillEvidence = [confirmed, draft];
  const beforeFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Gemini unavailable"); };
  const analysis = analyzePfeOffer(offer, data);
  globalThis.fetch = beforeFetch;
  assert.equal(analysis.eligibility.status, "eligible");
  assert.equal(analysis.relevance.level, "forte");
  const matlab = analysis.requirements.find(row => row.term === "MATLAB")!;
  const caneco = analysis.requirements.find(row => row.term === "CANECO BT")!;
  const autocad = analysis.requirements.find(row => row.term === "AutoCAD")!;
  assert.equal(matlab.priority, "obligatoire"); assert.equal(matlab.match, "prouvée"); assert.ok(matlab.cvExcerpt?.includes("MATLAB"));
  assert.equal(caneco.priority, "souhaitée"); assert.equal(caneco.match, "non documentée"); assert.equal(analysis.gaps.includes("CANECO BT"), false);
  assert.equal(autocad.match, "citée dans le CV");
  assert.equal(analysis.requirements.some(row => row.term === "SCADA"), false, "a keyword absent from the source is not invented as an employer requirement");
  assert.equal(matchingEvidence(data.profile, matlab)[0].id, confirmed.id);
  assert.equal(proofRecordId(draft, 1), draft.id);
  assert.equal(canSelectProof(confirmed), true);
  assert.equal(canSelectProof(draft), false);
  const unknown = analyzePfeOffer({ ...offer, duration: "", description: "", missions: [], skills: [], text: "Stage ingénieur génie électrique à Paris" }, data);
  assert.equal(unknown.eligibility.status, "verify", "unknown duration remains visible");
  assert.ok(unknown.unknowns.some(row => row.includes("Missions")));
  const technician = analyzePfeOffer({ ...offer, title: "Stage technicien génie électrique" }, data);
  assert.equal(technician.eligibility.status, "excluded");
  assert.equal(technician.relevance.level, "forte", "eligibility and technical relevance are independent");
  const unproved = analyzePfeOffer(offer, { ...data, originalCv: { name: "", text: "" }, profile: { ...data.profile, skillEvidence: [{ ...confirmed, source: "" }] } });
  assert.notEqual(unproved.requirements.find(row => row.term === "MATLAB")?.match, "prouvée");
  const changedCv = { ...data, originalCv: { name: "CV maître", text: "Nouveau CV" } };
  assert.notEqual(pfeFingerprint(offer, data), pfeFingerprint(offer, changedCv));
  assert.notEqual(pfeFingerprint(offer, data), pfeFingerprint({ ...offer, text: offer.text + " Nouveau critère" }, data));
  assert.notEqual(pfeFingerprint(offer, data), pfeFingerprint(offer, { ...data, profile: { ...data.profile, skillEvidence: [draft] } }));
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) }, dispatchEvent: () => {} } });
  const saved = savePfeAnalysis(data, { ...analysis, selectedEvidenceIds: [confirmed.id!] });
  saveData(email, saved);
  const reopened = loadData(email)!;
  assert.deepEqual(reopened.pfeAnalyses?.[offer.id]?.selectedEvidenceIds, [confirmed.id]);
  assert.deepEqual(reopened.originalCv, data.originalCv);
  assert.equal(reopened.pfeAnalyses?.[offer.id]?.fingerprint, pfeFingerprint(offer, reopened));
  assert.equal(reopened.pfeAnalyses?.[offer.id]?.aiSuggestion, undefined);
  console.log("P1 matching : éligibilité distincte, exigences obligatoires/souhaitées, preuves, inconnus, Gemini absent, péremption, sauvegarde/réouverture et absence d'invention vérifiés.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
