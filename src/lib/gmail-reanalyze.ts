/* ══════════ Réanalyse des anciens mails : identité + bilan + file ══════════
   Un mail d'alerte déjà importé peut être relu en entier (nouvelle détection,
   nouveaux titres, nouveaux liens, nouvel enrichissement). Deux règles
   non négociables s'appliquent à ce moment :

   1. IDENTITÉ — une annonce déjà connue garde sa clé d'affichage. Sinon sa
      candidature, son CV envoyé, ses favoris et sa note partiraient avec
      l'ancien identifiant. On reconnaît une annonce par, dans l'ordre :
      identifiant natif de la plateforme, URL canonique, puis title +
      entreprise + localité. Deux identifiants natifs différents ne fusionnent
      JAMAIS sur une ressemblance de titre ; deux annonces au même titre dans
      deux villes différentes restent distinctes.

   2. CONSERVATION — une annonce présente avant la réanalyse et introuvable
      après n'est pas effacée : elle est conservée et marquée « à vérifier ».
      Rien n'est inventé, rien n'est perdu.

   Module PUR (aucune E/S) : testable directement, sans Gmail ni stockage.
   ═════════════════════════════════════════════════════════════════════════ */

import type { RawOffer } from "./gmail-core";
import { jobKeyOf } from "./offer-links";
import { normalizeLabel, UNKNOWN_COMPANY, UNKNOWN_TITLE } from "./offer-identity";
import { comparableUrl, offerDisplayKey, type DisplayKeyOffer } from "./offer-display-key";

export { comparableUrl, offerDisplayKey };
export type { DisplayKeyOffer };

export type ReanalyzableOffer = RawOffer & {
  /** Clé d'affichage gelée : conservée telle quelle d'une réanalyse à l'autre. */
  stableKey?: string;
  /** Ancienne annonce conservée mais non retrouvée lors de la réanalyse. */
  needsReview?: boolean;
};

export type ReanalyzeReport = {
  /** Offres connues avant la réanalyse. */
  previous: number;
  /** Offres relues dans le mail. */
  detected: number;
  /** Annonces reconnues (identité conservée). */
  kept: number;
  /** Annonces dont le titre, l'entreprise, le lieu ou le lien a été corrigé. */
  corrected: number;
  /** Annonces nouvelles, absentes avant la réanalyse. */
  added: number;
  /** Anciennes annonces introuvables, conservées « à vérifier ». */
  retained: number;
  /** Titres conservés sous « à vérifier » (annonce à contrôler à la main). */
  toVerify: string[];
};

export const EMPTY_REANALYZE_REPORT: ReanalyzeReport = {
  previous: 0,
  detected: 0,
  kept: 0,
  corrected: 0,
  added: 0,
  retained: 0,
  toVerify: [],
};

/** Cumul de deux bilans (file de réanalyse : plusieurs lots). */
export function sumReanalyzeReports(
  first: ReanalyzeReport | null | undefined,
  second: ReanalyzeReport | null | undefined
): ReanalyzeReport {
  const a = first ?? EMPTY_REANALYZE_REPORT;
  const b = second ?? EMPTY_REANALYZE_REPORT;
  return {
    previous: a.previous + b.previous,
    detected: a.detected + b.detected,
    kept: a.kept + b.kept,
    corrected: a.corrected + b.corrected,
    added: a.added + b.added,
    retained: a.retained + b.retained,
    toVerify: [...new Set([...a.toVerify, ...b.toVerify])].slice(0, 50),
  };
}

/** Les trois clés de rapprochement d'une annonce, par ordre de fiabilité. */
export function offerMatchKeys(offer: DisplayKeyOffer): { native: string; url: string; tcl: string } {
  const native = (jobKeyOf(offer.applicationUrl || "") || "").trim();
  const url = comparableUrl(offer.applicationUrl);
  const title = normalizeLabel(offer.title);
  const company = normalizeLabel(offer.company);
  const location = normalizeLabel(offer.location);
  return {
    native,
    url: url ? `u:${url}` : "",
    tcl: title ? `t:${title}|${company}|${location}` : "",
  };
}

const usableTitle = (value?: string): boolean => {
  const label = normalizeLabel(value);
  return !!label && label !== normalizeLabel(UNKNOWN_TITLE) && label !== "stage" && label !== "offre";
};

const usableCompany = (value?: string): boolean => {
  const label = normalizeLabel(value);
  return !!label && label !== normalizeLabel(UNKNOWN_COMPANY);
};

const firstNonEmpty = <T>(preferred: T | undefined | null, fallback: T | undefined | null): T | undefined =>
  (Array.isArray(preferred) ? preferred.length > 0 : !!preferred) ? (preferred as T) : (fallback ?? undefined);

/** Cherche l'ancienne annonce correspondant à une annonce relue. */
function findPrevious(
  previous: readonly ReanalyzableOffer[],
  detected: ReanalyzableOffer,
  used: ReadonlySet<number>
): number {
  const keys = offerMatchKeys(detected);
  const prevKeys = previous.map(offerMatchKeys);
  /* 1 — identifiant natif : la preuve la plus forte. Deux identifiants natifs
     différents interdisent tout autre rapprochement (jamais de fusion). */
  if (keys.native) {
    for (let i = 0; i < previous.length; i++) {
      if (used.has(i)) continue;
      if (prevKeys[i].native && prevKeys[i].native === keys.native) return i;
    }
    for (let i = 0; i < previous.length; i++) {
      if (used.has(i)) continue;
      if (prevKeys[i].native) return -1; /* annonce native différente : pas de fusion */
    }
  }
  /* 2 — URL canonique. */
  if (keys.url) {
    for (let i = 0; i < previous.length; i++) {
      if (used.has(i)) continue;
      if (prevKeys[i].url && prevKeys[i].url === keys.url) return i;
    }
  }
  /* 3 — titre + entreprise + localité : le titre doit être établi des deux
     côtés, et un champ connu des deux côtés doit CONCORDER. « Concordance »
     signifie jamais « deux champs non vides » : deux annonces au même titre
     dans deux villes différentes restent distinctes (même logique pour
     l'entreprise). Un champ vide d'un côté n'empêche pas la correction. */
  if (!keys.tcl) return -1;
  const agrees = (first: unknown, second: unknown): boolean => {
    const a = normalizeLabel(first);
    const b = normalizeLabel(second);
    if (!a || !b) return true; /* inconnu d'un côté : rien à contredire */
    return a === b;
  };
  for (let i = 0; i < previous.length; i++) {
    if (used.has(i)) continue;
    const candidate = previous[i];
    const ck = prevKeys[i];
    if (!ck.tcl) continue;
    if (ck.tcl === keys.tcl) return i;
    if (!usableTitle(candidate.title) || !usableTitle(detected.title)) continue;
    if (normalizeLabel(candidate.title) !== normalizeLabel(detected.title)) continue;
    if (ck.native && keys.native && ck.native !== keys.native) continue;
    if (!agrees(candidate.location, detected.location)) continue;
    if (!agrees(candidate.company, detected.company)) continue;
    return i;
  }
  return -1;
}

/** Fusionne une annonce reconnue : le neuf prime, l'ancien comble les trous. */
function mergePair(previous: ReanalyzableOffer, detected: ReanalyzableOffer): ReanalyzableOffer {
  const title = usableTitle(detected.title) ? detected.title : previous.title || detected.title;
  const company = usableCompany(detected.company) ? detected.company : previous.company || detected.company;
  const location = firstNonEmpty(detected.location, previous.location) || "";
  /* Un lien de recherche n'est jamais conservé à la place d'un vrai lien : on
     garde le lien réel déjà connu tant que la réanalyse n'en apporte pas un. */
  const detectedUrl = detected.searchFallback ? "" : detected.applicationUrl;
  const applicationUrl = detectedUrl || previous.applicationUrl || "";
  const searchFallback = !applicationUrl && detected.searchFallback === true;
  const enriched = detected.enrichStatus === "ok" || detected.enrichStatus === "partial";
  return {
    ...previous,
    ...detected,
    title,
    company,
    location,
    applicationUrl,
    ...(searchFallback ? { searchFallback: true } : { searchFallback: detected.searchFallback === true }),
    contract: firstNonEmpty(detected.contract, previous.contract) || "",
    duration: firstNonEmpty(detected.duration, previous.duration) || "",
    deadline: firstNonEmpty(detected.deadline, previous.deadline) || "",
    salary: firstNonEmpty(detected.salary, previous.salary),
    description: firstNonEmpty(detected.description, previous.description) || "",
    summary: firstNonEmpty(detected.summary, previous.summary),
    profile: firstNonEmpty(detected.profile, previous.profile),
    applicationInfo: firstNonEmpty(detected.applicationInfo, previous.applicationInfo),
    prerequisites: firstNonEmpty(detected.prerequisites, previous.prerequisites),
    skills: firstNonEmpty(detected.skills, previous.skills) || [],
    missions: firstNonEmpty(detected.missions, previous.missions),
    keywords: firstNonEmpty(detected.keywords, previous.keywords),
    snippet: firstNonEmpty(detected.snippet, previous.snippet),
    anchorText: firstNonEmpty(detected.anchorText, previous.anchorText),
    sourceUrl: firstNonEmpty(detected.sourceUrl, previous.sourceUrl),
    /* État d'enrichissement : on ne rétrograde jamais une fiche enrichie. */
    enrichStatus: enriched ? detected.enrichStatus : previous.enrichStatus ?? detected.enrichStatus,
    enrichLevel: enriched ? detected.enrichLevel : previous.enrichLevel ?? detected.enrichLevel,
    enrichOutcome: enriched ? detected.enrichOutcome : previous.enrichOutcome ?? detected.enrichOutcome,
    enrichReason: enriched ? detected.enrichReason : previous.enrichReason ?? detected.enrichReason,
    /* Identifiant stable : la clé de l'annonce déjà connue, définitivement. */
    stableKey: previous.stableKey || offerDisplayKey(previous),
    needsReview: false,
  };
}

/** Une réanalyse a-t-elle apporté une correction visible ? */
function changed(previous: ReanalyzableOffer, merged: ReanalyzableOffer): boolean {
  return (
    normalizeLabel(previous.title) !== normalizeLabel(merged.title) ||
    normalizeLabel(previous.company) !== normalizeLabel(merged.company) ||
    normalizeLabel(previous.location) !== normalizeLabel(merged.location) ||
    comparableUrl(previous.applicationUrl) !== comparableUrl(merged.applicationUrl)
  );
}

export function mergeReanalyzedOffers(
  previous: readonly ReanalyzableOffer[],
  detected: readonly ReanalyzableOffer[]
): { offers: ReanalyzableOffer[]; report: ReanalyzeReport } {
  const used = new Set<number>();
  const offers: ReanalyzableOffer[] = [];
  let kept = 0;
  let corrected = 0;
  let added = 0;

  for (const offer of detected) {
    const index = findPrevious(previous, offer, used);
    if (index < 0) {
      offers.push({ ...offer, needsReview: false });
      added++;
      continue;
    }
    used.add(index);
    const merged = mergePair(previous[index], offer);
    kept++;
    if (changed(previous[index], merged)) corrected++;
    offers.push(merged);
  }

  let retained = 0;
  const toVerify: string[] = [];
  for (let i = 0; i < previous.length; i++) {
    if (used.has(i)) continue;
    const stale = previous[i];
    retained++;
    offers.push({ ...stale, needsReview: true });
    if (!usableTitle(stale.title)) toVerify.push(offerDisplayKey(stale));
  }

  return {
    offers,
    report: {
      previous: previous.length,
      detected: detected.length,
      kept,
      corrected,
      added,
      retained,
      toVerify: [...new Set(toVerify)].slice(0, 50),
    },
  };
}

/* ── File de réanalyse : progression réelle et reprise ─────────────────── */

/** Lot suivant d'une file (ids dans l'ordre, curseur persistant). */
export function nextReanalyzeBatch(
  ids: readonly string[],
  cursor: number,
  size: number
): { start: number; batch: string[]; remaining: number; done: boolean } {
  const start = Math.max(0, Math.min(Math.trunc(cursor) || 0, ids.length));
  const batch = ids.slice(start, start + Math.max(1, Math.trunc(size) || 1));
  const next = start + batch.length;
  return { start, batch, remaining: Math.max(0, ids.length - next), done: start >= ids.length };
}

/** Nouveau curseur : premier e-mail du lot réellement réanalysé manquant.
    Les e-mails non traités (budget/deadline) restent en tête de file au lieu
    d'être sautés — jamais de retraitement en boucle des mêmes premiers mails. */
export function advanceReanalyzeCursor(
  ids: readonly string[],
  start: number,
  processed: Iterable<string>
): number {
  const done = new Set(processed);
  let cursor = Math.max(0, Math.min(Math.trunc(start) || 0, ids.length));
  while (cursor < ids.length && done.has(ids[cursor])) cursor++;
  return cursor;
}
