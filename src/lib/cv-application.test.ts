import assert from "node:assert/strict";
import { parseCvText, cvToText } from "./cv";
import { prepareApplicationCv } from "./cv-application";
import { validateCvChange } from "./cv-adaptation";

const text = `CV maître • Référence interne de cible. • Version 17/10/2026 1
ÉLÈVE-INGÉNIEUR | GÉNIE ÉLECTRIQUE
Stage de 6 mois · à partir de février 2027
candidate@example.invalid
PROFIL TRANSVERSAL
Analyse de données avec Python.
EXPÉRIENCE PROFESSIONNELLE
Entreprise — Stagiaire en analyse de données · Nov. 2025 – fév. 2026
- Analyse des écarts entre production prévue et production réelle.
PROJETS TECHNIQUES PRINCIPAUX
Calcul de réseau électrique
Projet personnel · attesté dans CV récent
- Calcul de câbles.
Stockage renouvelable
Projet évoqué antérieurement · détails à vérifier
- Modèle à vérifier avant diffusion externe.
MORGAN EXEMPLE / DOSSIER MAÎTRE
CV maître • Référence interne de cible. • Version 17/10/2026 2
COMPÉTENCES : RÉFÉRENTIEL TRANSVERSAL
Programmation Python (pratiqué) · SQL (pratiqué) · VHDL (à confirmer)
FORMATION
École A — Cycle ingénieur · 2024–2027 · Paris
École B — Classes préparatoires MP · 2022–2024 · Lyon
STATUT DE CE DOCUMENT
CV MAÎTRE INTERNE — ne pas envoyer tel quel.`;
const master = parseCvText(text);
const original = JSON.stringify(master);
assert.equal(master.basics.name, "MORGAN EXEMPLE");
assert.equal(master.sections.find(section => /formation/i.test(section.title))?.items.length, 2);
const copy = prepareApplicationCv(master, "Python SQL analyse de données");
const result = cvToText(copy);
assert.equal(JSON.stringify(master), original);
assert.doesNotMatch(result, /référence interne|dossier maître|statut de ce document|à vérifier|à confirmer|attesté dans CV récent|VHDL/i);
assert.match(result, /Python/);
assert.match(result, /Calcul de réseau électrique/);
assert.doesNotMatch(result, /Stockage renouvelable/);
assert.match(result, /début 2027/);
assert.deepEqual(prepareApplicationCv(copy, "Python SQL"), copy);
const change = { id: "method", section: "Expérience", original: "Analyse des écarts entre production prévue et production réelle.", proposed: "Analyse de sensibilité des écarts entre production prévue et production réelle.", reason: "test", source: "", decision: "pending" as const };
assert.ok(validateCvChange(change, text).some(issue => /Méthodes absentes/.test(issue)));
console.log("cv-application: nom, dates, sélection, notes internes, compétences et méthodes non inventées vérifiés.");
