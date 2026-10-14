/* ════════════════ Enrichissement L0–L3, honnête et traçable ════════════════
   Chantier 2 — Jalon B. Un e-mail « traité » n'est PAS synonyme de « fiche
   enrichie ». Ce module modélise le NIVEAU réellement atteint par chaque offre
   et attache une provenance par champ, sans jamais inventer de description.

   Niveaux :
   · L0 « email-only »  — données fiables du mail (titre, entreprise, lien).
   · L1 « destination » — l'URL individuelle est accessible (fiche cible ouverte,
                          pas une page de recherche).
   · L2 « html »        — JobPosting / HTML principal analysé (missions, outils…).
   · L3 « employer »    — lien employeur comparé, meilleure description prouvée.

   Issue de page : chaque échec (403, login, CAPTCHA, 404, 429, timeout) a un
   état DISTINCT. Un 403 n'est JAMAIS une « expiration » déduite. Aucune donnée
   absente du texte source n'est produite : `unknown`, pas `false`. */

export type EnrichLevel = "L0" | "L1" | "L2" | "L3";

export const ENRICH_LEVEL_ORDER: Record<EnrichLevel, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

/** Issue honnête d'un chargement de fiche. */
export type PageOutcome =
  | { kind: "ok"; httpStatus: number }
  | { kind: "http_error"; httpStatus: number }
  | { kind: "login_required" }
  | { kind: "captcha" }
  | { kind: "not_found"; httpStatus: number }
  | { kind: "rate_limited"; httpStatus: number }
  | { kind: "timeout" }
  | { kind: "network" }
  | { kind: "blocked" };

/** État d'enrichissement affiché (badge UI) — jamais une fausse réussite. */
export type EnrichBadge =
  | { level: EnrichLevel; label: "Email uniquement"; honest: true }
  | { level: EnrichLevel; label: "Fiche analysée"; honest: true }
  | { level: EnrichLevel; label: "Bloquée / login"; honest: true }
  | { level: EnrichLevel; label: "À revoir"; honest: true }
  | { level: EnrichLevel; label: "Expirée vérifiée"; honest: true };

/** Provenance d'un champ enrichi : d'où vient la valeur, à quel niveau. */
export type FieldProvenance = {
  field: string;
  /** Niveau L0–L3 où la valeur a été obtenue. */
  sourceLevel: EnrichLevel;
  /** URL de la fiche qui a fourni la valeur (preuve). */
  sourceUrl?: string;
  /** Extrait textuel exact attestant la valeur (vérifié contre la source). */
  evidenceSnippet?: string;
  /** Modèle/analyse : `explicit` = écrit tel quel ; `inferred` = déduit. */
  origin: "explicit" | "inferred" | "email";
  confidence: number;
};

/** Champs enrichis d'une fiche, chacun avec sa provenance. */
export type EnrichedFieldMap = Record<string, FieldProvenance>;

/* ── Classification honnête d'une issue de page ─────────────────── */

/** Mappe une réponse/erreur de fetch vers une issue distincte.
    Aucune déduction « expirée » d'un simple 403/404. */
export function classifyPageOutcome(input: {
  httpStatus?: number;
  errorCode?: string;
  timedOut?: boolean;
  bodyText?: string;
}): PageOutcome {
  const { httpStatus, errorCode, timedOut, bodyText } = input;
  if (timedOut) return { kind: "timeout" };
  const code = (errorCode || "").toLowerCase();
  if (/enotfound|econnrefused|econnreset|certificate|dns/.test(code)) return { kind: "network" };
  const text = (bodyText || "").toLowerCase();
  if (/captcha|recaptcha|challenge|verify you are human|cloudflare/.test(text)) return { kind: "captcha" };
  if (/sign in|log in|connexion required|authentifiez|connectez-vous|sso|login\?/.test(text))
    return { kind: "login_required" };
  if (httpStatus === undefined) return { kind: "network" };
  if (httpStatus >= 200 && httpStatus < 300) return { kind: "ok", httpStatus };
  if (httpStatus === 404 || httpStatus === 410) return { kind: "not_found", httpStatus };
  if (httpStatus === 429) return { kind: "rate_limited", httpStatus };
  if (httpStatus === 401 || httpStatus === 403) {
    // 401 → login ; 403 → anti-robot/blocage (JAMAIS « expirée »).
    return httpStatus === 401 ? { kind: "login_required" } : { kind: "blocked" };
  }
  return { kind: "http_error", httpStatus };
}

/** Badge d'affichage honnête pour une issue + un niveau atteint. */
export function enrichBadgeFor(outcome: PageOutcome, level: EnrichLevel): EnrichBadge {
  switch (outcome.kind) {
    case "ok":
      return { level, label: level === "L0" ? "Email uniquement" : "Fiche analysée", honest: true };
    case "login_required":
    case "captcha":
    case "blocked":
      return { level, label: "Bloquée / login", honest: true };
    case "not_found":
      // 404/410 attesté : expiration VÉRIFIÉE (pas déduite d'un 403).
      return { level, label: "Expirée vérifiée", honest: true };
    case "rate_limited":
    case "timeout":
    case "network":
    case "http_error":
    default:
      return { level, label: "À revoir", honest: true };
  }
}

/** Niveau atteint selon l'issue : inatteignable → plafonné à L0. */
export function maxLevelFor(outcome: PageOutcome): EnrichLevel {
  switch (outcome.kind) {
    case "ok":
      return "L2"; // L3 nécessite un lien employeur séparé.
    default:
      return "L0";
  }
}

/* ── Vérification anti-invention ────────────────────────────────── */

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Vérifie qu'un `evidenceSnippet` existe RÉELLEMENT dans le texte source.
    Retourne false si l'extrait est inventé ou tronqué à rien. */
export function evidenceMatchesSource(
  evidenceSnippet: string | undefined,
  sourceText: string
): boolean {
  if (!evidenceSnippet) return false;
  const ev = norm(evidenceSnippet);
  if (ev.length < 8) return false;
  return norm(sourceText).includes(ev);
}

/** Filtre les provenances : toute valeur sans preuve textuelle est écartée
    (jamais présentée comme attestée). Les déductions `inferred` restent
    séparées du texte explicitement écrit. */
export function pruneUnprovenFields(
  provenances: EnrichedFieldMap,
  sourceText: string
): { kept: EnrichedFieldMap; rejected: string[] } {
  const kept: EnrichedFieldMap = {};
  const rejected: string[] = [];
  for (const [field, prov] of Object.entries(provenances)) {
    // Les déductions `inferred` et les données `email` n'exigent pas de snippet
    // de page (elles portent leur propre origine) ; les champs `explicit`
    // doivent être attestés par le texte source.
    if (prov.origin === "explicit") {
      if (evidenceMatchesSource(prov.evidenceSnippet, sourceText)) kept[field] = prov;
      else rejected.push(field);
    } else {
      kept[field] = prov;
    }
  }
  return { kept, rejected };
}

/* ── Reconstruction d'une provenance par niveau ─────────────────── */

/** Provenance par défaut pour les données issues du seul e-mail (L0). */
export function emailProvenance(fields: string[], sourceUrl?: string): EnrichedFieldMap {
  const map: EnrichedFieldMap = {};
  for (const field of fields) {
    map[field] = {
      field,
      sourceLevel: "L0",
      ...(sourceUrl ? { sourceUrl } : {}),
      origin: "email",
      confidence: 0.6,
    };
  }
  return map;
}

/** Fusionne une provenance de niveau supérieur par-dessus le L0, en conservant
    la meilleure version connue si le niveau supérieur échoue partiellement. */
export function mergeProvenance(
  base: EnrichedFieldMap,
  higher: EnrichedFieldMap
): EnrichedFieldMap {
  const out: EnrichedFieldMap = { ...base };
  for (const [field, prov] of Object.entries(higher)) {
    const prev = out[field];
    if (!prev || ENRICH_LEVEL_ORDER[prov.sourceLevel] > ENRICH_LEVEL_ORDER[prev.sourceLevel]) {
      out[field] = prov;
    }
  }
  return out;
}

/** Résumé de niveau pour l'UI : niveau global + provenance par champ. */
export function levelSummary(provenances: EnrichedFieldMap): {
  maxLevel: EnrichLevel;
  explicit: number;
  inferred: number;
  fromEmail: number;
} {
  let maxLevel: EnrichLevel = "L0";
  let explicit = 0;
  let inferred = 0;
  let fromEmail = 0;
  for (const prov of Object.values(provenances)) {
    if (ENRICH_LEVEL_ORDER[prov.sourceLevel] > ENRICH_LEVEL_ORDER[maxLevel])
      maxLevel = prov.sourceLevel;
    if (prov.origin === "explicit") explicit += 1;
    else if (prov.origin === "inferred") inferred += 1;
    else fromEmail += 1;
  }
  return { maxLevel, explicit, inferred, fromEmail };
}
