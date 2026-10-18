/* Module recruteur — Gemini ne fait jamais autorité à lui seul.
   5 offres SYNTHÉTIQUES (marquées « test synthétique ») et des réponses IA
   simulées vérifient chaque garde-fou : citation d'offre réelle, IDs de preuves
   résolus, affirmations interdites, compétences à acquérit, éligibilité fusionnée,
   et application déterministe du plan sur le CV structuré. */

import assert from "node:assert/strict";
import type { CvData } from "./cv";
import type { UserData } from "./data";
import { analyzeAndPlan } from "./cv-engine";
import { integrateAiResult, offerPromptText, unprovenHeadlineTerms, type AiAdaptResult, type IntegrateContext } from "./cv-recruiter";
import { applyPlanToCv, cvWordCount } from "./cv-plan-apply";

/* ── CV maître synthétique (extraits fidèles du dossier réel) ───────────── */

const MASTER_TEXT = [
  "MOUSTAPHA IBRAHIM DJAMA — Élève-ingénieur en génie électrique, énergie et automatisation (ECAM-EPMI, 2024–2027). Stage de 6 mois · à partir de début 2027.",
  "Expérience : EDD — Stagiaire en analyse de données énergétiques (nov. 2025 – févr. 2026). Analyse des données de production éolienne et photovoltaïque avec Python. Nettoyage et consolidation avec Python, SQL et Excel. Création d'indicateurs de suivi de production. Analyse des écarts entre production prévue et production réelle.",
  "Projet : Calcul et dimensionnement d'un réseau électrique industriel basse tension. Dimensionnement de câbles selon le courant admissible. Vérification des chutes de tension. Calculs de courants de court-circuit. Choix des protections et étude de sélectivité. Schéma unifilaire.",
  "Projet : Audit énergétique d'un bâtiment. Analyse des consommations et comparaison de scénarios d'amélioration.",
  "Formation : ECAM-EPMI — Cycle ingénieur, génie électrique, énergie et automatisation (en cours). CPGE MP (Djibouti, 2022–2024).",
  "Compétences : Python, SQL, Excel, dimensionnement BT, chutes de tension, protections, schéma unifilaire, photovoltaïque, éolien.",
  "Langues : Français (courant), Anglais B2, Arabe.",
].join("\n");

const cvData: CvData = {
  basics: { name: "Moustapha Ibrahim Djama", headline: "ÉLÈVE-INGÉNIEUR | GÉNIE ÉLECTRIQUE & ÉNERGIE", contact: "moustapha@example.invalid · Val-d'Oise", target: "Stage de 6 mois · à partir de début 2027" },
  summary: "Élève-ingénieur en génie électrique, énergie et automatisation, avec une expérience en analyse de données de production renouvelable.",
  sections: [
    { key: "exp", title: "Expériences", kind: "list", text: "", items: [{ id: "e1", title: "EDD — Stagiaire en analyse de données énergétiques", meta: "nov. 2025 – févr. 2026", detail: "- Analyse des écarts entre production prévue et production réelle.\n- Création d'indicateurs de suivi de production." }] },
    { key: "proj", title: "Projets", kind: "list", text: "", items: [{ id: "p1", title: "Calcul et dimensionnement d'un réseau électrique industriel", meta: "Projet personnel", detail: "- Dimensionnement de câbles selon le courant admissible.\n- Vérification des chutes de tension." }] },
    { key: "form", title: "Formation", kind: "list", text: "", items: [{ id: "f1", title: "ECAM-EPMI — Cycle ingénieur, génie électrique", meta: "2024–2027", detail: "Spécialité énergie et automatisation." }] },
    { key: "comp", title: "Compétences", kind: "text", text: "Python\nSQL\nExcel\ndimensionnement BT\nchutes de tension", items: [] },
  ],
};

const baseData = {
  profile: { firstName: "Moustapha", lastName: "Ibrahim Djama", title: "Élève-ingénieur en génie électrique", email: "moustapha@example.invalid", phone: "", city: "Val-d'Oise", skills: ["Python", "SQL"], experiences: [], educations: [], skillEvidence: [] },
  originalCv: { name: "CV maître", text: MASTER_TEXT },
  cvData, cvs: [], applications: [], letters: [], offers: [], recruiters: [], autopilot: false,
} as UserData;

/* ── 5 offres SYNTHÉTIQUES représentatives des familles métiers ──────────── */

const mbdaText = "Stage ingénieur bac+5, six mois, à partir de février 2027. Vous dimensionnerez les installations électriques basse tension des bâtiments de production : calcul des câbles, protections, schéma unifilaire. Maintenance industrielle des installations exigée.";
const bessText = "Stage ingénieur énergie, six mois dès janvier 2027. Missions : supervision SCADA de systèmes de stockage d'énergie (BESS) raccordés à des parcs éoliens, études grid-forming.";
const fpgaText = "Stage électronique embarquée, six mois, début 2027. Développement VHDL pour cartes FPGA, maîtrise du langage C exigée.";

const offers = {
  mbda: { id: "test-synth-mbda-bt", title: "Stage ingénieur architecture électrique", company: "MBDA (test synthétique)", location: "Lyon, France", salary: "", match: 0, keywords: [], contract: "Stage", duration: "6 mois", startDate: "2027-02", text: mbdaText, missions: ["Dimensionner les installations électriques basse tension"], prerequisites: ["Formation ingénieur bac+5", "Maintenance industrielle exigée"], skills: ["basse tension", "protections"] },
  bess: { id: "test-synth-bess", title: "Stage ingénieur systèmes de stockage", company: "TotalEnergies (test synthétique)", location: "Bordeaux, France", salary: "", match: 0, keywords: [], contract: "Stage", duration: "6 mois", startDate: "2027-01", text: bessText, missions: ["Superviser les systèmes de stockage"], prerequisites: [], skills: ["SCADA", "BESS"] },
  fpga: { id: "test-synth-fpga", title: "Stage ingénieur électronique FPGA", company: "MBDA (test synthétique)", location: "Paris, France", salary: "", match: 0, keywords: [], contract: "Stage", duration: "6 mois", startDate: "2027-02", text: fpgaText, missions: [], prerequisites: [], skills: ["VHDL", "FPGA", "C"] },
  cdi: { id: "test-synth-cdi", title: "Alternance technicien de maintenance", company: "Firme (test synthétique)", location: "Lille, France", salary: "", match: 0, keywords: [], contract: "Alternance", duration: "24 mois", text: "Alternance de 24 mois : maintenance préventive des machines, entretien des moteurs électriques.", missions: [], prerequisites: [], skills: ["maintenance"] },
} satisfies Record<string, IntegrateContext["data"]["offers"][number]>;

const ctxFor = (offer: (typeof offers)[keyof typeof offers]): IntegrateContext => {
  const { analysis, masterText, cvData: structured } = analyzeAndPlan(offer as never, baseData);
  return { masterText, cvData: structured, analysis, offerText: offerPromptText(offer as never), data: baseData };
};

/* ── 1 · MBDA BT : exigences tracées, faits résolus, interdit rejeté ───── */

{
  const ctx = ctxFor(offers.mbda);
  const ai: AiAdaptResult = {
    eligibility: { status: "eligible", reason: "Stage six mois début 2027" },
    strategy: { focus: "Dimensionnement de réseau basse tension", primary_evidence_ids: ["prj_reseau_bt"] },
    requirements: [
      { id: "req_01", text: "Dimensionnement des installations basse tension", quote: "vous dimensionnerez les installations électriques basse tension", priority: "obligatoire", facts: ["prj_reseau_bt"], relation: "direct" },
      { id: "req_02", text: "Maintenance industrielle", quote: "maintenance industrielle des installations exigée", priority: "obligatoire", facts: [], relation: "unsupported" },
      { id: "req_03", text: "Conception de postes HTB", quote: "citation absente de cette offre", priority: "souhaitée", facts: ["prj_invente"], relation: "direct" },
    ],
    changes: [
      { section: "Expérience : EDD", original: "Analyse des écarts entre production prévue et production réelle.", rewritten: "Analyse des écarts entre production prévue et production réelle, avec des indicateurs de suivi.", why: "Rapproche l'analyse prévue/réel de l'esprit d'analyse demandé.", requirement_ids: ["req_01"], evidence_ids: ["edd_04"], method: "KEYWORD_INSERT" },
      { section: "Expérience : EDD", original: "Création d'indicateurs de suivi de production.", rewritten: "Maintenance préventive des installations de production.", why: "Tentative de couverture du besoin de maintenance.", requirement_ids: ["req_02"], evidence_ids: [], method: "KEYWORD_INSERT" },
    ],
    headline: "ÉLÈVE-INGÉNIEUR | GÉNIE ÉLECTRIQUE & INSTALLATIONS BT",
    refused: [{ keyword: "CANECO BT", reason: "Outil cité par l'offre, absent du CV et du registre de preuves." }],
    stillMissing: [{ item: "Maintenance industrielle", howToGet: "Habilitation électrique B1V dispensée en centre de formation agréé." }],
    tips: ["Cite le calcul de court-circuit en entretien : c'est ta preuve la plus proche."],
  };
  const report = integrateAiResult(ai, ctx);

  assert.equal(report.eligibility.status, "eligible");
  assert.equal(report.focus, "Dimensionnement de réseau basse tension");
  assert.equal(report.headline, "ÉLÈVE-INGÉNIEUR | GÉNIE ÉLECTRIQUE & INSTALLATIONS BT");
  assert.equal(report.requirements.length, 2, "l'exigence à citation fantôme est rejetée");
  assert.ok(report.warnings.some(warning => warning.includes("citation absente")));
  assert.ok(report.warnings.some(warning => warning.includes("prj_invente")), "ID de preuve fabriqué signalé");
  const sizing = report.requirements.find(row => row.id === "req_01");
  assert.equal(sizing?.relation, "DIRECTE");
  assert.ok(sizing && sizing.facts.length >= 4, "l'ID projet est résolu vers les faits atomiques");
  assert.equal(report.requirements.find(row => row.id === "req_02")?.guidance, "à confirmer");
  assert.ok(report.unsupported.some(term => /maintenance/i.test(term)), "lacune honnête remontée");

  assert.equal(report.accepted.length, 1, "la reformulation prouvée est acceptée");
  assert.ok(report.rejected.length === 1, "la reformulation interdite est refusée");
  assert.ok(report.rejected[0].issues.some(issue => issue.includes("interdite")), "motif explicite : affirmation interdite");
  assert.ok(report.refused.some(row => row.keyword === "CANECO BT"));
  assert.ok(report.stillMissing[0].howToGet.length > 10);
}

/* ── 2 · BESS : compétence à acquérir jamais affirmable ─────────────────── */

{
  const ctx = ctxFor(offers.bess);
  const ai: AiAdaptResult = {
    eligibility: "eligible",
    strategy: { focus: "Supervision de systèmes de stockage", primary_evidence_ids: ["prj_stockage"] },
    requirements: [{ id: "req_01", text: "Supervision SCADA", quote: "supervision SCADA de systèmes de stockage", priority: "obligatoire", facts: ["prj_stockage"], relation: "direct" }],
    changes: [{ section: "Compétences", original: "Python", rewritten: "Python, supervision SCADA et grid-forming", why: "Mots-clés de l'offre.", evidence_ids: ["prj_stockage"], method: "KEYWORD_INSERT" }],
  };
  const report = integrateAiResult(ai, ctx);
  const supervision = report.requirements.find(row => row.text.includes("SCADA"));
  assert.equal(supervision?.guidance, "à confirmer", "SCADA n'existe que comme piste d'apprentissage");
  assert.equal(report.accepted.length, 0, "aucune reformulation SCADA/grid-forming acceptée");
  assert.ok(report.rejected.some(entry => entry.issues.some(issue => issue.includes("interdite"))));
}

/* ── 3 · FPGA : VHDL/mention à confirmer rejeté ─────────────────────────── */

{
  const ctx = ctxFor(offers.fpga);
  const ai: AiAdaptResult = {
    strategy: { focus: "Programmation C", primary_evidence_ids: ["prj_pacman"] },
    changes: [{ section: "Compétences", original: "Python", rewritten: "Python, VHDL et FPGA", why: "Outils de l'offre.", method: "KEYWORD_INSERT" }],
    headline: "ÉLÈVE-INGÉNIEUR | ÉLECTRONIQUE & FPGA (DIgSILENT)",
  };
  const report = integrateAiResult(ai, ctx);
  assert.equal(report.accepted.length, 0);
  assert.ok(report.rejected.some(entry => entry.issues.some(issue => /VHDL|FPGA/.test(issue))));
  assert.ok(report.headlineIssues.length >= 2, "titre refusé : FPGA confirmé + outil non démontré");
  assert.equal(report.headline, undefined, "titre refusé n'est jamais proposé");
}

/* ── 4 · Éligibilité fusionnée ──────────────────────────────────────────── */

{
  const verify = integrateAiResult({ eligibility: { status: "needs_confirmation", reason: "Durée à confirmer" } }, ctxFor(offers.mbda));
  assert.equal(verify.eligibility.status, "needs_confirmation");
  const excluded = integrateAiResult({ eligibility: "eligible" }, ctxFor(offers.cdi));
  assert.equal(excluded.eligibility.status, "ineligible", "le déterministe (contrat non-stage) prime sur l'avis IA");
}

/* ── 5 · Titres pro : contrôle des outils et niveaux ────────────────────── */

assert.deepEqual(unprovenHeadlineTerms("Élève-ingénieur | Énergie & systèmes électriques", MASTER_TEXT), []);
assert.ok(unprovenHeadlineTerms("Ingénieur expert PVsyst", MASTER_TEXT).length >= 1);
assert.ok(unprovenHeadlineTerms("Chef de projet électrique", MASTER_TEXT).length >= 1);

/* ── Application déterministe du plan accepté ───────────────────────────── */

{
  const ctx = ctxFor(offers.mbda);
  const report = integrateAiResult({
    strategy: { focus: "Dimensionnement BT", primary_evidence_ids: ["prj_reseau_bt"] },
    changes: [{ section: "Expérience : EDD", original: "Analyse des écarts entre production prévue et production réelle.", rewritten: "Analyse des écarts entre production prévue et production réelle, avec des indicateurs de suivi.", why: "Analyse prévue/réel.", evidence_ids: ["edd_04"], method: "KEYWORD_INSERT" }],
  }, ctx);
  const { cv, applied } = applyPlanToCv(cvData, [{ op: "set_headline", zone: "Titre / disponibilité", after: "Stage de 6 mois · Génie électrique · à partir de début 2027" }, ...report.accepted]);
  assert.ok(applied.length >= 2, "les opérations acceptées sont appliquées");
  assert.equal(cv.basics.target, "Stage de 6 mois · Génie électrique · à partir de début 2027");
  assert.ok(cv.sections[0].items[0].detail.includes("indicateurs de suivi"), "la reformulation validée figure dans le CV");
  assert.ok(!cv.sections[0].items[0].detail.includes("Maintenance"), "aucun contenu interdit n'apparaît");
  assert.ok(cvWordCount(cv) > 0);

  const wrappedQuote = applyPlanToCv(cvData, [{
    op: "rephrase_fact", zone: "Expérience : EDD",
    before: "Analyse des écarts entre production prévue\net production réelle.",
    after: "Analyse des écarts entre production prévue et production réelle, en comparant les résultats.",
  }]);
  assert.ok(wrappedQuote.applied.includes("Expérience : EDD"), "les citations Gemini restent applicables après les retours à la ligne du parseur PDF");
  assert.ok(wrappedQuote.cv.sections[0].items[0].detail.includes("en comparant les résultats"));
}

console.log("Module recruteur validé sur 5 offres synthétiques : citations exigées, faits résolus, interdits bloqués, éligibilité fusionnée, plan applicable.");
