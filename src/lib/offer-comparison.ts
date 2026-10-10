import type { DetectedOffer, UserData, Application } from "./data";
import type { PfeAnalysis } from "./pfe-matching";
import type { OfferQualification } from "./offer-qualification";
import { getFreshAnalysis } from "./offer-qualification";

export type ComparisonField = 
  | "company"
  | "title"
  | "domain"
  | "missions"
  | "requiredSkills"
  | "desiredSkills"
  | "location"
  | "duration"
  | "startDate"
  | "relevance"
  | "eligibility"
  | "strengths"
  | "gaps"
  | "unknowns"
  | "applicationStatus";

export type ComparisonCell = {
  field: ComparisonField;
  label: string;
  values: { offerId: string; value: string; highlight?: boolean }[];
  hasDifference: boolean;
};

export type OfferComparison = {
  offerIds: string[];
  cells: ComparisonCell[];
};

const FIELD_LABELS: Record<ComparisonField, string> = {
  company: "Entreprise",
  title: "Poste",
  domain: "Domaine technique",
  missions: "Missions",
  requiredSkills: "Compétences exigées",
  desiredSkills: "Compétences souhaitées",
  location: "Localisation",
  duration: "Durée",
  startDate: "Début",
  relevance: "Pertinence technique",
  eligibility: "Éligibilité PFE",
  strengths: "Points forts",
  gaps: "Lacunes",
  unknowns: "Inconnus",
  applicationStatus: "Statut candidature",
};

function extractDomain(analysis: PfeAnalysis | null): string {
  if (!analysis) return "Non analysé";
  return analysis.relevance.domains.length > 0 
    ? analysis.relevance.domains.join(", ") 
    : "Non identifié";
}

function extractMissions(offer: DetectedOffer): string {
  if (offer.missions?.length) return offer.missions.join("; ");
  if (offer.description) return offer.description.slice(0, 300);
  if (offer.text) return offer.text.slice(0, 300);
  return "Non précisées";
}

function extractRequiredSkills(analysis: PfeAnalysis | null): string {
  if (!analysis) return "Non analysé";
  const required = analysis.requirements
    .filter(r => r.priority === "obligatoire")
    .map(r => r.term);
  return required.length > 0 ? required.join(", ") : "Aucune";
}

function extractDesiredSkills(analysis: PfeAnalysis | null): string {
  if (!analysis) return "Non analysé";
  const desired = analysis.requirements
    .filter(r => r.priority === "souhaitée")
    .map(r => r.term);
  return desired.length > 0 ? desired.join(", ") : "Aucune";
}

function extractRelevance(analysis: PfeAnalysis | null): string {
  if (!analysis) return "Non analysé";
  return analysis.relevance.level === "forte" 
    ? "Forte (" + analysis.relevance.domains.join(", ") + ")"
    : analysis.relevance.level === "à examiner" 
      ? "À examiner" 
      : "Faible";
}

function extractEligibility(analysis: PfeAnalysis | null): string {
  if (!analysis) return "Non analysé";
  return analysis.eligibility.status === "eligible" 
    ? "Éligible" 
    : analysis.eligibility.status === "verify" 
      ? "À vérifier" 
      : "Incompatible";
}

function extractStrengths(analysis: PfeAnalysis | null): string {
  if (!analysis) return "Non analysé";
  return analysis.strengths.length > 0 ? analysis.strengths.join(", ") : "Aucun";
}

function extractGaps(analysis: PfeAnalysis | null): string {
  if (!analysis) return "Non analysé";
  return analysis.gaps.length > 0 ? analysis.gaps.join(", ") : "Aucun";
}

function extractUnknowns(analysis: PfeAnalysis | null): string {
  if (!analysis) return "Non analysé";
  return analysis.unknowns.length > 0 ? analysis.unknowns.join("; ") : "Aucun";
}

function extractApplicationStatus(data: UserData, offerId: string): string {
  const app = data.applications.find(a => a.offerId === offerId);
  if (!app) return "Non candidate";
  const statusLabels: Record<string, string> = {
    sent: "Postulée",
    interview: "Entretien",
    offer: "Offre reçue",
    rejected: "Refusée",
  };
  return statusLabels[app.status] || app.status;
}

function getValueForField(
  field: ComparisonField,
  offer: DetectedOffer,
  analysis: PfeAnalysis | null,
  qualification: OfferQualification | undefined,
  data: UserData
): string {
  switch (field) {
    case "company": return offer.company || "—";
    case "title": return offer.title || "—";
    case "domain": return extractDomain(analysis);
    case "missions": return extractMissions(offer);
    case "requiredSkills": return extractRequiredSkills(analysis);
    case "desiredSkills": return extractDesiredSkills(analysis);
    case "location": return offer.location || "—";
    case "duration": return offer.duration || "—";
    case "startDate": return offer.startDate ? offer.startDate.slice(0, 10) : "—";
    case "relevance": return extractRelevance(analysis);
    case "eligibility": return extractEligibility(analysis);
    case "strengths": return extractStrengths(analysis);
    case "gaps": return extractGaps(analysis);
    case "unknowns": return extractUnknowns(analysis);
    case "applicationStatus": return extractApplicationStatus(data, offer.id);
    default: return "—";
  }
}

function hasSignificantDifference(values: string[]): boolean {
  const normalized = values.map(v => v.trim().toLowerCase());
  return new Set(normalized).size > 1;
}

export function buildComparison(
  data: UserData,
  offerIds: string[]
): OfferComparison {
  const cells: ComparisonCell[] = [];
  
  const fields: ComparisonField[] = [
    "company", "title", "domain", "missions", "requiredSkills", "desiredSkills",
    "location", "duration", "startDate", "relevance", "eligibility",
    "strengths", "gaps", "unknowns", "applicationStatus"
  ];
  
  for (const field of fields) {
    const values = offerIds.map(offerId => {
      const offer = data.offers.find(o => o.id === offerId);
      const analysis = offer ? getFreshAnalysis(data, offer) : null;
      const qualification = data.offerQualifications?.[offerId];
      const value = offer ? getValueForField(field, offer, analysis, qualification, data) : "—";
      return { offerId, value };
    });
    
    const hasDifference = hasSignificantDifference(values.map(v => v.value));
    
    const highlightedValues = values.map(v => ({
      ...v,
      highlight: hasDifference && v.value !== "—" && v.value !== "Non analysé" && v.value !== "Non candidate"
    }));
    
    cells.push({
      field,
      label: FIELD_LABELS[field],
      values: highlightedValues,
      hasDifference,
    });
  }
  
  return { offerIds, cells };
}

export function getComparisonFields(): { field: ComparisonField; label: string }[] {
  return Object.entries(FIELD_LABELS).map(([field, label]) => ({
    field: field as ComparisonField,
    label,
  }));
}

export function canCompare(offerIds: string[]): { ok: boolean; error?: string } {
  if (offerIds.length < 2) return { ok: false, error: "Sélectionnez au moins 2 offres pour comparer" };
  if (offerIds.length > 4) return { ok: false, error: "Maximum 4 offres en comparaison simultanée" };
  return { ok: true };
}