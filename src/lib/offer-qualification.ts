import type { UserData, DetectedOffer, Application } from "./data";
import type { PfeAnalysis } from "./pfe-matching";
import { pfeFingerprint, analyzePfeOffer } from "./pfe-matching";

export { pfeFingerprint, analyzePfeOffer } from "./pfe-matching";

export type QualificationState = 
  | "new"
  | "to_examine"
  | "interesting"
  | "to_verify"
  | "shortlisted"
  | "rejected"
  | "applied";

export type OfferQualification = {
  offerId: string;
  state: QualificationState;
  priority: number;
  note: string;
  shortlistPosition: number | null;
  justification: string;
  infoToVerify: string[];
  decidedAt: string;
  updatedAt: string;
  /** Historique des changements d'état pour annulation */
  history?: { state: QualificationState; at: string; note?: string }[];
};

export type QualificationFilters = {
  states?: QualificationState[];
  search?: string;
  domains?: string[];
  locations?: string[];
  hasMissingInfo?: boolean;
  eligibility?: "eligible" | "verify" | "excluded" | "unknown";
  relevance?: "forte" | "à examiner" | "faible" | "unknown";
  sortBy?: "relevance" | "freshness" | "state" | "priority";
  sortDir?: "asc" | "desc";
};

const STATE_LABELS: Record<QualificationState, string> = {
  new: "Nouvelles",
  to_examine: "À examiner",
  interesting: "Intéressantes",
  to_verify: "À vérifier",
  shortlisted: "Retenues",
  rejected: "Écartées",
  applied: "Déjà candidates",
};

const STATE_ORDER: QualificationState[] = [
  "new",
  "to_examine",
  "interesting",
  "to_verify",
  "shortlisted",
  "rejected",
  "applied",
];

const STATE_ICONS: Record<QualificationState, string> = {
  new: "✨",
  to_examine: "🔍",
  interesting: "⭐",
  to_verify: "⚠️",
  shortlisted: "📋",
  rejected: "✕",
  applied: "✓",
};

const STATE_COLORS: Record<QualificationState, { bg: string; border: string; text: string }> = {
  new: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
  to_examine: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  interesting: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
  to_verify: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700" },
  shortlisted: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700" },
  rejected: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-600" },
  applied: { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-800" },
};

export function isAnalysisFresh(analysis: PfeAnalysis, offer: DetectedOffer, data: UserData): boolean {
  return analysis.fingerprint === pfeFingerprint(offer, data);
}

export function getFreshAnalysis(data: UserData, offer: DetectedOffer): PfeAnalysis | null {
  const analysis = data.pfeAnalyses?.[offer.id];
  if (!analysis) return null;
  if (!isAnalysisFresh(analysis, offer, data)) return null;
  return analysis;
}

export function computeInfoToVerify(offer: DetectedOffer, analysis: PfeAnalysis | null): string[] {
  const infos: string[] = [];
  
  if (!offer.duration?.trim()) infos.push("Durée du stage non précisée");
  if (!offer.startDate?.trim()) infos.push("Date de début non précisée");
  if (!offer.location?.trim()) infos.push("Localisation non précisée");
  if (!offer.description?.trim() && !offer.text?.trim()) infos.push("Description complète manquante");
  if (!offer.contract?.trim()) infos.push("Type de contrat non précisé");
  
  if (analysis) {
    if (analysis.eligibility.status === "verify") {
      analysis.eligibility.reasons.forEach(r => infos.push(r));
    }
    if (analysis.relevance.level === "à examiner" || analysis.relevance.level === "faible") {
      analysis.relevance.reasons.forEach(r => infos.push(r));
    }
    analysis.gaps.forEach(gap => infos.push(`Compétence obligatoire manquante : ${gap}`));
    analysis.unknowns.forEach(u => infos.push(u));
  } else {
    infos.push("Analyse PFE non réalisée");
  }
  
  return [...new Set(infos)];
}

export function inferQualificationState(
  offer: DetectedOffer,
  analysis: PfeAnalysis | null,
  existingQualification: OfferQualification | undefined,
  application: Application | undefined
): QualificationState {
  if (application) return "applied";
  if (existingQualification) return existingQualification.state;
  
  const infoToVerify = computeInfoToVerify(offer, analysis);
  const hasCriticalMissing = infoToVerify.some(i => 
    i.includes("Durée") || i.includes("Date de début") || i.includes("Localisation") || i.includes("Type de contrat")
  );
  
  if (!analysis) return "new";
  
  if (analysis.eligibility.status === "excluded") return "rejected";
  if (analysis.eligibility.status === "verify" && hasCriticalMissing) return "to_verify";
  if (analysis.relevance.level === "forte") return "interesting";
  if (analysis.relevance.level === "à examiner") return "to_examine";
  
  return "to_verify";
}

export function ensureQualification(data: UserData, offer: DetectedOffer): OfferQualification {
  const existing = data.offerQualifications?.[offer.id];
  const analysis = getFreshAnalysis(data, offer);
  const application = data.applications.find(a => a.offerId === offer.id);
  
  const state = inferQualificationState(offer, analysis, existing, application);
  
  if (existing) {
    return {
      ...existing,
      state,
      infoToVerify: computeInfoToVerify(offer, analysis),
      updatedAt: new Date().toISOString(),
    };
  }
  
  return {
    offerId: offer.id,
    state,
    priority: 0,
    note: "",
    shortlistPosition: null,
    justification: "",
    infoToVerify: computeInfoToVerify(offer, analysis),
    decidedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function getAllQualifications(data: UserData): Record<string, OfferQualification> {
  const qualifications: Record<string, OfferQualification> = {};
  for (const offer of data.offers || []) {
    qualifications[offer.id] = ensureQualification(data, offer);
  }
  return qualifications;
}

export function getOffersByState(
  data: UserData,
  states?: QualificationState[]
): { offer: DetectedOffer; qualification: OfferQualification }[] {
  const targetStates = states || STATE_ORDER;
  const qualifications = getAllQualifications(data);
  
  return (data.offers || [])
    .map(offer => ({ offer, qualification: qualifications[offer.id] }))
    .filter(({ qualification }) => targetStates.includes(qualification.state))
    .sort((a, b) => {
      const stateOrderA = STATE_ORDER.indexOf(a.qualification.state);
      const stateOrderB = STATE_ORDER.indexOf(b.qualification.state);
      if (stateOrderA !== stateOrderB) return stateOrderA - stateOrderB;
      return b.qualification.priority - a.qualification.priority;
    });
}

export function getShortlistedOffers(data: UserData): { offer: DetectedOffer; qualification: OfferQualification }[] {
  const qualifications = getAllQualifications(data);
  return (data.offers || [])
    .map(offer => ({ offer, qualification: qualifications[offer.id] }))
    .filter(({ qualification }) => qualification.state === "shortlisted")
    .sort((a, b) => {
      const posA = a.qualification.shortlistPosition ?? 999;
      const posB = b.qualification.shortlistPosition ?? 999;
      return posA - posB;
    });
}

export function updateQualification(
  data: UserData,
  offerId: string,
  patch: Partial<Pick<OfferQualification, "state" | "priority" | "note" | "shortlistPosition" | "justification">>
): UserData {
  const existing = data.offerQualifications?.[offerId];
  const now = new Date().toISOString();
  
  const next: OfferQualification = existing
    ? { ...existing, ...patch, updatedAt: now }
    : {
        offerId,
        state: "to_examine",
        priority: patch.priority ?? 0,
        note: patch.note ?? "",
        shortlistPosition: patch.shortlistPosition ?? null,
        justification: patch.justification ?? "",
        infoToVerify: [],
        decidedAt: now,
        updatedAt: now,
      };
  
  if (next.state === "shortlisted" && next.shortlistPosition === null) {
    const currentShortlist = getShortlistedOffers(data);
    next.shortlistPosition = currentShortlist.length + 1;
  }
  
  if (patch.state && patch.state !== "shortlisted") {
    next.shortlistPosition = null;
  }
  
  return {
    ...data,
    offerQualifications: {
      ...data.offerQualifications,
      [offerId]: next,
    },
  };
}

export function bulkUpdateQualification(
  data: UserData,
  offerIds: string[],
  patch: Partial<Pick<OfferQualification, "state" | "priority" | "note">>
): UserData {
  let nextData = data;
  for (const offerId of offerIds) {
    nextData = updateQualification(nextData, offerId, patch);
  }
  return nextData;
}

export function reorderShortlist(data: UserData, offerIds: string[]): UserData {
  let nextData = data;
  offerIds.forEach((offerId, index) => {
    nextData = updateQualification(nextData, offerId, { shortlistPosition: index + 1 });
  });
  return nextData;
}

export function getStateInfo(state: QualificationState) {
  return {
    label: STATE_LABELS[state],
    icon: STATE_ICONS[state],
    colors: STATE_COLORS[state],
    order: STATE_ORDER.indexOf(state),
  };
}

export function getStateCounts(data: UserData): Record<QualificationState, number> {
  const qualifications = getAllQualifications(data);
  const counts: Record<QualificationState, number> = {
    new: 0, to_examine: 0, interesting: 0, to_verify: 0,
    shortlisted: 0, rejected: 0, applied: 0,
  };
  for (const q of Object.values(qualifications)) {
    counts[q.state]++;
  }
  return counts;
}

function matchesSearch(offer: DetectedOffer, search: string): boolean {
  if (!search.trim()) return true;
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [offer.title, offer.company, offer.location, offer.description, offer.text, ...(offer.skills || []), ...(offer.keywords || []), ...(offer.missions || [])].filter(Boolean).join(" ").toLowerCase();
  return terms.every(t => haystack.includes(t));
}

function matchesDomain(offer: DetectedOffer, analysis: PfeAnalysis | null, domains: string[]): boolean {
  if (!domains.length) return true;
  if (!analysis) return false;
  return domains.some(d => analysis.relevance.domains.includes(d));
}

function matchesLocation(offer: DetectedOffer, locations: string[]): boolean {
  if (!locations.length) return true;
  const loc = (offer.location || "").toLowerCase();
  return locations.some(l => loc.includes(l.toLowerCase()));
}

function getEligibility(analysis: PfeAnalysis | null): "eligible" | "verify" | "excluded" | "unknown" {
  if (!analysis) return "unknown";
  return analysis.eligibility.status;
}

function getRelevance(analysis: PfeAnalysis | null): "forte" | "à examiner" | "faible" | "unknown" {
  if (!analysis) return "unknown";
  return analysis.relevance.level;
}

export function filterAndSortOffers(
  data: UserData,
  filters: QualificationFilters
): { offer: DetectedOffer; qualification: OfferQualification; analysis: PfeAnalysis | null }[] {
  const qualifications = getAllQualifications(data);
  const allOffers = (data.offers || []).map(offer => ({
    offer,
    qualification: qualifications[offer.id],
    analysis: getFreshAnalysis(data, offer),
  }));

  let filtered = allOffers.filter(({ offer, qualification, analysis }) => {
    if (filters.states?.length && !filters.states.includes(qualification.state)) return false;
    if (!matchesSearch(offer, filters.search || "")) return false;
    if (!matchesDomain(offer, analysis, filters.domains || [])) return false;
    if (!matchesLocation(offer, filters.locations || [])) return false;
    if (filters.hasMissingInfo && qualification.infoToVerify.length === 0) return false;
    if (filters.eligibility && filters.eligibility !== "unknown" && getEligibility(analysis) !== filters.eligibility) return false;
    if (filters.relevance && filters.relevance !== "unknown" && getRelevance(analysis) !== filters.relevance) return false;
    return true;
  });

  const sortBy = filters.sortBy || "relevance";
  const sortDir = filters.sortDir || "desc";

  filtered.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "relevance": {
        const relOrder = { forte: 3, "à examiner": 2, faible: 1, unknown: 0 };
        cmp = relOrder[getRelevance(a.analysis)] - relOrder[getRelevance(b.analysis)];
        if (cmp === 0) {
          const eligOrder = { eligible: 3, verify: 2, excluded: 1, unknown: 0 };
          cmp = eligOrder[getEligibility(a.analysis)] - eligOrder[getEligibility(b.analysis)];
        }
        break;
      }
      case "freshness": {
        const dateA = a.offer.startDate ? new Date(a.offer.startDate).getTime() : 0;
        const dateB = b.offer.startDate ? new Date(b.offer.startDate).getTime() : 0;
        cmp = dateB - dateA;
        break;
      }
      case "state": {
        cmp = STATE_ORDER.indexOf(a.qualification.state) - STATE_ORDER.indexOf(b.qualification.state);
        break;
      }
      case "priority": {
        cmp = b.qualification.priority - a.qualification.priority;
        break;
      }
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  return filtered;
}

export function getAvailableDomains(data: UserData): string[] {
  const domains = new Set<string>();
  for (const offer of data.offers || []) {
    const analysis = data.pfeAnalyses?.[offer.id];
    if (analysis && isAnalysisFresh(analysis, offer, data)) {
      analysis.relevance.domains.forEach(d => domains.add(d));
    }
  }
  return [...domains].sort();
}

export function getAvailableLocations(data: UserData): string[] {
  const locations = new Set<string>();
  for (const offer of data.offers || []) {
    if (offer.location) {
      const parts = offer.location.split(/[,\·]/).map(p => p.trim()).filter(Boolean);
      parts.forEach(p => locations.add(p));
    }
  }
  return [...locations].sort((a, b) => a.localeCompare(b, "fr"));
}

export function addToHistory(qualification: OfferQualification, newState: QualificationState, note?: string): OfferQualification {
  const history = qualification.history || [];
  if (history.length === 0 || history[history.length - 1].state !== qualification.state) {
    history.push({ state: qualification.state, at: qualification.updatedAt, note: qualification.note });
  }
  return {
    ...qualification,
    state: newState,
    note: note ?? qualification.note,
    history,
    updatedAt: new Date().toISOString(),
  };
}

export function undoLastDecision(data: UserData, offerId: string): UserData {
  const existing = data.offerQualifications?.[offerId];
  if (!existing?.history?.length) return data;
  const last = existing.history[existing.history.length - 1];
  const history = existing.history.slice(0, -1);
  const next: OfferQualification = {
    ...existing,
    state: last.state,
    note: last.note ?? "",
    history,
    updatedAt: new Date().toISOString(),
  };
  return {
    ...data,
    offerQualifications: { ...data.offerQualifications, [offerId]: next },
  };
}

export { STATE_ORDER, STATE_LABELS, STATE_ICONS, STATE_COLORS };