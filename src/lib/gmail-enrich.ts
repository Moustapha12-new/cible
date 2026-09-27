/* ══════════════════ Enrichissement des offres Gmail ══════════════════
   Module 2 — 1 appel IA par offre, cache serveur, isolation par offre.
   Types + helpers purs uniquement : l'appel IA vit dans gmail-core
   (askJsonRaw résilient) pour éviter un cycle de dépendances. */

import { createHash } from "node:crypto";

export type EnrichStatus = "none" | "ok" | "partial" | "blocked" | "skipped";

export type EnrichedOfferData = {
  title: string;
  company: string;
  location: string;
  contract: string;
  duration: string;
  deadline: string;
  salary: string;
  skills: string[];
  /** Mots-clés techniques (ATS) extraits de la page. */
  keywords: string[];
  missions: string[];
  /** Prérequis / profil exigé, détaillés. */
  prerequisites: string[];
  profile: string;
  description: string;
  /** Résumé fidèle de l'offre en 3 phrases maximum (badge + aperçu carte). */
  summary?: string;
  /** Modalités de candidature (email, formulaire, étapes…). */
  applicationInfo: string;
  applicationUrl: string;
  source: string;
  /** Verb d'action principal du poste (ex: "développer", "manager", "analyser"). */
  verbAction: string;
  /** Diplôme exigé (ex: "Licence", "Master", "Bac+5"). */
  diploma: string;
  /** Langues exigées (ex: "Français, Anglais", "Espagnol courant"). */
  langues: string[];
};

export type EnrichResult = {
  enrichStatus: EnrichStatus;
  enrichReason: string;
  enrichedAt?: string;
  data?: Partial<EnrichedOfferData>;
};

export type EnrichCandidate = {
  id: string;
  title: string;
  source: string;
  applicationUrl: string;
  emailText: string;
};

/** Clé de cache serveur : gmail:enrich:v3:<sha1(applicationUrl)>
    v3 : URLs nettoyées (cleanJobUrl) + comparaison enrich par clé plateforme. */
export function enrichCacheKey(applicationUrl: string): string {
  const url = (applicationUrl || "").trim();
  const hash = createHash("sha1").update(url).digest("hex");
  return `gmail:enrich:v3:${hash}`;
}

/** true si la ligne IA contient au moins un champ exploitable. */
export function isUsefulEnrichRow(
  row: Partial<EnrichedOfferData> | null | undefined
): boolean {
  if (!row || typeof row !== "object") return false;
  const keys = [
    "title", "company", "location", "contract", "duration", "deadline",
    "salary", "skills", "keywords", "missions", "prerequisites",
    "profile", "description", "summary", "applicationInfo",
  ] as const;
  return keys.some((k) => {
    const v = (row as Record<string, unknown>)[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
}

/** Ne met en cache que les résultats stables : ni skipped (budget), ni none,
    ni blocked (P1-4) — un anti-robot peut être temporaire, la reprise se fait
    via l'action relaunch_offer, jamais une exclusion figée à vie. */
export function isCacheableEnrichResult(r: EnrichResult): boolean {
  return (
    r.enrichStatus !== "skipped" &&
    r.enrichStatus !== "none" &&
    r.enrichStatus !== "blocked"
  );
}
