/* ═══════════════════════════════════════════════════════════════════
   gmail-core — refonte Module 1 « Alertes Gmail »
   · fetchLabelEmails / extractOfferLinks : conservés (ré-export)
   · askJson : NOUVEAU — backoff exponentiel 429/503 + recovery JSON
   · Traitement email-unique (pas de segmentation sauf >40k)
   · Checkpoints par e-mail (gmail:processed:<id>)
   RÈGLE D'OR : une offre = un objet atomique ; l'IA ne renvoie jamais
   d'URL absente des données réelles du mail (guards matchRealUrl).
   ═══════════════════════════════════════════════════════════════════ */

import { extractOfferLinks, isolateBlock, extractAnchorMap, canonicalizeOfferUrl, cleanJobUrl, jobKeyOf, decodeIndeedCtsTarget, isIndeedChromeTargetUrl, isIndeedOpaqueUrl, isValidIndeedJk, isChromeTrackingTitle } from "@/lib/offer-links";
import {
  fetchLabelEmails,
  listLabelIds,
  storeGet,
  storeSet,
  getGeminiHtmlRepresentation,
  GMAIL_LABEL,
  type ParsedEmail,
} from "@/lib/gmail-server";
import { enrichCacheKey, isUsefulEnrichRow, isCacheableEnrichResult, type EnrichStatus, type EnrichResult, type EnrichedOfferData } from "@/lib/gmail-enrich";
import { repairCheckpoint } from "@/lib/text-repair";
import { stampAnalysis } from "@/lib/gmail-dashboard";
import type { DetectSummary, AnchorEntry } from "@/lib/offer-links";

export { stampAnalysis };

export { extractOfferLinks, isolateBlock, extractAnchorMap, fetchLabelEmails, GMAIL_LABEL, enrichCacheKey };
export type { ParsedEmail, DetectSummary, AnchorEntry, EnrichStatus, EnrichResult };

/** Canonicalise applicationUrl au chargement (checkpoints antérieurs au fix
    mergeOffers) — sourceUrl (preuve) reste l'URL brute du mail. P0-5 : partagé
    par GET /api/gmail/dashboard et GET /api/gmail/offer-detail. */
export function canonicalizeOffers(offers: RawOffer[]): RawOffer[] {
  if (!Array.isArray(offers) || offers.length === 0) return offers ?? [];
  return offers.map((o) => {
    if (!o?.applicationUrl || o.searchFallback) return o;
    const c = canonicalizeOfferUrl(o.applicationUrl);
    return c && c !== o.applicationUrl ? { ...o, applicationUrl: c } : o;
  });
}

/* ── Types ─────────────────────────────────────────────────────── */

export type CheckpointStatus = "pending" | "done" | "error" | "pending_retry";

export type RawOffer = {
  title: string;
  company: string;
  location: string;
  contract: string;
  duration: string;
  deadline: string;
  salary?: string;
  skills: string[];
  missions?: string[];
  profile?: string;
  description: string;
  /** Résumé 3 phrases max extrait pendant l'enrichissement. */
  summary?: string;
  applicationUrl: string;
  source: string;
  sourceUrl?: string;
  anchorText?: string;
  snippet?: string;
  enrichStatus?: EnrichStatus;
  enrichReason?: string;
  enrichedAt?: string;
  searchFallback?: boolean;
  keywords?: string[];
  prerequisites?: string[];
  applicationInfo?: string;
  /** Anti-doublon tardif (calculé à l'import, jamais à la détection). */
  importStatus?: "nouvelle" | "doublon";
  importReason?: string;
  /** P1-6 : clés anti-doublon gelées AU MOMENT de la détection (avant enrich,
      qui réécrit titre/entreprise/localité/URL). Prioritaires côté classify. */
  dedupUrlKey?: string;
  dedupTclKey?: string;
  /** P0-3 : redirection Indeed opaque non résoluble hors ligne (engage/cts/
      pagead) — l'UI affiche « Lien non direct ». absent/false = lien direct. */
  indirect?: boolean;
};

export type EmailCheckpoint = {
  status: CheckpointStatus;
  offers: RawOffer[];
  error?: string;
  at: string;
  retries: number;
  recoveryUsed?: boolean;
  detectedByCode?: number;
  summary?: DetectSummary;
  isOffer?: boolean;
  reason?: string;
  /** En-têtes d'affichage (skip messages.get full au prochain sync). */
  subject?: string;
  from?: string;
  receivedAt?: string;
};

export type DetectionMethod = "code" | "ia" | "code+ia" | "none";

/* ── P0-2 : état d'analyse, distinct du résultat ───────────────────
   analysisState = dimension PROCESSUS (l'e-mail a-t-il été analysé ?,
   et sinon dans quelle file est-il ?) ; analysisResult = dimension
   CONTENU (que l'analyse a-t-elle trouvé ?), null tant que non analysé.
   Les 5 états affichés en UI sont la combinaison des deux.
   Les helpers dérivés vivent dans gmail-dashboard (pur, client-safe) ;
   core importe stampAnalysis pour ses propres chemins de production. */
export type EmailAnalysisState = "to_sync" | "analyzed" | "retry" | "error";
export type EmailAnalysisResult = "offer" | "none" | null;

export type ProcessedEmail = {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  isOffer: boolean;
  reason: string;
  finalStatus: "detected" | "no_offer" | "analyze_error";
  /** P0-2 : état d'analyse (processus) — dérivé si absent. */
  analysisState?: EmailAnalysisState;
  /** P0-2 : résultat d'analyse (contenu) — null tant que non analysé. */
  analysisResult?: EmailAnalysisResult;
  recoveryUsed?: boolean;
  fromCache?: boolean;
  detectedByCode?: number;
  detSummary?: DetectSummary;
  offers: RawOffer[];
  fromCheckpoint?: boolean;
  /* Observabilité Module 2 (par e-mail) */
  textLen?: number;
  hasHtml?: boolean;
  linksCount?: number;
  anchorsCount?: number;
  detectedOffers?: { title: string; company: string; applicationUrl: string }[];
  detectionMethod?: DetectionMethod;
  error?: string;
  checkpoint?: {
    status: CheckpointStatus;
    retries: number;
    at: string;
    recoveryUsed?: boolean;
  };
};

export type SyncSummaryGlobal = {
  emailsRead: number;
  emailsProcessed: number;
  totalOffersDetected: number;
  newOffersImported: number;
  duplicatesIgnored: number;
  noOfferVerified: number;
  errors: number;
  pendingRetry: number;
  /** P0-2 : e-mails jamais traités (checkpoint absent ou status pending). */
  pending: number;
  lastSync: string;
};

export type SyncOutcome = {
  labelFound: boolean;
  label: string;
  emailsRead: number;
  totalInLabel: number;
  emails: ProcessedEmail[];
  detected: number;
  checkpointStats: {
    done: number;
    processedThisRun: number;
    skippedDone: number;
    errors: number;
    pendingRetry: number;
  };
  summary: SyncSummaryGlobal;
  /** Messages listés mais non lus (fetch échoué) — jamais silencieux. */
  fetchSkipped?: number;
  fetchErrors?: string[];
  /** Libellé listé au-delà du plafond → « 500 premiers sur ~N ». */
  truncated?: boolean;
  /** Run interrompu par la deadline murale (avant maxDuration). */
  interrupted?: boolean;
  /** E-mails planifiés non traités (deadline ou budget maxProcess). */
  remaining?: number;
  /** Nouveaux e-mails reçus PENDANT le run (watermark de fin). */
  arrivedDuringRun?: number;
  /** Enrichissement sauté faute de temps restant (reprise au run suivant). */
  enrichDeferred?: boolean;
  /** P1-4 : compteurs d'une relance ciblée d'enrichissement (relaunch_offer). */
  enrichRetry?: EnrichCounts;
};

export type GmailAiResult = {
  results?: {
    id: string;
    isOffer?: boolean;
    reason?: string;
    offers?: unknown[];
  }[];
};

export type AskJsonOk<T> = { data: T; partial: false };
export type AskJsonPartial<T> = { data: T; partial: true };
export type AskJsonResult<T> = AskJsonOk<T> | AskJsonPartial<T>;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type SleepLike = (ms: number) => Promise<void>;

/* ── Constantes ────────────────────────────────────────────────── */

export const MAX_EMAIL_RETRIES = 3;
/** Seuil au-delà duquel un e-mail complet est découpé en 2 appels IA. */
export const AI_EMAIL_CHAR_LIMIT = 40_000;
export const BACKOFF_MS = [1_000, 2_000, 4_000] as const;
export const defaultSleep: SleepLike = (ms) => new Promise((r) => setTimeout(r, ms));

const JOB_DOMAINS = [
  "indeed", "linkedin", "jobteaser", "hellowork", "apec", "france-travail",
  "welcometothejungle", "letudiant", "monster", "regionjob", "glassdoor",
  "jobijoba", "meet-jobs", "jobstreet", "cadremploi", "meteojob",
];

const TRACKER_RE =
  /^(utm_.*|fbclid|gclid|msclkid|mc_[a-z]+|igsh|si|ref|ref_|spm|hs_.*|woosmap)$/i;

/* ── Checkpoints ───────────────────────────────────────────────── */

const checkpointKey = (emailId: string) => `gmail:processed:${emailId}`;

/* ── Cache checkpoints par run/requête (P1-3) ───────────────────
   Map write-through : à l'intérieur d'un run sync (ou d'une requête
   dashboard), chaque checkpoint n'est lu/écrit qu'une fois — ~856
   storeGet/storeSet par sync → ~267. Inactif par défaut : begin()
   (re)crée la Map, end() la libère (try/finally côté appelant). */
let cpMem: Map<string, EmailCheckpoint | null> | null = null;

export function beginCheckpointCache(): void {
  cpMem = new Map();
}

export function endCheckpointCache(): void {
  cpMem = null;
}

function cpCopy(j: EmailCheckpoint): EmailCheckpoint {
  return { ...j, offers: Array.isArray(j.offers) ? [...j.offers] : [], retries: j.retries ?? 0 };
}

export async function loadCheckpoint(emailId: string): Promise<EmailCheckpoint | null> {
  if (cpMem && cpMem.has(emailId)) {
    const hit = cpMem.get(emailId) ?? null;
    return hit ? cpCopy(hit) : null;
  }
  try {
    const raw = await storeGet(checkpointKey(emailId));
    if (!raw) {
      if (cpMem) cpMem.set(emailId, null);
      return null;
    }
    const j = JSON.parse(raw) as EmailCheckpoint;
    if (!j || typeof j !== "object" || !j.status) {
      if (cpMem) cpMem.set(emailId, null);
      return null;
    }
    /* P0-1 : réparation heuristique (mojibake latin1 → UTF-8 + entités
       numériques résiduelles) appliquée à TOUTE lecture. Si le texte reste
       corrompu (octets d'origine perdus) alors que l'e-mail était « done »,
       on force la re-synchronisation au lieu d'afficher du texte illisible. */
    const { value: fixed, corrupted } = repairCheckpoint(j);
    const cp = cpCopy(fixed);
    if (corrupted && cp.status === "done") {
      cp.status = "pending";
      cp.reason = "Texte corrompu (encodage) — re-synchronisation forcée";
    }
    /* P0-3 : migration des offres Indeed stockées avant applyIndeedTargets
       (cts → cible décodée, chrome éjecté, opaques marquées indirect). */
    cp.offers = migrateIndeedOffers(cp.offers ?? []);
    if (cpMem) cpMem.set(emailId, cpCopy(cp));
    return cp;
  } catch {
    /* pas de mise en cache sur erreur transitoire */
    return null;
  }
}

export async function saveCheckpoint(emailId: string, cp: EmailCheckpoint): Promise<void> {
  try {
    const stored = { ...cp, at: new Date().toISOString() };
    await storeSet(checkpointKey(emailId), JSON.stringify(stored));
    if (cpMem) cpMem.set(emailId, cpCopy(stored));
  } catch {
    /* best-effort : un checkpoint non écrit ne bloque pas le sync */
  }
}

/** true si l'e-mail doit être (re)traité à ce sync. */
export function shouldProcessEmail(cp: EmailCheckpoint | null): boolean {
  if (!cp) return true;
  if (cp.status === "done") return false;
  if (cp.status === "pending" || cp.status === "pending_retry") return true;
  if (cp.status === "error") return (cp.retries ?? 0) < MAX_EMAIL_RETRIES;
  return false;
}

/** Passe le checkpoint à pending_retry si 429 résiduel, sinon error++. */
export function classifyFailure(
  prev: EmailCheckpoint | null,
  errorMessage: string
): EmailCheckpoint {
  const retries = (prev?.retries ?? 0) + 1;
  const isRateLimit = /429|rate.?limit|quota/i.test(errorMessage);
  const status: CheckpointStatus =
    isRateLimit && retries <= MAX_EMAIL_RETRIES ? "pending_retry" : "error";
  return {
    status,
    offers: prev?.offers ?? [],
    error: errorMessage.slice(0, 500),
    at: new Date().toISOString(),
    retries,
    recoveryUsed: prev?.recoveryUsed,
    detectedByCode: prev?.detectedByCode,
    summary: prev?.summary,
    isOffer: false,
    reason: "Erreur d'analyse — relance la synchronisation",
    subject: prev?.subject,
    from: prev?.from,
    receivedAt: prev?.receivedAt,
  };
}

/* ── URL guards (jamais d'URL inventée) ────────────────────────── */

export function urlMatchKey(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    let path = u.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      /* encodage malformé */
    }
    path = path.replace(/\/+$/, "");
    const keep: string[] = [];
    for (const [k, v] of u.searchParams.entries()) {
      if (!TRACKER_RE.test(k)) keep.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
    keep.sort();
    const qs = keep.length ? `?${keep.join("&")}` : "";
    return `//${host}${path}${qs}`;
  } catch {
    return s.toLowerCase();
  }
}

export function matchRealUrl(candidate: string, realUrls: readonly string[]): string | null {
  const c = (candidate || "").trim();
  if (!c) return null;
  for (const r of realUrls) {
    if (r && r.trim() === c) return r;
  }
  /* Comparaison par CLÉ plateforme (li:<id> / in:<jk>…) : ponte l'URL canonique
     de l'offre et l'URL brute de tracking du mail (/comm/jobs/view… vs
     /jobs/view…) — c'est cette étape qui empêche l'offre d'être écartée de
     l'enrichissement faute de correspondance littérale. */
  const pk = jobKeyOf(c);
  if (pk) {
    for (const r of realUrls) {
      if (r && jobKeyOf(r) === pk) return r;
    }
  }
  const ck = urlMatchKey(c);
  if (!ck) return null;
  for (const r of realUrls) {
    if (r && urlMatchKey(r) === ck) return r;
  }
  return null;
}

export function searchFallbackUrl(title: string, company: string, location: string): string {
  const parts = [company, title, location].map((s) => (s || "").trim()).filter(Boolean);
  if (parts.length === 0) return "";
  return `https://www.google.com/search?q=${parts.map((s) => encodeURIComponent(s)).join("+")}+emploi`;
}

export function isSearchFallbackUrl(url: string): boolean {
  return /^https:\/\/www\.google\.com\/search/i.test(url.trim());
}

/* ── Sanitizers ────────────────────────────────────────────────── */

const asStr = (v: unknown): string => (typeof v === "string" ? v : "");
const asOptStr = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v : undefined;
const asStrList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];

export function sanitizeAiOffer(raw: unknown): RawOffer | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return {
    title: asStr(r.title),
    company: asStr(r.company),
    location: asStr(r.location),
    contract: asStr(r.contract),
    duration: asStr(r.duration),
    deadline: asStr(r.deadline),
    salary: asOptStr(r.salary),
    skills: asStrList(r.skills),
    missions: Array.isArray(r.missions) ? asStrList(r.missions) : undefined,
    profile: asOptStr(r.profile),
    description: asStr(r.description),
    applicationUrl: asStr(r.applicationUrl),
    source: asStr(r.source),
  };
}

export function sanitizeAiOffers(list: unknown): RawOffer[] {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeAiOffer).filter((o): o is RawOffer => o !== null);
}

export function dedupKeyOf(o: RawOffer): string {
  return (
    (o.applicationUrl || "").trim().toLowerCase() ||
    `${o.title}|${o.company}|${o.location}`.trim().toLowerCase()
  );
}

export function looksLikeJobAlert(input: {
  subject?: string;
  from?: string;
  links?: string[];
}): boolean {
  const blob = `${input.from || ""} ${input.subject || ""} ${(input.links ?? []).join(" ")}`.toLowerCase();
  if (JOB_DOMAINS.some((d) => blob.includes(d))) return true;
  const subject = (input.subject || "").toLowerCase();
  if (/offre|stage|emploi|job|alerte|recrutement|alternance|internship|candidature/.test(subject)) {
    return true;
  }
  return (input.links?.length ?? 0) >= 3;
}

/* ── Recovery JSON (réponse tronquée / malformée) ──────────────── */

/** Nettoie les fences ```json …``` et tente JSON.parse strict. */
function tryParse(text: string): unknown | null {
  const clean = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!clean) return null;
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

/**
 * Extrait la première structure JSON valide d'une réponse potentiellement
 * tronquée. Stratégie :
 * 1. parse direct
 * 2. premier `{` … essais de fermeture progressive (dernier `}` viable)
 * 3. complétion des crochets/aces ouverts (recouvre JSON coupé en pleine liste)
 * Retourne null si aucun objet valide n'est trouvable.
 */
export function recoverJson<T>(text: string): { data: T; partial: boolean } | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;

  const direct = tryParse(raw);
  if (direct !== null && typeof direct === "object") {
    return { data: direct as T, partial: false };
  }

  const start = raw.indexOf("{");
  if (start < 0) return null;
  const body = raw.slice(start);

  /* 2 — essais sur les positions de `}` (du plus profond vers la racine). */
  const closePositions: number[] = [];
  for (let i = body.length - 1; i >= 0; i--) {
    if (body[i] === "}") closePositions.push(i);
  }
  for (const pos of closePositions) {
    const candidate = body.slice(0, pos + 1);
    const parsed = tryParse(candidate);
    if (parsed !== null && typeof parsed === "object") {
      return { data: parsed as T, partial: true };
    }
  }

  /* 3 — fermeture des structures ouvertes (JSON coupé au milieu). */
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  /* Ferme les chaînes ouvertes puis les structures (ordre inverse). */
  let attempt = body;
  if (inStr) attempt += '"';
  while (stack.length) attempt += stack.pop();
  const closed = tryParse(attempt);
  if (closed !== null && typeof closed === "object") {
    return { data: closed as T, partial: true };
  }

  /* Si la racine attendue est un tableau, tenter aussi `[…]`. */
  const arrStart = raw.indexOf("[");
  if (arrStart >= 0) {
    const arrBody = raw.slice(arrStart);
    const arrStack: string[] = [];
    let arrInStr = false;
    let arrEsc = false;
    for (let i = 0; i < arrBody.length; i++) {
      const ch = arrBody[i];
      if (arrInStr) {
        if (arrEsc) arrEsc = false;
        else if (ch === "\\") arrEsc = true;
        else if (ch === '"') arrInStr = false;
        continue;
      }
      if (ch === '"') arrInStr = true;
      else if (ch === "{") arrStack.push("}");
      else if (ch === "[") arrStack.push("]");
      else if (ch === "}" || ch === "]") arrStack.pop();
    }
    let arrAttempt = arrBody;
    if (arrInStr) arrAttempt += '"';
    while (arrStack.length) arrAttempt += arrStack.pop();
    const arrClosed = tryParse(arrAttempt);
    if (arrClosed !== null && typeof arrClosed === "object") {
      return { data: arrClosed as T, partial: true };
    }
  }

  return null;
}

/* ── askJson résilient ─────────────────────────────────────────── */

export function resolveModels(envModel?: string): string[] {
  const primary = (envModel || process.env.GEMINI_MODEL || "gemini-3-flash-preview").trim();
  return [primary, "gemini-flash-latest", "gemini-3.1-flash-lite"].filter(
    (m, i, a) => a.indexOf(m) === i
  );
}

export function backoffDelay(attempt: number): number {
  /* attempt est 0-indexé : avant la tentative 1 → 1s, 2 → 2s, 3 → 4s. */
  if (attempt <= 0) return 0;
  return BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
}

function isTransient(status: number): boolean {
  return status === 429 || status === 503;
}

function isHardHttpError(errMessage: string): boolean {
  /* Erreur HTTP franche hors 429/503 → inutile de re-tenter le même modèle. */
  return /Gemini .* HTTP/.test(errMessage) && !/ HTTP (429|503)/.test(errMessage);
}

export type AskJsonOptions = {
  temperature?: number;
  /** Injection pour les tests (mock HTTP). */
  fetchImpl?: FetchLike;
  sleepImpl?: SleepLike;
  /** Override de la liste de modèles (tests). */
  models?: string[];
  /** Timeout ms (défaut 45s, 90s si modèle « pro »). */
  timeoutMs?: number;
};

/**
 * Envoie `prompt` à Gemini avec :
 * · 3 tentatives / modèle, backoff 1s → 2s → 4s sur 429/503
 * · bascule de modèle si épuisé ou erreur dure
 * · recovery JSON sur réponse tronquée → partial:true
 * Jamais de throw sur réponse malformée récupérable ; throw clair sinon.
 */
export async function askJsonRaw<T>(
  prompt: string,
  system: string,
  opts: AskJsonOptions = {}
): Promise<AskJsonResult<T>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Clé API manquante côté serveur");

  const temperature = opts.temperature ?? 0.4;
  const doFetch = opts.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const doSleep = opts.sleepImpl ?? defaultSleep;
  const models = opts.models && opts.models.length ? opts.models : resolveModels();

  let lastErr: Error = new Error("Aucun modèle disponible");
  let lastRawText = "";

  for (const MODEL of models) {
    const isPro = /pro/.test(MODEL);
    const timeout = opts.timeoutMs ?? (isPro ? 90_000 : 45_000);

    for (let attempt = 0; attempt < 3; attempt++) {
      const delay = backoffDelay(attempt);
      if (delay > 0) await doSleep(delay);

      try {
        const res = await doFetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                temperature,
                responseMimeType: "application/json",
                maxOutputTokens: 8192,
                ...(isPro ? { thinkingConfig: { thinkingLevel: "medium" } } : {}),
              },
            }),
            signal: AbortSignal.timeout(timeout),
            cache: "no-store",
          }
        );

        if (!res.ok) {
          const msg = `Gemini ${MODEL} HTTP ${res.status}`;
          lastErr = new Error(msg);
          /* Transitoire → même modèle (backoff déjà appliqué au prochain attempt). */
          if (isTransient(res.status) && attempt < 2) continue;
          /* Dur → modèle suivant. */
          if (isTransient(res.status) || attempt >= 2) break;
          break;
        }

        const j = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
        };
        const t = (j.candidates?.[0]?.content?.parts ?? [])
          .filter((p) => !p.thought)
          .map((p) => p.text ?? "")
          .join("")
          .trim();

        if (!t) {
          lastErr = new Error("Réponse IA vide");
          if (attempt < 2) continue;
          break;
        }

        lastRawText = t;
        const recovered = recoverJson<T>(t);
        if (recovered) {
          if (recovered.partial) {
            console.warn(
              `[gmail-core] JSON partiel récupéré (modèle=${MODEL}, len=${t.length})`
            );
          }
          return recovered;
        }

        /* Parse impossible même avec recovery → retry puis message clair. */
        lastErr = new Error(
          `JSON invalide après recovery (modèle=${MODEL}) : ${t.slice(0, 200)}`
        );
        if (attempt < 2) continue;
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        /* Timeout / réseau / abort → retry même modèle. */
        if (isHardHttpError(lastErr.message)) break;
      }
    }
  }

  const preview = lastRawText ? lastRawText.slice(0, 200) : "";
  throw new Error(
    `${lastErr.message}${preview ? ` | réponse: ${preview}` : ""}`
  );
}

/** Prompt SYSTEM léger dédié à l'extraction d'offres (JSON strict, français). */
export const GMAIL_SYSTEM =
  "Tu es un expert français du recrutement et des alertes emploi. " +
  "Tu réponds TOUJOURS en français, exclusivement en JSON valide, sans texte autour. " +
  "Tu ne génères jamais de lien, d'URL ou d'information absente des données fournies.";

/**
 * askJson résilient — construit le prompt gmail-offers / gmail-recheck
 * (copie/adaptation des prompts ai.ts, email COMPLET en un seul appel) puis
 * délègue à askJsonRaw.
 */
export async function askJson<T = unknown>(
  task: "gmail-offers" | "gmail-recheck",
  body: { emails?: unknown[] },
  opts: AskJsonOptions = {}
): Promise<AskJsonResult<T>> {
  const prompt = buildGmailPrompt(task, body);
  return askJsonRaw<T>(prompt, GMAIL_SYSTEM, {
    temperature: opts.temperature ?? 0.2,
    ...opts,
  });
}

/** Adaptation des prompts ai.ts pour UN e-mail complet (pas segmenté). */
export function buildGmailPrompt(
  task: "gmail-offers" | "gmail-recheck",
  body: { emails?: unknown[] }
): string {
  const emailsJson = JSON.stringify(body.emails ?? [], null, 1);
  const commonRules = `
**Champ « anchors » (source de vérité des liens) :** chaque e-mail contient la liste ORDONNÉE de ses liens réels, sous la forme {"text": "<texte visible du lien>", "href": "<URL>"} — dans l'ordre où ils apparaissent dans le mail. Utilise-les pour LOCALISER chaque annonce : le titre, l'entreprise et la ville se trouvent dans le texte autour du lien d'annonce. Un lien de CANDIDATURE peut être un long lien de tracking (clk/track/redirect/comm/...) : c'est TOUT DE MÊME le lien de cette annonce. Les liens de désinscription, de compte, de footer, de réseaux sociaux ou d'accueil ne sont PAS des liens d'annonce.

Pour CHAQUE e-mail (reçu COMPLET — un seul appel, pas de segment) :
1. Parcours le texte intégralement, DE LA PREMIÈRE à la DERNIÈRE ligne, sans t'arrêter. Dès que le motif « Titre + Entreprise + Lieu » apparaît, cherche activement s'il se répète plus bas : 3 occurrences = 3 offres, 18 occurrences = 18 offres. Ne t'arrête jamais à la première.
2. Détermine s'il contient une ou plusieurs offres de STAGE, INTERNSHIP, ALTERNANCE ou opportunité équivalente pour un étudiant ou jeune diplômé (y compris alternance, VIE, job étudiant à forte valeur…).
3. IGNORE strictement (isOffer=false, avec une raison courte) : newsletters générales sans poste concret, offres CDI/CDD seniors, publicités, événements, formations payantes, invitations.
4. Ignore le bruit contextuel (« Voir toutes les offres », « Postulez facilement », slogans) : ce ne sont PAS des offres.
5. Si un e-mail contient plusieurs offres, liste CHACUNE séparément.

**RÈGLE ABSOLUE :** ne limite JAMAIS le nombre d'offres extraites d'un même e-mail. 1, 3, 10, 20, 30 annonces : liste TOUTES, chacune avec son propre objet dans offers[], sans exception.

Pour CHAQUE offre retenue (sans rien inventer — uniquement liens et textes fournis) :
- title, company, location, contract, duration, deadline, skills[], description
- applicationUrl : le href EXACT de l'ancre de CETTE offre. S'il n'existe AUCUN lien réel correspondant (ni anchors ni links), renvoie EXACTEMENT « "" ». Ne JAMAIS inventer, assembler ou recoller un lien.
- source : "LinkedIn" | "Indeed" | "Welcome to the Jungle" | "JobTeaser" | "HelloWork" | "Apec" | "Site entreprise" | "Autre"

Réponds avec ce JSON exact :
{"results": [{"id": "<id de l'e-mail>", "isOffer": true|false, "reason": "<court>", "offers": [{"title": "...", "company": "...", "location": "...", "contract": "...", "duration": "...", "deadline": "...", "skills": ["..."], "description": "...", "applicationUrl": "...", "source": "..."}]}]}

Règle anti-invention : ne crée JAMAIS un lien ou une information absente des données fournies. Retourne exactement un objet "results" couvrant TOUS les e-mails reçus, avec TOUTES les offres sans exception.`;

  if (task === "gmail-recheck") {
    return `Ces e-mails proviennent du libellé Gmail « Stages – Alertes offres » : ce sont des ALERTES EMPLOI. Il y a très probablement des offres de stage à l'intérieur, même si le corps est court ou réduit à des liens.
Ne conclus JAMAIS « sans offre » à la légère : cherche CHAQUE annonce jusqu'au bout de l'e-mail.
S'il n'y a réellement AUCUNE annonce (invitation, pub pure, promo), renvoie isOffer=false avec une raison courte — mais sois sûr à 100%.

Voici les e-mails à analyser (COMPLETS) :
${emailsJson}
${commonRules}
Retourne un objet par e-mail reçu, avec TOUTES les annonces trouvées, sans exception ni troncature.`;
  }

  return `Tu es chargé de classer les e-mails reçus dans un libellé Gmail « Stages – Alertes offres ».
Voici les e-mails à analyser (métadonnées, texte COMPLET de l'e-mail, liens et ancres) :
${emailsJson}
${commonRules}`;
}

/* ── Traitement email-unique ───────────────────────────────────── */

type AiEmailPayload = {
  id: string;
  subject: string;
  from: string;
  date: string;
  text: string;
  links: string[];
  anchors: AnchorEntry[];
};

function buildAiText(email: ParsedEmail): string {
  let full = email.text || "";
  if (email.html) {
    const repr = getGeminiHtmlRepresentation(email.html);
    const reprLonger = repr.length > full.length;
    const linksOnlyInRepr =
      /\[LINK:[^\]]*\|https?:\/\//i.test(repr) && !/https?:\/\//i.test(full);
    if (repr && (reprLonger || linksOnlyInRepr)) full = repr;
  }
  return full;
}

/** Découpe en 2 max sur frontière de bloc — uniquement si > 40 000 caractères. */
export function splitEmailForAi(text: string, limit = AI_EMAIL_CHAR_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const mid = Math.ceil(text.length / 2);
  let cut = text.lastIndexOf("\n\n", mid);
  if (cut < limit * 0.3) cut = text.lastIndexOf("\n", mid);
  if (cut < limit * 0.2) cut = text.lastIndexOf(". ", mid);
  if (cut < 100) cut = mid;
  return [text.slice(0, cut), text.slice(cut)];
}

function codeOffersFrom(
  email: ParsedEmail,
  det: ReturnType<typeof extractOfferLinks>
): RawOffer[] {
  return det.offers.map((a) => {
    const block = isolateBlock(email.html ?? "", a.href);
    return {
      title: (block?.title || a.rawTitle || "").trim(),
      company: (block?.company || "").trim(),
      location: (block?.location || "").trim(),
      contract: "",
      duration: "",
      deadline: "",
      skills: [],
      description: "",
      applicationUrl: a.canonicalUrl,
      source: a.platform,
      sourceUrl: a.href,
      anchorText: (block?.title || a.rawTitle || "").trim(),
      snippet: block?.snippet || undefined,
    };
  });
}

function realUrlSet(email: ParsedEmail, anchors: AnchorEntry[], code: RawOffer[]): string[] {
  const set = new Set<string>();
  const push = (u: string) => {
    const t = (u || "").trim();
    if (t) set.add(t);
  };
  for (const a of anchors) push(a.href);
  for (const l of email.links ?? []) push(l);
  for (const o of code) {
    push(o.sourceUrl ?? "");
    push(o.applicationUrl);
  }
  return [...set];
}

function mergeOffers(code: RawOffer[], ai: RawOffer[], realUrls: string[]): RawOffer[] {
  const out: RawOffer[] = [];
  const seen = new Set<string>();
  const push = (o: RawOffer) => {
    const k = dedupKeyOf(o);
    if (k && seen.has(k)) return;
    if (k) seen.add(k);
    out.push(o);
  };
  for (const o of code) push(o);
  for (const o of ai) {
    const matched = matchRealUrl(o.applicationUrl, realUrls);
    if (matched) {
      /* Canonicalise pour le bouton Postuler : l'URL brute du mail (tracking)
         reste en sourceUrl (preuve), l'applicationUrl devient l'URL propre. */
      o.applicationUrl = canonicalizeOfferUrl(matched) || matched;
      const anchorsHit = realUrls.includes(matched);
      if (anchorsHit) {
        o.sourceUrl = o.sourceUrl || matched;
      }
      push(o);
    } else if (!o.applicationUrl) {
      /* Pas d'URL réelle → searchFallback plus tard, mais on conserve l'offre. */
      push(o);
    }
    /* URL IA absente du mail → offre écartée (règle d'or). */
  }
  return out;
}

function attachProofs(email: ParsedEmail, offers: RawOffer[], anchors: AnchorEntry[]): RawOffer[] {
  return offers.map((o) => {
    if (!o.applicationUrl || isSearchFallbackUrl(o.applicationUrl)) {
      if (!o.applicationUrl) {
        const url = searchFallbackUrl(o.title, o.company, o.location);
        if (url) {
          return { ...o, applicationUrl: url, searchFallback: true, sourceUrl: undefined, anchorText: undefined, snippet: undefined };
        }
      }
      return o;
    }
    const match =
      anchors.find((a) => a.href === o.applicationUrl) ??
      anchors.find((a) => matchRealUrl(o.applicationUrl, [a.href]) !== null);
    const next = { ...o };
    if (match) {
      next.sourceUrl = match.href;
      next.anchorText = match.text;
    } else if (next.sourceUrl) {
      /* déjà fourni par le code */
    } else {
      next.sourceUrl = next.applicationUrl;
    }
    if (email.html && !next.snippet) {
      const block = isolateBlock(email.html, next.sourceUrl || next.applicationUrl);
      if (block?.snippet) next.snippet = block.snippet;
    }
    if (!next.searchFallback) {
      const url = searchFallbackUrl(next.title, next.company, next.location);
      /* searchFallback seulement si pas d'URL réelle — ici on en a une. */
      void url;
    }
    return next;
  });
}

/* ── P0-3 : résolution HORS LIGNE des redirects Indeed opaques ────
   cts/v3 = gzip(JSON {"u":…}) décodable localement → cible appliquée
   (viewjob?jk= = résolu ; pagead = URL de clic complète + indirect ;
   chrome désinscription/optout = offre ÉJECTÉE).
   engage/cts non décodables + pagead seuls → conservés + `indirect`
   (badge « Lien non direct » en UI) ; chrome au titre (« Se désabonner »…
   fuite de l'IA) → éjecté.
   AUCUN fetch réseau : Indeed renvoie 403 aux robots (vérifié). */
export function applyIndeedTargets(offers: RawOffer[]): RawOffer[] {
  const out: RawOffer[] = [];
  for (const o of offers) {
    const u = (o.applicationUrl || "").trim();
    if (!u) {
      out.push(o);
      continue;
    }
    if (/^https?:\/\/cts\.indeed\.com\//i.test(u)) {
      const target = decodeIndeedCtsTarget(u);
      if (target && isIndeedChromeTargetUrl(target)) continue; /* éjecté */
      if (target) {
        const jk = (() => {
          try {
            return (new URL(target).searchParams.get("jk") || "").trim();
          } catch {
            return "";
          }
        })();
        if (isValidIndeedJk(jk)) {
          const resolved: RawOffer = {
            ...o,
            applicationUrl: `https://fr.indeed.com/viewjob?jk=${encodeURIComponent(jk)}`,
          };
          delete resolved.indirect;
          out.push(resolved);
        } else {
          out.push({ ...o, applicationUrl: target, indirect: true });
        }
      } else {
        /* payload tronqué : URL d'origine conservée, marquée indirecte. */
        out.push({ ...o, indirect: true });
      }
      continue;
    }
    if (isIndeedOpaqueUrl(u)) {
      const title = (o.title || o.anchorText || "").trim();
      if (title && isChromeTrackingTitle(title)) continue; /* chrome éjecté */
      out.push({ ...o, indirect: true });
      continue;
    }
    out.push(o);
  }
  return out;
}

/** P0-3 : migration à la lecture des checkpoints antérieurs (précédent :
    repairCheckpoint P0-1). Applique applyIndeedTargets aux offres stockées
    (cts non décodé, engage sans indirect, chrome) — pur, synchrone,
    idempotent, aucun réseau. Si une URL opaque a été remplacée (cts→pagead),
    la clé de dédup figée (vide sur l'opaque) est recalculée ; les offres
    inchangées gardent leurs clés gelées. */
export function migrateIndeedOffers(offers: RawOffer[]): RawOffer[] {
  const next = applyIndeedTargets(offers);
  const prevUrls = new Set(offers.map((o) => o.applicationUrl));
  return next.map((o) => {
    if (o.applicationUrl && !prevUrls.has(o.applicationUrl)) {
      const k = importUrlKey(o.applicationUrl);
      if (k) return { ...o, dedupUrlKey: k };
    }
    return o;
  });
}

export type ProcessEmailOptions = {
  /** Force le retraitement même si le checkpoint dit done. */
  force?: boolean;
  /** Désactive l'appel IA (code seul) — utile pour tests. */
  skipAi?: boolean;
  fetchImpl?: FetchLike;
  sleepImpl?: SleepLike;
  models?: string[];
};

/**
 * Traite UN e-mail complet :
 * a. extractOfferLinks → offres code + summary
 * b. si verifyOk && offres > 0 → validé, pas d'IA
 * c. sinon → un seul appel IA sur l'email complet (recovery si JSON tronqué)
 * d. merge avec guards URL ; écrit le checkpoint.
 */
export async function processEmail(
  email: ParsedEmail,
  opts: ProcessEmailOptions = {}
): Promise<ProcessedEmail> {
  const anchors = extractAnchorMap(email.html);
  const det = extractOfferLinks(email.html);
  const code = codeOffersFrom(email, det);
  const realUrls = realUrlSet(email, anchors, code);

  const codeOk = det.summary.verifyOk === true && code.length > 0;
  const needAi =
    !opts.skipAi &&
    (!codeOk) &&
    (!det.summary.htmlPresent ||
      det.summary.anchorsTotal === 0 ||
      det.summary.verifyOk === false ||
      code.length === 0 ||
      looksLikeJobAlert({ subject: email.subject, from: email.from, links: email.links }));

  const aiOffers: RawOffer[] = [];
  let recoveryUsed = false;
  let aiError: string | null = null;

  if (needAi) {
    const fullText = buildAiText(email);
    const parts = splitEmailForAi(fullText);
    const payloads: AiEmailPayload[] = parts.map((text, i) => ({
      id: parts.length === 1 ? email.id : `${email.id}#${i}`,
      subject: (email.subject || "").slice(0, 200),
      from: (email.from || "").slice(0, 160),
      date: (email.receivedAt || "").slice(0, 10),
      text,
      links: email.links ?? [],
      anchors,
    }));

    const task = looksLikeJobAlert({ subject: email.subject, from: email.from, links: email.links })
      ? "gmail-recheck"
      : "gmail-offers";

    try {
      const askOpts: AskJsonOptions = {
        temperature: 0.2,
        fetchImpl: opts.fetchImpl,
        sleepImpl: opts.sleepImpl,
        models: opts.models,
      };

      /* 1er appel : email complet (ou 1ère moitié si >40k). */
      const first = await askJson<GmailAiResult>(
        task,
        { emails: [payloads[0]] },
        askOpts
      );
      if (first.partial) recoveryUsed = true;
      const results = first.data.results ?? [];
      aiOffers.push(...sanitizeAiOffers(results[0]?.offers));

      /* 2e appel SEULEMENT si email >40k ET la 1ère moitié semble incomplète
         (anchors count > offres trouvées dans la 1ère moitié). */
      if (payloads.length > 1) {
        const expectedFromAnchors = anchors.length;
        const foundSoFar = aiOffers.length + code.length;
        if (expectedFromAnchors > foundSoFar) {
          try {
            const second = await askJson<GmailAiResult>(
              task,
              { emails: [payloads[1]] },
              askOpts
            );
            if (second.partial) recoveryUsed = true;
            const r2 = second.data.results ?? [];
            aiOffers.push(...sanitizeAiOffers(r2[0]?.offers));
          } catch (e) {
            /* P1-5 : la 2e moitié échoue → aiError propagé (jamais silencieux). */
            const m = e instanceof Error ? e.message : String(e);
            aiError = aiError ?? m;
            console.warn("[gmail-core] 2e moitié échouée:", m);
          }
        }
      }
    } catch (e) {
      aiError = e instanceof Error ? e.message : String(e);
      console.warn(`[gmail-core] IA échec email=${email.id}: ${aiError}`);
    }
  }

  const merged = mergeOffers(code, aiOffers, realUrls);
  /* Point d'écriture UNIQUE des URLs avant saveCheckpoint : applicationUrl
     nettoyée (tracking retiré), sourceUrl conservée brute (preuve technique,
     jamais affichée telle quelle). P0-3 : applyIndeedTargets entre le
     nettoyage et le gel des clés (résolution cts / éjection chrome / indirect). */
  const withProofs = applyIndeedTargets(
    attachProofs(email, merged, anchors).map((o) =>
      o.applicationUrl ? { ...o, applicationUrl: cleanJobUrl(o.applicationUrl) } : o
    )
  ).map((o) => {
      /* P1-6 : geler les clés ANTES enrichissement — l'IA réécrit ensuite
         titre/entreprise/localité et peut réécrire l'URL (matchRealUrl) :
         clés recalculées après = instables d'un run à l'autre. Le gel n'a
         lieu que si la valeur est exploitable (sinon fallback au classif.). */
      const frozen: RawOffer = { ...o };
      const urlKey = o.applicationUrl ? importUrlKey(o.applicationUrl) : "";
      if (urlKey) frozen.dedupUrlKey = urlKey;
      if (o.title.trim() && o.company.trim()) frozen.dedupTclKey = titleCompanyKeyOf(o);
      return frozen;
    });

  const anyError = aiError !== null && code.length === 0 && withProofs.length === 0;
  const finalStatus: ProcessedEmail["finalStatus"] = anyError
    ? "analyze_error"
    : withProofs.length > 0
      ? "detected"
      : "no_offer";

  const aiUsed = aiOffers.length > 0;
  const detectionMethod: DetectionMethod =
    code.length > 0 && aiUsed
      ? "code+ia"
      : code.length > 0
        ? "code"
        : aiUsed
          ? "ia"
          : "none";

  /* P1-5 : toute défaillance IA (même partielle, code ≥ 1 offre) marque
     l'e-mail error/pending_retry — jamais done (sinon invisible et non
     relançable). */
  const aiRateLimit = aiError !== null && /429|rate.?limit|quota/i.test(aiError);

  let reason: string;
  if (withProofs.length > 0) {
    reason = aiError !== null
      ? `Extraction par le code (${withProofs.length} offre(s)) — analyse IA en échec`
      : codeOk
        ? `Extraction exhaustive par le code (${code.length} offre(s), ${det.summary.anchorsTotal} lien(s))`
        : `Extraction code + IA (${withProofs.length} offre(s))${recoveryUsed ? " — JSON partiel récupéré" : ""}`;
  } else if (anyError) {
    reason = "Erreur d'analyse — relance la synchronisation";
  } else if (det.summary.htmlPresent && det.summary.unique === 0 && (det.summary.anchorsTotal ?? 0) > 0) {
    reason = `Aucune offre dans le HTML : ${det.summary.anchorsTotal} lien(s), ${det.summary.markers} marqueur(s)`;
  } else {
    reason = "Aucune offre de stage identifiée";
  }

  const aiText = needAi ? buildAiText(email) : email.text || "";
  const processed: ProcessedEmail = {
    id: email.id,
    subject: email.subject,
    from: email.from,
    receivedAt: email.receivedAt,
    isOffer: withProofs.length > 0,
    reason,
    finalStatus,
    recoveryUsed,
    detectedByCode: code.length,
    detSummary: det.summary,
    offers: withProofs,
    textLen: aiText.length,
    hasHtml: !!email.html,
    linksCount: (email.links ?? []).length,
    anchorsCount: anchors.length,
    detectedOffers: withProofs.map((o) => ({
      title: o.title,
      company: o.company,
      applicationUrl: o.applicationUrl,
    })),
    detectionMethod,
    error: aiError ?? undefined,
  };

  const prev = await loadCheckpoint(email.id);
  const cp: EmailCheckpoint = {
    status: aiError !== null ? (aiRateLimit ? "pending_retry" : "error") : "done",
    offers: withProofs,
    error: aiError ?? undefined,
    at: new Date().toISOString(),
    retries: aiError !== null ? (prev?.retries ?? 0) + 1 : 0,
    recoveryUsed,
    detectedByCode: code.length,
    summary: det.summary,
    isOffer: processed.isOffer,
    reason,
    subject: email.subject,
    from: email.from,
    receivedAt: email.receivedAt,
  };
  if (cp.status === "error" && cp.retries > MAX_EMAIL_RETRIES) {
    cp.status = "error";
  }
  await saveCheckpoint(email.id, cp);
  processed.checkpoint = {
    status: cp.status,
    retries: cp.retries,
    at: cp.at,
    recoveryUsed: cp.recoveryUsed,
  };

  return stampAnalysis(processed);
}

/* ── Enrichissement Module 2 (1 appel IA / offre, cache, isolation) ── */

export type EnrichCandidate = {
  id: string;
  title: string;
  source: string;
  applicationUrl: string;
  emailText: string;
};

/** Prompt gmail-enrich copié/adapté de ai.ts pour UNE seule offre. */
export function buildEnrichPrompt(offer: {
  id: string;
  title: string;
  source: string;
  applicationUrl: string;
  emailText: string;
  pageText: string;
}): string {
  const emailText = (offer.emailText || "").slice(0, 2500);
  const pageText = (offer.pageText || "").slice(0, 9000);
  return `Tu enrichis UNE fiche de stage / alternance issue d'un e-mail d'alerte (Indeed, LinkedIn…).

Fiche à enrichir (id, métadonnées, texte de l'e-mail, texte de la page d'annonce) :
${JSON.stringify(
    {
      id: offer.id,
      title: offer.title.slice(0, 160),
      source: offer.source.slice(0, 80),
      applicationUrl: offer.applicationUrl,
      emailText,
      pageText,
    },
    null,
    1
  )}

Croise les deux sources : emailText (e-mail d'alerte) et pageText (page de l'annonce, qui PRIME).

Structure de l'objet à renvoyer :
- id : reprends EXACTEMENT l'id fourni
- title : intitulé exact du poste
- company : entreprise ("Non précisée" si absente)
- location : ville / télétravail ("Non précisé" si absent)
- contract : "Stage", "Alternance", "Internship" ou précision
- duration : durée (ex. "6 mois") ou ""
- deadline : date limite de candidature (ISO AAAA-MM-JJ si possible) ou ""
- salary : rémunération si mentionnée, sinon ""
- skills : 4 à 10 compétences issues des textes
- keywords : 5 à 12 mots-clés techniques / termes ATS présents dans la page
- missions : 4 à 8 missions concrètes en français
- prerequisites : prérequis exigés, ou []
- profile : profil recherché en une ligne, ou ""
- description : description complète en 4 à 6 phrases fidèles aux textes
- summary : résumé fidèle de l'offre en MAXIMUM 3 phrases (aperçu carte), en français
- applicationInfo : modalités de candidature présentes dans les textes, sinon ""
- verbAction : verbe d'action principal du poste (ex: "développer", "manager", "analyser"), ou ""
- diploma : diplôme exigé (ex: "Licence", "Master", "Bac+5"), ou ""
- langues : langues exigées (ex: "Français, Anglais", "Espagnol courant"), ou ""
- applicationUrl : la valeur EXACTE fournie pour cet id
- source : "LinkedIn" | "Indeed" | "Welcome to the Jungle" | "Site entreprise" | "Autre"

RÈGLE : information absente des textes → "" ou [], jamais inventée. N'invente JAMAIS d'applicationUrl : reprends celle fournie. Réponds TOUJOURS un objet (jamais zéro).

Réponds avec ce JSON exact :
{"results": [{"id": "<id fourni>", "title": "...", "company": "...", "location": "...", "contract": "...", "duration": "...", "deadline": "...", "salary": "...", "skills": ["..."], "keywords": ["..."], "missions": ["..."], "prerequisites": ["..."], "profile": "...", "description": "...", "summary": "...", "applicationInfo": "...", "applicationUrl": "<copie exacte>", "source": "..."}]}`;
}

type EnrichRow = { id: string } & Partial<EnrichedOfferData>;

async function loadEnrichCache(key: string): Promise<EnrichResult | null> {
  try {
    const raw = await storeGet(key);
    if (!raw) return null;
    const j = JSON.parse(raw) as EnrichResult;
    if (!j || typeof j !== "object" || !j.enrichStatus) return null;
    return j;
  } catch {
    return null;
  }
}

async function saveEnrichCache(key: string, value: EnrichResult): Promise<void> {
  if (!isCacheableEnrichResult(value)) return;
  try {
    await storeSet(key, JSON.stringify(value));
  } catch {
    /* best-effort */
  }
}

function applyEnrichData(o: RawOffer, r: EnrichResult): void {
  const hasPage = r.data && r.enrichStatus !== "blocked" && r.enrichStatus !== "skipped";
  if (hasPage && r.data) {
    const originalUrl = o.applicationUrl;
    for (const key of [
      "title", "company", "location", "contract", "duration", "deadline",
      "salary", "skills", "keywords", "missions", "prerequisites",
      "profile", "description", "summary", "applicationInfo", "source",
    ] as const) {
      const v = (r.data as Record<string, unknown>)[key] as string | string[] | undefined;
      if (Array.isArray(v) ? v.length > 0 : v) {
        (o as unknown as Record<string, unknown>)[key] = v;
      }
    }
    /* applicationUrl : jamais remplacée par une valeur IA différente. */
    const aiUrl = r.data.applicationUrl;
    if (aiUrl && originalUrl && aiUrl !== originalUrl && matchRealUrl(aiUrl, [originalUrl]) === null) {
      /* on ignore l'URL IA — garde la réelle */
    }
  }
  o.enrichStatus = r.enrichStatus;
  o.enrichReason = r.enrichReason;
  if (r.enrichedAt) o.enrichedAt = r.enrichedAt;
}

export function buildEnrichCandidates(
  processed: ProcessedEmail[],
  emailsById: Map<string, ParsedEmail>,
  opts?: { retryOnly?: boolean }
): EnrichCandidate[] {
  const out: EnrichCandidate[] = [];
  for (const a of processed) {
    if (!a.isOffer) continue;
    const email = emailsById.get(a.id);
    /* P1-4 : hoist par e-mail (au lieu d'un realUrlSet par offre). */
    const real = email ? realUrlSet(email, extractAnchorMap(email.html), []) : [];
    a.offers.forEach((o, idx) => {
      /* P1-4 : jamais re-candidater une offre déjà enrichie (ok) ; un
         blocked n'est retenté qu'en mode retryOnly (relaunch_offer). */
      if (o.enrichStatus === "ok") return;
      if (o.enrichStatus === "blocked" && !opts?.retryOnly) return;
      if (!o.applicationUrl || !/^https?:\/\//i.test(o.applicationUrl)) return;
      if (isSearchFallbackUrl(o.applicationUrl)) return;
      /* La preuve réelle a été vérifiée à la détection ; en relance ciblée
         (vue checkpoint, html non relu) on ne re-filtre pas dessus. */
      if (email && !opts?.retryOnly && !matchRealUrl(o.applicationUrl, real)) return;
      let frag = (o.snippet || "").trim();
      if ((!frag || frag.replace(/\s+/g, " ").length < 80) && email?.html) {
        const block = isolateBlock(email.html, o.sourceUrl || o.applicationUrl);
        frag = (block?.snippet || frag).trim();
      }
      const emailText =
        frag.replace(/\s+/g, " ").length >= 80
          ? `${a.subject}\n${frag}`
          : `${a.subject}\n${(email?.text ?? "").slice(0, 2500)}`;
      out.push({
        id: `${a.id}#${idx}`,
        title: o.title,
        source: o.source,
        applicationUrl: o.applicationUrl,
        emailText,
      });
    });
  }
  return out;
}

export type EnrichProcessedOptions = {
  max?: number;
  timeBudgetMs?: number;
  /** Injection tests : fetch de page. */
  fetchPageImpl?: (url: string) => Promise<{ ok: true; text: string } | { ok: false; reason: string }>;
  /** Injection tests : appel IA (parse déjà fait → results rows). */
  askImpl?: (prompt: string) => Promise<{ results?: EnrichRow[] }>;
  /** Désactive le cache serveur (tests). */
  skipCache?: boolean;
  concurrency?: number;
  /** P1-4 (relaunch_offer) : ne retente QUE les offres non-ok (dont blocked). */
  retryOnly?: boolean;
};

/** P1-4 : compteur de la relance ciblée d'enrichissement. */
export type EnrichCounts = { tried: number; okNow: number; stillBlocked: number };

/**
 * Enrichit chaque offre candidate :
 * · cache gmail:enrich:v3:<sha1(url)> d'abord
 * · sinon fetchOfferPage + 1 appel IA unique
 * · isolation : une offre en échec n'affecte pas les autres
 */
export async function enrichProcessed(
  processed: ProcessedEmail[],
  emailsById: Map<string, ParsedEmail>,
  opts: EnrichProcessedOptions = {}
): Promise<EnrichCounts> {
  const candidates = buildEnrichCandidates(processed, emailsById, {
    retryOnly: opts.retryOnly === true,
  });
  const counts: EnrichCounts = { tried: 0, okNow: 0, stillBlocked: 0 };
  if (candidates.length === 0) return counts;

  /* Prioriser les hôtes accessibles (Hellowork, Greenhouse…) avant
     Indeed/LinkedIn souvent en bot-wall — max enrich limited. */
  const preferredHost =
    /hellowork|greenhouse\.io|lever\.co|workable|welcometothejungle|talent\.io/i;
  candidates.sort((a, b) => {
    const pa = preferredHost.test(a.applicationUrl) ? 0 : 1;
    const pb = preferredHost.test(b.applicationUrl) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return 0;
  });

  /* P0-2 : plus de limite arbitraire sur le nombre d'offres enrichies.
     On traite TOUTES les candidates éligibles avec une concurrency contrôlée
     pour ne pas surcharger les services externes. Le budget timeBudgetMs
     reste la vraie borne d'arrêt. */
  const pool = candidates;
  const deadline = Date.now() + (opts.timeBudgetMs ?? 110_000);
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const fetchPage = opts.fetchPageImpl ?? ((url: string) => import("@/lib/scrape").then((m) => m.fetchOfferPage(url)));
  const results = new Map<string, EnrichResult>();

  let i = 0;
  let tooLate = false;
  const worker = async () => {
    while (i < pool.length) {
      const c = pool[i++];
      if (tooLate || Date.now() > deadline) {
        tooLate = true;
        results.set(c.id, {
          enrichStatus: "skipped",
          enrichReason: "Budget de temps du sync dépassé — fiche non enrichie",
        });
        continue;
      }
      try {
        const cacheKey = enrichCacheKey(c.applicationUrl);
        if (!opts.skipCache) {
          const hit = await loadEnrichCache(cacheKey);
          if (hit) {
            results.set(c.id, hit);
            continue;
          }
        }

        const page = await fetchPage(c.applicationUrl);
        let pageText = "";
        if (page.ok) {
          pageText = page.text;
        }
        /* P0-1 : si page bloquée, on appelle quand même Gemini avec email seulement.
           pageText reste "" — le prompt gmail-enrich gère "information absente → "" ou []".
           On note tout de même le statut blocked mais on continue l'enrichissement. */
        const enrichmentMark = page.ok ? "" : " (based on email only)";
        let row: EnrichRow | undefined;
        try {
          if (opts.askImpl) {
            const r = await opts.askImpl(
              buildEnrichPrompt({ ...c, pageText })
            );
            row = (r.results ?? [])[0];
          } else {
            const ask = await askJsonRaw<{ results?: EnrichRow[] }>(
              buildEnrichPrompt({ ...c, pageText }),
              GMAIL_SYSTEM,
              { temperature: 0.2 }
            );
            row = (ask.data.results ?? [])[0];
          }
        } catch {
          const partial: EnrichResult = {
            enrichStatus: "partial",
            enrichReason: "Erreur d'analyse — fiche basée sur l'e-mail" + enrichmentMark,
          };
          results.set(c.id, partial);
          if (!opts.skipCache) await saveEnrichCache(cacheKey, partial);
          continue;
        }

        const useful = isUsefulEnrichRow(row);
        const okResult: EnrichResult = useful
          ? {
              enrichStatus: "ok",
              enrichReason:
                page.ok || enrichmentMark
                  ? page.ok
                    ? "Fiche enrichie depuis la page de l'annonce"
                    : "Fiche enrichie depuis le texte de l'e-mail"
                  : "Fiche enrichie depuis la page de l'annonce",
              enrichedAt: new Date().toISOString(),
              data: row
                ? { ...row, applicationUrl: c.applicationUrl }
                : undefined,
            }
          : {
              enrichStatus: "partial",
              enrichReason:
                page.ok || enrichmentMark
                  ? page.ok
                    ? "Analyse sans données exploitables — fiche basée sur l'e-mail"
                    : "Analyse sans données exploitables — fiche basée sur l'e-mail"
                  : "Analyse sans données exploitables — fiche basée sur la page",
            };
        results.set(c.id, okResult);
        if (!opts.skipCache) await saveEnrichCache(cacheKey, okResult);
      } catch (e) {
        results.set(c.id, {
          enrichStatus: "partial",
          enrichReason: `Erreur isolée : ${e instanceof Error ? e.message : String(e)}`.slice(0, 200),
        });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, pool.length) }, worker));

  for (const a of processed) {
    a.offers.forEach((o, idx) => {
      const r = results.get(`${a.id}#${idx}`);
      if (!r) return;
      applyEnrichData(o, r);
    });
  }
  counts.tried = results.size;
  for (const r of results.values()) {
    if (r.enrichStatus === "ok") counts.okNow++;
    else if (r.enrichStatus === "blocked") counts.stillBlocked++;
  }
  return counts;
}

/* ── Anti-doublon tardif (uniquement à l'import) ──────────────── */

export type ImportOfferLike = {
  title: string;
  company: string;
  location: string;
  applicationUrl: string;
  /** P1-6 : clés gelées avant enrich — priorité sur recalcul. */
  dedupUrlKey?: string;
  dedupTclKey?: string;
};

export type ImportClass = {
  status: "nouvelle" | "doublon";
  reason?: string;
  urlKey: string;
  titleCompanyKey: string;
};

/** Clé titre|entreprise|localité (lowercase, trim). */
export function titleCompanyKeyOf(o: {
  title?: string;
  company?: string;
  location?: string;
}): string {
  return `${(o.title || "").trim().toLowerCase()}|${(o.company || "").trim().toLowerCase()}|${(o.location || "").trim().toLowerCase()}`;
}

/** Normalise l'URL pour l'anti-doublon (reprend normalizeUrl de gmail-client).
    P1-6 : clé primaire = identifiant plateforme (jobKeyOf) quand reconnu —
    immunitaire aux paramètres de session/tracking (lipi, vjs, refId…) qui
    font que deux URLs du MÊME poste ne sont jamais textuellement égales.
    La règle « générérique » (p:…) est exclue : elle ignore la query et
    traite mal le slash final (incohérent avec la normalisation ci-dessous). */
export function importUrlKey(url: string): string {
  if (!url) return "";
  const jobKey = jobKeyOf(url);
  if (jobKey && !jobKey.startsWith("p:")) return `jk:${jobKey}`;
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
    return u.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Classe une offre par rapport aux index déjà importés.
 * Uniquement appelé à l'import (ingest) — pas pendant la détection.
 */
export function classifyImportOffer(
  offer: ImportOfferLike,
  seen: { byUrl: Set<string>; byTitle: Set<string> }
): ImportClass {
  const urlKey = offer.dedupUrlKey || importUrlKey(offer.applicationUrl || "");
  const titleCompanyKey = offer.dedupTclKey || titleCompanyKeyOf(offer);
  if (urlKey && seen.byUrl.has(urlKey)) {
    return { status: "doublon", reason: "URL déjà importée", urlKey, titleCompanyKey };
  }
  if (seen.byTitle.has(titleCompanyKey) && titleCompanyKey !== "||") {
    return { status: "doublon", reason: "Titre + entreprise + localité déjà importés", urlKey, titleCompanyKey };
  }
  return { status: "nouvelle", urlKey, titleCompanyKey };
}

/** Applique l'anti-doublon sur une liste d'offres dans l'ordre d'import. */
export function classifyImportBatch(offers: ImportOfferLike[]): ImportClass[] {
  const seen = { byUrl: new Set<string>(), byTitle: new Set<string>() };
  return offers.map((o) => {
    const c = classifyImportOffer(o, seen);
    if (c.status === "nouvelle") {
      if (c.urlKey) seen.byUrl.add(c.urlKey);
      if (c.titleCompanyKey !== "||") seen.byTitle.add(c.titleCompanyKey);
    }
    return c;
  });
}

/* ── Orchestration sync ────────────────────────────────────────── */

export type RunSyncOptions = {
  accessToken: string;
  label: { id: string; name: string };
  /** Traite aussi les emails marqués done (re-sync complète). */
  force?: boolean;
  skipAi?: boolean;
  skipEnrich?: boolean;
  enrichMax?: number;
  fetchImpl?: FetchLike;
  sleepImpl?: SleepLike;
  models?: string[];
  /** Plafond d'emails traités dans CE run (budget). */
  maxProcess?: number;
  /** Relance ciblée : n'envisage que ces ids (ignoré si vide). */
  onlyEmailIds?: string[];
  /** Reset des checkpoints error/pending_retry avant ce run (relance_errors). */
  resetErrors?: boolean;
  /** P1-4 : NE fait QUE retenter l'enrichissement (aucune détection IA). */
  enrichOnly?: boolean;
  /** Injection tests pour l'enrichissement. */
  enrichOpts?: EnrichProcessedOptions;
  /** Deadline murale du run (ms) — interrompt proprement avant maxDuration. */
  deadlineMs?: number;
  /** Compte utilisateur (e-mail) : active le watermark `gmail:run:<user>`. */
  userKey?: string;
};

/**
 * Fetch du libellé → pour chaque email non traité (checkpoint) :
 * processEmail → enrichissement optionnel → resume.
 * Quota : skip messages.get full pour les emails déjà done (meta locale).
 * Cache checkpoints borné au run (P1-3) : try/finally garantit endCheckpointCache
 * sur TOUS les chemins (retour, throw, fetch Gmail en échec).
 */
export async function runSync(opts: RunSyncOptions): Promise<SyncOutcome> {
  beginCheckpointCache();
  try {
    return await runSyncInner(opts);
  } finally {
    endCheckpointCache();
  }
}

async function runSyncInner(opts: RunSyncOptions): Promise<SyncOutcome> {
  const metaFor = async (id: string) => {
    const cp = await loadCheckpoint(id);
    if (!cp?.subject) return null;
    return {
      subject: cp.subject,
      from: cp.from ?? "",
      receivedAt: cp.receivedAt ?? cp.at,
    };
  };
  /* Tally des e-mails RÉELLEMENT prévus au traitement → `remaining` exact
     en cas d'interruption (les skip/meta ne comptent pas). */
  let plannedFull = 0;
  const fetched = await fetchLabelEmails(opts.accessToken, opts.label, {
    resolveMode: async (id) => {
      /* P1-4 enrichOnly : aucun e-mail à (re)détecter — lecture seule. */
      if (opts.enrichOnly) {
        const cp = await loadCheckpoint(id);
        return cp?.subject ? "skip" : "meta";
      }
      const inOnly = opts.onlyEmailIds?.length
        ? opts.onlyEmailIds.includes(id)
        : true;
      if (opts.force) {
        if (inOnly) plannedFull++;
        return "full";
      }
      const cp = await loadCheckpoint(id);
      if (!inOnly) {
        return cp?.subject ? "skip" : "meta";
      }
      /* resetErrors simule pending → full pour les erreurs relancées. */
      if (
        opts.resetErrors &&
        cp &&
        (cp.status === "error" || cp.status === "pending_retry")
      ) {
        plannedFull++;
        return "full";
      }
      if (shouldProcessEmail(cp)) {
        plannedFull++;
        return "full";
      }
      return cp?.subject ? "skip" : "meta";
    },
    metaFor,
  });
  const emails = fetched.emails;
  const emailsById = new Map(emails.map((e) => [e.id, e]));

  /* Watermark + état de run : snapshot AVANT traitement, re-listage APRÈS →
     « N nouveaux reçus pendant la synchro » (P1-1). */
  const runKey = opts.userKey ? `gmail:run:${opts.userKey}` : null;
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const snapshotIds = emails.map((e) => e.id);
  const truncated = fetched.truncated === true;
  if (runKey) {
    await storeSet(
      runKey,
      JSON.stringify({ runId, at: new Date().toISOString(), ids: snapshotIds, truncated })
    ).catch(() => {});
  }

  /* Progression live (P0-9) : une clé légère lue par GET /api/gmail/progress
     (1 lecture stockage) — l'UI affiche « N / M » pendant le run. */
  const progressKey = opts.userKey ? `gmail:progress:${opts.userKey}` : null;
  if (progressKey) {
    await storeSet(
      progressKey,
      JSON.stringify({
        processed: 0,
        total: plannedFull,
        runId,
        running: true,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    ).catch(() => {});
  }

  /* Deadline murale (P0-5) : on s'arrête PROPREMENT avant la coupure
     plateforme — la réserve laisse la main à l'enrichissement final. */
  const deadlineAt =
    opts.deadlineMs && opts.deadlineMs > 0 ? Date.now() + opts.deadlineMs : null;
  const ENRICH_RESERVE_MS = 20_000;

  /* Garde-fou : des messages listés mais AUCUN lisible = bug de fetch (400…).
     Sans ce contrôle le sync « réussit » silencieusement à 0 e-mail traité. */
  if (emails.length === 0 && fetched.total > 0 && (fetched.skipped ?? 0) > 0) {
    throw new Error(
      `Lecture impossible de ${fetched.skipped} e-mails du libellé (fetch échoué) : ${
        (fetched.skipErrors ?? [])[0] ?? "détail indisponible"
      }`
    );
  }

  /* Backfill meta d'affichage sur les checkpoints antérieurs (une seule fois). */
  for (const email of emails) {
    if (!email.subject && email.subject !== "(sans objet)") continue;
    const cp = await loadCheckpoint(email.id);
    if (cp && !cp.subject && email.subject) {
      await saveCheckpoint(email.id, {
        ...cp,
        subject: email.subject,
        from: email.from,
        receivedAt: email.receivedAt,
      });
    }
  }

  if (opts.onlyEmailIds && opts.onlyEmailIds.length > 0) {
    const allow = new Set(opts.onlyEmailIds);
    for (const id of allow) {
      if (opts.resetErrors) {
        const cp = await loadCheckpoint(id);
        if (cp && (cp.status === "error" || cp.status === "pending_retry")) {
          await saveCheckpoint(id, { ...cp, status: "pending", retries: 0, error: undefined });
        }
      }
    }
  } else if (opts.resetErrors) {
    for (const email of emails) {
      const cp = await loadCheckpoint(email.id);
      if (cp && (cp.status === "error" || cp.status === "pending_retry")) {
        await saveCheckpoint(email.id, { ...cp, status: "pending", retries: 0, error: undefined });
      }
    }
  }

  const emailsOut: ProcessedEmail[] = [];
  let processedThisRun = 0;
  let skippedDone = 0;
  let errors = 0;
  let pendingRetry = 0;
  let doneCount = 0;
  let interrupted = false;

  const maxProcess = opts.maxProcess ?? emails.length;
  const only = opts.onlyEmailIds && opts.onlyEmailIds.length > 0 ? new Set(opts.onlyEmailIds) : null;
  /* Délai inter-emails (IA) : évite le 429 Gemini en rafale sur les sync longs.
     Désactivé avec skipAi (corpus/tests déterministes). */
  const aiDelayMs = opts.skipAi
    ? 0
    : Math.max(0, Number(process.env.GMAIL_AI_DELAY_MS ?? 1500) || 0);

  /* Écriture de progression bornée : à chaque 10 e-mails traités OU au plus
     toutes les 30 s (au moment où un e-mail se termine) — best-effort pur. */
  let progressLastWrite = 0;
  const noteProgress = (final = false) => {
    if (!progressKey) return;
    const now = Date.now();
    if (!final && processedThisRun % 10 !== 0 && now - progressLastWrite < 30_000) return;
    progressLastWrite = now;
    void storeSet(
      progressKey,
      JSON.stringify({
        processed: processedThisRun,
        total: plannedFull,
        runId,
        running: !final,
        updatedAt: new Date().toISOString(),
        ...(final ? { endedAt: new Date().toISOString() } : {}),
      })
    ).catch(() => {});
  };

  /* Vue « depuis checkpoint » (emails done ou enrichOnly) — sans relecture IA. */
  const viewFromCp = (email: ParsedEmail, cp: EmailCheckpoint): ProcessedEmail =>
    stampAnalysis({
    id: email.id,
    subject: email.subject,
    from: email.from,
    receivedAt: email.receivedAt,
    isOffer: cp.isOffer === true,
    reason: cp.reason ?? (cp.isOffer ? "Traité (checkpoint)" : "Aucune offre de stage identifiée"),
    finalStatus: cp.isOffer ? "detected" : cp.error ? "analyze_error" : "no_offer",
    recoveryUsed: cp.recoveryUsed,
    detectedByCode: cp.detectedByCode,
    detSummary: cp.summary,
    offers: cp.offers ?? [],
    fromCheckpoint: true,
    textLen: undefined,
    hasHtml: undefined,
    linksCount: undefined,
    anchorsCount: cp.summary?.anchorsTotal,
    detectedOffers: (cp.offers ?? []).map((o) => ({
      title: o.title,
      company: o.company,
      applicationUrl: o.applicationUrl,
    })),
    detectionMethod: (cp.detectedByCode ?? 0) > 0 ? "code" : (cp.offers?.length ? "ia" : "none"),
    error: cp.error,
    checkpoint: {
      status: cp.status,
      retries: cp.retries ?? 0,
      at: cp.at,
      recoveryUsed: cp.recoveryUsed,
    },
  });

  for (const email of emails) {
    if (only && !only.has(email.id)) continue;
    const cp = await loadCheckpoint(email.id);
    if (cp?.status === "done") doneCount++;

    /* P1-4 enrichOnly (relaunch_offer) : on ne fait QUE re-passer l'offre
       existante à l'enrichissement — vue checkpoint, aucune détection. */
    if (opts.enrichOnly) {
      skippedDone++;
      if (cp) emailsOut.push(viewFromCp(email, cp));
      continue;
    }

    if (!opts.force && !shouldProcessEmail(cp)) {
      skippedDone++;
      if (cp && cp.status === "done") {
        emailsOut.push(viewFromCp(email, cp));
      }
      continue;
    }

    if (processedThisRun >= maxProcess) {
      /* Budget épuisé : on sort en laissant le reste pour le prochain run. */
      break;
    }

    if (deadlineAt && Date.now() >= deadlineAt - ENRICH_RESERVE_MS) {
      /* Deadline murale atteinte : interruption propre, le reste est compté. */
      interrupted = true;
      break;
    }

    if (aiDelayMs > 0 && processedThisRun > 0) {
      await new Promise((r) => setTimeout(r, aiDelayMs));
    }

    try {
      const processed = await processEmail(email, {
        force: opts.force,
        skipAi: opts.skipAi,
        fetchImpl: opts.fetchImpl,
        sleepImpl: opts.sleepImpl,
        models: opts.models,
      });
      emailsOut.push(processed);
      processedThisRun++;
      if (processed.finalStatus === "analyze_error") errors++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const failed = classifyFailure(cp, msg);
      await saveCheckpoint(email.id, failed);
      emailsOut.push({
        id: email.id,
        subject: email.subject,
        from: email.from,
        receivedAt: email.receivedAt,
        isOffer: false,
        reason: failed.reason ?? "Erreur d'analyse",
        finalStatus: "analyze_error",
        offers: [],
        error: failed.error,
        detectionMethod: "none",
        checkpoint: {
          status: failed.status,
          retries: failed.retries,
          at: failed.at,
        },
      });
      processedThisRun++;
      errors++;
      if (failed.status === "pending_retry") pendingRetry++;
    }
    noteProgress();
  }
  noteProgress(true);

  /* Recalcule pendingRetry depuis les checkpoints rechargés (léger). */
  if (pendingRetry === 0) {
    for (const e of emailsOut) {
      if (e.finalStatus === "analyze_error") {
        const c = await loadCheckpoint(e.id);
        if (c?.status === "pending_retry") pendingRetry++;
      }
    }
  }

  let enrichDeferred = false;
  let enrichRetry: EnrichCounts | undefined;
  if (!opts.skipEnrich) {
    /* Budget restant sous la deadline → l'enrichissement ne dépasse jamais
       la coupure ; sinon il est signalé comme reporté (pas perdu en silence). */
    const enrichBudget = deadlineAt ? deadlineAt - Date.now() : undefined;
    if (enrichBudget !== undefined && enrichBudget <= 5_000) {
      enrichDeferred = true;
    } else {
      const counts = await enrichProcessed(emailsOut, emailsById, {
        max: opts.enrichMax,
        timeBudgetMs: enrichBudget,
        ...opts.enrichOpts,
        /* P1-4 : relaunch_offer retente blocked + les autres non-ok. */
        retryOnly: opts.enrichOnly === true,
      }).catch(() => null);
      if (counts && opts.enrichOnly) enrichRetry = counts;
/* Persister enrichStatus dans les checkpoints (processEmail écrit avant enrich). */
      for (const a of emailsOut) {
        if (!a.isOffer || a.offers.length === 0) continue;
        const cp = await loadCheckpoint(a.id);
        if (cp) await saveCheckpoint(a.id, { ...cp, offers: a.offers });
      }
    }
  }

  const detected = emailsOut.reduce((n, a) => n + a.offers.length, 0);

  /* Anti-doublon tardif : uniquement sur les offres de CE run (import). */
  const flatOffers = emailsOut.flatMap((e) => e.offers);
  const classes = classifyImportBatch(
    flatOffers.map((o) => ({
      title: o.title,
      company: o.company,
      location: o.location,
      applicationUrl: o.applicationUrl,
      dedupUrlKey: o.dedupUrlKey,
      dedupTclKey: o.dedupTclKey,
    }))
  );
  let classIdx = 0;
  for (const e of emailsOut) {
    for (const o of e.offers) {
      const c = classes[classIdx++];
      if (c) {
        o.importStatus = c.status;
        if (c.reason) o.importReason = c.reason;
      }
    }
  }
  const newOffersImported = classes.filter((c) => c.status === "nouvelle").length;
  const duplicatesIgnored = classes.filter((c) => c.status === "doublon").length;
  /* Persister importStatus/classification dans les checkpoints — sans cela le
     dashboard affiche toujours « 0 importées / 0 doublons » (champs en mémoire). */
  for (const e of emailsOut) {
    if (!e.offers.some((o) => o.importStatus)) continue;
    const cp = await loadCheckpoint(e.id);
    if (cp) await saveCheckpoint(e.id, { ...cp, offers: e.offers });
  }
  const noOfferVerified = emailsOut.filter(
    (e) => e.finalStatus === "no_offer"
  ).length;
  const lastSync = new Date().toISOString();

  /* Watermark de fin : re-listage léger (ids seuls) → nouveaux reçus PENDANT
     le run. Best-effort : ne doit jamais faire échouer un run abouti. */
  let arrivedDuringRun: number | undefined;
  if (runKey) {
    try {
      const after = await listLabelIds(opts.accessToken, opts.label);
      const before = new Set(snapshotIds);
      arrivedDuringRun = after.ids.filter((id) => !before.has(id)).length;
      await storeSet(
        runKey,
        JSON.stringify({ runId, endedAt: lastSync, arrivedDuringRun, truncated })
      ).catch(() => {});
    } catch {
      /* best-effort */
    }
  }

  const remaining = Math.max(0, plannedFull - processedThisRun);

  const summary: SyncSummaryGlobal = {
    emailsRead: emailsOut.length,
    emailsProcessed: processedThisRun,
    totalOffersDetected: detected,
    newOffersImported,
    duplicatesIgnored,
    noOfferVerified,
    errors,
    pendingRetry,
    pending: emailsOut.filter(
      (e) => !e.checkpoint || e.checkpoint.status === "pending"
    ).length,
    lastSync,
  };

  return {
    labelFound: true,
    label: opts.label.name,
    emailsRead: emailsOut.length,
    totalInLabel: fetched.total,
    emails: emailsOut,
    detected,
    checkpointStats: {
      done: doneCount,
      processedThisRun,
      skippedDone,
      errors,
      pendingRetry,
    },
    summary,
    fetchSkipped: fetched.skipped ?? 0,
    fetchErrors: fetched.skipErrors ?? [],
    truncated,
    interrupted,
    remaining,
    ...(arrivedDuringRun !== undefined ? { arrivedDuringRun } : {}),
    ...(enrichDeferred ? { enrichDeferred: true } : {}),
    ...(enrichRetry ? { enrichRetry } : {}),
  };
}
