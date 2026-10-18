/* Registre de preuves du candidat (pack CV maître) : intégrité, résolution
   d'IDs vers les faits atomiques, affirmations interdites, garde-fou d'import. */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  AVAILABILITY_LINE, DOSSIER, FORBIDDEN_CLAIMS, LEARNABLE_TARGETS,
  dossierEvidenceFor, dossierExtract, dossierSkillCatalogue, findForbiddenClaims,
  learnableOnly, factText, resolveFactIds,
} from "./candidate-dossier";

/* ── Intégrité du registre importé ──────────────────────────────────────── */

assert.equal(DOSSIER.schema_version, "1.0.0");
assert.ok(DOSSIER.fact_registry.length >= 35, "registre de faits atomiques présent");
assert.ok(DOSSIER.skills.length >= 30, "catalogue de compétences présent");
assert.equal(DOSSIER.future_learning_targets.length, 7);
assert.equal(AVAILABILITY_LINE, "Stage de 6 mois · à partir de début 2027",
  "formulation verrouillée exigée par le candidat");

/* ── Résolution des IDs cités par l'IA ──────────────────────────────────── */

const facts = resolveFactIds(["prj_reseau_bt"]);
assert.ok(facts.valid.length >= 4, "un ID de projet se résout vers ses faits atomiques");
assert.ok(facts.valid.every(id => /^prj_reseau_bt_f/.test(id)), "les faits résolus appartiennent au projet cité");
assert.deepEqual(resolveFactIds(["edd_03"]).valid, ["edd_03"], "un fait atomique reste résolvable tel quel");
assert.deepEqual(resolveFactIds(["formation"]).valid, ["formation"]);
const unknown = resolveFactIds(["prj_invention", 42, "  "]);
assert.deepEqual(unknown.valid, [], "aucune ID fabriquée n'est acceptée");
assert.deepEqual(unknown.unknown, ["prj_invention"], "l'ID fabriquée est signalée");
const skillResolution = resolveFactIds(["solar"]);
assert.ok(skillResolution.valid.length > 0, "une compétence du dossier se résout vers ses faits");
assert.ok(factText(["prj_audit_f01"]).includes("consommations"), "le texte de preuve est celui du registre");

/* ── Correspondance compétence ↔ terme d'offre ──────────────────────────── */

const sizing = dossierEvidenceFor("dimensionnement de câbles BT");
assert.ok(sizing.length > 0 && sizing[0].skill.id === "sizing");
assert.ok(sizing[0].factText.length > 0, "la preuve attachée contient le texte du fait");
assert.deepEqual(dossierEvidenceFor("entropie quantique"), [], "hors registre = aucune preuve inventée");

/* ── Compétences à acquérir : jamais déclarables ────────────────────────── */

assert.equal(learnableOnly("Supervision SCADA")?.id, "learn_scada");
assert.equal(learnableOnly("PVsyst")?.id, "learn_pvsyst");
assert.equal(learnableOnly("Excel"), null, "un mot-clé générique ne bascule pas en compétence à acquérir");
assert.equal(learnableOnly("dimensionnement"), null);

/* ── Affirmations interdites ────────────────────────────────────────────── */

const MASTER = "Lina Marchand — élève-ingénieur. Dimensionnement de câbles, chutes de tension, schéma unifilaire. Expérience : analyse de données de production éolienne avec Python chez EDD.";
assert.deepEqual(findForbiddenClaims("Expérience en maintenance préventive industrielle.", MASTER),
  ["maintenance (expérience absente)"]);
assert.deepEqual(findForbiddenClaims("Simulation sous DIgSILENT PowerFactory et PSS/E.", MASTER).length, 2);
assert.ok(findForbiddenClaims("Habilitation HSE et audit de sécurité réalisés.", MASTER).length >= 1);
assert.deepEqual(findForbiddenClaims("Piloté l'équipe de maintenance.", MASTER).length >= 1, true);
/* Aucun faux positif sur le vocabulaire réel du candidat. */
assert.deepEqual(findForbiddenClaims("Dimensionnement de câbles et chutes de tension sous Python.", MASTER), []);
/* Le CV maître qui mentionne déjà un terme n'est pas bloqué par le blocage. */
assert.deepEqual(findForbiddenClaims("Maintenance", "Expérience en maintenance industrielle."), []);

/* Couverture des interdits les plus risqués du pack. */
for (const label of ["ETAP (non démontré)", "SCADA (cible d'apprentissage)", "Revit (non démontré)",
  "PyTorch (non démontré)", "VHDL/FPGA (à confirmer)", "BESS (gestion non démontrée)",
  "grid-forming / GFM (non démontré)", "black-start (non démontré)", "MPPT (non validé industriellement)"]) {
  assert.ok(FORBIDDEN_CLAIMS.some(rule => rule.label === label), `règle présente : ${label}`);
}
assert.ok(LEARNABLE_TARGETS.every(target => target.evidence_required.length > 10),
  "chaque piste d'apprentissage exige une preuve");

/* ── Catalogue catégorisé ───────────────────────────────────────────────── */

const catalogue = dossierSkillCatalogue();
assert.ok(catalogue.technique.some(skill => skill.id === "bt"));
assert.ok(catalogue.logiciels.some(skill => skill.id === "psim"));
assert.ok(catalogue.programmation.some(skill => skill.id === "python"));
assert.ok(catalogue.academique.length >= 10, "connaissances académiques séparées");
assert.ok(catalogue.qualites.length >= 5, "qualités séparées");
assert.equal(catalogue.apprentissage.length, 7, "pistes d'apprentissage séparées");

/* ── Extract envoyé au modèle recruteur ─────────────────────────────────── */

const extract = dossierExtract();
assert.ok(extract.includes("DISPONIBILITÉ VERROUILLÉE : Stage de 6 mois · à partir de début 2027"));
assert.ok(extract.includes("prj_reseau_bt"), "les faits atomiques sont cités par ID");
assert.ok(extract.includes("HSE"), "les interdits sont listés");
assert.ok(extract.includes("PVsyst"), "les compétences à acquérir sont listées");
assert.ok(extract.includes("JAMAIS présentées comme acquises"));
assert.ok(extract.length < 25_000, `extract compact pour le prompt (${extract.length} caractères)`);

/* ── Garde-fou : jamais importé côté client ─────────────────────────────── */

const ALLOWED = new Set([
  "lib/candidate-dossier.ts", "lib/candidate-dossier.test.ts",
  "lib/cv-engine.ts", "lib/cv-engine.test.ts",
  "lib/cv-recruiter.ts", "lib/cv-recruiter.test.ts",
  "lib/cv-auto-adapt.ts", "app/api/cv/adapt/route.ts",
]);
const root = join(process.cwd(), "src").replace(/\\/g, "/");
const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = dir + "/" + name;
  if (statSync(path).isDirectory()) return walk(path);
  return /\.(ts|tsx)$/.test(path) ? [path] : [];
});
const IMPORT_PATTERN = /from\s+["'](?:@\/lib\/|\.\/)candidate-dossier["']/;
const importers = walk(root)
  .filter(path => IMPORT_PATTERN.test(readFileSync(path, "utf8")))
  .map(path => path.slice(root.length + 1))
  .filter(relative => !ALLOWED.has(relative));
assert.deepEqual(importers, [],
  "candidate-dossier ne doit être importé que par du code serveur (données personnelles)");

console.log("Registre de preuves validé : IDs résolus vers les faits atomiques, interdits bloqués, pistes d'apprentissage isolées, import client impossible.");
