/* Helpers purs Module 4 — dashboard Alertes Gmail.
   Aucune dépendance serveur : utilisables dans les composants ET les tests. */

import type { ProcessedEmail, RawOffer, SyncSummaryGlobal, DetectionMethod, CheckpointStatus, EmailAnalysisState, EmailAnalysisResult } from "@/lib/gmail-core";
import { entityChar } from "@/lib/text-repair";

export type {
  ProcessedEmail,
  RawOffer,
  SyncSummaryGlobal,
  DetectionMethod,
  CheckpointStatus,
  EmailAnalysisState,
  EmailAnalysisResult,
};

/* ── P0-2 : état d'analyse (processus) vs résultat (contenu) ─────
   Helpers purs ici (client-safe) : gmail-core (serveur) importe
   stampAnalysis depuis ce module — jamais l'inverse en runtime. */

export function analysisStateOf(e: ProcessedEmail): EmailAnalysisState {
  if (e.analysisState) return e.analysisState;
  const st = e.checkpoint?.status;
  if (st === "pending_retry") return "retry";
  if (st === "error" || e.finalStatus === "analyze_error") return "error";
  if (st === "done") return "analyzed";
  return "to_sync";
}

export function analysisResultOf(e: ProcessedEmail): EmailAnalysisResult {
  if (e.analysisResult !== undefined) return e.analysisResult;
  if (analysisStateOf(e) !== "analyzed") return null;
  return e.finalStatus === "detected" && e.offers.length > 0 ? "offer" : "none";
}

/** Attache les deux champs dérivés (payload auto-descriptif). */
export function stampAnalysis(e: ProcessedEmail): ProcessedEmail {
  return { ...e, analysisState: analysisStateOf(e), analysisResult: analysisResultOf(e) };
}

/* ── P0-3 : « Lien non direct » (miroir client pur de
   offer-links.isIndeedOpaqueUrl — offer-links import cheerio + node:zlib et
   n'est JAMAIS importé côté client ; ce helper sert aux composants et aux
   payloads antérieurs au champ `indirect`). */
export function isIndirectOfferUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (!/indeed\.com$/i.test(u.hostname)) return false;
    const jk = (u.searchParams.get("jk") || "").trim();
    if (/^[0-9a-zA-Z]{13,24}$/.test(jk)) return false;
    return (
      /^\/f\/a\//i.test(u.pathname) ||
      /^\/v3\//i.test(u.pathname) ||
      /\/pagead\/clk/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

/* ── Réponse GET /api/gmail/dashboard ─────────────────────────── */

export type DashboardConnection = {
  connected: boolean;
  configured: boolean;
  gmailAccount?: string;
  lastSync?: string | null;
  reason?: string;
};

export type DashboardPayload = {
  ok: boolean;
  error?: string;
  reason?: string;
  /** Message technique d'origine si `error`/`reason` a été humanisé (replié en UI). */
  detail?: string;
  labelFound: boolean;
  label: string;
  totalInLabel: number;
  connected: boolean;
  configured: boolean;
  gmailAccount?: string;
  lastSync?: string | null;
  emails: ProcessedEmail[];
  summary: SyncSummaryGlobal;
  hint?: string;
  /** Libellé listé au-delà du plafond (« 500 premiers sur ~N »). */
  truncated?: boolean;
  /** P0-4 : réponse servie depuis le snapshot persistant (pas de rebuild). */
  fromSnapshot?: boolean;
  /** P0-4 : horodatage de construction du snapshot. */
  snapshotAt?: string;
};

export function emptySummary(lastSync = ""): SyncSummaryGlobal {
  return {
    emailsRead: 0,
    emailsProcessed: 0,
    totalOffersDetected: 0,
    newOffersImported: 0,
    duplicatesIgnored: 0,
    noOfferVerified: 0,
    errors: 0,
    pendingRetry: 0,
    pending: 0,
    lastSync,
  };
}

/** Agrège un résumé global à partir des e-mails déjà traités (checkpoints). */
export function buildSummary(
  emails: ProcessedEmail[],
  lastSync: string | null | undefined,
  totalInLabel: number
): SyncSummaryGlobal {
  const summary = emptySummary(lastSync ?? "");
  summary.emailsRead = totalInLabel || emails.length;
  for (const e of emails) {
    const status = e.checkpoint?.status;
    if (status === "done") summary.emailsProcessed += 1;
    else if (status === "pending_retry") summary.pendingRetry += 1;
    else if (status === "error" || e.finalStatus === "analyze_error") summary.errors += 1;
    /* P0-2 : « En attente » = jamais traité (checkpoint absent ou pending). */
    else if (!status || status === "pending") summary.pending += 1;

    if (e.finalStatus === "no_offer" && status === "done") summary.noOfferVerified += 1;
    for (const o of e.offers) {
      summary.totalOffersDetected += 1;
      if (o.importStatus === "nouvelle") summary.newOffersImported += 1;
      else if (o.importStatus === "doublon") summary.duplicatesIgnored += 1;
    }
  }
  return summary;
}

/* ── Statut visuel d'un e-mail (P0-2) ──────────────────────────
   5 états UI = combinaison analysisState × analysisResult :
   À synchroniser · Analysé — offre trouvée · Analysé — aucune offre ·
   À réessayer · Erreur */

export type EmailVisualStatus = "success" | "warning" | "error" | "empty" | "pending";

export function emailVisualStatus(e: ProcessedEmail): EmailVisualStatus {
  const state = analysisStateOf(e);
  if (state === "error") return "error";
  if (state === "retry") return "warning";
  if (state === "to_sync") return "pending";
  return analysisResultOf(e) === "offer" ? "success" : "empty";
}

export const STATUS_GLYPH: Record<EmailVisualStatus, string> = {
  success: "✓",
  warning: "⚠",
  error: "✖",
  empty: "○",
  pending: "○",
};

export const STATUS_LABEL: Record<EmailVisualStatus, string> = {
  success: "Analysé — offre trouvée",
  warning: "À réessayer",
  error: "Erreur",
  empty: "Analysé — aucune offre",
  pending: "À synchroniser",
};

export const STATUS_CLASS: Record<EmailVisualStatus, string> = {
  success: "text-mint",
  warning: "text-amber",
  error: "text-red",
  empty: "text-muted",
  pending: "text-muted",
};

/* ── Méthode de détection ─────────────────────────────────────── */

export function detectionMethodOf(e: ProcessedEmail): DetectionMethod {
  if (e.detectionMethod) return e.detectionMethod;
  const code = e.detectedByCode ?? 0;
  const total = e.offers.length;
  if (code > 0 && total > code) return "code+ia";
  if (code > 0) return "code";
  if (total > 0) return "ia";
  return "none";
}

export const METHOD_LABEL: Record<DetectionMethod, string> = {
  code: "Code",
  ia: "IA",
  "code+ia": "Code + IA",
  none: "—",
};

/* ── Dates ────────────────────────────────────────────────────── */

/** "Aujourd'hui à 16:42" · "Hier à 09:14" · "Il y a 19h" · "Il y a 3j" */
export function formatLastSync(iso: string | null | undefined): string {
  if (!iso) return "jamais";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "jamais";
  const now = new Date();
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((day0.getTime() - d0.getTime()) / 86_400_000);
  if (diffDays === 0) return `Aujourd'hui à ${time}`;
  if (diffDays === 1) return `Hier à ${time}`;
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins < 60) return `Il y a ${mins} min`;
  if (diffDays < 7 && d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" }) + ` à ${time}`;
  }
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays)}j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** Date reçue d'un e-mail, courte. */
export function formatEmailDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── Expéditeur ───────────────────────────────────────────────── */

/** "LinkedIn <jobs@linkedin.com>" → "jobs@linkedin.com" (ou nom si pas d'@). */
export function extractSender(from: string): string {
  const m = /<([^>]+)>/.exec(from || "");
  if (m) return m[1];
  return (from || "").trim() || "—";
}

/** Affichage court : "LinkedIn" si domaine identifiable, sinon email tronqué. */
export function senderLabel(from: string): string {
  const addr = extractSender(from);
  if (!addr.includes("@")) return addr.slice(0, 40);
  const domain = addr.split("@")[1] || "";
  const base = domain.split(".")[0];
  if (!base || base === "gmail" || base === "yahoo" || base === "orange" || base === "free") {
    return addr.length > 32 ? addr.slice(0, 30) + "…" : addr;
  }
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/* ── Progression ──────────────────────────────────────────────── */

export function progressPct(processed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((processed / total) * 100)));
}

/* ── Métadonnées techniques (EmailDetail) ─────────────────────── */

export type EmailMetaRow = { label: string; value: string };

export function emailMetaRows(e: ProcessedEmail): EmailMetaRow[] {
  return [
    { label: "textLen", value: e.textLen != null ? String(e.textLen) : "—" },
    { label: "hasHtml", value: e.hasHtml != null ? String(e.hasHtml) : "—" },
    { label: "linksCount", value: e.linksCount != null ? String(e.linksCount) : "—" },
    { label: "anchorsCount", value: e.anchorsCount != null ? String(e.anchorsCount) : "—" },
    { label: "detectionMethod", value: METHOD_LABEL[detectionMethodOf(e)] },
    { label: "recoveryUsed", value: e.recoveryUsed ? "oui" : "non" },
    {
      label: "checkpoint",
      value: e.checkpoint
        ? `${e.checkpoint.status} · retries=${e.checkpoint.retries}${e.checkpoint.at ? ` · ${e.checkpoint.at}` : ""}`
        : "absent",
    },
  ];
}

/* ── Badge enrichissement ─────────────────────────────────────── */

export type EnrichBadge = { label: string; cls: string };

export function enrichBadge(status: RawOffer["enrichStatus"] | undefined): EnrichBadge {
  switch (status) {
    case "ok":
      return { label: "enrichie", cls: "pill pill--ok" };
    case "partial":
      return { label: "enrichie (partielle)", cls: "pill pill--wait" };
    case "blocked":
      return { label: "site protégé — réessai auto", cls: "pill" };
    case "skipped":
      return { label: "non enrichie (délai dépassé)", cls: "pill" };
    default:
      return { label: "non enrichie", cls: "pill" };
  }
}

/** P2-1 : raison d'e-mail humanisée à l'affichage (le texte brut reste
    disponible côté serveur/checkpoint, jamais réécrit). */
export function humanizeReason(reason: string): string {
  if (!reason) return reason;
  const m = reason.match(/\((\d+) offre/);
  const n = m ? Number(m[1]) : null;
  if (reason.includes("analyse IA en échec")) {
    return n !== null
      ? `${n} offre${n > 1 ? "s" : ""} détectée${n > 1 ? "s" : ""} sans l'IA (analyse en échec)`
      : "Extraction sans l'IA (analyse en échec)";
  }
  if (reason.includes("JSON partiel récupéré")) {
    return n !== null
      ? `${n} offre${n > 1 ? "s" : ""} détectée${n > 1 ? "s" : ""} avec l'aide de l'IA`
      : "Offres détectées avec l'aide de l'IA";
  }
  return reason;
}

/* ── Validation actions POST /api/gmail/sync ──────────────────── */

export type SyncAction = "sync" | "relaunch_errors" | "relaunch_email" | "relaunch_offer";

export type SyncBodyParsed =
  | { ok: true; email: string; action: SyncAction; emailId: string; debug: boolean; force: boolean }
  | { ok: false; error: string; status: 400 | 401 };

/** Parse et valide le corps JSON de POST /api/gmail/sync (logique de route). */
export function parseSyncBody(raw: unknown): SyncBodyParsed {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Requête invalide", status: 400 };
  }
  const body = raw as Record<string, unknown>;
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return { ok: false, error: "Compte utilisateur manquant", status: 400 };
  let action: SyncAction = "sync";
  if (
    body.action === "relaunch_errors" ||
    body.action === "relaunch_email" ||
    body.action === "relaunch_offer"
  ) {
    action = body.action;
  }
  const emailId = String(body.emailId || "").trim();
  if ((action === "relaunch_email" || action === "relaunch_offer") && !emailId) {
    return { ok: false, error: `emailId manquant pour ${action}`, status: 400 };
  }
  return {
    ok: true,
    email,
    action,
    emailId,
    debug: body.debug === true,
    force: body.force === true,
  };
}

/* ── GET query ────────────────────────────────────────────────── */

export function parseDashboardQuery(search: string): { ok: true; email: string } | { ok: false; error: string } {
  const params = new URLSearchParams(search);
  const email = (params.get("email") || "").trim().toLowerCase();
  if (!email) return { ok: false, error: "Compte utilisateur manquant" };
  return { ok: true, email };
}

/* ── P0-5 : payload allégé (snippet / sourceUrl sortis) ─────────── */

/** P0-5 : copie des offres SANS snippet (HTML volumineux, ~4 Mo au total)
    ni sourceUrl (preuve brute) — les deux se régénèrent à la demande via
    GET /api/gmail/offer-detail. Tous les autres champs sont conservés. */
export function slimOffers(offers: RawOffer[]): RawOffer[] {
  if (!Array.isArray(offers) || offers.length === 0) return offers ?? [];
  return offers.map((o) => {
    if (!o || (o.snippet === undefined && o.sourceUrl === undefined)) return o;
    const copy: RawOffer = { ...o };
    delete copy.snippet;
    delete copy.sourceUrl;
    return copy;
  });
}

/* ── P0-4 : cache client du payload (affichage immédiat au boot) ── */

const PAYLOAD_CACHE_PREFIX = "cible:gmail:payload:v1:";

function payloadCacheKey(email: string): string {
  return `${PAYLOAD_CACHE_PREFIX}${(email || "").trim().toLowerCase()}`;
}

function localStorageAvailable(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

/** Dernier payload valide mis en cache — affichage instantané (SWR) au boot. */
export function loadPayloadCache(email: string): DashboardPayload | null {
  if (!email || !localStorageAvailable()) return null;
  try {
    const raw = localStorage.getItem(payloadCacheKey(email));
    if (!raw) return null;
    const j = JSON.parse(raw) as DashboardPayload;
    if (!j || j.ok !== true || !Array.isArray(j.emails)) return null;
    return j;
  } catch {
    return null;
  }
}

/** Persiste le payload après chaque fetch réussi (best-effort : quota/privé). */
export function savePayloadCache(email: string, payload: DashboardPayload): void {
  if (!email || !payload?.ok || !localStorageAvailable()) return;
  try {
    localStorage.setItem(payloadCacheKey(email), JSON.stringify(payload));
  } catch {
    /* quota plein ou mode privé — le refresh réseau reste la source de vérité */
  }
}

/** Purge le cache local (déconnexion). */
export function clearPayloadCache(email: string): void {
  if (!email || !localStorageAvailable()) return;
  try {
    localStorage.removeItem(payloadCacheKey(email));
  } catch {
    /* best-effort */
  }
}

/* ── Affichage propre des offres (étape 4) ─────────────────────── */

/** Texte lisible depuis un fragment HTML (snippets / descriptions d'offre). */
export function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    /* P0-1 : entités numériques décodées (jamais laissées littérales). */
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => entityChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => entityChar(parseInt(d, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** URL affichable : complète si courte, sinon « hôte…queue » (l'attribut
    title et le href restent l'URL entière — jamais tronquée pour le navigateur). */
export function shortUrl(url: string): string {
  if (!url) return "";
  if (url.length <= 64) return url;
  try {
    const u = new URL(url);
    return `${u.host}…${url.slice(-28)}`;
  } catch {
    return `…${url.slice(-40)}`;
  }
}

/** Logo d'entreprise dans le HTML d'une offre (<img src http(s), hors pixels
    de tracking) — null si rien de fiable : pas de faux logo inventé. */
export function extractLogoSrc(html: string | undefined): string | null {
  if (!html) return null;
  const m = /<img[^>]*\ssrc=["']([^"']+)["']/i.exec(html);
  if (!m) return null;
  const src = m[1].trim();
  if (!/^https?:\/\//i.test(src)) return null;
  if (/(pixel|track|beacon|spacer|blank\.gif|1x1)/i.test(src)) return null;
  return src;
}

/* ── Erreurs d'infra → phrase FR (P0-7) ──────────────────────── */

export type HumanError = { human: string; detail?: string };

/** Règles ordonnées : pattern technique → phrase FR ($1 = groupe capturé).
    Sans correspondance, le message d'origine passe tel quel (déjà FR). */
const HUMAN_RULES: [RegExp, string][] = [
  [
    /BLOB_READ_WRITE_TOKEN|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL|KV_REST_API|Persistance OAuth non configur/i,
    "Le stockage serveur n'est pas configuré sur ce déploiement — la connexion Gmail ne peut pas être enregistrée.",
  ],
  [/Supabase PUT (\d+)/i, "Le stockage serveur a refusé une écriture (HTTP $1) — réessaie dans un instant."],
  [/KV HTTP (\d+)/i, "Le cache serveur est momentanément indisponible (HTTP $1) — réessaie."],
  /* Quota IA (P1-10) : Gemini + 429/quota → phrase dédiée, jamais le brut. */
  [
    /(?:gemini|quota ia|flash-lite)[\s\S]*?(?:HTTP 429|rate.?limit|quota)|(?:HTTP 429|rate.?limit|quota)[\s\S]*?(?:gemini|quota ia|flash-lite)/i,
    "Analyse en attente — quota IA régénéré demain (réessaie plus tard).",
  ],
  [/HTTP 429|rate.?limit|quota/i, "Limite de requêtes atteinte — réessaie dans quelques minutes."],
  [/HTTP (5\d\d)/i, "Service momentanément indisponible (HTTP $1) — réessaie dans un instant."],
  [/HTTP (401|403)|invalid_grant|Gmail non connect/i, "Session Gmail expirée ou absente — reconnecte-toi."],
  [/timeout|ETIMEDOUT|aborted|d[ée]lai d[ée]pass/i, "Délai dépassé — Gmail a mis trop de temps à répondre."],
  [
    /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|erreur r[ée]seau|network/i,
    "Problème de réseau — vérifie ta connexion puis réessaie.",
  ],
  [
    /Lecture impossible de (\d+) e-mails/i,
    "$1 e-mail(s) du libellé n'ont pas pu être lus — relance la synchronisation.",
  ],
];

/** Traduit une erreur technique brute en phrase FR compréhensible.
    `detail` = message d'origine (à afficher replié) uniquement s'il diffère. */
export function humanizeGmailError(err: unknown): HumanError {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return { human: "Erreur inattendue — réessaie." };
  for (const [re, tpl] of HUMAN_RULES) {
    const m = re.exec(raw);
    if (m) {
      const human = tpl.replace(/\$(\d)/g, (_, d: string) => m[Number(d)] ?? "");
      return { human, detail: raw };
    }
  }
  return { human: raw };
}

/* ── Dernière synchro persistée (P0-8) ───────────────────────── */

/** Résumé du DERNIER run complet (réponse POST /api/gmail/sync), persisté
    côté client → le bloc « dernière synchro » survit au rechargement. */
export type LastRunStats = {
  at: string;
  action: SyncAction;
  emailsRead: number;
  processedThisRun: number;
  totalOffersDetected: number;
  newOffersImported: number;
  duplicatesIgnored: number;
  errors: number;
  pendingRetry: number;
  totalInLabel?: number;
  truncated?: boolean;
  interrupted?: boolean;
  remaining?: number;
  arrivedDuringRun?: number;
  enrichDeferred?: boolean;
};

const lastRunKey = (email: string) => `cible:gmail:lastrun:v1:${email.toLowerCase()}`;

export function saveLastRun(email: string, run: LastRunStats): void {
  if (typeof window === "undefined" || !email) return;
  try {
    window.localStorage.setItem(lastRunKey(email), JSON.stringify(run));
  } catch {
    /* stockage plein / mode privé — la carte retombe simplement sur le cumul */
  }
}

export function loadLastRun(email: string): LastRunStats | null {
  if (typeof window === "undefined" || !email) return null;
  try {
    const raw = window.localStorage.getItem(lastRunKey(email));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LastRunStats>;
    if (!v || typeof v.at !== "string") return null;
    return v as LastRunStats;
  } catch {
    return null;
  }
}

/* ── P3-1 : historique des syncs (gmail:run:hist:*) ────────────
   Une clé par run, bornée aux RUN_HIST_MAX plus récents — la liste
   cliquable du dashboard survit aux toasts (4,2 s) et aux reloads. */

export type RunHistEntry = {
  at: string;
  action: string;
  emailsRead: number;
  processed: number;
  offers: number;
  created: number;
  errors: number;
  durationMs: number;
};

export const RUN_HIST_MAX = 20;

const runHistPrefix = (email: string) => `cible:gmail:run:hist:${email.toLowerCase()}:`;
const runHistKey = (email: string, at: string) => `${runHistPrefix(email)}${at}`;

export function saveRunHist(email: string, entry: RunHistEntry): void {
  if (typeof window === "undefined" || !email) return;
  try {
    window.localStorage.setItem(runHistKey(email, entry.at), JSON.stringify(entry));
    /* Bornage : au-delà de RUN_HIST_MAX, les entrées les plus vieilles partent. */
    const all = loadRunHist(email);
    if (all.length > RUN_HIST_MAX) {
      for (const old of all.slice(RUN_HIST_MAX)) {
        window.localStorage.removeItem(runHistKey(email, old.at));
      }
    }
  } catch {
    /* stockage plein / mode privé — l'historique est un confort, pas un blocage */
  }
}

export function loadRunHist(email: string): RunHistEntry[] {
  if (typeof window === "undefined" || !email) return [];
  try {
    const prefix = runHistPrefix(email);
    const ls = window.localStorage;
    const out: RunHistEntry[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const v = JSON.parse(ls.getItem(k) || "null") as Partial<RunHistEntry>;
      if (v && typeof v.at === "string") out.push(v as RunHistEntry);
    }
    out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return out;
  } catch {
    return [];
  }
}

/** Estimation en minutes : moyenne du run extrapolée au reste (null si trop tôt). */
export function etaMinutes(processed: number, total: number, elapsedMs: number): number | null {
  if (processed <= 0 || total <= processed || elapsedMs < 5_000) return null;
  const perEmail = elapsedMs / processed;
  return Math.max(1, Math.round(((total - processed) * perEmail) / 60_000));
}

/* ── P1-6 : variantes probable (groupement UI, jamais exclusion) ── */

/** Seuil de similarité titre au-delà duquel deux offres sont une « variante probable ». */
export const VARIANT_SIM_THRESHOLD = 0.9;

function normalizeTitle(s: string): string {
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

/** Coefficient de Dice sur bigrammes (0..1) : titres quasi identiques ≥ 0.9. */
export function titleSimilarity(a: string, b: string): number {
  const sa = normalizeTitle(a);
  const sb = normalizeTitle(b);
  if (!sa || !sb) return sa === sb ? 1 : 0;
  if (sa === sb) return 1;
  if (sa.length < 2 || sb.length < 2) return 0;
  const ma = bigramCounts(sa);
  const mb = bigramCounts(sb);
  let hits = 0;
  for (const [g, c] of ma) hits += Math.min(c, mb.get(g) || 0);
  return (2 * hits) / (sa.length - 1 + (sb.length - 1));
}

/** P1-6 : offres dont le titre est ≥ VARIANT_SIM_THRESHOLD similaire à celui
    d'une autre offre de la liste AVEC une URL différente. Retourne les clés
    `${emailId}#${offerIndex}` à badger « variante probable » — regroupement
    UI uniquement : ces offres ne sont JAMAIS exclues de l'import. */
export function findVariantKeys(
  emails: { id: string; offers: { title: string; applicationUrl: string }[] }[]
): Set<string> {
  const items: {
    key: string;
    norm: string;
    grams: Map<string, number>;
    url: string;
    len: number;
  }[] = [];
  for (const em of emails) {
    em.offers.forEach((o, i) => {
      const norm = normalizeTitle(o.title || "");
      if (norm.length < 8) return; // titres trop courts : faux positifs
      items.push({
        key: `${em.id}#${i}`,
        norm,
        grams: bigramCounts(norm),
        url: (o.applicationUrl || "").trim(),
        len: norm.length,
      });
    });
  }
  const out = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (a.url && a.url === b.url) continue; // même URL = même offre, pas variante
      if (Math.abs(a.len - b.len) > Math.max(a.len, b.len) * 0.5) continue;
      let hits = 0;
      for (const [g, c] of a.grams) hits += Math.min(c, b.grams.get(g) || 0);
      const sim = (2 * hits) / (a.len - 1 + b.len - 1);
      if (sim >= VARIANT_SIM_THRESHOLD) {
        out.add(a.key);
        out.add(b.key);
      }
    }
  }
  return out;
}
