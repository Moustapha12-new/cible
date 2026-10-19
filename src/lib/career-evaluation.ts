/** Méthode adaptée de Career-Ops 1.37 (MIT), voir docs/CAREER_OPS_ANALYSE.md.
 * Importance de l'annonce, preuves du candidat et note globale restent distinctes. */
import { cvToText, parseCvText } from "./cv";
import type { DetectedOffer, UserData } from "./data";

export const CAREER_VERSION = "career-ops-cible-v1";
export const CAREER_TARGET = "Stage de six mois à partir de début 2027, France ; génie électrique, énergie, automatisation. Niveau élève-ingénieur.";
export const CAREER_DIMENSIONS = ["cvMatch", "goalAlignment", "compensation", "culture", "redFlags"] as const;
export type CareerDimension = typeof CAREER_DIMENSIONS[number];
export type CareerImportance = "critical" | "high" | "meaningful" | "preferred" | "low_signal";
export type CareerRequirement = { id: string; term: string; importance: CareerImportance; basis: "stated" | "structural" | "inferred"; quote: string | null };
export type CareerMatch = { requirementId: string; match: "strong" | "partial" | "missing" | "unknown"; evidenceLevel: "demonstrated" | "transferable" | "theoretical" | "unconfirmed"; cvQuote: string | null; gap: string; risk: string; mitigation: string };
export type CareerEvidence = { status: "supported" | "partial" | "unknown"; source: "cv" | "offer" | "target" | "unknown"; quote: string | null; explanation: string };
export type CareerReport = {
  version: string; offerId: string; fingerprint: string; createdAt: string; score: number; reason: string;
  archetype: string; confidence: "low" | "medium" | "high";
  dimensions: Record<CareerDimension, CareerEvidence>; requirements: CareerRequirement[]; matches: CareerMatch[];
  nextChecks: string[]; strategy: string[]; warnings: string[];
};
const normal = (text: string) => text.replace(/\s+/g, " ").trim();
const quoteIn = (text: string, quote: string) => !!quote.trim() && normal(text).includes(normal(quote));
const string = (value: unknown, max = 600) => typeof value === "string" ? value.trim().slice(0, max) : "";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown) => Array.isArray(value) ? value.map(v => string(v)).filter(Boolean).slice(0, 5) : [];

export function careerOfferText(offer: DetectedOffer): string {
  return [...new Set([offer.title, offer.company, offer.text, offer.description, offer.profile, offer.location, offer.duration, offer.startDate, offer.contract, offer.salary, ...(offer.missions || []), ...(offer.skills || []), ...(offer.keywords || []), ...(offer.prerequisites || [])].filter((v): v is string => typeof v === "string" && !!v.trim()))].join("\n").slice(0, 24_000);
}

/** Le dossier maître reste entier dans le compte ; seules les affirmations
 * non marquées incertaines peuvent servir de preuves pour un score fort. */
export function careerCvEvidence(data: UserData): string {
  const cv = data.originalCv?.text ? parseCvText(data.originalCv.text) : data.cvData ? structuredClone(data.cvData) : null;
  if (!cv) return "";
  const doubtful = /à confirmer|à vérifier|évoqu[ée]|avant diffusion externe/i;
  cv.sections = cv.sections.filter(s => !/statut.*document|dossier maître|référence interne/i.test(s.title)).map(s => ({ ...s,
    items: s.items.filter(item => !doubtful.test(`${item.title} ${item.meta || ""} ${item.detail}`)),
    text: s.text.split(/[\n·]/).filter(line => !doubtful.test(line)).join("\n"),
  }));
  return cvToText(cv).slice(0, 20_000);
}

// Signature de cache uniquement, pas une empreinte d'intégrité documentaire.
export function careerKey(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${CAREER_VERSION}:${text.length}:${(hash >>> 0).toString(16)}`;
}
export function careerFingerprint(offer: DetectedOffer, data: UserData) {
  return careerKey(`${careerOfferText(offer)}\n${data.originalCv?.text || (data.cvData ? cvToText(data.cvData) : "")}\n${CAREER_TARGET}`);
}
export function currentCareerReport(offer: DetectedOffer, data: UserData, now = Date.now()): CareerReport | null {
  const report = data.careerReports?.[offer.id];
  return report && report.version === CAREER_VERSION && report.fingerprint === careerFingerprint(offer, data)
    && now >= Date.parse(report.createdAt) && now - Date.parse(report.createdAt) < 7 * 86400_000 ? report : null;
}

export function validateCareerRequirements(raw: unknown, offerText: string): CareerRequirement[] {
  const rows = record(raw).requirements;
  if (!Array.isArray(rows)) throw new Error("L'analyse des exigences n'a pas renvoyé de liste exploitable.");
  const result: CareerRequirement[] = [];
  const seen = new Set<string>();
  for (const value of rows.slice(0, 60)) {
    const row = record(value), term = string(row.term, 160), quote = string(row.quote, 900);
    if (!term || seen.has(term.toLowerCase())) continue;
    const basis = row.basis === "stated" || row.basis === "structural" ? row.basis : "inferred";
    if (basis !== "inferred" && !quoteIn(offerText, quote)) continue;
    let importance: CareerImportance = ["critical", "high", "meaningful", "preferred", "low_signal"].includes(String(row.importance)) ? row.importance as CareerImportance : "meaningful";
    if (basis === "inferred" && ["critical", "high"].includes(importance)) importance = "meaningful";
    seen.add(term.toLowerCase());
    result.push({ id: `req-${result.length + 1}`, term, quote: basis === "inferred" ? null : quote, basis, importance });
  }
  if (!result.some(r => r.basis !== "inferred")) throw new Error("Aucune exigence sourcée dans l'annonce : enrichis son texte avant de l'évaluer.");
  return result;
}

export function validateCareerReport(raw: unknown, offer: DetectedOffer, data: UserData, requirements: CareerRequirement[], now = new Date().toISOString()): CareerReport {
  const input = record(raw), cv = careerCvEvidence(data), offerText = careerOfferText(offer);
  if (typeof input.score !== "number" || !Number.isFinite(input.score) || input.score < 1 || input.score > 5 || !string(input.reason)) throw new Error("Gemini n'a pas fourni de note sur 5 avec une justification exploitable.");
  const warnings: string[] = [];
  const matches = requirements.map(requirement => {
    const rawMatches = Array.isArray(input.matches) ? input.matches : [];
    const row = record(rawMatches.find(v => record(v).requirementId === requirement.id));
    let match: CareerMatch["match"] = ["strong", "partial", "missing"].includes(String(row.match)) ? row.match as CareerMatch["match"] : "unknown";
    const cvQuote = string(row.cvQuote, 1000);
    const validProof = quoteIn(cv, cvQuote);
    const evidenceLevel: CareerMatch["evidenceLevel"] = validProof && ["demonstrated", "transferable", "theoretical"].includes(String(row.evidenceLevel)) ? row.evidenceLevel as CareerMatch["evidenceLevel"] : "unconfirmed";
    if (match === "strong" && !validProof) { match = "partial"; warnings.push(`Preuve non retrouvée pour « ${requirement.term} » : correspondance forte refusée.`); }
    if (match === "strong" && evidenceLevel !== "demonstrated") { match = "partial"; warnings.push(`« ${requirement.term} » : niveau non démontré, correspondance forte refusée.`); }
    const needsMitigation = ["critical", "high"].includes(requirement.importance) && match !== "strong";
    return { requirementId: requirement.id, match, evidenceLevel, cvQuote: validProof ? cvQuote : null, gap: string(row.gap),
      risk: needsMitigation ? string(row.risk) || `Le recruteur peut vérifier « ${requirement.term} » pendant l'entretien.` : string(row.risk),
      mitigation: needsMitigation ? string(row.mitigation) || "Confirmer ton niveau réel et préparer un exemple du parcours, sans revendiquer une maîtrise absente du CV." : string(row.mitigation) };
  });
  const dimensions = {} as CareerReport["dimensions"];
  for (const key of CAREER_DIMENSIONS) {
    const row = record(record(input.dimensions)[key]);
    const source: CareerEvidence["source"] = ["cv", "offer", "target"].includes(String(row.source)) ? row.source as CareerEvidence["source"] : "unknown";
    const quote = string(row.quote, 900);
    const corpus = source === "cv" ? cv : source === "offer" ? offerText : source === "target" ? CAREER_TARGET : "";
    const allowedSource = key === "compensation" || key === "culture" ? source === "offer" : key === "cvMatch" ? source === "cv" : true;
    const valid = allowedSource && quoteIn(corpus, quote);
    const status: CareerEvidence["status"] = valid && row.status === "supported" ? "supported" : valid && row.status === "partial" ? "partial" : "unknown";
    dimensions[key] = { status, source: valid ? source : "unknown", quote: valid ? quote : null, explanation: string(row.explanation) || "Information non vérifiée dans les sources disponibles." };
  }
  const unknown = Object.values(dimensions).filter(d => d.status === "unknown").length;
  const nextChecks = strings(input.nextChecks);
  for (const key of CAREER_DIMENSIONS) if (dimensions[key].status === "unknown" && nextChecks.length < 5) nextChecks.push(`${CAREER_LABELS[key]} : information à vérifier.`);
  const confidence = unknown >= 2 || dimensions.cvMatch.status === "unknown" || dimensions.goalAlignment.status === "unknown" || matches.some(m => m.match === "unknown") ? "low"
    : Object.values(dimensions).some(d => d.status !== "supported") || nextChecks.length ? "medium" : "high";
  return { version: CAREER_VERSION, offerId: offer.id, fingerprint: careerFingerprint(offer, data), createdAt: now,
    score: Math.round(input.score * 10) / 10, reason: string(input.reason), archetype: string(input.archetype, 120), confidence,
    requirements, matches, dimensions, strategy: strings(input.strategy), nextChecks, warnings };
}
export const CAREER_LABELS: Record<CareerDimension, string> = { cvMatch: "Adéquation au CV", goalAlignment: "Objectif de stage", compensation: "Conditions et gratification", culture: "Environnement de travail", redFlags: "Points de vigilance" };
