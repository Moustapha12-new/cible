import assert from "node:assert/strict";
import { emptyData, type DetectedOffer } from "./data";
import { CAREER_TARGET, careerFingerprint, careerOfferText, currentCareerReport, validateCareerReport, validateCareerRequirements } from "./career-evaluation";
import { careerKeywordAudit, chronologicalExperiences } from "./career-cv-checks";
import { evaluateCareer } from "./career-evaluation-pipeline";
import type { CvData } from "./cv";

// Données synthétiques pour tests uniquement ; jamais injectées dans le compte.
const offer: DetectedOffer = { id: "test-offer", company: "Entreprise test", title: "Stage réseaux électriques", location: "France", salary: "", keywords: ["Python"], match: 0,
  text: "Stage de six mois à partir de début 2027 en France. Python obligatoire. Étudier des réseaux électriques et documenter les simulations. Élève ingénieur en génie électrique. Anglais souhaité." };
const cv: CvData = { basics: { name: "Candidat test", headline: "Élève ingénieur", contact: "France" }, summary: "Élève ingénieur en génie électrique. Stage de six mois à partir de début 2027.", sections: [
  { key: "exp", title: "Expériences", kind: "list", text: "", items: [
    { id: "old", title: "Stage ancien", meta: "mai 2023 – septembre 2023", detail: "Simulation de réseaux électriques en Python et rédaction du rapport technique." },
    { id: "unknown", title: "Expérience sans date", detail: "Documentation technique." },
    { id: "new", title: "Stage récent", meta: "Jan 2025 – Oct 2025", detail: "Calcul des pertes électriques." },
  ] },
  { key: "skills", title: "Compétences", kind: "text", text: "Python. MATLAB (théorique).", items: [] },
] };
const data = { ...emptyData("Test", "test@example.test"), cvData: cv, offers: [offer] };
const reqInput = { requirements: [
  { term: "Python", basis: "stated", importance: "critical", quote: "Python obligatoire." },
  { term: "Anglais", basis: "stated", importance: "preferred", quote: "Anglais souhaité." },
  { term: "Invention", basis: "stated", importance: "high", quote: "Dix ans de C++ obligatoires" },
  { term: "Travail en équipe", basis: "inferred", importance: "critical" },
] };
const requirements = validateCareerRequirements(reqInput, careerOfferText(offer));
assert.equal(requirements.length, 3, "Exigence avec fausse citation rejetée");
assert.equal(requirements[2].importance, "meaningful", "Inférence plafonnée");
const raw = { score: 4.1, reason: "Le projet Python couvre la simulation ; l'anglais reste à confirmer.",
  dimensions: { cvMatch: { status: "supported", source: "cv", quote: "Simulation de réseaux électriques en Python et rédaction du rapport technique.", explanation: "Projet démontré" },
    goalAlignment: { status: "supported", source: "target", quote: CAREER_TARGET, explanation: "Objectif stage" },
    compensation: { status: "supported", source: "offer", quote: "Gratification de 2000 euros", explanation: "Inventé" },
    culture: { status: "supported", source: "cv", quote: "Python", explanation: "Source inadéquate" } },
  matches: [{ requirementId: "req-1", match: "strong", cvQuote: "Maîtrise complète de Python", gap: "", risk: "", mitigation: "" }, { requirementId: "req-2", match: "missing" }, { requirementId: "req-3", match: "partial" }],
  strategy: ["Mettre en avant le projet de simulation Python, conserver les dates."], nextChecks: [] };
const report = validateCareerReport(raw, offer, data, requirements);
const theoretical = validateCareerReport({ ...raw, matches: [{ requirementId: "req-1", match: "strong", evidenceLevel: "theoretical", cvQuote: "Python. MATLAB (théorique)." }] }, offer, data, requirements);
assert.equal(theoretical.matches[0].match, "partial", "Connaissance théorique ne devient pas une réalisation démontrée");
assert.equal(report.requirements[0].importance, "critical", "L'importance fixée avant lecture du CV reste intacte");
assert.equal(report.matches[0].match, "partial", "Fausse preuve forte refusée");
assert.ok(report.matches[0].risk && report.matches[0].mitigation);
assert.equal(report.dimensions.compensation.status, "unknown");
assert.equal(report.dimensions.culture.status, "unknown");
assert.equal(report.confidence, "low");
assert.equal(report.score, 4.1, "Note globale conservée, pas un pourcentage calculé");
assert.throws(() => validateCareerReport({ ...raw, score: 92 }, offer, data, requirements));
assert.throws(() => validateCareerRequirements({ requirements: [] }, offer.text));
const cachedData = { ...data, careerReports: { [offer.id]: report } };
assert.equal(currentCareerReport(offer, cachedData)?.score, 4.1);
assert.equal(currentCareerReport({ ...offer, text: offer.text + " Nouveau critère." }, cachedData), null);
assert.notEqual(careerFingerprint(offer, data), careerFingerprint(offer, { ...data, cvData: { ...cv, summary: "CV modifié" } }));
assert.equal(currentCareerReport(offer, cachedData, Date.now() + 8 * 86400_000), null);
assert.deepEqual(careerKeywordAudit("JavaScript C++ AutoCAD Python3", ["Java", "C", "C++", "Revit", "Python", "AutoCAD"]), { present: ["C++", "Python", "AutoCAD"], missing: ["Java", "C", "Revit"] });
const ordered = chronologicalExperiences(cv);
assert.deepEqual(ordered.sections[0].items.map(i => i.id), ["new", "unknown", "old"]);
assert.equal(cv.sections[0].items[0].id, "old", "CV maître non muté");

async function main() {
  const calls: { task: string; body: unknown }[] = [];
  const model: Parameters<typeof evaluateCareer>[2] = async (task, body) => { calls.push({ task, body }); return task === "careerRequirements" ? reqInput : raw; };
  const first = await evaluateCareer(offer, data, model);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].task, "careerRequirements");
  assert.deepEqual(Object.keys(calls[0].body as object), ["offerText"], "La première passe ne reçoit aucune donnée du candidat");
  const second = await evaluateCareer(offer, { ...data, careerReports: { [offer.id]: first.report }, careerRequirementCache: first.requirementCache }, model);
  assert.equal(second.cached, true);
  assert.equal(calls.length, 2, "Cache : aucun nouvel appel IA");
  await evaluateCareer(offer, { ...data, cvData: { ...cv, summary: cv.summary + " Nouveau projet confirmé." }, careerRequirementCache: first.requirementCache }, model);
  assert.equal(calls.length, 3, "CV modifié : seule la comparaison est relancée, exigences figées");
  assert.equal(calls[2].task, "careerEvaluation");
  console.log("Career-Ops cible : validations, cache, isolation en deux passes, preuves, mots-clés et chronologie OK.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
