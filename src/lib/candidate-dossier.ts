/* ═══════════ Registre de preuves du candidat (pack CV maître, 17/10/2026) ═══════
   Source : src/data/dossier-candidat.json (DOSSIER_CANDIDAT_CIBLE.json du pack).
   RÈGLES :
   · Ce module est la SOURCE DE VÉRITÉ du candidat. Un CV généré ne le modifie
     jamais ; aucune adaptation n'ajoute un fait qui n'y figure pas.
   · Les statuts (evidenced / declared / coursework / mention_to_confirm /
     suggestion_only) sont des statuts DOCUMENTAIRES, pas des notes de niveau.
   · `future_learning_targets` = pistes d'apprentissage : JAMAIS déclarables.

   ⚠ SÉCURITÉ : ce fichier contient des données personnelles. Il ne doit être
   importé que par du code serveur (routes API, cv-engine, cv-recruiter) —
   jamais par un composant « use client ». Le test candidate-dossier.test.ts
   vérifie qu'aucun fichier client ne l'importe. */

import dossierJson from "@/data/dossier-candidat.json";

export type EvidenceStatus =
  | "cv_confirmed" | "historical_user_project" | "historical_coursework"
  | "evidenced" | "declared" | "coursework" | "mention_to_confirm" | "suggestion_only";

export type DossierFact = { fact_id: string; owner_id: string; text: string; verification: EvidenceStatus; source_refs: string[] };
export type DossierExperience = { id: string; employer: string; title: string; period: string; evidence_status: EvidenceStatus; facts: { id: string; text: string }[]; demonstrated_tools: string[]; skill_tags: string[]; forbidden_inferences: string[] };
export type DossierProject = { id: string; title: string; category: string; evidence_status: EvidenceStatus; description: string; facts: string[]; skill_tags: string[]; do_not_claim: string[] };
export type DossierSkill = { id: string; name: string; category: string; evidence_status: EvidenceStatus; evidence_ids: string[]; keywords: string[]; notes: string };
export type LearnableTarget = { id: string; label: string; priority: string; status: EvidenceStatus; domain: string[]; evidence_required: string };

type DossierShape = {
  schema_version: string; data_date: string;
  candidate: { name: string; headline: string; location: string; internship: { duration_months: number; start_earliest: string; wording: string } };
  experience: DossierExperience[];
  projects: DossierProject[];
  academic_knowledge: { id: string; name: string; domain: string; evidence_status: EvidenceStatus; level: string }[];
  skills: DossierSkill[];
  personal_qualities: { id: string; name: string; status: string; evidence: string[]; usage: string }[];
  claims_to_verify: { claim: string; reason: string; action: string }[];
  fact_registry: DossierFact[];
  career_objective: { principal: string; primary_domains: string[]; secondary_domains: string[]; avoid_as_primary: string[]; wording: string };
  future_learning_targets: LearnableTarget[];
};

export const DOSSIER = dossierJson as unknown as DossierShape;

/* ── Disponibilité verrouillée (demande explicite du candidat, 17/10/2026) ── */

export const AVAILABILITY_PERIOD = "à partir de début 2027";
export const AVAILABILITY_LINE = `Stage de 6 mois · ${AVAILABILITY_PERIOD}`;

/* ── Index des faits atomiques ────────────────────────────────────────────── */

const FACTS = new Map<string, DossierFact>(DOSSIER.fact_registry.map(fact => [fact.fact_id, fact]));
export const FACT_IDS: Set<string> = new Set(FACTS.keys());

/* Un ID cité par le modèle peut désigner un fait atomique, mais aussi un
   projet, une expérience ou une compétence du registre : on le RÉSOUT vers
   les faits atomiques correspondants (GUIDE §7). */
const OWNER_FACTS = new Map<string, string[]>();
for (const fact of DOSSIER.fact_registry) {
  OWNER_FACTS.set(fact.owner_id, [...(OWNER_FACTS.get(fact.owner_id) || []), fact.fact_id]);
}
const SKILLS_BY_ID = new Map<string, DossierSkill>(DOSSIER.skills.map(skill => [skill.id, skill]));

function resolveOne(id: string): string[] {
  if (FACTS.has(id)) return [id];
  const direct = OWNER_FACTS.get(id);
  if (direct?.length) return direct.slice(0, 5);
  const skill = SKILLS_BY_ID.get(id);
  if (skill) return [...new Set(skill.evidence_ids.flatMap(owner => OWNER_FACTS.get(owner) || []))].slice(0, 5);
  return [];
}

/** Résout les IDs cités par l'IA vers les faits atomiques. Une ID inconnue est rejetée. */
export function resolveFactIds(ids: unknown): { valid: string[]; unknown: string[] } {
  const valid: string[] = [], unknown: string[] = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!id) continue;
    if (id === "formation") { valid.push(id); continue; }
    const resolved = resolveOne(id);
    if (resolved.length) valid.push(...resolved);
    else unknown.push(id);
  }
  return { valid: [...new Set(valid)], unknown: [...new Set(unknown)] };
}

/** Texte des faits atomiques (preuve à fournir au modèle et à la validation). */
export function factText(ids: string[]): string {
  return ids.flatMap(id => { const fact = FACTS.get(id); return fact ? [fact.text] : []; }).join("\n");
}

/* ── Index compétences (nom + mots-clés) ──────────────────────────────────── */

const norm = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const tokens = (value: string): string[] => norm(value).match(/[a-z0-9+#]{3,}/g) || [];

export type DossierHit = { skill: DossierSkill; factIds: string[]; factText: string };

const SKILL_INDEX: { skill: DossierSkill; keys: string[] }[] = DOSSIER.skills.map(skill => ({
  skill,
  keys: [skill.name, ...skill.keywords].map(key => norm(key)).filter(Boolean),
}));

/** Compétences du dossier qui recoupent un terme d'offre (nom, mot-clé, tag). */
export function dossierEvidenceFor(term: string, limit = 2): DossierHit[] {
  const wanted = new Set(tokens(term));
  if (!wanted.size) return [];
  const hits: DossierHit[] = [];
  for (const { skill, keys } of SKILL_INDEX) {
    const matched = keys.some(key => key === norm(term) || tokens(key).some(token => wanted.has(token)));
    if (!matched) continue;
    const factIds = DOSSIER.fact_registry
      .filter(fact => skill.evidence_ids.includes(fact.owner_id) || fact.owner_id === skill.id)
      .map(fact => fact.fact_id)
      .slice(0, 3);
    hits.push({ skill, factIds, factText: factText(factIds) || skill.name });
    if (hits.length >= limit) break;
  }
  return hits;
}

/* ── Pistes d'apprentissage : JAMAIS déclarables ──────────────────────────── */

export const LEARNABLE_TARGETS: LearnableTarget[] = DOSSIER.future_learning_targets;

const LEARNABLE_PATTERNS: { target: LearnableTarget; pattern: RegExp }[] = [
  { target: LEARNABLE_TARGETS.find(t => t.id === "learn_pandapower")!, pattern: /\bpandapower\b/ },
  { target: LEARNABLE_TARGETS.find(t => t.id === "learn_ecodial")!, pattern: /\becodial\b/ },
  { target: LEARNABLE_TARGETS.find(t => t.id === "learn_power_query")!, pattern: /\bpower\s*query\b/ },
  { target: LEARNABLE_TARGETS.find(t => t.id === "learn_powerfactory")!, pattern: /\bpowerfactory\b|\bpower\s*factory\b|\bdigsilent\b/ },
  { target: LEARNABLE_TARGETS.find(t => t.id === "learn_pvsyst")!, pattern: /\bpvsyst\b/ },
  { target: LEARNABLE_TARGETS.find(t => t.id === "learn_iec60909")!, pattern: /\biec\s*60909\b/ },
  { target: LEARNABLE_TARGETS.find(t => t.id === "learn_scada")!, pattern: /\bscada\b/ },
];

/** Une exigence qui n'apparaît que comme cible d'apprentissage n'est jamais affirmable.
    Seuls les motifs DISTINCTIFS sont utilisés : un mot-clé générique (« Excel »)
    ne peut pas faire basculer une compétence réellement prouvée. */
export function learnableOnly(term: string): LearnableTarget | null {
  const wanted = norm(term);
  const hit = LEARNABLE_PATTERNS.find(({ pattern }) => pattern.test(wanted));
  return hit ? hit.target : null;
}

/* ── Affirmations interdites (claims_to_verify + do_not_claim + interdits) ── */

export type ForbiddenRule = { label: string; pattern: RegExp };

/** Couvre les 6 `claims_to_verify`, les `do_not_claim` des projets, les
    `forbidden_inferences` d'EDD et les compétences à acquérir. Toute phrase
    qui AFFIRME l'un de ces éléments sans trace dans le CV maître est rejetée. */
export const FORBIDDEN_CLAIMS: ForbiddenRule[] = [
  { label: "ETAP (non démontré)", pattern: /\betap\b/ },
  { label: "PSAF (non démontré)", pattern: /\bpsaf\b/ },
  { label: "COSMOS (non démontré)", pattern: /\bcosmos\b/ },
  { label: "SCADA (cible d'apprentissage)", pattern: /\bscada\b/ },
  { label: "Revit (non démontré)", pattern: /\brevit\b/ },
  { label: "DIALux (non démontré)", pattern: /\bdialux\b/ },
  { label: "NetworkX (non démontré)", pattern: /\bnetworkx\b/ },
  { label: "PyTorch (non démontré)", pattern: /\bpytorch\b/ },
  { label: "Scikit-learn (non démontré)", pattern: /\bscikit[\s-]?learn\b/ },
  { label: "Java (non démontré)", pattern: /\bjava\b/ },
  { label: "VHDL/FPGA (à confirmer)", pattern: /\bvhdl\b|\bfpga\b/ },
  { label: "DIgSILENT / PowerFactory (cible d'apprentissage)", pattern: /\bdigsilent\b|\bpower\s*factory\b|\bpowerfactory\b/ },
  { label: "PSS/E (non démontré)", pattern: /\bpss\s*\/?\s*e\b/ },
  { label: "PVsyst (cible d'apprentissage)", pattern: /\bpvsyst\b/ },
  { label: "pandapower (cible d'apprentissage)", pattern: /\bpandapower\b/ },
  { label: "Ecodial (cible d'apprentissage)", pattern: /\becodial\b/ },
  { label: "Power Query (cible d'apprentissage)", pattern: /\bpower\s*query\b/ },
  { label: "IEC 60909 (cible d'apprentissage)", pattern: /\biec\s*60909\b/ },
  { label: "HSE (expérience absente)", pattern: /\bhse\b|\baudit de securite\b/ },
  { label: "maintenance (expérience absente)", pattern: /\bmaintenance\b/ },
  { label: "chantier (expérience absente)", pattern: /\bchantiers?\b/ },
  { label: "BESS (gestion non démontrée)", pattern: /\bbess\b|\bbattery energy storage\b/ },
  { label: "micro-réseau (niveau d'achèvement incertain)", pattern: /\bmicro[\s-]?reseau\b|\bmini[\s-]?grid\b/ },
  { label: "grid-forming / GFM (non démontré)", pattern: /\bgrid[\s-]?forming\b|\bgfm\b/ },
  { label: "black-start (non démontré)", pattern: /\bblack[\s-]?start\b/ },
  { label: "RMS/EMT (non démontré)", pattern: /\brms\b|\bemt\b/ },
  { label: "MPPT (non validé industriellement)", pattern: /\bmppt\b/ },
  { label: "EMS (non démontré)", pattern: /\bems\b/ },
  { label: "GMAO (non démontré)", pattern: /\bgmao\b/ },
  { label: "responsabilité d'équipe (jamais revendiquée)", pattern: /\b(pilote[rt]?|encadre[rt]?|coordonn[ée]|manager|chef de projet)\b/ },
  { label: "prestation de chantier (jamais revendiquée)", pattern: /\b(intervention[\s-]de[\s-]terrain|mise en service sur site)\b/ },
  { label: "optimisation chiffrée sans source", pattern: /\b(economies?|reduction|gain)[^.;]{0,40}chiffr/ },
];

const normalize = (value: string) => norm(value).replace(/\s+/g, " ");

/** Phrases interdites réellement présentes dans `proposed` mais absentes de `master`. */
export function findForbiddenClaims(proposed: string, master: string): string[] {
  const after = normalize(proposed);
  const source = normalize(master);
  return FORBIDDEN_CLAIMS
    .filter(({ pattern }) => pattern.test(after) && !pattern.test(source))
    .map(({ label }) => label);
}

/* ── Catalogue catégorisé (technique / académique / logiciels / prog / qualités) ── */

export type SkillCatalogue = {
  technique: DossierSkill[];
  logiciels: DossierSkill[];
  programmation: DossierSkill[];
  academique: { name: string; domain: string; level: string }[];
  qualites: { name: string; status: string }[];
  apprentissage: LearnableTarget[];
};

const SOFTWARE_CATEGORIES = new Set(["simulation_cad", "embedded"]);

export function dossierSkillCatalogue(): SkillCatalogue {
  return {
    technique: DOSSIER.skills.filter(skill => !SOFTWARE_CATEGORIES.has(skill.category) && skill.category !== "programming"),
    logiciels: DOSSIER.skills.filter(skill => SOFTWARE_CATEGORIES.has(skill.category)),
    programmation: DOSSIER.skills.filter(skill => skill.category === "programming"),
    academique: DOSSIER.academic_knowledge.map(row => ({ name: row.name, domain: row.domain, level: row.level })),
    qualites: DOSSIER.personal_qualities.map(row => ({ name: row.name, status: row.status })),
    apprentissage: LEARNABLE_TARGETS,
  };
}

const STATUS_LABEL: Record<string, string> = {
  cv_confirmed: "confirmé dans le CV maître", historical_user_project: "projet personnel (preuve à joindre)",
  historical_coursework: "travaux de cours/TP (preuve à joindre)", evidenced: "exercice ou projet identifié",
  declared: "déclaré au CV (sans livrable rattaché)", coursework: "matière étudiée (enseignement)",
  mention_to_confirm: "mention faible — À CONFIRMER, jamais présentée comme maîtrisée",
  suggestion_only: "piste d'apprentissage — JAMAIS déclarable",
};
const statusLabel = (status: EvidenceStatus) => STATUS_LABEL[status] ?? status;

/* ── Extract compact envoyé au modèle recruteur ───────────────────────────── */

/** Profil de preuves destiné au prompt « adapt » — pas le CV brut : le registre
    structuré avec statuts, faits atomiques et interdits. */
export function dossierExtract(): string {
  const catalogue = dossierSkillCatalogue();
  const line = (skill: DossierSkill) => `· ${skill.name} [${statusLabel(skill.evidence_status)}]${skill.notes ? ` — ${skill.notes}` : ""}`;
  return [
    `DOSSIER CANDIDAT — source de vérité (jamais modifié par un CV généré). Candidat : ${DOSSIER.candidate.name}, ${DOSSIER.candidate.headline}, ${DOSSIER.candidate.location}.`,
    `DISPONIBILITÉ VERROUILLÉE : ${AVAILABILITY_LINE}. Interdit d'écrire « dès », « PFE », « fin d'études » ou toute autre date.`,
    "",
    "EXPÉRIENCE (faits confirmés au CV) :",
    ...DOSSIER.experience.map(exp => [`— ${exp.employer} — ${exp.title} (${exp.period})`, ...exp.facts.map(f => `   • ${f.text} [${f.id}]`),
      `   Interdits : ${exp.forbidden_inferences.join(" ; ")}`].join("\n")),
    "",
    "PROJETS (faits et limites) :",
    ...DOSSIER.projects.map(project => [`— ${project.id} · ${project.title} [${statusLabel(project.evidence_status)}] : ${project.description}`,
      ...project.facts.slice(0, 5).map(fact => `   • ${fact}`),
      `   Ne pas affirmer : ${project.do_not_claim.join(" ; ")}`].join("\n")),
    "",
    "COMPÉTENCES ÉLECTRICITÉ / ÉNERGIE / DONNÉES :",
    ...catalogue.technique.map(line),
    "",
    "LOGICIELS & SIMULATION :",
    ...catalogue.logiciels.map(line),
    "",
    "PROGRAMMATION :",
    ...catalogue.programmation.map(line),
    "",
    "CONNAISSANCES ACADÉMIQUES (matières enseignées — jamais « maîtrisé ») :",
    ...catalogue.academique.map(row => `· ${row.name} (${row.domain})`),
    "",
    "QUALITÉS PERSONNELLES (déclarées — à étayer, jamais surventées) :",
    ...DOSSIER.personal_qualities.map(row => `· ${row.name} [${row.status}] : ${row.usage}`),
    "",
    "AFFIRMATIONS ABSOLUMENT INTERDITES (non démontrées) :",
    ...DOSSIER.claims_to_verify.map(claim => `· ${claim.claim} — ${claim.reason}`),
    "",
    "À ACQUÉRIR — pistes d'apprentissage, JAMAIS présentées comme acquises :",
    ...LEARNABLE_TARGETS.map(target => `· ${target.label} (preuve requise : ${target.evidence_required})`),
    "",
    `OBJECTIF CARRIÈRE : ${DOSSIER.career_objective.principal}. Domaines prioritaires : ${DOssierDomains()}.`,
  ].join("\n");
}

function DOssierDomains(): string {
  return `${DOSSIER.career_objective.primary_domains.join(", ")} ; secondaires : ${DOSSIER.career_objective.secondary_domains.join(", ")}`;
}

/* ── Extraction des interdits de chaque projet (utilisé par les tests) ────── */

export const PROJECT_DO_NOT_CLAIM: { id: string; terms: string[] }[] =
  DOSSIER.projects.map(project => ({ id: project.id, terms: project.do_not_claim }));

export const EDD_FORBIDDEN_INFERENCES: string[] = DOSSIER.experience.flatMap(exp => exp.forbidden_inferences);
