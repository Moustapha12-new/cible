import type { CvData, CvSection } from "./cv";
import { cvToText, parseCvText } from "./cv";
import type { DetectedOffer, UserData } from "./data";
import { checkFacts } from "./facts";
import { hasCvTerm } from "./cv-keywords";
import { canSelectProof, pfeFingerprint, proofRecordId, type PfeAnalysis } from "./pfe-matching";

export type CvChange = {
  id: string;
  section: string;
  original: string;
  proposed: string;
  edited?: string;
  reason: string;
  source: string;
  decision: "pending" | "accepted" | "rejected";
  userConfirmed?: boolean;
};
export type CvAdaptation = {
  id: string;
  offerId: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "approved";
  orientation: "electrical" | "energy";
  masterFingerprint: string;
  matchingFingerprint: string;
  matchingAnalyzedAt: string;
  selectedEvidenceIds: string[];
  unverifiedTerms?: string[];
  proofText?: string;
  masterText: string;
  suggestions: CvChange[];
  sectionOrder?: number[];
  hiddenSections?: number[];
  headline: string;
  approvedCv?: CvData;
  approvedText?: string;
};

const normalized = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const words = (text: string): string[] => normalized(text).match(/[a-z]{3,}/g) || [];
const FACT_LABEL = /\b(?:certification|certifi[eé]|dipl[oô]me|habilit[ée]|brevet|licence professionnelle)\b/i;
const numbers = (text: string): string[] => text.match(/\b\d+(?:[.,]\d+)?\b/g) || [];
const capitalized = (text: string): string[] => text.match(/\b[A-ZÉÈÊÀÂÔÛ][a-zéèêàâôûîïüç]{2,}(?:\s+[A-ZÉÈÊÀÂÔÛ][a-zéèêàâôûîïüç]{2,})*/g) || [];
const STOP = new Set(["avec", "dans", "pour", "une", "des", "les", "sur", "aux", "par", "son", "ses", "leur", "leurs", "afin", "ainsi", "plus", "mes", "mon", "stage", "ingenieur"]);
const TECHNICAL = /^(?:caneco|dialux|autocad|revit|etap|matlab|simulink|python|scada|gmao|plc|automate|automatismes?|electrotechnique|electrique|photovolta[iï]que|eolien|nucleaire|hydrogene|dimensionnement|certification|habilitation|caces)$/i;

export function cvMasterText(data: UserData): string {
  return data.originalCv?.text?.trim() || (data.cvData ? cvToText(data.cvData) : "") || "";
}

export function getApprovedCV(data: UserData, offerId: string): CvAdaptation | undefined {
  return data.cvAdaptations?.[offerId]?.find(v => v.status === "approved");
}

export function getApprovedCVText(data: UserData, offerId: string): string | undefined {
  const cv = getApprovedCV(data, offerId);
  return cv?.approvedText;
}

export function hasApprovedCV(data: UserData, offerId: string): boolean {
  return !!getApprovedCV(data, offerId);
}

export function adaptationStale(adaptation: CvAdaptation, offer: DetectedOffer, data: UserData): boolean {
  const matching = data.pfeAnalyses?.[offer.id];
  return !matching || matching.fingerprint !== pfeFingerprint(offer, data) ||
    adaptation.matchingFingerprint !== matching.fingerprint || adaptation.masterText !== cvMasterText(data) ||
    adaptation.selectedEvidenceIds.join("|") !== matching.selectedEvidenceIds.join("|");
}

export function approvedProofText(data: UserData, analysis: PfeAnalysis): string {
  return (data.profile.skillEvidence || []).flatMap((proof, index) =>
    analysis.selectedEvidenceIds.includes(proofRecordId(proof, index)) && canSelectProof(proof)
      && proof.status === "demonstrated" ? [proof.description || proof.evidence, proof.source || "", proof.term, ...(proof.skills || [])] : []).join("\n");
}

/** Independent of Gemini. An AI rewrite must be traceable to one exact CV fragment. */
export function validateCvChange(change: CvChange, master: string, proofText = "", unverifiedTerms: string[] = []): string[] {
  const original = change.original.trim();
  const proposed = (change.edited ?? change.proposed).trim();
  const issues: string[] = [];
  if (!original || !master.includes(original)) issues.push("L'extrait de départ n'existe pas dans le CV maître.");
  if (!proposed) issues.push("La proposition est vide.");
  const source = `${master}\n${proofText}`;
  const sourceWords = new Set(words(source));
  const newTerms = [...new Set(words(proposed).filter(term => !sourceWords.has(term) && TECHNICAL.test(term)))];
  if (newTerms.length) issues.push(`Compétences ou logiciels absents du CV et des preuves confirmées : ${newTerms.slice(0, 8).join(", ")}.`);
  const unsupported = unverifiedTerms.filter(term => hasCvTerm(proposed, term) && !hasCvTerm(source, term));
  if (unsupported.length) issues.push(`Compétence demandée mais non confirmée dans le CV : ${unsupported.join(", ")}.`);
  const sourceNumbers = new Set<string>(numbers(source));
  if (numbers(proposed).some(value => !sourceNumbers.has(value))) issues.push("Chiffre ou date absent des sources.");
  if (numbers(original).some(value => !numbers(proposed).includes(value))) issues.push("Une date ou un chiffre de l'extrait original a changé ou disparu.");
  const sourceNames = normalized(source);
  const unknownNames = capitalized(proposed).filter(name => !sourceNames.includes(normalized(name)) && !STOP.has(normalized(name)));
  if (unknownNames.length) issues.push(`Nom, poste ou entreprise à vérifier : ${unknownNames.slice(0, 5).join(", ")}.`);
  if (FACT_LABEL.test(proposed) && !FACT_LABEL.test(original) && !FACT_LABEL.test(proofText)) issues.push("Diplôme, habilitation ou certification non confirmé dans la source de ce changement.");
  return issues;
}

export function normalizeAiChanges(input: unknown, master: string, proofText: string, analysis: PfeAnalysis): CvChange[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.slice(0, 20).flatMap((row, index) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const original = typeof item.original === "string" ? item.original.trim() : "";
    const proposed = typeof item.rewritten === "string" ? item.rewritten.trim() : "";
    if (!original || !proposed || original === proposed || seen.has(original)) return [];
    seen.add(original);
    const linked = analysis.requirements.filter(req => proposed.toLowerCase().includes(req.term.toLowerCase()) && req.match !== "non documentée");
    const change: CvChange = { id: `ai-${index}-${original.length}`, section: String(item.section || "CV"), original, proposed,
      source: original, reason: linked.length ? `Met en avant ${linked.map(req => req.term).join(", ")}, présent dans l'annonce.` : "Reformulation proposée pour cette offre.", decision: "pending" };
    return validateCvChange(change, master, proofText, analysis.requirements.filter(req => req.match !== "prouvée" && req.match !== "citée dans le CV").map(req => req.term)).length ? [] : [change];
  });
}

export function sectionCanBeOmitted(section: CvSection): boolean {
  const content = [section.title, section.text, ...section.items.flatMap(item => [item.title, item.meta || "", item.detail])].join(" ");
  return !/exp[eé]rience|projet|formation|comp[eé]tence|certificat|dipl[oô]me|langue|logiciel/i.test(section.title) &&
    !/@|\b(?:19|20)\d{2}\b|\b\d+(?:[.,]\d+)?\s?(?:%|€|ans|mois)\b/i.test(content);
}

export function assembleCv(adaptation: CvAdaptation, proofText = ""): { text: string; issues: string[] } {
  let text = adaptation.masterText;
  const issues: string[] = [];
  const sourceProofs = adaptation.proofText ?? proofText;
  for (const change of adaptation.suggestions) {
    if (change.decision !== "accepted") continue;
    const errors = validateCvChange(change, adaptation.masterText, sourceProofs, adaptation.unverifiedTerms);
    if (errors.length) { issues.push(...errors.map(error => `${change.section} : ${error}`)); continue; }
    if (!text.includes(change.original)) { issues.push(`${change.section} : l'extrait est déjà modifié ou absent.`); continue; }
    text = text.replace(change.original, change.edited ?? change.proposed);
  }
  if (adaptation.sectionOrder?.length || adaptation.hiddenSections?.length) {
    const structured = parseCvText(text);
    const sections = structured.sections;
    const order = [...new Set([...(adaptation.sectionOrder || []), ...sections.map((_, index) => index)])];
    const unsafeHidden = (adaptation.hiddenSections || []).filter(index => sections[index] && !sectionCanBeOmitted(sections[index]));
    if (unsafeHidden.length) issues.push("Une rubrique contenant des faits importants ne peut pas être retirée automatiquement.");
    structured.sections = order.filter(index => Number.isInteger(index) && index >= 0 && index < sections.length && !adaptation.hiddenSections?.includes(index)).map(index => sections[index]);
    text = cvToText(structured);
  }
  const report = checkFacts(adaptation.masterText, text);
  if (report.invented.length) issues.push("Chiffres ou résultats inconnus détectés dans le CV final.");
  if (report.lost.length) issues.push("Des coordonnées, dates ou autres faits du CV maître ont disparu.");
  return { text, issues };
}

export function saveAdaptation(data: UserData, adaptation: CvAdaptation): UserData {
  const versions = data.cvAdaptations?.[adaptation.offerId] || [];
  return { ...data, cvAdaptations: { ...data.cvAdaptations,
    [adaptation.offerId]: versions.some(version => version.id === adaptation.id)
      ? versions.map(version => version.id === adaptation.id ? adaptation : version)
      : [adaptation, ...versions] } };
}

export function cvQualityChecklist(text: string, analysis: PfeAnalysis, design: "professional" | "grey" | "design" | "ats" | "compact") {
  const lower = normalized(text);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const relevant = analysis.requirements.filter(row => row.match === "prouvée" || row.match === "citée dans le CV");
  const represented = relevant.filter(row => lower.includes(normalized(row.term)));
  return [
    { label: "Cohérence avec l'offre", ok: represented.length > 0 || !relevant.length, detail: `${represented.length}/${relevant.length} compétence(s) déjà documentée(s) visibles dans le CV.` },
    { label: "Expériences et projets", ok: /exp[eé]rience|projet|r[eé]alisation/i.test(text), detail: "Vérifie que les expériences les plus proches des missions figurent en premier." },
    { label: "Profil et titre", ok: /ing[eé]nieur|[eé]tudiant|[eé]l[eè]ve/i.test(text.slice(0, 350)), detail: "Le niveau étudiant doit rester explicite." },
    { label: "Longueur", ok: wordCount <= 650, detail: `${wordCount} mots ; la vérification géométrique A4 reste indispensable.` },
    { label: "Rubriques", ok: /formation/i.test(text) && /comp[eé]tence|logiciel|projet|exp[eé]rience/i.test(text), detail: "Formation et savoir-faire doivent être repérables." },
    { label: "Relecture", ok: !/[ \t]{3,}|[.!?]{3,}/.test(text), detail: "Contrôle de forme élémentaire ; relis l'orthographe et la grammaire toi-même." },
    { label: "Lecture ATS", ok: design === "ats" || design === "professional" || design === "compact", detail: "Privilégie ATS simple ou professionnel si le portail analyse automatiquement le CV." },
  ];
}
