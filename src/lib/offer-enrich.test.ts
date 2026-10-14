/* Jalon B — enrichissement honnête : statuts distincts par issue, niveaux
   L0–L3, provenance par champ, aucune information inventée. */

import assert from "node:assert/strict";
import {
  classifyPageOutcome,
  enrichBadgeFor,
  maxLevelFor,
  evidenceMatchesSource,
  pruneUnprovenFields,
  emailProvenance,
  mergeProvenance,
  levelSummary,
  type EnrichedFieldMap,
} from "./offer-enrich";

/* 1 — Chaque échec a un état DISTINCT (03_TESTS §B.5). */
assert.equal(classifyPageOutcome({ httpStatus: 403 }).kind, "blocked", "403 → bloqué, jamais expirée");
assert.equal(classifyPageOutcome({ httpStatus: 401 }).kind, "login_required", "401 → login");
assert.equal(classifyPageOutcome({ httpStatus: 404 }).kind, "not_found", "404 → absente");
assert.equal(classifyPageOutcome({ httpStatus: 410 }).kind, "not_found", "410 → absente");
assert.equal(classifyPageOutcome({ httpStatus: 429 }).kind, "rate_limited", "429 → quota");
assert.equal(classifyPageOutcome({ timedOut: true }).kind, "timeout", "timeout → délai");
assert.equal(classifyPageOutcome({ errorCode: "ENOTFOUND" }).kind, "network", "DNS → réseau");
assert.equal(classifyPageOutcome({ httpStatus: 200, bodyText: "Please complete the CAPTCHA" }).kind, "captcha", "CAPTCHA détecté");
assert.equal(classifyPageOutcome({ httpStatus: 200, bodyText: "Sign in to apply" }).kind, "login_required", "mur de login détecté");
assert.equal(classifyPageOutcome({ httpStatus: 200 }).kind, "ok", "200 → ok");

/* Un 403 ne produit JAMAIS une expiration (seuls 404/410 l'attestent). */
assert.notEqual(classifyPageOutcome({ httpStatus: 403 }).kind, "not_found", "403 jamais expirée");
assert.equal(enrichBadgeFor(classifyPageOutcome({ httpStatus: 404 }), "L1").label, "Expirée vérifiée", "404 → expirée vérifiée");
assert.equal(enrichBadgeFor(classifyPageOutcome({ httpStatus: 403 }), "L1").label, "Bloquée / login", "403 → bloquée");

/* 2 — Niveaux L0–L3 : inatteignable → plafonné à L0. */
assert.equal(maxLevelFor(classifyPageOutcome({ httpStatus: 200 })), "L2", "page ok → L2");
assert.equal(maxLevelFor(classifyPageOutcome({ httpStatus: 403 })), "L0", "bloqué → L0");
assert.equal(maxLevelFor(classifyPageOutcome({ timedOut: true })), "L0", "timeout → L0");

/* 3 — Anti-invention : un extrait absent de la source est rejeté. */
const source = "Le stagiaire analysera les architectures électriques et dimensionnera les protections BT.";
assert.ok(evidenceMatchesSource("dimensionnera les protections BT", source), "extrait réel accepté");
assert.ok(!evidenceMatchesSource("maîtrise de PyTorch et TensorFlow", source), "extrait inventé rejeté");
assert.ok(!evidenceMatchesSource("", source), "extrait vide rejeté");

/* 4 — Provenance par champ : explicite exige preuve, email/inferred non. */
const prov: EnrichedFieldMap = {
  missions: { field: "missions", sourceLevel: "L2", origin: "explicit", evidenceSnippet: "dimensionnera les protections BT", confidence: 0.9 },
  skills: { field: "skills", sourceLevel: "L2", origin: "explicit", evidenceSnippet: "maîtrise de PyTorch", confidence: 0.9 },
  contract: { field: "contract", sourceLevel: "L0", origin: "email", confidence: 0.7 },
  profile: { field: "profile", sourceLevel: "L2", origin: "inferred", confidence: 0.5 },
};
const { kept, rejected } = pruneUnprovenFields(prov, source);
assert.ok(kept.missions, "champ attesté conservé");
assert.ok(!kept.skills, "champ inventé écarté");
assert.deepEqual(rejected, ["skills"], "seul skills rejeté");
assert.ok(kept.contract, "donnée email conservée (L0)");
assert.ok(kept.profile, "déduction inferred conservée (séparée, non présentée comme preuve)");

/* 5 — Fusion L0 → L2 : le niveau supérieur prime, la meilleure version persiste. */
const l0 = emailProvenance(["title", "company", "location"], "https://example.test/job/1");
assert.equal(l0.title.sourceLevel, "L0", "provenance L0 par défaut");
const l2: EnrichedFieldMap = {
  title: { field: "title", sourceLevel: "L2", origin: "explicit", evidenceSnippet: "Architecte électrique", confidence: 0.95 },
};
const merged = mergeProvenance(l0, l2);
assert.equal(merged.title.sourceLevel, "L2", "L2 prime sur L0");
assert.equal(merged.company.sourceLevel, "L0", "champ sans L2 reste L0");

/* 6 — Résumé de niveau cohérent. */
const sum = levelSummary(merged);
assert.equal(sum.maxLevel, "L2", "niveau global = L2");
assert.equal(sum.explicit, 1, "1 champ explicite");
assert.equal(sum.fromEmail, 2, "2 champs email (company, location)");

console.log("Jalon B validé : issues de page distinctes (403/401/404/429/timeout/CAPTCHA),");
console.log("niveaux L0–L3 plafonnés honnêtement, provenance par champ, anti-invention vérifiée.");
