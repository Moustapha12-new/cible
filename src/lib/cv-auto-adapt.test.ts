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
  { original: "Analyse de données énergétiques chez EDD.", rewritten: "Analyse de données énergétiques chez EDD, orientée performance énergétique.", section: "Profil" },
  { original: "Calcul et dimensionnement d'un réseau BT.", rewritten: "Calcul et dimensionnement d'un réseau BT avec MATLAB.", section: "Projet" },
  { original: "Projet réseau électrique", rewritten: "Expert en projet réseau électrique", section: "Projet" },
  { original: "Expérience inventée", rewritten: "Expérience inventée chez EDF", section: "Expérience" },
] });
assert.equal(result.cv.summary, "Analyse de données énergétiques chez EDD, orientée performance énergétique.");
assert.equal(result.cv.sections[0].items[0].detail, "Calcul et dimensionnement d'un réseau BT.");
assert.equal(result.cv.sections[0].items[0].title, "Projet réseau électrique");
assert.equal(result.changes.length, 1);
assert.equal(source.summary, "Analyse de données énergétiques chez EDD.");
process.stdout.write("cv-auto-adapt: 5 assertions passed\n");
