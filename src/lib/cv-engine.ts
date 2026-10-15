/* ═══════════ Chantier 3 — moteur d'adaptation CV fondé sur preuves ═══════════
   Parties déterministes des modules A–F de 02_CV_MOTEUR_EXPERT.md, fidèles à
   METHODE_CV_ORIGINALE.md. Gemini n'intervient QUE pour la rédaction contrôlée
   (voir /api/cv/adapt) ; tout ce qui suit est du code sans appel IA.

   A · Analyse de l'annonce : 6 catégories, 5 besoins principaux, citation
       de la fiche distinguée de l'inférence technique.
   B · Matrice exigence → preuve : DIRECTE / TRANSFÉRABLE / PARTIELLE /
       NON_DÉMONTRÉE, avec IDs de preuves du parcours vérifié.
   C · Stratégie : 3 compétences utiles, réalisation à remonter, rubriques à
       conserver, lacunes honnêtes, test du recruteur (20 secondes).
   D · Plan : opérations limitées et justifiées (whitelist), impact A4 estimé.
   E · Vérification : chaque opération est validée indépendamment ; aucune
       compétence non prouvée n'est insérée.
   F · Diff avant/après exact du contenu.
   + Décision « conserver le CV sans modification » quand il est déjà pertinent. */

import type { DetectedOffer, Profile, UserData } from "./data";
import type { CvData } from "./cv";
import { analyzePfeOffer, type PfeAnalysis, type PFERequirement } from "./pfe-matching";
import { cvMasterText, sectionCanBeOmitted, validateCvChange, type CvChange } from "./cv-adaptation";
import { hasCvTerm } from "./cv-keywords";

/* ── Titre de disponibilité verrouillé (conditions personnelles) ────────── */

export const AVAILABILITY = "à partir de février 2027";

/** Titre unique de disponibilité — « dès », « PFE », « fin d'études » interdits. */
export function stageHeadline(specialty?: string): string {
  const clean = specialty?.trim();
  return clean ? `Stage de 6 mois · ${clean} · ${AVAILABILITY}` : `Stage de 6 mois · ${AVAILABILITY}`;
}

/* ── B · Matrice exigence → preuve ──────────────────────────────────────── */

export type ProofLink = "DIRECTE" | "TRANSFÉRABLE" | "PARTIELLE" | "NON_DÉMONTRÉE";

export type ProofRef = {
  id: string;
  term: string;
  kind: string;
  status: string;
  /** Extrait de preuve (parcours vérifié) — jamais le vocabulaire de l'offre. */
  excerpt: string;
};

export type RequirementRow = {
  term: string;
  priority: PFERequirement["priority"];
  /** Citation vérifiable de la fiche vs déduction technique assumée. */
  origin: "citation" | "inférence";
  /** Extrait de la fiche attestant le besoin (lorsque citation). */
  quote?: string;
  link: ProofLink;
  evidenceIds: string[];
  evidence: ProofRef[];
  /** NON_DÉMONTRÉE → « à confirmer », jamais ajoutée au CV. */
  guidance: "peut être affirmée" | "à confirmer";
};

const norm = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const STOP = new Set(["stage", "alternance", "h/f", "ingenieur", "etude", "etudes", "entreprise", "poste", "equipe", "projet", "experience", "connaissance", "maitrise", "notion", "ans", "mois", "societe", "maitrise", "bonne", "bon", "niveau"]);
const contentTokens = (value: string): string[] =>
  (norm(value).match(/[a-z0-9+#]{3,}/g) || []).filter(token => !STOP.has(token));

/** Inférences techniques assumées : jamais présentées comme des citations. */
const INFERENCE_RULES: [RegExp, string][] = [
  [/selectivite|coordinat|protection/i, "sélectivité des protections"],
  [/\bcfo\b|\bcfa\b|moyenne tension|distribution/i, "dimensionnement de réseaux de distribution"],
  [/bess|stockage|eolien|photovolta/i, "intégration de systèmes de production et de stockage"],
  [/scada|automatisme|controle industriel/i, "supervision et asservissement"],
];

function sharedTokens(haystack: string, needle: string): string[] {
  const known = new Set(contentTokens(haystack));
  return contentTokens(needle).filter(token => known.has(token));
}

/** Module B : étiquete chaque besoin selon la preuve réelle du parcours. */
export function linkRequirement(
  requirement: PFERequirement,
  profile: Profile,
  formationTexts: string[] = []
): { link: ProofLink; evidence: ProofRef[] } {
  const evidence = (profile.skillEvidence || []).map((item, index) => ({
    item,
    id: item.id || `proof:${index}:${norm(item.term)}`,
  }));
  const usable = evidence.filter(({ item }) => item.status !== "missing" && !!item.source?.trim() && !!((item.description || item.evidence || "").trim()));
  const ref = ({ item, id }: (typeof evidence)[number]): ProofRef => ({
    id,
    term: item.term,
    kind: item.kind || "self",
    status: item.status,
    excerpt: (item.description || item.evidence || "").trim().slice(0, 160),
  });
  const exact = usable.filter(({ item }) =>
    item.status === "demonstrated" && [item.term, ...(item.skills || [])].some(skill => norm(skill) === norm(requirement.term)));
  if (exact.length) return { link: "DIRECTE", evidence: exact.map(ref) };
  const transfer = usable.filter(({ item }) =>
    item.status === "demonstrated" && sharedTokens([item.term, ...(item.skills || [])].join(" "), requirement.term).length > 0);
  if (transfer.length) return { link: "TRANSFÉRABLE", evidence: transfer.map(ref) };
  const partial = usable.filter(({ item }) =>
    item.status !== "demonstrated" && sharedTokens([item.term, ...(item.skills || [])].join(" "), requirement.term).length > 0);
  if (partial.length) return { link: "PARTIELLE", evidence: partial.map(ref) };
  const diploma = formationTexts.find(text => norm(text).includes(norm(requirement.term)));
  if (diploma) {
    return {
      link: "PARTIELLE",
      evidence: [{ id: "formation", term: requirement.term, kind: "training", status: "studied", excerpt: diploma.slice(0, 160) }],
    };
  }
  return { link: "NON_DÉMONTRÉE", evidence: [] };
}

/* ── A · Analyse de l'annonce ───────────────────────────────────────────── */

export type OfferAnalysis = {
  offerId: string;
  fingerprint: string;
  /** Les 6 catégories — chaque ligne est une CITATION de la fiche, rien d'autre. */
  conditions: string[];
  objective: string;
  missions: string[];
  technicalSkills: string[];
  deliverables: string[];
  secondaryCriteria: string[];
  /** 5 besoins principaux (termes). */
  topNeeds: string[];
  requirements: RequirementRow[];
  relevance: PfeAnalysis["relevance"];
  eligibility: PfeAnalysis["eligibility"];
  unknowns: string[];
};

const DELIVERABLE_RE = /livrable|rapport|note de calcul|synth[ée]se|dossier d'[ée]tude|plans?|sch[ée]mas?|pr[ée]sentation|maquette|prototype|outils? python/i;
const SECONDARY_RE = /anglais|mobilit|toeic|autonomie|esprit d['’]quipe|communication|curiosit|rigueur|initiative/i;
const PRIORITY_RANK: Record<PFERequirement["priority"], number> = { obligatoire: 0, "souhaitée": 1, "à vérifier": 2 };

/** Analyse complète d'une offre (module A + jointure avec la matrice B). */
export function analyzeOfferForCandidate(offer: DetectedOffer, data: UserData, aiSuggestion?: string): OfferAnalysis {
  const analysis: PfeAnalysis = analyzePfeOffer(offer, data);
  const masterText = cvMasterText(data);
  const formationTexts = [data.profile.title, ...data.profile.educations.map(row => row.degree)].filter(Boolean);
  const profile = data.profile;
  /* Citation = terme écrit dans la fiche (tous champs) ; inférence = déduction
     technique de ce module, jamais présentée comme une citation. */
  const ficheLines = [offer.profile, offer.description, offer.text, ...(offer.missions || []), ...(offer.prerequisites || [])]
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0);
  const citedLines = [...(offer.prerequisites || []), ...(offer.skills || []), ...(offer.missions || []), offer.profile, offer.description, offer.text]
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0);

  const requirements: RequirementRow[] = analysis.requirements.map(requirement => {
    const { link, evidence } = linkRequirement(requirement, profile, formationTexts);
    const isCitation = citedLines.some(line => hasCvTerm(line, requirement.term));
    return {
      term: requirement.term,
      priority: requirement.priority,
      origin: isCitation ? "citation" : "inférence",
      quote: isCitation ? requirement.source?.slice(0, 220) : undefined,
      link,
      evidenceIds: evidence.map(row => row.id),
      evidence,
      /* Seule une preuve directe ou transférable peut être affirmée ; une
         preuve partielle (déclarée/étudiée) reste « à confirmer ». */
      guidance: link === "DIRECTE" || link === "TRANSFÉRABLE" || (link === "PARTIELLE" && hasCvTerm(masterText, requirement.term))
        ? "peut être affirmée" : "à confirmer",
    };
  });

  /* Besoins supplémentaires déduits — toujours marqués « inférence ». */
  const ficheText = ficheLines.join("\n");
  for (const [pattern, term] of INFERENCE_RULES) {
    if (pattern.test(norm(ficheText)) && !requirements.some(row => norm(row.term) === norm(term))) {
      const { link, evidence } = linkRequirement({ term, priority: "à vérifier", source: term, match: "non documentée", evidenceIds: [] }, profile, formationTexts);
      requirements.push({ term, priority: "à vérifier", origin: "inférence", link, evidenceIds: evidence.map(row => row.id), evidence, guidance: link === "DIRECTE" || link === "TRANSFÉRABLE" || (link === "PARTIELLE" && hasCvTerm(masterText, term)) ? "peut être affirmée" : "à confirmer" });
    }
  }

  const conditions = [
    offer.contract && `Contrat : ${offer.contract}`,
    offer.duration && `Durée : ${offer.duration}`,
    offer.startDate && `Début : ${offer.startDate}`,
    offer.location && `Lieu : ${offer.location}`,
    offer.deadline && `Candidature avant le : ${offer.deadline}`,
  ].filter((value): value is string => !!value);

  const technicalSkills = requirements.filter(row => row.origin === "citation").map(row => row.term);
  const deliverables = ficheLines.filter(line => DELIVERABLE_RE.test(line)).map(line => line.trim().slice(0, 220));
  const secondaryCriteria = ficheLines.filter(line => SECONDARY_RE.test(line)).map(line => line.trim().slice(0, 220));
  const objective = offer.profile?.trim().slice(0, 320) || "";

  const sorted = [...requirements].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    || (a.link === "NON_DÉMONTRÉE" ? 1 : 0) - (b.link === "NON_DÉMONTRÉE" ? 1 : 0));
  const topNeeds = sorted.slice(0, 5).map(row => row.term);

  const unknowns = [
    ...analysis.unknowns,
    ...(aiSuggestion ? [] : []),
  ];

  return {
    offerId: offer.id,
    fingerprint: analysis.fingerprint,
    conditions,
    objective,
    missions: (offer.missions || []).map(line => line.trim().slice(0, 320)),
    technicalSkills,
    deliverables: [...new Set(deliverables)],
    secondaryCriteria: [...new Set(secondaryCriteria)],
    topNeeds,
    requirements,
    relevance: analysis.relevance,
    eligibility: analysis.eligibility,
    unknowns,
  };
}

/* ── C · Stratégie ──────────────────────────────────────────────────────── */

export type CvStrategy = {
  /** Titre de disponibilité conforme (verrouillé). */
  headline: string;
  /** Les trois compétences les plus utiles pour CETTE offre. */
  topSkills: string[];
  /** Principale réalisation à remonter (preuve réelle du parcours). */
  flagship?: { evidenceId: string; label: string };
  keepSections: string[];
  reorderSections: { title: string; toIndex: number }[];
  gaps: string[];
  recruiterTest: { titleVisible: boolean; proofVisible: boolean; potentialVisible: boolean };
};

export function buildStrategy(analysis: OfferAnalysis, data: UserData, masterText: string, cvData?: CvData): CvStrategy {
  const documented = analysis.requirements.filter(row => row.link !== "NON_DÉMONTRÉE");
  const topSkills = [...documented]
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      || (a.link === "DIRECTE" ? 0 : 1) - (b.link === "DIRECTE" ? 0 : 1))
    .slice(0, 3).map(row => row.term);

  /* Domaine métier présent à la fois dans l'offre et dans le CV maître. */
  const domain = analysis.relevance.domains.find(name => hasCvTerm(masterText, name));

  let flagship: CvStrategy["flagship"];
  const direct = analysis.requirements.filter(row => row.link === "DIRECTE" || row.link === "TRANSFÉRABLE");
  for (const row of direct) {
    const proof = row.evidence[0];
    if (proof && hasCvTerm(masterText, proof.term)) {
      flagship = { evidenceId: proof.id, label: `${proof.term} — ${proof.excerpt}` };
      break;
    }
  }

  const sections = cvData?.sections ?? [];
  const keepSections = sections.filter(section => !sectionCanBeOmitted(section)).map(section => section.title);
  const reorderSections: { title: string; toIndex: number }[] = [];
  if (flagship && sections.length > 1) {
    const index = sections.findIndex(section =>
      section.items.some(item => hasCvTerm(`${item.title} ${item.detail}`, flagship.label.split(" — ")[0])));
    if (index > 0) reorderSections.push({ title: sections[index].title, toIndex: 0 });
  }

  const gaps = analysis.requirements
    .filter(row => row.link === "NON_DÉMONTRÉE")
    .map(row => `${row.term} — demandé dans l'offre, non confirmé par le parcours (à confirmer, jamais ajouté au CV)`);

  return {
    headline: stageHeadline(domain),
    topSkills,
    flagship,
    keepSections,
    reorderSections,
    gaps,
    recruiterTest: {
      titleVisible: /ing[eé]nieur|[ée]tudiant|[eé]l[eè]ve/i.test(masterText.slice(0, 350)),
      proofVisible: topSkills.length > 0 && topSkills.some(skill => hasCvTerm(masterText, skill)),
      potentialVisible: !!flagship,
    },
  };
}

/* ── D · Plan d'opérations ──────────────────────────────────────────────── */

export type PlanOpKind = "keep" | "rewrite_profile" | "set_headline" | "reorder_projects" | "rephrase_fact" | "reorder_skills" | "omit_optional_fact";
export const PLAN_WHITELIST: PlanOpKind[] = ["keep", "rewrite_profile", "set_headline", "reorder_projects", "rephrase_fact", "reorder_skills", "omit_optional_fact"];

export type PlanOperation = {
  id: string;
  op: PlanOpKind;
  /** Zone du CV concernée. */
  zone: string;
  /** IDs de preuves du parcours qui autorisent l'opération. */
  sourceFactIds: string[];
  before?: string;
  after?: string;
  justification: string;
  proofType: ProofLink | "verrouillé";
  /** Effet estimé sur la place en page A4. */
  a4Impact: "nul" | "léger" | "significatif";
  decision: "pending" | "accepted" | "rejected";
};

export type CvPlan = {
  offerId: string;
  fingerprint: string;
  createdAt: string;
  strategy: CvStrategy;
  analysis: OfferAnalysis;
  operations: PlanOperation[];
  /** CV déjà pertinent : aucune modification proposée (03_TESTS C.7). */
  noChange: boolean;
};

const WORD_LIMIT_ONE_PAGE = 520;

/** Règle « conserver le CV sans modification » : tous les besoins obligatoires
    sont affirmables (preuve directe/transférable, ou PARTIELLE déjà citée
    verbatim dans le CV maître — ex. domaine du diplôme) et le niveau de
    pertinence est « forte ». */
export function isNoChangeCase(analysis: OfferAnalysis): boolean {
  const obligatoires = analysis.requirements.filter(row => row.priority === "obligatoire");
  return analysis.relevance.level === "forte"
    && obligatoires.length > 0
    && obligatoires.every(row => row.guidance === "peut être affirmée");
}

const opId = (op: PlanOpKind, zone: string) => `op-${op}-${zone.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;

/** Plan déterministe : uniquement des opérations sûres et justifiées.
    La rédaction Gemini (rewrite_profile / rephrase_fact) s'ajoute ensuite,
    validée par validatePlanOperation (module E). */
export function buildPlan(analysis: OfferAnalysis, strategy: CvStrategy, data: UserData, masterText: string, cvData?: CvData): CvPlan {
  const operations: PlanOperation[] = [];
  const noChange = isNoChangeCase(analysis);

  if (noChange) {
    operations.push({
      id: opId("keep", "cv-entier"),
      op: "keep",
      zone: "CV entier",
      sourceFactIds: analysis.requirements.flatMap(row => row.evidenceIds),
      justification: `CV déjà pertinent pour cette offre : ${strategy.topSkills.join(", ") || "exigences obligatoires"} déjà ${strategy.topSkills.length > 1 ? "couvertes" : "couvert"} par le parcours vérifié — aucune réécriture nécessaire.`,
      proofType: "verrouillé",
      a4Impact: "nul",
      decision: "accepted",
    });
    return { offerId: analysis.offerId, fingerprint: analysis.fingerprint, createdAt: new Date().toISOString(), strategy, analysis, operations, noChange: true };
  }

  if (cvData) {
    const current = cvData.basics.target?.trim() || cvData.basics.headline?.trim() || "";
    if (current !== strategy.headline) {
      operations.push({
        id: opId("set_headline", "titre"),
        op: "set_headline",
        zone: "Titre / disponibilité",
        sourceFactIds: [],
        before: current,
        after: strategy.headline,
        justification: `Titre de disponibilité unique exigé par le candidat : « ${AVAILABILITY} ». Aucun diplôme, nom ni date n'est modifié.`,
        proofType: "verrouillé",
        a4Impact: "nul",
        decision: "pending",
      });
    }
    for (const title of strategy.keepSections) {
      operations.push({
        id: opId("keep", title),
        op: "keep",
        zone: title,
        sourceFactIds: [],
        justification: "Rubrique porteuse de faits vérifiables : conservée inchangée.",
        proofType: "verrouillé",
        a4Impact: "nul",
        decision: "accepted",
      });
    }
    for (const move of strategy.reorderSections) {
      const section = cvData.sections.find(row => row.title === move.title);
      const order = (section?.items ?? []).map(item => item.title);
      operations.push({
        id: opId("reorder_projects", move.title),
        op: "reorder_projects",
        zone: move.title,
        sourceFactIds: strategy.flagship ? [strategy.flagship.evidenceId] : [],
        before: order.join("\n"),
        after: [...order.slice(move.toIndex), ...order.slice(0, move.toIndex)].join("\n"),
        justification: strategy.flagship
          ? `Remonter la réalisation la plus proche des missions : ${strategy.flagship.label.split(" — ")[0]}.`
          : "Réordonner vers le plus pertinent.",
        proofType: "DIRECTE",
        a4Impact: "nul",
        decision: "pending",
      });
    }
    const skillsSection = cvData.sections.find(section => /comp[ée]tence|logiciel|informatique/i.test(section.title));
    if (skillsSection) {
      const lines = (skillsSection.kind === "text" ? skillsSection.text.split("\n") : skillsSection.items.map(item => item.title)).map(l => l.trim()).filter(Boolean);
      const score = (line: string) => strategy.topSkills.reduce((count, skill) => count + (hasCvTerm(line, skill) ? 1 : 0), 0);
      if (lines.length > 1 && strategy.topSkills.some(skill => lines.some(line => hasCvTerm(line, skill)))) {
        const ranked = [...lines].sort((a, b) => score(b) - score(a));
        if (ranked.join("\n") !== lines.join("\n")) {
          operations.push({
            id: opId("reorder_skills", skillsSection.title),
            op: "reorder_skills",
            zone: skillsSection.title,
            sourceFactIds: analysis.requirements.flatMap(row => row.link === "NON_DÉMONTRÉE" ? [] : row.evidenceIds).slice(0, 6),
            before: lines.join("\n"),
            after: ranked.join("\n"),
            justification: `Compétences déjà prouvées remontées selon leur pertinence pour l'offre (${strategy.topSkills.join(", ")}). Aucun mot-clé ajouté.`,
            proofType: "TRANSFÉRABLE",
            a4Impact: "nul",
            decision: "pending",
          });
        }
      }
    }
    let words = masterText.split(/\s+/).filter(Boolean).length;
    for (const section of cvData.sections) {
      if (words <= WORD_LIMIT_ONE_PAGE) break;
      if (!sectionCanBeOmitted(section)) continue;
      operations.push({
        id: opId("omit_optional_fact", section.title),
        op: "omit_optional_fact",
        zone: section.title,
        sourceFactIds: [],
        before: section.title,
        justification: `Rubrique facultative sans fait daté ni contact (${words} mots > ${WORD_LIMIT_ONE_PAGE}) : retrait pour tenir la page A4.`,
        proofType: "verrouillé",
        a4Impact: "significatif",
        decision: "pending",
      });
      words -= section.text.split(/\s+/).filter(Boolean).length + section.items.reduce((sum, item) => sum + item.title.split(/\s+/).length + item.detail.split(/\s+/).length, 0);
    }
  }

  return { offerId: analysis.offerId, fingerprint: analysis.fingerprint, createdAt: new Date().toISOString(), strategy, analysis, operations, noChange: false };
}

/* ── E · Vérification indépendante des opérations ───────────────────────── */

/** Valide une opération SANS faire confiance à l'IA : whitelist, provenance,
    non-invention, verrou des rubriques porteuses de faits. */
export function validatePlanOperation(op: PlanOperation, masterText: string, analysis: OfferAnalysis, cvData?: CvData): string[] {
  if (!PLAN_WHITELIST.includes(op.op)) return [`Opération hors whitelist : ${op.op}`];
  const issues: string[] = [];
  switch (op.op) {
    case "keep":
      return [];
    case "set_headline": {
      const after = (op.after || "").trim();
      if (!/^Stage de 6 mois( · .+)? · à partir de février 2027$/.test(after)) {
        issues.push("Titre de disponibilité non conforme (attendu « Stage de 6 mois · … · à partir de février 2027 »).");
      } else {
        const specialty = after.split(" · ")[1];
        if (specialty && !hasCvTerm(masterText, specialty)
          && !analysis.requirements.some(row => hasCvTerm(row.term, specialty) || hasCvTerm(specialty, row.term))) {
          issues.push(`Spécialité du titre « ${specialty} » ni dans le CV maître ni dans l'offre.`);
        }
      }
      return issues;
    }
    case "rewrite_profile":
    case "rephrase_fact": {
      const change: CvChange = {
        id: op.id, section: op.zone, original: op.before || "", proposed: op.after || "",
        reason: op.justification, source: op.before || "", decision: "pending",
      };
      const unverified = analysis.requirements.filter(row => row.link === "NON_DÉMONTRÉE").map(row => row.term);
      issues.push(...validateCvChange(change, masterText, masterText, unverified));
      return issues;
    }
    case "reorder_projects":
    case "reorder_skills": {
      const before = (op.before || "").split("\n").map(line => line.trim()).filter(Boolean);
      const after = (op.after || "").split("\n").map(line => line.trim()).filter(Boolean);
      if (before.length !== after.length) issues.push("Le réordonnancement doit conserver exactement les mêmes lignes.");
      for (const line of after) if (!before.includes(line)) issues.push(`Ligne inédite dans un réordonnement : ${line.slice(0, 70)}`);
      return issues;
    }
    case "omit_optional_fact": {
      const section = cvData?.sections.find(row => row.title === op.zone);
      if (!section) return ["Rubrique inconnue pour la suppression."];
      if (!sectionCanBeOmitted(section)) issues.push("Rubrique porteur de faits importants (dates, expériences) : suppression interdite.");
      return issues;
    }
  }
}

/** Valide un plan entier. Retourne les opérations refusées (avec motifs). */
export function validatePlan(plan: CvPlan, masterText: string, cvData?: CvData): { accepted: PlanOperation[]; rejected: { op: PlanOperation; issues: string[] }[] } {
  const accepted: PlanOperation[] = [];
  const rejected: { op: PlanOperation; issues: string[] }[] = [];
  for (const op of plan.operations) {
    const issues = validatePlanOperation(op, masterText, plan.analysis, cvData);
    if (issues.length) rejected.push({ op, issues });
    else accepted.push(op);
  }
  return { accepted, rejected };
}

/* ── F · Diff avant / après ─────────────────────────────────────────────── */

export type CvDiffLine = { kind: "kept" | "added" | "removed"; text: string };
export type CvDiff = {
  lines: CvDiffLine[];
  added: number;
  removed: number;
  unchangedRatio: number;
  wordDelta: number;
};

/** Diff exact ligne à ligne du contenu réellement présent (avant → après). */
export function diffCvVersions(before: string, after: string): CvDiff {
  const key = (line: string) => norm(line);
  const beforeLines = before.split("\n").map(line => line.trim()).filter(Boolean);
  const afterLines = after.split("\n").map(line => line.trim()).filter(Boolean);
  const remaining = new Map<string, number>();
  for (const line of afterLines) remaining.set(key(line), (remaining.get(key(line)) || 0) + 1);
  const lines: CvDiffLine[] = [];
  let removed = 0;
  for (const line of beforeLines) {
    const count = remaining.get(key(line)) || 0;
    if (count > 0) { remaining.set(key(line), count - 1); lines.push({ kind: "kept", text: line }); }
    else { removed++; lines.push({ kind: "removed", text: line }); }
  }
  let added = 0;
  for (const line of afterLines) {
    const count = remaining.get(key(line)) || 0;
    if (count > 0) { remaining.set(key(line), count - 1); added++; lines.push({ kind: "added", text: line }); }
  }
  const total = Math.max(beforeLines.length, afterLines.length) || 1;
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  return {
    lines,
    added,
    removed,
    unchangedRatio: Math.round(1000 * (total - Math.max(added, removed)) / total) / 1000,
    wordDelta: words(after) - words(before),
  };
}

/* ── Entrée unique : analyse + plan (aucun appel IA) ────────────────────── */

export function analyzeAndPlan(offer: DetectedOffer, data: UserData): { analysis: OfferAnalysis; strategy: CvStrategy; plan: CvPlan; masterText: string; cvData?: CvData } {
  const masterText = (data.originalCv?.text?.trim() || "") || "";
  const cvData = data.cvData ?? undefined;
  const analysis = analyzeOfferForCandidate(offer, data);
  const strategy = buildStrategy(analysis, data, masterText, cvData);
  const plan = buildPlan(analysis, strategy, data, masterText, cvData);
  return { analysis, strategy, plan, masterText, cvData };
}
