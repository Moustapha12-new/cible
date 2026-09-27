"use client";

/* Pont Alertes Gmail → Matching ATS / Adaptation CV / Lettre / Candidature.
   Helpers purs côté client : conversion d'offre, clé d'identité, état de
   candidature persistant (localStorage), sans réécrire les modules IA. */

import type { DetectedOffer } from "@/lib/data";

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
};

/* ── Clé d'identité (match dashboard ↔ page détail) ────────────── */

/** Clé stable d'une offre Gmail : URL canonique si présente, sinon
    titre|entreprise|localité (même logique que dedupKeyOf / urlKey). */
export function offerBridgeKey(offer: OfferLike): string {
  const url = (offer.applicationUrl || "").trim().toLowerCase();
  if (url) return `u:${url}`;
  const t = [
    (offer.title || "").trim().toLowerCase(),
    (offer.company || "").trim().toLowerCase(),
    (offer.location || "").trim().toLowerCase(),
  ].join("|");
  return `t:${t}`;
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
    offer.title,
    offer.company,
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
    Adaptation et Lettres la voient sans réécrire ces modules. */
export function offerToDetectedOffer(offer: OfferLike, match = 0): DetectedOffer {
  const text = offerToOfferText(offer);
  return {
    id: `gmail-${offerBridgeKey(offer).slice(0, 48).replace(/[^\w:-]+/g, "_")}`,
    title: offer.title || "Offre Gmail",
    company: offer.company || "Entreprise non précisée",
    location: offer.location || "",
    salary: offer.salary || "",
    match: Math.max(0, Math.min(100, Math.round(match))),
    keywords: (offer.keywords?.length ? offer.keywords : offer.skills || []).slice(0, 8),
    text,
    summary: offer.summary || undefined,
    url: offer.applicationUrl || undefined,
    source: offer.source || "Alertes Gmail",
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
