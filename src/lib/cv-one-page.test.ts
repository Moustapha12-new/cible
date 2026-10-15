import assert from "node:assert/strict";
import { cvDocumentHtml, cvToText, type CvData } from "./cv";
import { onePageCandidates } from "./cv-one-page";
import { generatePdfFromHtml } from "./pdf-generator";

const longDetail = "- Analyse de données de production sous Python et comparaison des résultats avec les mesures existantes.\n- Préparation de tableaux Excel pour le suivi de la consommation et la vérification des écarts.\n- Documentation des calculs, des paramètres et des limites du modèle utilisé.\n- Présentation des résultats techniques à l'équipe et synthèse des prochaines vérifications.";
const source: CvData = {
  basics: { name: "Candidate Example", headline: "Élève ingénieur en génie électrique", target: "Stage de six mois en 2027", contact: "candidate@example.invalid\nhttps://example.invalid" },
  summary: "Élève ingénieur en génie électrique. Expérience en analyse de données de production et en documentation technique. Intérêt pour l'optimisation des réseaux, les modèles et le traitement de données. Disponible pour un stage de six mois à partir de début 2027.",
  sections: [
    { key: "experience", title: "Expérience professionnelle", kind: "list", text: "", items: Array.from({ length: 4 }, (_, index) => ({ id: `e${index}`, title: `Expérience ${index + 1}`, meta: "Entreprise · 2025", detail: longDetail })) },
    { key: "projects", title: "Projets techniques", kind: "list", text: "", items: Array.from({ length: 3 }, (_, index) => ({ id: `p${index}`, title: `Projet ${index + 1}`, meta: "Projet personnel · 2026", detail: longDetail })) },
    { key: "skills", title: "Compétences techniques", kind: "text", text: "Programmation : Python, SQL, C++.\nAnalyse : traitement de données, Excel.\nÉlectricité : réseaux BT, protections.", items: [] },
    { key: "education", title: "Formation", kind: "list", text: "", items: [{ id: "f1", title: "Diplôme d'ingénieur", meta: "2024–2027", detail: "Génie électrique." }] },
  ],
};
const before = cvToText(source);
const candidates = onePageCandidates(source, "Optimisation de réseaux et analyse de données sous Python");
assert.equal(candidates.length, 3);
assert.equal(cvToText(source), before);
for (const candidate of candidates) {
  assert.equal(candidate.cv.sections[2].text, source.sections[2].text);
  assert.deepEqual(candidate.cv.sections[0].items.map(item => item.title), source.sections[0].items.map(item => item.title));
  assert.ok(cvToText(candidate.cv).length < before.length);
}
const html = (cv: CvData) => cvDocumentHtml(cv, { template: "professional", accent: "#246753", fontSize: 9.5 }, "CV cible");
async function main() {
  await assert.rejects(generatePdfFromHtml(html(source)), /page A4/);
  let fitted = false;
  for (const candidate of candidates) {
    try {
      const pdf = await generatePdfFromHtml(html(candidate.cv));
      assert.ok(pdf.byteLength > 1_000);
      fitted = true;
      break;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("page A4")) throw error;
    }
  }
  assert.equal(fitted, true, "A condensed variant should pass the real PDF verifier");
  process.stdout.write("cv-one-page: source preserved, PDF fits one A4 page\n");
}
void main();
