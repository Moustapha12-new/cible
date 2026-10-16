import assert from "node:assert/strict";
import { qualifyDiscoveryText } from "./discovery-qualification";

const q = (description: string) => qualifyDiscoveryText(description, "Stage PFE réseaux électriques");
assert.equal(q("Stage de 6 mois à compter de septembre 2026. Bac+5 génie électrique.").startFit, "incompatible");
assert.equal(q("Durée et/ou période du stage : 6 mois, à partir du 1er trimestre 2027. Vous êtes en dernière année de cycle ingénieur.").startFit, "compatible");
assert.equal(q("Stage de 5 à 6 mois à compter de janvier 2027. Étudiant en Master 2 électrotechnique.").degreeFit, "compatible");
assert.equal(q("Stage de 6 mois. Étudiant en dernière année d'école d'ingénieur.").startFit, "unknown");
assert.equal(q("Formation Bac+5 en affaires publiques et relations institutionnelles.").degreeFit, "other_specialty");
console.log("Qualification Discovery : dates explicites, inconnues et diplôme vérifiés.");
