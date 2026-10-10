/* ══════════════════ MOTEUR DE DÉDUPLICATION CROSS-SOURCE — P4 ══════════════
   Rapprochement intelligent sans fusion destructive.
   Conserve toutes les sources, propose une validation humaine pour les cas ambigus.
   ═══════════════════════════════════════════════════════════════════════ */

import type {
  PermanentOffer,
  OfferSourceRef,
  OfferSourceType,
  DedupMatch,
  DedupResult,
  DedupConfidence,
  OfferLocation,
  OfferDomain,
} from "./permanent-offer";
import { normalizeCity, normalizeRegion, buildDedupKey, buildUrlDedupKey } from "./permanent-offer";

/* ── Similarité de titres (coefficient de Dice sur bigrammes) ─────── */

function normalizeForComparison(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bigramCounts(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) || 0) + 1);
  }
  return m;
}

function diceSimilarity(a: string, b: string): number {
  const sa = normalizeForComparison(a);
  const sb = normalizeForComparison(b);
  if (!sa || !sb) return sa === sb ? 1 : 0;
  if (sa === sb) return 1;
  if (sa.length < 2 || sb.length < 2) return 0;
  const ma = bigramCounts(sa);
  const mb = bigramCounts(sb);
  let hits = 0;
  for (const [g, c] of ma) hits += Math.min(c, mb.get(g) || 0);
  return (2 * hits) / (sa.length - 1 + sb.length - 1);
}

/* ── Comparaison de localisations ────────────────────────────────── */

function locationSimilarity(a: OfferLocation, b: OfferLocation): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (a.city && b.city) {
    const citySim = diceSimilarity(a.city, b.city);
    if (citySim > 0.8) {
      score += 0.4;
      reasons.push(`Ville similaire (${Math.round(citySim * 100)}%)`);
    }
  }
  if (a.department && b.department && a.department === b.department) {
    score += 0.2;
    reasons.push(`Même département (${a.department})`);
  }
  if (a.region && b.region) {
    const regionSim = diceSimilarity(a.region, b.region);
    if (regionSim > 0.8) {
      score += 0.2;
      reasons.push(`Région similaire (${Math.round(regionSim * 100)}%)`);
    }
  }
  if (a.country !== b.country) {
    score -= 0.5;
    reasons.push("Pays différents");
  }

  return { score: Math.max(0, Math.min(1, score)), reasons };
}

/* ── Comparaison de domaines ─────────────────────────────────────── */

function domainSimilarity(a: OfferDomain, b: OfferDomain): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (a.primary === b.primary) {
    score += 0.5;
    reasons.push(`Domaine principal identique (${a.primary})`);
  } else {
    const primarySim = diceSimilarity(a.primary, b.primary);
    if (primarySim > 0.7) {
      score += 0.3;
      reasons.push(`Domaine principal proche (${Math.round(primarySim * 100)}%)`);
    }
  }

  const secondaryA = new Set(a.secondary);
  const secondaryB = new Set(b.secondary);
  const commonSecondary = [...secondaryA].filter(s => secondaryB.has(s));
  if (commonSecondary.length > 0) {
    score += 0.2 * Math.min(commonSecondary.length, 3);
    reasons.push(`Domaines secondaires communs: ${commonSecondary.join(", ")}`);
  }

  const keywordsA = new Set(a.technicalKeywords);
  const keywordsB = new Set(b.technicalKeywords);
  const commonKeywords = [...keywordsA].filter(k => keywordsB.has(k));
  if (commonKeywords.length > 0) {
    score += 0.1 * Math.min(commonKeywords.length, 5);
    reasons.push(`Mots-clés techniques communs: ${commonKeywords.slice(0, 5).join(", ")}`);
  }

  return { score: Math.min(1, score), reasons };
}

/* ── Comparaison d'entreprise ────────────────────────────────────── */

function companySimilarity(a: string, b: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const sim = diceSimilarity(a, b);
  if (sim > 0.9) {
    reasons.push(`Entreprise quasi identique (${Math.round(sim * 100)}%)`);
    return { score: 1, reasons };
  }
  if (sim > 0.7) {
    reasons.push(`Entreprise similaire (${Math.round(sim * 100)}%)`);
    return { score: 0.7, reasons };
  }
  return { score: 0, reasons: [] };
}

/* ── Moteur principal ────────────────────────────────────────────── */

export interface DedupEngineOptions {
  /** Seuil pour "certain" (fusion auto recommandée) */
  certainThreshold?: number;        // défaut 0.95
  /** Seuil pour "probable" (validation humaine recommandée) */
  probableThreshold?: number;       // défaut 0.8
  /** Seuil pour "possible" (signalement seulement) */
  possibleThreshold?: number;       // défaut 0.6
}

const DEFAULT_OPTIONS: Required<DedupEngineOptions> = {
  certainThreshold: 0.95,
  probableThreshold: 0.8,
  possibleThreshold: 0.6,
};

export class OfferDedupEngine {
  private options: Required<DedupEngineOptions>;

  constructor(options: DedupEngineOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Compare une offre candidate avec une offre existante du catalogue.
   * Retourne un match avec confiance et raisons détaillées.
   */
  compare(candidate: Partial<PermanentOffer>, existing: PermanentOffer): DedupMatch | null {
    const reasons: string[] = [];
    const matchingFields: string[] = [];
    let totalScore = 0;
    let maxPossibleScore = 0;

    // 1. URL canonique (priorité absolue)
    const candidateUrlKeys = candidate.sources?.flatMap(s => s.canonicalUrl ? [buildUrlDedupKey(s.canonicalUrl)] : []) || [];
    const existingUrlKeys = existing.sources.flatMap(s => s.canonicalUrl ? [buildUrlDedupKey(s.canonicalUrl)] : []);
    const urlMatch = candidateUrlKeys.some(k => existingUrlKeys.includes(k));
    if (urlMatch) {
      return {
        existingOfferId: existing.id,
        confidence: "certain",
        reasons: ["URL canonique identique détectée"],
        matchingFields: ["canonicalUrl"],
        sourceRefs: candidate.sources?.filter(s => s.canonicalUrl && existingUrlKeys.includes(buildUrlDedupKey(s.canonicalUrl!))) || [],
      };
    }

    // 2. Clé de déduplication titre+entreprise+localisation
    if (candidate.title && candidate.company && candidate.location?.city) {
      const candidateDedupKey = buildDedupKey({
        title: candidate.title,
        company: candidate.company,
        location: candidate.location,
      });
      if (candidateDedupKey === existing.dedupKey) {
        return {
          existingOfferId: existing.id,
          confidence: "certain",
          reasons: ["Clé titre+entreprise+ville identique"],
          matchingFields: ["dedupKey"],
          sourceRefs: candidate.sources || [],
        };
      }
    }

    // 3. Score composite pour les cas non certains
    let score = 0;
    const weights = {
      title: 0.25,
      company: 0.25,
      location: 0.25,
      domain: 0.15,
      sourceOverlap: 0.1,
    };

    // Titre
    if (candidate.title && existing.title) {
      const titleSim = diceSimilarity(candidate.title, existing.title);
      score += titleSim * weights.title;
      if (titleSim > 0.8) {
        reasons.push(`Titre très similaire (${Math.round(titleSim * 100)}%)`);
        matchingFields.push("title");
      }
    }
    maxPossibleScore += weights.title;

    // Entreprise
    if (candidate.company && existing.company) {
      const { score: compScore, reasons: compReasons } = companySimilarity(candidate.company, existing.company);
      score += compScore * weights.company;
      reasons.push(...compReasons);
      if (compScore > 0) matchingFields.push("company");
    }
    maxPossibleScore += weights.company;

    // Localisation
    if (candidate.location && existing.location) {
      const { score: locScore, reasons: locReasons } = locationSimilarity(candidate.location, existing.location);
      score += locScore * weights.location;
      reasons.push(...locReasons);
      if (locScore > 0) matchingFields.push("location");
    }
    maxPossibleScore += weights.location;

    // Domaine
    if (candidate.domain && existing.domain) {
      const { score: domScore, reasons: domReasons } = domainSimilarity(candidate.domain, existing.domain);
      score += domScore * weights.domain;
      reasons.push(...domReasons);
      if (domScore > 0) matchingFields.push("domain");
    }
    maxPossibleScore += weights.domain;

    // Chevauchement des sources (même source, IDs différents)
    if (candidate.sources && existing.sources) {
      const candidateSourceIds = new Set(candidate.sources.map(s => `${s.type}:${s.nativeId}`));
      const existingSourceIds = new Set(existing.sources.map(s => `${s.type}:${s.nativeId}`));
      const overlap = [...candidateSourceIds].filter(id => existingSourceIds.has(id));
      if (overlap.length > 0) {
        score += weights.sourceOverlap;
        reasons.push(`Source commune: ${overlap.join(", ")}`);
        matchingFields.push("sourceOverlap");
      }
    }
    maxPossibleScore += weights.sourceOverlap;

    // Normalisation
    const normalizedScore = maxPossibleScore > 0 ? score / maxPossibleScore : 0;

    // Détermination de la confiance
    let confidence: DedupConfidence = "none";
    if (normalizedScore >= this.options.certainThreshold) confidence = "certain";
    else if (normalizedScore >= this.options.probableThreshold) confidence = "probable";
    else if (normalizedScore >= this.options.possibleThreshold) confidence = "possible";

    if (confidence === "none") return null;

    return {
      existingOfferId: existing.id,
      confidence,
      reasons,
      matchingFields,
      sourceRefs: candidate.sources || [],
    };
  }

  /**
   * Trouve tous les matchs pour une offre candidate dans le catalogue.
   */
  findMatches(candidate: Partial<PermanentOffer>, catalog: PermanentOffer[]): DedupMatch[] {
    const matches: DedupMatch[] = [];
    for (const existing of catalog) {
      if (existing.isDeleted) continue;
      const match = this.compare(candidate, existing);
      if (match) matches.push(match);
    }
    // Trier par confiance décroissante
    const confidenceOrder = { certain: 3, probable: 2, possible: 1, none: 0 };
    matches.sort((a, b) => confidenceOrder[b.confidence] - confidenceOrder[a.confidence]);
    return matches;
  }

  /**
   * Détermine l'action recommandée basée sur les matchs trouvés.
   */
  determineAction(matches: DedupMatch[]): DedupResult {
    if (matches.length === 0) {
      return {
        matches: [],
        suggestedAction: "keep_separate",
        requiresHumanReview: false,
      };
    }

    const bestMatch = matches[0];
    const hasCertain = matches.some(m => m.confidence === "certain");
    const hasProbable = matches.some(m => m.confidence === "probable");
    const multipleProbable = matches.filter(m => m.confidence === "probable").length > 1;

    if (hasCertain) {
      // Un match certain = fusion recommandée (même offre, sources différentes)
      return {
        matches,
        suggestedAction: "merge",
        requiresHumanReview: false,
      };
    }

    if (hasProbable) {
      if (multipleProbable) {
        // Plusieurs matches probables = ambigu, révision humaine requise
        return {
          matches,
          suggestedAction: "review_required",
          requiresHumanReview: true,
        };
      }
      // Un seul match probable = lier les sources, révision humaine recommandée
      return {
        matches,
        suggestedAction: "link_sources",
        requiresHumanReview: true,
      };
    }

    // Matches seulement "possible" = signaler mais garder séparées
    return {
      matches,
      suggestedAction: "keep_separate",
      requiresHumanReview: false,
    };
  }
}

/* ── Utilitaires pour déduplication incrémentale ─────────────────── */

export interface IncrementalDedupResult {
  offerId: string;
  action: "created" | "merged" | "sources_linked" | "kept_separate" | "review_required";
  matchedOfferId?: string;
  confidence?: DedupConfidence;
  reasons?: string[];
}

export async function processIncrementalDedup(
  candidate: PermanentOffer,
  existingOffers: PermanentOffer[],
  engine: OfferDedupEngine
): Promise<IncrementalDedupResult> {
  const matches = engine.findMatches(candidate, existingOffers);
  const result = engine.determineAction(matches);

  if (matches.length === 0) {
    return { offerId: candidate.id, action: "created" };
  }

  const bestMatch = matches[0];

  switch (result.suggestedAction) {
    case "merge":
      return {
        offerId: candidate.id,
        action: "merged",
        matchedOfferId: bestMatch.existingOfferId,
        confidence: bestMatch.confidence,
        reasons: bestMatch.reasons,
      };
    case "link_sources":
      return {
        offerId: candidate.id,
        action: "sources_linked",
        matchedOfferId: bestMatch.existingOfferId,
        confidence: bestMatch.confidence,
        reasons: bestMatch.reasons,
      };
    case "review_required":
      return {
        offerId: candidate.id,
        action: "review_required",
        matchedOfferId: bestMatch.existingOfferId,
        confidence: bestMatch.confidence,
        reasons: bestMatch.reasons,
      };
    default:
      return {
        offerId: candidate.id,
        action: "kept_separate",
        matchedOfferId: bestMatch.existingOfferId,
        confidence: bestMatch.confidence,
        reasons: bestMatch.reasons,
      };
  }
}