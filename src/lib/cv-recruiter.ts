/* ═══════════ Module recruteur — pont entre Gemini et le plan déterministe ═══
   Gemini joue le recruteur technique (analyse profonde de l'offre, matrice
   exigence → preuve, stratégie, reformulations ciblées). CE MODULE NE FAIT
   JAMAIS CONFIANCE À L'IA : chaque ligne revient est recoupée avec le plan
   déterministe (cv-engine), le registre de preuves (candidate-dossier) et le
   CV maître avant d'être acceptée.

   Contrat attendu (GUIDE_GEMINI §7) :
   { eligibility, strategy{focus, primary_evidence_ids},
     requirements[{id,text,quote,priority,facts,relation}],
     changes[{section,original,rewritten,why,requirement_ids,evidence_ids}],
     refused[], stillMissing[], tips[], headline } */

import type { CvData } from "./cv";
import type { DetectedOffer, UserData } from "./data";
import type { OfferAnalysis, PlanOperation, ProofLink } from "./cv-engine";
import { validatePlanOperation } from "./cv-engine";
import { AVAILABILITY_LINE, FACT_IDS, findForbiddenClaims, resolveFactIds } from "./candidate-dossier";

/* ── Contrat IA ───────────────────────────────────────────────────────────── */

export type AiRequirementRow = {
  id?: string; text?: string; quote?: string;
  priority?: string; facts?: unknown; relation?: string;
};
export type AiChangeRow = {
  section?: string; original?: string; rewritten?: string; why?: string;
  requirement_ids?: unknown; evidence_ids?: unknown; method?: string;
};
export type AiAdaptResult = {
  eligibility?: { status?: string; reason?: string } | string;
  headline?: string;
  strategy?: { focus?: string; primary_evidence_ids?: unknown };
  requirements?: AiRequirementRow[];
  changes?: AiChangeRow[];
  refused?: { keyword?: string; reason?: string }[];
  stillMissing?: { item?: string; howToGet?: string }[];
  tips?: string[];
};

export type RecruiterRequirement = {
  id: string; text: string; quote: string; priority: "obligatoire" | "souhaitée" | "à vérifier";
  relation: ProofLink; facts: string[]; guidance: "peut être affirmée" | "à confirmer";
  /** Divergence entre l'avis IA et la preuve déterministe. */
  warning?: string;
};

export type RecruiterReport = {
  eligibility: { status: "eligible" | "needs_confirmation" | "ineligible"; reasons: string[] };
  focus?: string;
  headline?: string;
  headlineIssues: string[];
  requirements: RecruiterRequirement[];
  accepted: PlanOperation[];
  rejected: { op: PlanOperation; issues: string[] }[];
  refused: { keyword: string; reason: string }[];
  unsupported: string[];
  stillMissing: { item: string; howToGet: string }[];
  tips: string[];
  warnings: string[];
};

/* ── Utilitaires ──────────────────────────────────────────────────────────── */

const norm = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const contentTokens = (value: string): string[] => norm(value).match(/[a-z0-9+#]{4,}/g) || [];

/** Texte intégral de l'offre pour le prompt (mêmes champs que l'analyse). */
export function offerPromptText(offer: DetectedOffer): string {
  return [offer.title, offer.company, offer.description, offer.text, offer.profile, offer.location,
    ...(offer.missions || []), ...(offer.skills || []), ...(offer.skills || []), ...(offer.prerequisites || [])]
    .filter(Boolean).join("\n").slice(0, 12_000);
}

const TOOLS = /matlab|simulink|caneco|autocad|etap|scada|revit|dialux|pvsyst|powerfactory|digsilent|pspice|psim|stm32|vhdl|fpga|java\b|pytorch|networkx|pandapower|ecodial|power\s*query|pss/i;

/** Outil ou niveau sénior introduit par l'IA sans trace dans le CV maître. */
export function unprovenHeadlineTerms(headline: string, masterText: string): string[] {
  const source = norm(masterText);
  const issues: string[] = [];
  const tool = headline.match(new RegExp(TOOLS.source, "i"));
  if (tool && !norm(source).includes(norm(tool[0]))) issues.push(`outil non démontré « ${tool[0]} »`);
  if (/\b(senior|expert|chef de projet|responsable|encadrant)\b/i.test(headline)) issues.push("niveau sénior revendiqué");
  return issues;
}

/* ── Intégration validée de la réponse IA ─────────────────────────────────── */

const RELATION_MAP: Record<string, ProofLink> = {
  direct: "DIRECTE", directe: "DIRECTE", transferable: "TRANSFÉRABLE", transferrable: "TRANSFÉRABLE",
  partial: "PARTIELLE", unsupported: "NON_DÉMONTRÉE", non: "NON_DÉMONTRÉE",
};
const PRIORITY_MAP: Record<string, RecruiterRequirement["priority"]> = {
  obligatoire: "obligatoire", required: "obligatoire", "must": "obligatoire",
  souhaitée: "souhaitée", souhaitee: "souhaitée", desired: "souhaitée", plus: "souhaitée",
  "à vérifier": "à vérifier", a_verifier: "à vérifier", verify: "à vérifier",
};

export type IntegrateContext = {
  masterText: string;
  cvData?: CvData;
  analysis: OfferAnalysis;
  offerText: string;
  data: UserData;
};

/** Fusionne l'éligibilité IA (3 états) avec la vérification déterministe. */
function mergeEligibility(result: AiAdaptResult, analysis: OfferAnalysis): RecruiterReport["eligibility"] {
  const deterministic = analysis.eligibility.status; // "eligible" | "verify" | "excluded"
  const aiRaw = typeof result.eligibility === "string" ? result.eligibility : result.eligibility?.status;
  const ai = aiRaw === "eligible" || aiRaw === "needs_confirmation" || aiRaw === "ineligible" ? aiRaw : undefined;
  const aiReason = typeof result.eligibility === "object" && result.eligibility?.reason ? result.eligibility.reason : "";
  const reasons = [...analysis.eligibility.reasons, ...(aiReason ? [`Analyse IA : ${aiReason}`] : [])];
  if (deterministic === "excluded" || ai === "ineligible") return { status: "ineligible", reasons };
  if (deterministic === "verify" || ai === "needs_confirmation") return { status: "needs_confirmation", reasons };
  return { status: "eligible", reasons };
}

/** Valide les exigences IA contre l'offre réelle et le plan déterministe. */
function integrateRequirements(rows: AiRequirementRow[], ctx: IntegrateContext, warnings: string[]): RecruiterRequirement[] {
  const kept: RecruiterRequirement[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, 12)) {
    const text = (row.text || "").trim();
    if (!text || kept.length >= 12) continue;
    const key = norm(text);
    if (seen.has(key)) continue;
    /* Les IDs de preuves sont résolus AVANT toute autre validation : une ID
       fabriquée est toujours signalée, même si la ligne est rejetée ensuite. */
    const { valid, unknown } = resolveFactIds(row.facts);
    if (unknown.length) warnings.push(`IDs de preuves inconnus ignorés (${text.slice(0, 40)}) : ${unknown.join(", ")}.`);
    /* La « citation » doit exister VRAIMENT dans l'offre (anti-hallucination). */
    const quote = (row.quote || "").trim();
    if (!quote || !norm(ctx.offerText).includes(norm(quote).slice(0, 160))) {
      warnings.push(`Exigence « ${text.slice(0, 60)} » rejetée : citation absente de l'offre.`);
      continue;
    }
    seen.add(key);
    const relation = RELATION_MAP[norm(row.relation || "")] ?? "NON_DÉMONTRÉE";
    /* Recoupement déterministe : la preuve réelle prime sur l'avis IA. */
    const tokens = new Set(contentTokens(text));
    const deterministic = ctx.analysis.requirements
      .filter(drow => contentTokens(drow.term).some(token => tokens.has(token)))
      .sort((a, b) => (a.link === "NON_DÉMONTRÉE" ? 1 : 0) - (b.link === "NON_DÉMONTRÉE" ? 1 : 0))[0];
    const guidance = deterministic?.guidance === "peut être affirmée" && relation !== "NON_DÉMONTRÉE"
      ? "peut être affirmée" : "à confirmer";
    const warning = deterministic && deterministic.guidance === "à confirmer" && (relation === "DIRECTE" || relation === "TRANSFÉRABLE")
      ? `L'IA propose « ${relation} » mais la preuve du parcours n'autorise pas cette affirmation — retenue « à confirmer ».` : undefined;
    if (warning) warnings.push(warning);
    kept.push({
      id: (row.id || `req-${kept.length + 1}`).slice(0, 40),
      text: text.slice(0, 200), quote: quote.slice(0, 220),
      priority: PRIORITY_MAP[norm(row.priority || "")] ?? deterministic?.priority ?? "à vérifier",
      relation, facts: valid, guidance, ...(warning ? { warning } : {}),
    });
  }
  return kept;
}

/** Reformulations ciblées : chaque opération passe la validation indépendante. */
function integrateChanges(rows: AiChangeRow[], ctx: IntegrateContext, requirementIds: Set<string>, warnings: string[]): { accepted: PlanOperation[]; rejected: { op: PlanOperation; issues: string[] }[] } {
  const accepted: PlanOperation[] = [], rejected: { op: PlanOperation; issues: string[] }[] = [];
  const seen = new Set<string>();
  for (const [index, row] of rows.slice(0, 10).entries()) {
    const original = (row.original || "").trim();
    const rewritten = (row.rewritten || "").trim();
    if (!original || !rewritten || original === rewritten || seen.has(original)) continue;
    seen.add(original);
    if (row.method === "RETURN_UNCHANGED") continue;
    const { valid: evidenceIds } = resolveFactIds(row.evidence_ids);
    const refs = Array.isArray(row.requirement_ids) ? row.requirement_ids.filter((id): id is string => typeof id === "string") : [];
    for (const id of refs) if (!requirementIds.has(id)) warnings.push(`Référence d'exigence inconnue « ${id} » ignorée.`);
    const zone = (row.section || "CV").slice(0, 80);
    const op: PlanOperation = {
      id: `op-ai-${index}`,
      op: /profil|r[eé]sum[ée]/i.test(zone) ? "rewrite_profile" : "rephrase_fact",
      zone, sourceFactIds: evidenceIds.slice(0, 6),
      before: original, after: rewritten,
      justification: (row.why || "Reformulation ciblée pour cette offre").slice(0, 300),
      proofType: "PARTIELLE", a4Impact: "léger", decision: "pending",
    };
    const issues = validatePlanOperation(op, ctx.masterText, ctx.analysis, ctx.cvData);
    if (issues.length) rejected.push({ op, issues });
    else accepted.push(op);
  }
  return { accepted, rejected };
}

/** Point d'entrée : result brut de Gemini → rapport recruteur ENTIEREMENT validé. */
export function integrateAiResult(result: AiAdaptResult | null | undefined, ctx: IntegrateContext): RecruiterReport {
  const warnings: string[] = [];
  const source = result && typeof result === "object" ? result : {};
  const eligibility = mergeEligibility(source, ctx.analysis);
  const requirements = integrateRequirements(Array.isArray(source.requirements) ? source.requirements : [], ctx, warnings);
  const requirementIds = new Set(requirements.map(row => row.id));
  const { accepted, rejected } = integrateChanges(Array.isArray(source.changes) ? source.changes : [], ctx, requirementIds, warnings);

  /* Titre professionnel : validé comme toute autre affirmation. */
  const headline = (source.headline || "").trim().slice(0, 120);
  const headlineIssues: string[] = [];
  if (headline) {
    headlineIssues.push(...findForbiddenClaims(headline, ctx.masterText));
    headlineIssues.push(...unprovenHeadlineTerms(headline, ctx.masterText));
  }

  const { valid: focusFacts } = resolveFactIds(source.strategy?.primary_evidence_ids);
  const focus = (source.strategy?.focus || "").trim().slice(0, 160);
  if (source.strategy?.focus && !focusFacts.length) {
    const unknown = resolveFactIds(source.strategy.primary_evidence_ids);
    if (unknown.unknown.length) warnings.push(`Preuves stratégiques inconnues : ${unknown.unknown.join(", ")}.`);
  }

  const unsupported = [
    ...requirements.filter(row => row.relation === "NON_DÉMONTRÉE").map(row => row.text),
    ...ctx.analysis.requirements.filter(row => row.link === "NON_DÉMONTRÉE" && !requirements.some(aiRow => contentTokens(aiRow.text).some(token => contentTokens(row.term).includes(token)))).map(row => row.term),
  ];

  return {
    eligibility, ...(focus ? { focus } : {}), ...(headline && !headlineIssues.length ? { headline } : {}),
    headlineIssues, requirements, accepted, rejected,
    refused: (Array.isArray(source.refused) ? source.refused : [])
      .filter(row => row && typeof row.keyword === "string")
      .map(row => ({ keyword: String(row.keyword).slice(0, 80), reason: (row.reason || "").slice(0, 200) }))
      .slice(0, 12),
    unsupported: [...new Set(unsupported)].slice(0, 12),
    stillMissing: (Array.isArray(source.stillMissing) ? source.stillMissing : [])
      .filter(row => row && typeof row.item === "string")
      .map(row => ({ item: String(row.item).slice(0, 160), howToGet: (row.howToGet || "").slice(0, 160) }))
      .slice(0, 8),
    tips: (Array.isArray(source.tips) ? source.tips : []).filter((tip): tip is string => typeof tip === "string").map(tip => tip.slice(0, 200)).slice(0, 5),
    warnings,
  };
}

/** Phrase de disponibilité que tout CV adapté doit porter. */
export const REQUIRED_AVAILABILITY = AVAILABILITY_LINE;
export const KNOWN_FACT_IDS = FACT_IDS;
