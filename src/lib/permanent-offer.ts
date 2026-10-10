/* ══════════════════ CATALOGUE PERMANENT DES OFFRES — P4 ══════════════════
   Modèle de données professionnel pour la bibliothèque permanente.
   Distinction claire : données sources (figées) vs décisions utilisateur (vivantes).
   ═══════════════════════════════════════════════════════════════════════ */

import type { QualificationState } from "./offer-qualification";

/* ── Identifiants stables ────────────────────────────────────────── */

export type OfferSourceType = "gmail" | "linkedin" | "indeed" | "hellowork" | "welcometothejungle" | "manual" | "other";

export interface OfferSourceRef {
  type: OfferSourceType;
  /** Identifiant natif de la source (ex: message-id Gmail, job-id LinkedIn) */
  nativeId: string;
  /** URL canonique normalisée (sans trackers UTM) */
  canonicalUrl?: string;
  /** URL brute originale */
  rawUrl?: string;
  /** Date de première détection sur cette source */
  detectedAt: string;
  /** Date de dernière synchronisation depuis cette source */
  lastSyncedAt?: string;
  /** Données brutes conservées pour vérification (optionnel, peut être volumineux) */
  rawDataRef?: string; // clé de stockage pour le blob brut
}

/* ── Localisation structurée ─────────────────────────────────────── */

export interface OfferLocation {
  /** Ville normalisée (ex: "Paris", "Lyon", "Toulouse") */
  city?: string;
  /** Code département (ex: "75", "69", "31") */
  department?: string;
  /** Région administrative (ex: "Île-de-France", "Auvergne-Rhône-Alpes") */
  region?: string;
  /** Pays (ex: "France") */
  country: string;
  /** Code postal si connu */
  postalCode?: string;
  /** Indique si du télétravail/hybride est mentionné */
  remote?: "on_site" | "hybrid" | "remote" | "unknown";
  /** Texte brut original pour traçabilité */
  rawText: string;
  /** Confiance dans l'extraction (0-1) */
  confidence: number;
}

/* ── Domaine technique structuré ─────────────────────────────────── */

export interface OfferDomain {
  /** Domaine principal (ex: "Électricité", "Nucléaire", "Automatisme") */
  primary: string;
  /** Domaines secondaires */
  secondary: string[];
  /** Mots-clés techniques extraits (logiciels, normes, compétences) */
  technicalKeywords: string[];
  /** Confiance dans la classification */
  confidence: number;
}

/* ── Historique d'événements ────────────────────────────────────── */

export type OfferEventType =
  | "created"
  | "source_added"
  | "enriched"
  | "qualified"
  | "shortlisted"
  | "archived"
  | "restored"
  | "application_linked"
  | "application_unlinked"
  | "merged"
  | "split"
  | "description_updated"
  | "location_updated"
  | "manually_edited";

export interface OfferEvent {
  id: string;
  type: OfferEventType;
  timestamp: string;
  /** "system" ou "user" — distingue les événements auto des décisions humaines */
  actor: "system" | "user";
  /** Description lisible */
  description: string;
  /** Données contextuelles (état avant/après, source, etc.) */
  metadata?: Record<string, unknown>;
}

/* ── Offre permanente (catalogue) ────────────────────────────────── */

export interface PermanentOffer {
  /** Identifiant interne stable (UUID v4) — JAMAIS réutilisé */
  id: string;
  /** Identifiant de déduplication cross-source (généré, stable) */
  dedupKey: string;

  /* Identité de base */
  title: string;
  company: string;

  /* Localisation structurée */
  location: OfferLocation;

  /* Domaine technique */
  domain: OfferDomain;

  /* Détails du poste */
  contractType?: string;           // "stage", "alternance", "CDI", "CDD", "VIE"
  durationMonths?: number;         // durée en mois (ex: 6)
  startDate?: string;              // ISO date (ex: "2027-02-01") ou période (ex: "2027-02")
  salary?: string;
  description: string;             // description complète (texte brut)
  missions: string[];
  requiredSkills: string[];        // compétences exigées
  desiredSkills: string[];         // compétences souhaitées
  prerequisites: string[];         // prérequis (diplômes, expériences, langues)
  profile?: string;                // profil recherché

  /* Sources et traçabilité */
  sources: OfferSourceRef[];
  /** Source principale (la plus complète / la plus récente) */
  primarySource: OfferSourceRef;

  /* Dates système */
  createdAt: string;               // première entrée dans le catalogue
  updatedAt: string;               // dernière modification quelconque
  lastEnrichedAt?: string;         // dernier enrichissement (page d'annonce lue)
  publishedAt?: string;            // date de publication réelle si connue

  /* État d'enrichissement */
  enrichStatus: "none" | "pending" | "partial" | "complete" | "blocked" | "skipped";
  enrichError?: string;

  /* Qualification utilisateur (P3-D) — séparée des données sources */
  qualification?: OfferQualificationSnapshot;

  /* Archivage */
  archived: boolean;
  archivedAt?: string;
  archiveReason?: string;

  /* Liaisons */
  applicationId?: string;          // lien vers candidature si existante
  dossierId?: string;              // lien vers Mission PFE si existant

  /* Historique d'événements (borné aux 50 plus récents) */
  history: OfferEvent[];

  /* Métadonnées techniques */
  version: number;                 // incrémentée à chaque modification
  isDeleted: boolean;              // suppression logique (soft delete)
}

/* ── Snapshot de qualification (copie pour requêtes rapides) ─────── */

export interface OfferQualificationSnapshot {
  state: QualificationState;
  priority: number;
  note: string;
  shortlistPosition: number | null;
  justification: string;
  infoToVerify: string[];
  decidedAt: string;
  updatedAt: string;
}

/* ── Filtres de recherche avancée ───────────────────────────────── */

export interface OfferSearchFilters {
  /* Texte */
  query?: string;                    // recherche full-text (titre, entreprise, description, compétences)
  searchFields?: ("title" | "company" | "description" | "skills" | "missions" | "location")[];

  /* Qualification */
  states?: QualificationState[];

  /* Domaine technique */
  domains?: string[];                // domaine primaire
  technicalKeywords?: string[];      // mots-clés techniques

  /* Localisation */
  regions?: string[];
  departments?: string[];
  cities?: string[];
  remote?: ("on_site" | "hybrid" | "remote")[];
  includeUnknownLocation?: boolean;

  /* Contrat et dates */
  contractTypes?: string[];
  minDurationMonths?: number;
  maxDurationMonths?: number;
  startDateFrom?: string;
  startDateTo?: string;

  /* Enrichissement */
  enrichStatus?: PermanentOffer["enrichStatus"][];

  /* Archivage */
  includeArchived?: boolean;
  archivedOnly?: boolean;

  /* Liaisons */
  hasApplication?: boolean;
  hasDossier?: boolean;

  /* Tri */
  sortBy?: "relevance" | "createdAt" | "updatedAt" | "startDate" | "title" | "company" | "qualificationState" | "priority";
  sortDir?: "asc" | "desc";

  /* Pagination */
  page?: number;
  pageSize?: number;
}

/* ── Résultat de recherche paginé ───────────────────────────────── */

export interface OfferSearchResult {
  offers: PermanentOffer[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: OfferSearchFacets;
}

/* ── Facettes pour filtres dynamiques ───────────────────────────── */

export interface OfferSearchFacets {
  domains: { value: string; count: number }[];
  regions: { value: string; count: number }[];
  departments: { value: string; count: number }[];
  cities: { value: string; count: number }[];
  contractTypes: { value: string; count: number }[];
  enrichStatus: { value: string; count: number }[];
  qualificationStates: { value: QualificationState; count: number }[];
  sources: { value: OfferSourceType; count: number }[];
  durationRange: { min: number; max: number };
  salaryRange?: { min: number; max: number }; // si parsable
}

/* ── Statistiques du catalogue ──────────────────────────────────── */

export interface CatalogStats {
  totalOffers: number;
  byState: Record<QualificationState, number>;
  byEnrichStatus: Record<PermanentOffer["enrichStatus"], number>;
  byDomain: { domain: string; count: number }[];
  byRegion: { region: string; count: number }[];
  byContractType: { type: string; count: number }[];
  bySource: { source: OfferSourceType; count: number }[];
  newThisWeek: number;
  newThisMonth: number;
  archived: number;
  withApplication: number;
  withDossier: number;
  duplicatesDetected: number;
  lastSyncAt?: string;
}

/* ── Résultat de déduplication ──────────────────────────────────── */

export type DedupConfidence = "certain" | "probable" | "possible" | "none";

export interface DedupMatch {
  existingOfferId: string;
  confidence: DedupConfidence;
  reasons: string[];              // ex: ["URL canonique identique", "Titre+entreprise+ville similaires (0.95)"]
  matchingFields: string[];       // ex: ["canonicalUrl", "titleCompanyLocation"]
  sourceRefs: OfferSourceRef[];   // les sources qui ont matché
}

export interface DedupResult {
  matches: DedupMatch[];
  suggestedAction: "merge" | "link_sources" | "keep_separate" | "review_required";
  requiresHumanReview: boolean;
}

/* ── Opérations de migration ────────────────────────────────────── */

export interface MigrationReport {
  timestamp: string;
  source: "gmail" | "detected_offers" | "manual" | "full";
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { offerId: string; error: string }[];
  dedupMatches: DedupMatch[];
  durationMs: number;
}

/* ── Utilitaires ────────────────────────────────────────────────── */

export function createOfferId(): string {
  return `off_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createEventId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeCity(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b(cedex|ceDEX)\b/gi, "")
    .trim();
}

export function normalizeRegion(region: string): string {
  return region
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function extractDepartmentFromPostalCode(postalCode: string): string | undefined {
  const match = postalCode.match(/^(\d{2})\d{3}$/);
  return match ? match[1] : undefined;
}

export function buildDedupKey(offer: Pick<PermanentOffer, "title" | "company" | "location">): string {
  const city = normalizeCity(offer.location.city || "");
  const parts = [
    offer.title.toLowerCase().trim(),
    offer.company.toLowerCase().trim(),
    city,
  ].filter(Boolean);
  return `dedup:${parts.join("|")}`;
}

export function buildUrlDedupKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const keep: string[] = [];
    for (const [k, v] of u.searchParams.entries()) {
      if (!/^(utm_.*|fbclid|gclid|msclkid|mc_[a-z]+|igsh|si|ref|ref_|spm|hs_.*|woosmap)$/i.test(k)) {
        keep.push(`${k}=${v}`);
      }
    }
    u.search = keep.length ? `?${keep.join("&")}` : "";
    return `url:${u.href.replace(/\/$/, "").toLowerCase()}`;
  } catch {
    return `url:${url.trim().toLowerCase()}`;
  }
}