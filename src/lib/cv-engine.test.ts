/* Jalon C — moteur CV fondé sur preuves (METHODE_CV_ORIGINALE + 02_CV A–F).
   Fixtures « test synthétique » : CV maître d'élève-ingénieur génie électrique
   + 4 offres métier représentatives (MBDA, WSP, TotalEnergies, Mews Labs).
   Critère ultime : les 4 offres produisent des choix de preuves DIFFÉRENTS,
   aucun ajout de compétence non prouvée, et un cas « sans modification ». */

import assert from "node:assert/strict";
import type { CvData } from "./cv";
import type { SkillEvidence, UserData } from "./data";
import {
  analyzeAndPlan,
  analyzeOfferForCandidate,
  diffCvVersions,
  isNoChangeCase,
  linkRequirement,
  stageHeadline,
  validatePlanOperation,
  type OfferAnalysis,
} from "./cv-engine";
import type { PFERequirement } from "./pfe-matching";

/* ── CV maître synthétique (source unique de vérité, aucune démo) ───────── */

const MASTER_TEXT = [
  "Lina Marchand — élève-ingénieur en génie électrique (3e année), recherche un stage de 6 mois à partir de février 2027.",
  "Expérience : Projet personnel Mini-réseau BT — conception et simulation d'un réseau basse tension, protections contre les courts-circuits, chutes de tension et sélectivité des disjoncteurs. Outils : ETAP, AutoCAD Electrical.",
  "Formation : Diplôme d'ingénieur en génie électrique (en cours) ; Licence professionnelle Énergies renouvelables.",
  "Compétences : AutoCAD Electrical, ETAP, MATLAB, dimensionnement de câbles.",
  "Langues : Français (natif), Anglais (TOEIC 850).",
].join("\n");

const evidence = (
  term: string,
  status: SkillEvidence["status"],
  skills: string[],
  description: string,
  source: string
): SkillEvidence => ({
  term,
  status,
  skills,
  description,
  source,
  evidence: description,
  autonomy: "independent",
  updatedAt: "2026-10-01T00:00:00.000Z",
});

const SKILL_EVIDENCE: SkillEvidence[] = [
  evidence("réseau basse tension", "demonstrated", ["basse tension", "réseaux électriques", "protections", "sélectivité", "dimensionnement"],
    "Mini-réseau BT : protections courts-circuits, chutes de tension, sélectivité des disjoncteurs", "Projet personnel 2025"),
  evidence("AutoCAD Electrical", "demonstrated", ["AutoCAD", "schémas électriques"],
    "Schémas unifilaires du mini-réseau BT réalisés sous AutoCAD Electrical", "Projet personnel 2025"),
  evidence("ETAP", "demonstrated", ["simulation", "calculs de défauts"],
    "Simulation de défauts et chutes de tension sous ETAP", "Projet personnel 2025"),
  evidence("dimensionnement", "demonstrated", ["dimensionnement", "câbles"],
    "Dimensionnement des câbles DC/AC de l'installation photovoltaïque du semestre", "Projet de fin de semestre"),
  evidence("photovoltaïque", "demonstrated", ["photovoltaïque", "énergies renouvelables"],
    "Dimensionnement d'une installation photovoltaïque raccordée, production annuelle calculée", "Projet de fin de semestre"),
  evidence("réseaux de distribution", "demonstrated", ["CFO", "CFA", "réseaux de distribution"],
    "Étude de raccordement BT/MT d'un parc photovoltaïque : protections et câbles CFO", "Projet de fin de semestre"),
  evidence("MATLAB", "demonstrated", ["simulation"],
    "Modélisation MATLAB de la production annuelle du parc PV", "Projet de fin de semestre"),
  evidence("stockage d'énergie", "declared", ["stockage d'énergie", "batteries"],
    "Cours et TD sur le stockage d'énergie — aucun projet réalisé", "Cours L3"),
  evidence("python", "declared", ["programmation"],
    "Bases de Python vues en cours, automatisations simples personnelles", "Cours + usage personnel"),
  evidence("mathématiques appliquées", "studied", ["mathématiques", "statistiques"],
    "Licence pro : modules mathématiques appliquées et statistiques", "Relevé de notes"),
  evidence("anglais", "declared", ["anglais"],
    "Anglais technique : TOEIC 850", "TOEIC 2025"),
  evidence("maintenance industrielle", "missing", [], "", ""),
];

const profile: UserData["profile"] = {
  firstName: "Lina",
  lastName: "Marchand",
  title: "Élève-ingénieur en génie électrique",
  email: "lina.marchand@example.invalid",
  phone: "06 00 00 00 00",
  city: "Lyon",
  skills: ["AutoCAD Electrical", "ETAP", "MATLAB"],
  experiences: [
    { title: "Projet personnel Mini-réseau BT", place: "ENI", period: "2025", detail: "Conception et simulation d'un réseau basse tension" },
  ],
  educations: [{ degree: "Diplôme d'ingénieur en génie électrique", school: "ENI", period: "2024–2027" }],
  skillEvidence: SKILL_EVIDENCE,
};

const cvData: CvData = {
  basics: { name: "Lina Marchand", headline: "ÉLÈVE-INGÉNIEUR | GÉNIE ÉLECTRIQUE", contact: "lina.marchand@example.invalid · Lyon", target: "Stage de 6 mois · à partir de février 2027" },
  summary: "Élève-ingénieur en génie électrique, je cherche un stage de 6 mois à partir de février 2027.",
  sections: [
    { key: "exp", title: "Expériences", kind: "list", text: "", items: [{ id: "e1", title: "Projet personnel Mini-réseau BT", meta: "2025", detail: "Conception et simulation d'un réseau basse tension, protections et sélectivité." }] },
    { key: "proj", title: "Projets", kind: "list", text: "", items: [{ id: "p1", title: "Installation photovoltaïque raccordée", meta: "2024", detail: "Dimensionnement des câbles DC/AC et calcul de production annuelle (MATLAB)." }] },
    { key: "form", title: "Formation", kind: "list", text: "", items: [{ id: "f1", title: "Diplôme d'ingénieur en génie électrique", meta: "2024–2027", detail: "ENI" }] },
    { key: "comp", title: "Compétences", kind: "text", text: "AutoCAD Electrical\nETAP\nMATLAB", items: [] },
    { key: "loisirs", title: "Centres d'intérêt", kind: "text", text: "Vélo, photographie.", items: [] },
  ],
};

const baseData: UserData = {
  profile,
  originalCv: { name: "CV maître", text: MASTER_TEXT },
  cvData,
  cvs: [],
  applications: [],
  letters: [],
  offers: [],
  recruiters: [],
  autopilot: false,
} as UserData;

/* ── 4 offres métier SYNTHÉTIQUES (marquées « test synthétique ») ───────── */

type FixtureOffer = { id: string; company: string } & Record<string, unknown>;

const OFFERS: Record<string, FixtureOffer> = {
  /* MBDA — architecture électrique industrielle. */
  mbda: {
    id: "test-synth-mbda", company: "MBDA (test synthétique)",
    title: "Stage ingénieur architecture électrique industrielle",
    contract: "Stage", duration: "6 mois", startDate: "2027-02", location: "Lyon, France", deadline: "2027-01-15",
    description: "Vous concevrez l'architecture électrique des bâtiments de production : réseaux basse tension, protections et schémas.",
    text: "Stage ingénieur bac+5. Architecture électrique industrielle : réseaux basse tension, protections, schémas électriques, CANECO BT. Maintenance industrielle des installations.",
    missions: ["Concevoir l'architecture électrique des bâtiments de production", "Rédiger les schémas électriques des réseaux basse tension"],
    prerequisites: ["Formation ingénieur bac+5 en génie électrique", "Maîtrise d'ETAP et AutoCAD Electrical obligatoire", "Expérience en maintenance industrielle exigée"],
    skills: ["basse tension", "protections", "CANECO BT", "maintenance industrielle"],
  },
  /* WSP — CFO/CFA. */
  wsp: {
    id: "test-synth-wsp", company: "WSP (test synthétique)",
    title: "Stage ingénieur réseaux de distribution CFO/CFA",
    contract: "Stage", duration: "6 mois", startDate: "2027-02", location: "Lyon, France", deadline: "2027-01-31",
    description: "Dimensionnement de réseaux de distribution moyenne et basse tension (CFO/CFA) pour des clients industriels.",
    text: "Stage ingénieur bac+5. Dimensionnement de câbles CFO et CFA, réseaux de distribution, schémas d'exécution sous AutoCAD. Revit serait un atout. Gestion de projet client.",
    missions: ["Dimensionner les câbles CFO et CFA des réseaux de distribution", "Éditer les schémas d'exécution"],
    prerequisites: ["Formation ingénieur bac+5 en génie électrique", "Connaissance du dimensionnement de réseaux exigée"],
    skills: ["CFO", "CFA", "réseaux de distribution", "dimensionnement"],
  },
  /* TotalEnergies — BESS et parc éolien. */
  total: {
    id: "test-synth-total", company: "TotalEnergies (test synthétique)",
    title: "Stage ingénieur systèmes de stockage d'énergie et parc éolien",
    contract: "Stage", duration: "6 mois", startDate: "2027-02", location: "Lyon, France", deadline: "2027-02-28",
    description: "Étude de l'intégration de systèmes de stockage d'énergie (batteries) à un parc éolien : simulation et bilans.",
    text: "Stage ingénieur bac+5. Systèmes de stockage d'énergie et batteries, éolien, simulation de scénarios sous MATLAB, Python pour le traitement des données. Gestion de projet.",
    missions: ["Modéliser le dimensionnement du stockage d'énergie", "Simuler les scénarios de production éolienne"],
    prerequisites: ["Formation ingénieur bac+5 en énergie", "Bases en simulation MATLAB et Python"],
    skills: ["stockage d'énergie", "batteries", "éolien", "simulation"],
  },
  /* Mews Labs — criticité des réseaux. */
  mews: {
    id: "test-synth-mews", company: "Mews Labs (test synthétique)",
    title: "Stage analyste criticité des réseaux électriques",
    contract: "Stage", duration: "6 mois", startDate: "2027-02", location: "Lyon, France", deadline: "2027-03-31",
    description: "Analyse de criticité des réseaux électriques : modélisation des pannes et calculs de probabilités.",
    text: "Stage ingénieur bac+5. Analyse de criticité des réseaux électriques, mathématiques et probabilités, Python pour la modélisation. PyTorch et NetworkX appréciés.",
    missions: ["Modéliser les pannes et their probabilités", "Développer les scripts d'analyse"],
    prerequisites: ["Formation ingénieur bac+5", "Bases solides en mathématiques et probabilités"],
    skills: ["réseaux électriques", "Python", "mathématiques", "PyTorch", "NetworkX"],
  },
  /* SNCF — offre où le CV est déjà pertinent : cas SANS MODIFICATION. */
  sncf: {
    id: "test-synth-sncf", company: "SNCF (test synthétique)",
    title: "Stage ingénieur études réseaux basse tension",
    contract: "Stage", duration: "6 mois", startDate: "2027-02", location: "Lyon, France", deadline: "2027-01-10",
    description: "Études et simulation de réseaux basse tension des installations : protections et schémas.",
    text: "Stage ingénieur bac+5 en génie électrique. Études de réseaux basse tension, protections contre les courts-circuits, simulation sous ETAP, schémas électriques AutoCAD.",
    missions: ["Réaliser les études de réseaux basse tension", "Simuler les protections"],
    prerequisites: ["Formation ingénieur bac+5 en génie électrique", "Maîtrise d'ETAP et AutoCAD Electrical obligatoire"],
    skills: ["basse tension", "protections", "ETAP", "AutoCAD"],
  },
};

const offer = (key: string) => OFFERS[key] as unknown as Parameters<typeof analyzeOfferForCandidate>[0];
const evidenceKeySet = (analysis: OfferAnalysis) =>
  [...new Set(analysis.requirements.flatMap(row => row.evidenceIds))].sort().join("|");
const requirement = (analysis: OfferAnalysis, term: string) => {
  const row = analysis.requirements.find(candidate => candidate.term === term);
  assert.ok(row, `exigence « ${term} » présente dans l'analyse`);
  return row;
};

/* ── Module B : étiquettes DIRECTE / TRANSFÉRABLE / PARTIELLE / NON_DÉMONTRÉE ─ */

{
  const req = (term: string): PFERequirement => ({ term, priority: "obligatoire", source: term, match: "non documentée", evidenceIds: [] });
  assert.equal(linkRequirement(req("basse tension"), profile).link, "DIRECTE", "terme exact démontré → DIRECTE");
  assert.equal(linkRequirement(req("dimensionnement de câbles CFO"), profile).link, "TRANSFÉRABLE", "token commun → TRANSFÉRABLE");
  assert.equal(linkRequirement(req("stockage d'énergie"), profile).link, "PARTIELLE", "preuve déclarée → PARTIELLE");
  assert.equal(linkRequirement(req("Revit"), profile).link, "NON_DÉMONTRÉE", "aucune preuve → NON_DÉMONTRÉE");
  const partial = linkRequirement(req("stockage d'énergie"), profile).evidence[0];
  assert.equal(partial.status, "declared", "la preuve partielle reste « déclarée » (jamais promue démontrée)");
}

/* ── Titre de disponibilité verrouillé ───────────────────────────────────── */
assert.equal(stageHeadline(), "Stage de 6 mois · à partir de février 2027");
assert.equal(stageHeadline("Génie électrique"), "Stage de 6 mois · Génie électrique · à partir de février 2027");

/* ── Analyse des 4 offres métier + cas sans-modification ─────────────────── */

const results = Object.fromEntries(
  Object.keys(OFFERS).map(key => {
    const { analysis, strategy, plan } = analyzeAndPlan(offer(key), baseData);
    return [key, { analysis, strategy, plan }];
  })
) as Record<string, ReturnType<typeof analyzeAndPlan>>;

/* 1 — Critère ultime : choix de preuves DIFFÉRENTS pour chaque offre. */
const selections = Object.fromEntries(Object.entries(results).map(([key, value]) => [key, evidenceKeySet(value.analysis)]));
const uniqueSelections = new Set(Object.values(selections));
assert.equal(uniqueSelections.size, Object.keys(OFFERS).length,
  `choix de preuves distincts par offre (obtenu ${uniqueSelections.size}/${Object.keys(OFFERS).length})`);

/* 2 — MBDA : réseaux BT privilégié si prouvé ; maintenance JAMAIS inventée. */
{
  const { analysis, strategy, plan } = results.mbda;
  assert.equal(requirement(analysis, "basse tension").link, "DIRECTE", "MBDA : réseau BT démontré → DIRECTE");
  assert.equal(requirement(analysis, "maintenance industrielle").link, "NON_DÉMONTRÉE", "MBDA : maintenance non démontrée");
  assert.equal(requirement(analysis, "maintenance industrielle").guidance, "à confirmer", "MBDA : maintenance = « à confirmer »");
  assert.ok(strategy.gaps.some(gap => gap.startsWith("maintenance industrielle")), "MBDA : lacune honnête listée");
  assert.ok(!JSON.stringify(plan.operations).includes("maintenance industrielle"), "MBDA : aucune opération n'ajoute la maintenance");
  assert.equal(requirement(analysis, "CANECO BT").link, "NON_DÉMONTRÉE", "MBDA : CANECO BT cité mais non prouvé");
}

/* 3 — WSP : Revit NON inféré d'AutoCAD ; CFO couvert par preuve transférable. */
{
  const { analysis, plan } = results.wsp;
  assert.equal(requirement(analysis, "Revit").link, "NON_DÉMONTRÉE", "WSP : Revit n'est jamais inféré d'AutoCAD");
  assert.ok(!JSON.stringify(plan.operations).includes("Revit"), "WSP : aucune opération ne mentionne Revit");
  assert.equal(requirement(analysis, "CFO").link, "DIRECTE", "WSP : CFO couvert par l'étude de raccordement");
  const inferred = analysis.requirements.find(row => row.term === "dimensionnement de réseaux de distribution");
  assert.equal(inferred?.origin, "inférence", "WSP : besoin déduit marqué « inférence »");
  assert.equal(requirement(analysis, "gestion de projet").origin, "citation", "WSP : besoin cité marqué « citation »");
}

/* 4 — TotalEnergies : crédible sur énergie et stockage, sans survente. */
{
  const { analysis } = results.total;
  assert.equal(requirement(analysis, "stockage d'énergie").link, "PARTIELLE", "TotalEnergies : stockage au niveau cours → PARTIELLE");
  assert.equal(requirement(analysis, "stockage d'énergie").guidance, "à confirmer", "TotalEnergies : stockage à confirmer, pas affirmé");
  assert.equal(requirement(analysis, "simulation").link, "DIRECTE", "TotalEnergies : simulation MATLAB démontrée");
  assert.equal(requirement(analysis, "éolien").link, "NON_DÉMONTRÉE", "TotalEnergies : éolien non démontré");
  const stockProof = requirement(analysis, "stockage d'énergie").evidence[0];
  assert.ok(stockProof && stockProof.status === "declared", "TotalEnergies : preuve de stockage = niveau déclaré/cours");
}

/* 5 — Mews Labs : PyTorch et NetworkX JAMAIS validés. */
{
  const { analysis, plan } = results.mews;
  assert.equal(requirement(analysis, "PyTorch").link, "NON_DÉMONTRÉE", "Mews : PyTorch non validé");
  assert.equal(requirement(analysis, "NetworkX").link, "NON_DÉMONTRÉE", "Mews : NetworkX non validé");
  assert.ok(!JSON.stringify(plan.operations).includes("PyTorch"), "Mews : aucune opération n'insère PyTorch");
  assert.ok(!JSON.stringify(plan.operations).includes("NetworkX"), "Mews : aucune opération n'insère NetworkX");
  assert.equal(requirement(analysis, "mathématiques").link, "PARTIELLE", "Mews : mathématiques = preuve étudiée (PARTIELLE)");
  assert.ok(results.mews.analysis.relevance.domains.length > 0, "Mews : domaine technique identifié");
}

/* 6 — Analyse : 5 besoins max, citation vs inférence, catégories. */
for (const [key, value] of Object.entries(results)) {
  assert.ok(value.analysis.topNeeds.length > 0 && value.analysis.topNeeds.length <= 5,
    `${key} : 1 à 5 besoins principaux (obtenu ${value.analysis.topNeeds.length})`);
  assert.ok(value.analysis.conditions.length > 0, `${key} : conditions extraites`);
  for (const row of value.analysis.requirements) {
    assert.ok(row.origin === "citation" || row.origin === "inférence", `${key} : origine tracée`);
    if (row.origin === "citation") assert.ok(row.quote && row.quote.length > 0, `${key} : citation vérifiable`);
    assert.ok(["DIRECTE", "TRANSFÉRABLE", "PARTIELLE", "NON_DÉMONTRÉE"].includes(row.link), `${key} : étiquette B`);
  }
}

/* 7 — Cas « sans modification » (03_TESTS C.7) : SNCF, CV déjà pertinent. */
{
  const { analysis, plan } = results.sncf;
  assert.equal(isNoChangeCase(analysis), true, "SNCF : tous les obligatoires sont couverts → sans modification");
  assert.equal(plan.noChange, true, "plan.noChange posé");
  assert.equal(plan.operations.length, 1, "SNCF : une seule opération");
  assert.equal(plan.operations[0].op, "keep", "SNCF : opération « keep »");
  assert.equal(plan.operations[0].decision, "accepted", "SNCF : conservé tel quel");
}

/* 8 — Titre de disponibilité conforme généré dans le plan MBDA. */
{
  const headlineOp = results.mbda.plan.operations.find(op => op.op === "set_headline");
  assert.ok(headlineOp, "MBDA : opération set_headline présente");
  assert.equal(headlineOp.after, "Stage de 6 mois · Génie électrique · à partir de février 2027",
    "titre conforme à la disponibilité du candidat");
  assert.ok(results.mbda.strategy.flagship, "MBDA : principale réalisation repérée");
  assert.deepEqual(results.mbda.strategy.reorderSections, [], "MBDA : réalisation déjà en tête de rubrique — rien à remonter");
}

/* ── Module E : vérification anti-invention des opérations ───────────────── */

{
  const { analysis } = results.mbda;
  const before = "AutoCAD Electrical\nETAP";
  const reorderOk = {
    id: "op1", op: "reorder_skills" as const, zone: "Compétences", sourceFactIds: [],
    before, after: "ETAP\nAutoCAD Electrical", justification: "test", proofType: "TRANSFÉRABLE" as const, a4Impact: "nul" as const, decision: "pending" as const,
  };
  assert.deepEqual(validatePlanOperation(reorderOk, MASTER_TEXT, analysis, cvData), [], "réordonnement sûr accepté");
  assert.ok(validatePlanOperation({ ...reorderOk, after: `${before}\nRevit` }, MASTER_TEXT, analysis, cvData).length > 0,
    "réordonnement avec ligne inédite REJETÉ");
  assert.ok(validatePlanOperation({ ...reorderOk, op: "set_headline", after: "Dès février 2027" }, MASTER_TEXT, analysis, cvData).length > 0,
    "titre non conforme REJETÉ");
  assert.ok(validatePlanOperation({ ...reorderOk, op: "set_headline", after: "Stage de 6 mois · Astronautique · à partir de février 2027" }, MASTER_TEXT, analysis, cvData).length > 0,
    "spécialité hors CV et hors offre REJETÉE");
  assert.ok(validatePlanOperation({ ...reorderOk, op: "omit_optional_fact", zone: "Expériences" }, MASTER_TEXT, analysis, cvData).length > 0,
    "suppression d'une rubrique porteuse de faits REJETÉE");
  assert.deepEqual(validatePlanOperation({ ...reorderOk, op: "omit_optional_fact", zone: "Centres d'intérêt" }, MASTER_TEXT, analysis, cvData), [],
    "suppression d'une rubrique facultative acceptée");
  const rewrite = {
    id: "op2", op: "rephrase_fact" as const, zone: "Expériences", sourceFactIds: [],
    before: "Conception et simulation d'un réseau basse tension",
    after: "J'ai piloté la maintenance de 40 sites nucléaires",
    justification: "test", proofType: "DIRECTE" as const, a4Impact: "nul" as const, decision: "pending" as const,
  };
  assert.ok(validatePlanOperation(rewrite, MASTER_TEXT, analysis, cvData).length > 0,
    "réécriture inventant une expérience REJETÉE");
}

/* ── Module F : diff avant / après exact ─────────────────────────────────── */

{
  const diff = diffCvVersions("Profil A\nCompétences X\nContact", "Profil A\nCompétences X Y\nContact");
  assert.equal(diff.added, 1, "1 ligne ajoutée");
  assert.equal(diff.removed, 1, "1 ligne retirée");
  assert.equal(diff.lines.filter(line => line.kind === "kept").length, 2, "2 lignes conservées");
  assert.ok(diff.wordDelta > 0, "delta de mots positif");
}

console.log(
  "\nJalon C — moteur CV fondé sur preuves validé :\n" +
  "· 4 offres métier → 4 choix de preuves DIFFÉRENTS (MBDA/WSP/TotalEnergies/Mews Labs)\n" +
  "· DIRECTE / TRANSFÉRABLE / PARTIELLE / NON_DÉMONTRÉE avec IDs de preuves\n" +
  "· citation vs inférence tracées, 5 besoins max, catégories d'analyse\n" +
  "· aucun ajout de compétence non prouvée (maintenance, Revit, PyTorch, NetworkX)\n" +
  "· cas « sans modification » validé · vérification anti-invention · diff exact"
);
