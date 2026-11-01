import assert from "node:assert/strict";
import { preferredEvidence } from "./offer-evidence";
import type { RawOffer } from "./gmail-core";
const partial: RawOffer = { title: "Stage", company: "Entreprise", location: "Paris", contract: "Stage", duration: "", deadline: "", skills: [], description: "Annonce courte", applicationUrl: "https://example.com/job", source: "test", enrichStatus: "partial" } satisfies RawOffer;
const complete: RawOffer = { ...partial, enrichStatus: "ok", enrichOutcome: "ok", description: "Description précise des missions techniques et des compétences demandées pour ce stage au sein de notre bureau d'études électriques.", missions: ["Dimensionner les installations électriques du bâtiment."], skills: ["AutoCAD"] };
assert.equal(preferredEvidence(partial, complete), complete);
assert.equal(preferredEvidence(complete, partial), complete);
assert.equal(partial.description, "Annonce courte");
console.log("La fiche complète est conservée quel que soit l’ordre des alertes.");
