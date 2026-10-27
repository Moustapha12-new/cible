"use client";

/* Pont Alertes Gmail → Matching ATS / Adaptation CV / Lettre / Candidature.
   Helpers purs côté client : conversion d'offre, clé d'identité, état de
   candidature persistant (localStorage), sans réécrire les modules IA. */

import type { DetectedOffer } from "@/lib/data";
import { groundKeywords, repairOfferIdentity, UNKNOWN_COMPANY, UNKNOWN_TITLE } from "@/lib/offer-identity";
import { offerDisplayKey } from "@/lib/offer-display-key";

/* ── Types ─────────────────────────────────────────────────────── */

export type CandidatureStatus = "none" | "adaptation" | "letter_ready" | "sent";

export type CandidatureState = {
  key: string;
  status: CandidatureStatus;
  score?: number;
  present?: string[];
  missing?: string[];
  strategy?: string;
  letter?: string;
  letterSubject?: string;
  updatedAt: string;
};

export type OfferLike = {
  title?: string;
  company?: string;
  location?: string;
  contract?: string;
  duration?: string;
  deadline?: string;
  salary?: string;
  skills?: string[];
  missions?: string[];
  profile?: string;
  description?: string;
  summary?: string;
  applicationUrl?: string;
  source?: string;
  sourceUrl?: string;
  anchorText?: string;
  snippet?: string;
  keywords?: string[];
  prerequisites?: string[];
  applicationInfo?: string;
  enrichStatus?: string;
  /** Jalon B : niveau L0–L3 + issue de page distincte. */
  enrichLevel?: string;
  enrichOutcome?: string;
  status?: string;
  receivedAt?: string;
  /** Lien de recherche (aucune URL d'annonce réelle) — jamais présenté
      comme le lien de l'offre. */
  searchFallback?: boolean;
  /** Clé d'affichage gelée d'une annonce déjà connue : une réanalyse ne change
      jamais l'identifiant d'une offre déjà reconnue (candidature intacte). */
  stableKey?: string;
  /** Ancienne annonce conservée « à vérifier » après réanalyse. */
  needsReview?: boolean;
};

/* ── Clé d'identité (match dashboard ↔ page détail) ────────────── */

/** Clé stable d'une offre Gmail : clé gelée d'une annonce déjà connue si elle
    existe (une réanalyse conserve ainsi candidatures, CV envoyés et favoris),
    sinon URL canonique, sinon titre|entreprise|localité. */
export function offerBridgeKey(offer: OfferLike): string {
  return offerDisplayKey(offer);
}

/* ── Texte d'offre pour /api/ai (match / adapt / letter) ───────── */

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/** Assemble un texte d'offre complet (≥30 car. exigé par l'API) à partir
    des champs RawOffer / GmailOffer — enrichis ou basiques. */
export function offerToOfferText(offer: OfferLike): string {
  const parts: string[] = [];
  const head = [
    offer.title === UNKNOWN_TITLE ? "" : offer.title,
    offer.company === UNKNOWN_COMPANY ? "" : offer.company,
    offer.location,
    [offer.contract, offer.duration].filter(Boolean).join(" · "),
  ]
    .filter(Boolean)
    .join(" — ");
  if (head) parts.push(head);

  const meta = [
    offer.deadline ? `Date limite : ${offer.deadline}` : "",
    offer.salary ? `Rémunération : ${offer.salary}` : "",
    offer.source ? `Source : ${offer.source}` : "",
  ].filter(Boolean);
  if (meta.length) parts.push(meta.join(" · "));

  const summary = stripHtml(offer.summary || "");
  if (summary) parts.push(summary);
  const desc = stripHtml(offer.description || "");
  if (desc && desc !== summary) parts.push(desc);

  if (offer.missions?.length) parts.push(`Missions : ${offer.missions.join(" · ")}`);
  if (offer.prerequisites?.length) parts.push(`Prérequis : ${offer.prerequisites.join(" · ")}`);
  if (offer.profile) parts.push(`Profil recherché : ${offer.profile}`);
  if (offer.skills?.length) parts.push(`Compétences : ${offer.skills.join(", ")}`);
  if (offer.keywords?.length) parts.push(`Mots-clés : ${offer.keywords.join(", ")}`);
  if (offer.applicationInfo) parts.push(`Candidature : ${offer.applicationInfo}`);

  const snippet = stripHtml(offer.snippet || "");
  if (snippet && !desc) parts.push(snippet);
  else if (snippet && snippet.length > desc.length) parts.push(snippet);

  let text = parts.join("\n\n").trim();
  if (text.length < 30) {
    text = [text, "Offre d'emploi détectée dans une alerte Gmail.", offer.applicationUrl || ""]
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return text;
}

/** Convertit une offre Gmail en DetectedOffer (UserData.offers) pour que
    Adaptation et Lettres la voient sans réécrire ces modules.
    L'identité (titre, entreprise) est réparée ici : un fragment d'objet de mail
    ou une initiale ne doit jamais devenir le nom d'une offre affichée. */
export function offerToDetectedOffer(offer: OfferLike, match = 0): DetectedOffer {
  const identity = repairOfferIdentity({
    title: offer.title,
    company: offer.company,
    location: offer.location,
    url: offer.applicationUrl,
    description: offer.description,
    summary: offer.summary,
    snippet: offer.snippet,
    missions: offer.missions,
    profile: offer.profile,
  });
  /* Badges : seuls les mots-clés attestés par le texte réel de l'annonce. */
  const evidence = [offer.description, offer.summary, offer.snippet, offer.profile, ...(offer.missions || [])]
    .filter((part): part is string => typeof part === "string" && !!part.trim())
    .join("\n");
  const keywords = groundKeywords([...new Set([...(offer.skills || []), ...(offer.keywords || [])])], evidence);
  const text = offerToOfferText({ ...offer, title: identity.title, company: identity.company });
  return {
    id: `gmail-${encodeURIComponent(offerBridgeKey(offer))}`,
    title: identity.title,
    company: identity.company,
    location: offer.location || "",
    salary: offer.salary || "",
    match: Math.max(0, Math.min(100, Math.round(match))),
    keywords: keywords.slice(0, 40),
    text,
    summary: offer.summary || undefined,
    url: offer.searchFallback ? undefined : offer.applicationUrl || undefined,
    source: offer.source || "Alertes Gmail",
    contract: offer.contract,
    duration: offer.duration,
    deadline: offer.deadline,
    receivedAt: offer.receivedAt,
    gmailStatus: offer.status,
    description: offer.description,
    missions: offer.missions,
    skills: offer.skills,
    prerequisites: offer.prerequisites,
    profile: offer.profile,
    enrichStatus: offer.enrichStatus,
    enrichLevel: offer.enrichLevel,
    enrichOutcome: offer.enrichOutcome,
  };
}

/* ── État de candidature (localStorage) ─────────────────────────── */

const candKeyFor = (email: string) => `cible:gmail-cand:v1:${email.toLowerCase()}`;

export function loadCandidatures(email: string): Record<string, CandidatureState> {
  try {
    const raw = window.localStorage.getItem(candKeyFor(email));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CandidatureState>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCandidature(email: string, state: CandidatureState): CandidatureState {
  const all = loadCandidatures(email);
  const next: CandidatureState = { ...state, updatedAt: new Date().toISOString() };
  all[next.key] = next;
  try {
    window.localStorage.setItem(candKeyFor(email), JSON.stringify(all));
    window.dispatchEvent?.(new CustomEvent("cible:data-changed", { detail: { email } }));
  } catch {
    /* quota — non bloquant */
  }
  return next;
}

export function getCandidature(email: string, key: string): CandidatureState | null {
  return loadCandidatures(email)[key] ?? null;
}

/* ── Pipeline visuel ───────────────────────────────────────────── */

export const CANDIDATURE_STEPS: { status: CandidatureStatus; label: string }[] = [
  { status: "none", label: "Pas encore" },
  { status: "adaptation", label: "En préparation" },
  { status: "letter_ready", label: "Lettre prête" },
  { status: "sent", label: "Candidature envoyée" },
];

const RANK: Record<CandidatureStatus, number> = {
  none: 0,
  adaptation: 1,
  letter_ready: 2,
  sent: 3,
};

export function candidatureRank(status: CandidatureStatus | undefined): number {
  return RANK[status ?? "none"] ?? 0;
}

/** Métadonnées optionnelles passées à Adaptation IA via cible:quick-adapt. */
export type QuickAdaptMeta = {
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  summary?: string;
  keywords?: string[];
  source?: string;
  url?: string;
  /** Score ATS déjà calculé (0-100) — affiché dans Module 03. */
  match?: number;
  present?: string[];
  missing?: string[];
};

/** Écrit le pont vers Adaptation IA (même clé que Matching ATS). */
export function writeQuickAdapt(
  offerText: string,
  selected: string[] = [],
  meta?: QuickAdaptMeta
): void {
  try {
    window.localStorage.setItem(
      "cible:quick-adapt",
      JSON.stringify({
        offerText,
        selected,
        meta,
        at: Date.now(),
        from: "alertes-gmail",
      })
    );
  } catch {
    /* stockage indisponible — la page adaptation affichera ses onglets */
  }
}
