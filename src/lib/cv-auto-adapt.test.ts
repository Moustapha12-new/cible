import assert from "node:assert/strict";
import { applyGroundedChanges } from "./cv-auto-adapt";
import { cvToText, type CvData } from "./cv";

const source: CvData = {
  basics: { name: "Candidat Exemple", headline: "Élève ingénieur en génie électrique", contact: "test@example.invalid" },
  summary: "Analyse de données énergétiques chez EDD.",
  sections: [{ key: "experience", title: "Expérience", kind: "list", text: "", items: [{ id: "1", title: "Projet réseau électrique", detail: "Calcul et dimensionnement d'un réseau BT." }] }],
};
const original = cvToText(source);
const result = applyGroundedChanges(source, original, { changes: [
  { original: "Analyse de données énergétiques chez EDD.", rewritten: "Chez EDD, analyse de données énergétiques.", section: "Profil" },
  { original: "Calcul et dimensionnement d'un réseau BT.", rewritten: "Calcul et dimensionnement d'un réseau BT avec MATLAB.", section: "Projet" },
  { original: "Projet réseau électrique", rewritten: "Expert en projet réseau électrique", section: "Projet" },
  { original: "Expérience inventée", rewritten: "Expérience inventée chez EDF", section: "Expérience" },
] });
assert.equal(result.cv.summary, "Chez EDD, analyse de données énergétiques.");
assert.equal(result.cv.sections[0].items[0].detail, "Calcul et dimensionnement d'un réseau BT.");
assert.equal(result.cv.sections[0].items[0].title, "Projet réseau électrique");
assert.equal(result.changes.length, 1);
assert.equal(source.summary, "Analyse de données énergétiques chez EDD.");
const withSkills: CvData = { basics: { name: "Exemple", headline: "Stage de six mois à partir de février 2027", contact: "test@example.invalid" }, summary: "", sections: [
  { key: "skills", title: "Compétences techniques", kind: "text", text: "Réseaux électriques et Python.", items: [] },
  { key: "projects", title: "Projets", kind: "list", text: "", items: [{ id: "2", title: "Projet MATLAB", detail: "Simulation sous MATLAB." }] },
] };
const optimized = applyGroundedChanges(withSkills, cvToText(withSkills), { changes: [] }, ["Python", "MATLAB", "AutoCAD"]);
assert.doesNotMatch(optimized.cv.sections[0].text, /MATLAB|Compétences et logiciels pertinents/);
assert.doesNotMatch(optimized.cv.sections[0].text, /AutoCAD/);
assert.match(optimized.cv.basics.headline, /f[ée]vrier 2027/);
assert.equal(withSkills.basics.headline, "Stage de six mois à partir de février 2027");
const mewsCv: CvData = { basics: { name: "Candidate Example", headline: "Élève-ingénieur | Énergie et systèmes électriques", contact: "example.invalid" }, summary: "Formation en génie électrique. Expérience en analyse de données.", sections: [
  { key: "experience", title: "Expérience", kind: "list", text: "", items: [{ id: "3", title: "Stage données", detail: "Analyse de données de production sous Python ; nettoyage avec SQL." }] },
  { key: "skills", title: "Compétences techniques", kind: "text", text: "Électricité : réseaux BT, dimensionnement de câbles.\nDonnées et programmation : Python, SQL, Excel.", items: [] },
] };
const mewsOriginal = cvToText(mewsCv);
const mewsAdapted = applyGroundedChanges(mewsCv, mewsOriginal, { changes: [
  { original: "Analyse de données de production sous Python", rewritten: "Analyse de sensibilité de données de production sous Python" },
  { original: "Python, SQL, Excel", rewritten: "Python, NetworkX, SQL, Excel" },
] }, ["Théorie des graphes", "Analyse de sensibilité", "Python", "Processus stochastiques"]);
assert.equal(mewsAdapted.cv.sections[0].items[0].detail, mewsCv.sections[0].items[0].detail);
assert.doesNotMatch(cvToText(mewsAdapted.cv), /NetworkX|sensibilit[ée]|stochastique|th[ée]orie des graphes/i);
assert.match(mewsAdapted.cv.sections[1].text.split("\n")[0], /Python/);
assert.match(mewsAdapted.cv.basics.headline, /ANALYSE DE DONNÉES & PYTHON/);
assert.equal(mewsCv.sections[1].text.split("\n")[0].startsWith("Électricité"), true);
const mbdaCv: CvData = { basics: { name: "Candidate Example", headline: "Élève-ingénieur | Énergie et systèmes électriques", contact: "example.invalid", target: "Stage ingénieur de fin d’études (PFE) · 6 mois à partir de février 2027" }, summary: "Élève-ingénieur en génie électrique. Première expérience en analyse de données chez EDD.", sections: [
  { key: "experience", title: "Expérience professionnelle", kind: "list", text: "", items: [{ id: "3", title: "EDD — Stage analyse énergétique", detail: "Analyse de données sous Python." }] },
  { key: "projects", title: "Projets techniques", kind: "list", text: "", items: [{ id: "4", title: "Calcul et dimensionnement d’un réseau électrique industriel", detail: "- Étude des câbles et des chutes de tension.\n- Calcul de courts-circuits, choix des protections et schéma unifilaire." }] },
  { key: "skills", title: "Compétences techniques", kind: "text", text: "Électricité : réseaux BT et protections.", items: [] },
] };
const mbda = applyGroundedChanges(mbdaCv, cvToText(mbdaCv), { changes: [] }, ["installations électriques", "génie électrique"], "Stage MBDA architecture des installations électriques de bâtiments de production");
assert.match(mbda.cv.basics.headline, /INSTALLATIONS BT/);
assert.equal(mbda.cv.basics.target, "Stage de 6 mois · Installations électriques BT · à partir de début 2027");
assert.match(mbda.cv.summary, /Projet personnel de dimensionnement/);
assert.doesNotMatch(cvToText(mbda.cv), /Compétences et logiciels pertinents/);
assert.equal(mbdaCv.basics.headline, "Élève-ingénieur | Énergie et systèmes électriques");
process.stdout.write("cv-auto-adapt: 19 assertions passed\n");
