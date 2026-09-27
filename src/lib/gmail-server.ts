import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as cheerio from "cheerio";
import { charsetFromContentType, decodeMimeText, decodeRfc2047 } from "@/lib/mime-text";
import { entityChar } from "@/lib/text-repair";

// ── Types d'OAuth ───────────────────────────────────────────────

/** Structure complète d'une connexion OAuth Gmail stockée côté serveur. */
export type GmailConnection = {
  v: number;
  userId: string;
  gmailEmail: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  labelId: string | null;
  labelName: string | null;
  lastSync: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Types partagés ──────────────────────────────────────────────

/** Résumé détecté par le code déterministe (extraits d'offer-links). */
export type DetectSummary = {
  htmlPresent: boolean;
  anchorsTotal: number;
  offerAnchors: number;
  markers: number;
  unique: number;
  verifyOk: boolean | null;
};

/** Message Gmail parsé tel que renvoyé par `fetchLabelEmails`. */
export type ParsedEmail = {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  text: string;
  html: string;
  /** URLs http(s) extraites du texte et des ancres HTML (max 60). */
  links: string[];
};

export type FetchLabelEmailsResult = {
  emails: ParsedEmail[];
  total: number;
  /** Libellé listé au-delà du plafond MAX_MESSAGES → « 500 premiers sur ~N ». */
  truncated?: boolean;
  /** Messages listés mais échoués au fetch (jamais avalés sans trace). */
  skipped?: number;
  /** Dernières erreurs de fetch (max 5), pour diagnostic UI. */
  skipErrors?: string[];
};

/** En-têtes d'affichage d'un e-mail (sans corps — évite messages.get full). */
export type ParsedEmailMeta = {
  subject: string;
  from: string;
  receivedAt: string;
};

/** Comment lire un message du libellé (quota : skip = 0 unité Gmail). */
export type FetchMode = "full" | "meta" | "skip";

export type FetchLabelEmailsOpts = {
  /** full = corps complet · meta = en-têtes · skip = aucun appel messages.get. */
  resolveMode?: (id: string) => Promise<FetchMode> | FetchMode;
  /** Métadonnées locales (checkpoint) quand resolveMode renvoie « skip ». */
  metaFor?: (id: string) => Promise<ParsedEmailMeta | null> | ParsedEmailMeta | null;
  /** Pause entre messages.get (ms). Défaut GMAIL_GET_DELAY_MS ou 25. */
  getDelayMs?: number;
};

// ── Constantes ──────────────────────────────────────────────────

export const GMAIL_LABEL = "Stages – Alertes offres";

const ENC_PREFIX = "enc:v1:";
const STATE_TTL_MS = 15 * 60 * 1000;
/* 500 par défaut : le libellé a atteint 250 (= ancienne limite) et grandit
   chaque jour — au-delà, les plus anciens sortiraient silencieusement. */
const MAX_MESSAGES = Math.max(50, Number(process.env.GMAIL_MAX_MESSAGES || 500) || 500);
const GMAIL_API_BASE = process.env.GMAIL_API_BASE || "https://gmail.googleapis.com/gmail/v1";

// ── Chiffrement des fiches OAuth ────────────────────────────────

function encKey(): Buffer {
  const secret = process.env.GMAIL_ENC;
  if (!secret || secret.length < 16) {
    throw new Error("GMAIL_ENC manquant (chaîne d'au moins 16 caractères)");
  }
  return createHash("sha256").update(secret).digest();
}

function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const plain = Buffer.from(JSON.stringify(value), "utf8");
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

function decryptJson<T>(payload: string): T | null {
  if (!payload.startsWith(ENC_PREFIX)) return null;
  const buf = Buffer.from(payload.slice(ENC_PREFIX.length), "base64");
  if (buf.length < 28) return null;
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  try {
    const decipher = createDecipheriv("aes-256-gcm", encKey(), iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(out.toString("utf8")) as T;
  } catch {
    return null;
  }
}

// ── Stockage clé/valeur (KV REST → Blob → fichier local) ───────

function kvConfig(): { url: string; token: string } | null {
  const pairs: [string, string][] = [
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ["REDIS_REST_API_URL", "REDIS_REST_API_TOKEN"],
  ];
  for (const [uk, tk] of pairs) {
    const url = process.env[uk]?.trim();
    const token = process.env[tk]?.trim();
    if (url && token && /^https?:\/\//i.test(url)) return { url, token };
  }
  return null;
}

function hasBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function supabaseConfig(): { url: string; key: string; bucket: string } | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key || !/^https?:\/\//i.test(url)) return null;
  const bucket = (process.env.SUPABASE_BUCKET || "cible-gmail-storage").trim();
  return { url, key, bucket };
}

const STORAGE_MISSING =
  "Persistance OAuth non configurée : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, KV_REST_API_URL/KV_REST_API_TOKEN, ou BLOB_READ_WRITE_TOKEN requis en production";

async function kvRequest(method: string, path: string, body?: string): Promise<string | null> {
  const kv = kvConfig();
  if (!kv) throw new Error("Stockage clé/valeur non configuré (KV_REST_API_URL / KV_REST_API_TOKEN)");
  const res = await fetch(`${kv.url}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${kv.token}`, "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV HTTP ${res.status}`);
  const text = await res.text();
  return text.length ? text : null;
}

function localStoreDir(): string {
  return join(process.cwd(), ".gmail-tokens");
}

function localKeyPath(key: string): string {
  return join(localStoreDir(), `${encodeURIComponent(key)}.json`);
}

type StorageMode = "supabase" | "kvrest" | "blob" | "local";

function storageMode(): StorageMode {
  if (supabaseConfig()) return "supabase";
  if (kvConfig()) return "kvrest";
  if (hasBlob()) return "blob";
  if (process.env.VERCEL === "1") throw new Error(STORAGE_MISSING);
  return "local";
}

function blobPathname(key: string): string {
  return `gmail/${key.replace(/[^a-zA-Z0-9._@:-]/g, "_")}`;
}

function supabaseObjectPath(key: string): string {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants");
  return `${cfg.url}/storage/v1/object/${cfg.bucket}/${blobPathname(key)}`;
}

function supabaseHeaders(): Record<string, string> {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants");
  return {
    Authorization: `Bearer ${cfg.key}`,
    apikey: cfg.key,
    "Content-Type": "application/octet-stream",
  };
}

async function supabaseGet(key: string): Promise<string | null> {
  if (!supabaseConfig()) return null;
  try {
    const res = await fetch(supabaseObjectPath(key), {
      method: "GET",
      headers: supabaseHeaders(),
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const text = await res.text();
    return text.length ? text : null;
  } catch {
    return null;
  }
}

async function supabasePut(key: string, value: string): Promise<void> {
  const res = await fetch(supabaseObjectPath(key), {
    method: "PUT",
    headers: { ...supabaseHeaders(), "x-upsert": "true" },
    body: value,
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase PUT ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function supabaseDelete(key: string): Promise<void> {
  try {
    const res = await fetch(supabaseObjectPath(key), {
      method: "DELETE",
      headers: supabaseHeaders(),
      cache: "no-store",
    });
    if (!res.ok && res.status !== 404) {
      /* best-effort */
    }
  } catch {
    /* best-effort */
  }
}

async function blobGet(key: string): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const { get } = await import("@vercel/blob");
    const res = await get(blobPathname(key), { access: "private", token, useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const text = await new Response(res.stream).text();
    return text.length ? text : null;
  } catch {
    return null;
  }
}

async function blobPut(key: string, value: string): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN manquant");
  const { put } = await import("@vercel/blob");
  await put(blobPathname(key), value, {
    access: "private",
    token,
    allowOverwrite: true,
    contentType: "application/octet-stream",
  });
}

async function blobDelete(key: string): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return;
  try {
    const { del } = await import("@vercel/blob");
    await del(blobPathname(key), { token });
  } catch {
    /* best-effort */
  }
}

/** Lecture brute d'une valeur stockée (chaîne) ou null. */
export async function storeGet(key: string): Promise<string | null> {
  const mode = storageMode();
  if (mode === "supabase") return supabaseGet(key);
  if (mode === "kvrest") {
    const raw = await kvRequest("GET", `get/${key}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed === null || parsed === undefined) return null;
      return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    } catch {
      return raw;
    }
  }
  if (mode === "blob") return blobGet(key);
  try {
    return await readFile(localKeyPath(key), "utf8");
  } catch {
    return null;
  }
}

/** Écriture brute d'une valeur (chaîne). */
export async function storeSet(key: string, value: string): Promise<void> {
  const mode = storageMode();
  if (mode === "supabase") {
    await supabasePut(key, value);
    return;
  }
  if (mode === "kvrest") {
    await kvRequest("POST", `set/${key}`, JSON.stringify(value));
    return;
  }
  if (mode === "blob") {
    await blobPut(key, value);
    return;
  }
  await mkdir(localStoreDir(), { recursive: true });
  await writeFile(localKeyPath(key), value, "utf8");
}

export async function storeDel(key: string): Promise<void> {
  const mode = storageMode();
  if (mode === "supabase") {
    await supabaseDelete(key);
    return;
  }
  if (mode === "kvrest") {
    try {
      await kvRequest("POST", `del/${key}`);
    } catch {
      /* best-effort */
    }
    return;
  }
  if (mode === "blob") {
    await blobDelete(key);
    return;
  }
  try {
    await rm(localKeyPath(key), { force: true });
  } catch {
    /* best-effort */
  }
}

/* ── Verrou anti-double-run (best-effort) ─────────────────────── */

const SYNC_LOCK_TTL_MS = 300_000;

/** Kv minimal injectable (tests en mémoire, défaut = store serveur). */
export type SimpleKv = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
};

const defaultSyncKv: SimpleKv = { get: storeGet, set: storeSet, del: storeDel };

export function syncLockKey(email: string): string {
  return `gmail:lock:sync:${email}`;
}

/** Verrou frais (< TTL) ? — pur, testable sans stockage. */
export function isSyncLockFresh(raw: string | null, now: number = Date.now()): boolean {
  if (!raw) return false;
  try {
    const at = Number((JSON.parse(raw) as { at?: number }).at ?? 0);
    return Number.isFinite(at) && at > 0 && now - at < SYNC_LOCK_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Tente de prendre le verrou de sync. Retourne le token si pris, null si un
 * run est déjà en cours. Échec de stockage → on prend quand même (jamais
 * bloquant : la synchro reste possible même si la persistance est en rade).
 */
export async function acquireSyncLock(
  email: string,
  kv: SimpleKv = defaultSyncKv,
  now: number = Date.now()
): Promise<string | null> {
  try {
    const raw = await kv.get(syncLockKey(email));
    if (isSyncLockFresh(raw, now)) return null;
    const token = `${now}:${Math.random().toString(36).slice(2, 10)}`;
    await kv.set(syncLockKey(email), JSON.stringify({ at: now, token }));
    return token;
  } catch {
    return `${now}:fallback`;
  }
}

/** Libère le verrou SEULEMENT si le token nous appartient (anti-course). */
export async function releaseSyncLock(
  email: string,
  token: string,
  kv: SimpleKv = defaultSyncKv
): Promise<void> {
  try {
    const raw = await kv.get(syncLockKey(email));
    if (!raw) return;
    const held = JSON.parse(raw) as { token?: string };
    if (held.token === token) await kv.del(syncLockKey(email));
  } catch {
    /* best-effort : le TTL de 300 s nettoie de toute façon */
  }
}

/** true si une persistance serveur est disponible (Supabase, KV, Blob, ou local hors Vercel). */
export function storageReady(): boolean {
  try {
    storageMode();
    return true;
  } catch {
    if (process.env.VERCEL === "1") {
      console.error("[gmail-storage]", STORAGE_MISSING);
    }
    return false;
  }
}

// ── Clés ────────────────────────────────────────────────────────

const oauthKey = (email: string) => `gmail:oauth:${email.toLowerCase()}`;
const legacyTokenKey = (email: string) => `gmail:token:${email.toLowerCase()}`;
const stateKey = (state: string) => `gmail:state:${state}`;
const nowIso = () => new Date().toISOString();

// ── Fiches OAuth ────────────────────────────────────────────────

async function loadOauthRaw(email: string): Promise<GmailConnection | null> {
  const addr = email.toLowerCase();
  const direct = await storeGet(oauthKey(addr));
  if (direct) {
    const decrypted = decryptJson<GmailConnection>(direct);
    if (decrypted) return decrypted;
  }
  /* Migration depuis l'ancien format non chiffré `gmail:token:*`. */
  try {
    const legacy = await storeGet(legacyTokenKey(addr));
    if (legacy) {
      const tok = JSON.parse(legacy) as {
        access_token?: string;
        refresh_token?: string;
        expiry?: number;
        email?: string;
      };
      if (tok.access_token) {
        const migrated: GmailConnection = {
          v: 1,
          userId: addr,
          gmailEmail: tok.email ?? addr,
          accessToken: tok.access_token,
          refreshToken: tok.refresh_token,
          expiresAt: typeof tok.expiry === "number" ? tok.expiry : Date.now() + 3600_000,
          labelId: null,
          labelName: null,
          lastSync: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        await storeSet(oauthKey(addr), encryptJson(migrated));
        await storeDel(legacyTokenKey(addr)).catch(() => {});
        return migrated;
      }
    }
  } catch {
    /* legacy illisible */
  }
  return null;
}

async function saveOauthRaw(conn: GmailConnection): Promise<void> {
  await storeSet(oauthKey(conn.userId.toLowerCase()), encryptJson(conn));
}

export async function getOauthConnection(
  email: string
): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  labelId: string | null;
  lastSync: string | null;
  gmailEmail?: string;
} | null> {
  try {
    const conn = await loadOauthRaw(email);
    if (!conn) return null;
    const valid = conn.expiresAt ? Date.now() < conn.expiresAt : false;
    return {
      accessToken: valid ? conn.accessToken : null,
      refreshToken: conn.refreshToken ?? null,
      expiresAt: conn.expiresAt ?? null,
      labelId: conn.labelId,
      lastSync: conn.lastSync,
      gmailEmail: conn.gmailEmail,
    };
  } catch {
    return null;
  }
}

/**
 * Adresse Gmail à afficher : profil Google > fiche OAuth > compte app.
 * N'jamais l'ancienne adresse migrée (moustaled.ibr…) si une autre source existe.
 */
export function pickGmailDisplayAddress(
  profileEmail?: string | null,
  oauthEmail?: string | null,
  appEmail?: string | null
): string | undefined {
  const legacy = "moustaled.ibr.dj@gmail.com";
  const candidates = [profileEmail, oauthEmail, appEmail]
    .map((s) => (s || "").trim())
    .filter((s) => s && s.toLowerCase() !== legacy);
  return candidates[0] || undefined;
}

export async function saveOauthConnection(email: string, connection: GmailConnection): Promise<void> {
  await saveOauthRaw({ ...connection, userId: connection.userId || email, updatedAt: nowIso() });
}

/** Mise à jour partielle d'une fiche OAuth existante (label, lastSync…). */
export async function updateOauthConnection(
  email: string,
  patch: Partial<Pick<GmailConnection, "labelId" | "labelName" | "lastSync">>
): Promise<GmailConnection | null> {
  const existing = await loadOauthRaw(email);
  if (!existing) return null;
  const next: GmailConnection = { ...existing, ...patch, updatedAt: nowIso() };
  await saveOauthRaw(next);
  return next;
}

export async function deleteOauthConnection(email: string): Promise<void> {
  await storeDel(oauthKey(email));
  await storeDel(legacyTokenKey(email)).catch(() => {});
}

/** Émet un state OAuth lié à un compte (TTL 15 min, consommable une fois). */
export async function createOauthState(email: string): Promise<string> {
  const state = randomBytes(16).toString("hex");
  await storeSet(
    stateKey(state),
    JSON.stringify({ email: email.toLowerCase(), createdAt: Date.now() })
  );
  return state;
}

/** Consomme un state (DELETE atomique best-effort) ; null si absent/périmé. */
export async function consumeOauthState(state: string): Promise<{ email: string } | null> {
  const raw = await storeGet(stateKey(state));
  if (!raw) return null;
  await storeDel(stateKey(state));
  try {
    const parsed = JSON.parse(raw) as { email?: string; createdAt?: number };
    if (!parsed.email) return null;
    if (parsed.createdAt && Date.now() - parsed.createdAt > STATE_TTL_MS) return null;
    return { email: parsed.email };
  } catch {
    return null;
  }
}

/** Token d'accès valide (refresh si expiré) ; throw si non connecté. */
export async function getAccessToken(email: string): Promise<string> {
  let conn = await loadOauthRaw(email);
  if (!conn) throw new Error("Compte Gmail non connecté");
  if (!conn.refreshToken) throw new Error("Session Gmail expirée - reconnecte-toi");
  if (conn.expiresAt > Date.now() + 60_000 && conn.accessToken) return conn.accessToken;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Configuration Google OAuth manquante (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    console.error("[gmail] refresh échoué :", res.status, json.error ?? "");
    if (res.status === 400 || res.status === 401) {
      await deleteOauthConnection(email).catch(() => {});
    }
    throw new Error("Session Gmail expirée - reconnecte-toi");
  }
  conn = {
    ...conn,
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    updatedAt: nowIso(),
  };
  await saveOauthRaw(conn);
  return conn.accessToken;
}

// ── Appels API Gmail ────────────────────────────────────────────

/** true si l'erreur Gmail est un quota / rate-limit (403 Total Query Cost, 429…). */
export function isGmailQuotaError(message: string): boolean {
  return /403|429|quota|rate.?limit|Total Query Cost|too many requests/i.test(message);
}

/** Throttle global — marge sous 6000 unités/min Gmail (full get ≈ 5 unités :
    70ms → ~14 req/s → ~4200 unités/min). */
let gmailLastCallAt = 0;
const GMAIL_MIN_INTERVAL_MS = Math.max(
  0,
  Number(process.env.GMAIL_MIN_INTERVAL_MS ?? 70) || 0
);

async function gmailThrottle(): Promise<void> {
  if (GMAIL_MIN_INTERVAL_MS <= 0) return;
  const now = Date.now();
  const wait = gmailLastCallAt + GMAIL_MIN_INTERVAL_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  gmailLastCallAt = Date.now();
}

/** Backoff premier→dernier essai (ms) — surchargeable via env/tests. */
export const gmailRetryDelaysMs = {
  first: Number(process.env.GMAIL_RETRY_DELAY_MS ?? 800) || 800,
  second: Number(process.env.GMAIL_RETRY_DELAY_MS2 ?? 2500) || 2500,
  /** Quota « per minute » Gmail : la fenêtre ne se libère qu'après ~60s. */
  quotaWindow: Number(process.env.GMAIL_RETRY_DELAY_QUOTA_MS ?? 61000) || 61000,
};

/**
 * GET JSON Gmail — throttle + retry 403/429 (quota) avec backoff.
 * 3 essais rapides (transitoires) ; si le quota « per minute » persiste,
 * attend la fin de la fenêtre Google (61s) puis 1 essai final.
 * Les erreurs non-quotas sont throwées immédiatement.
 */
async function gmailGet<T>(
  endpoint: string,
  accessToken: string
): Promise<{ ok: true; data: T } | { ok: false; quota: boolean; message: string }> {
  await gmailThrottle();
  const res = await fetch(`${GMAIL_API_BASE}/${endpoint}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (res.ok) return { ok: true, data: (await res.json()) as T };
  const errText = await res.text();
  const quota = res.status === 429 || (res.status === 403 && isGmailQuotaError(errText));
  return { ok: false, quota, message: `Gmail API error ${res.status}: ${errText}` };
}

export async function gmailJson<T>(endpoint: string, accessToken: string): Promise<T> {
  const delays = [0, gmailRetryDelaysMs.first, gmailRetryDelaysMs.second];
  let lastMsg = "";
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await new Promise((r) => setTimeout(r, delays[attempt]));
    const out = await gmailGet<T>(endpoint, accessToken);
    if (out.ok) return out.data;
    lastMsg = out.message;
    if (!out.quota) throw new Error(lastMsg);
    if (attempt < delays.length - 1) continue;
    /* Quota résistant : attendre la fenêtre « Units per minute » puis 1 dernier essai. */
    await new Promise((r) => setTimeout(r, gmailRetryDelaysMs.quotaWindow));
    const finalTry = await gmailGet<T>(endpoint, accessToken);
    if (finalTry.ok) return finalTry.data;
    throw new Error(finalTry.message);
  }
  throw new Error(lastMsg || "Gmail API error");
}

export async function findLabel(
  accessToken: string,
  labelName: string
): Promise<{ id: string; name: string } | null> {
  try {
    const labels = await gmailJson<{ labels?: { id: string; name: string }[] }>(
      "users/me/labels",
      accessToken
    );
    const target = labelName.trim().toLowerCase();
    const found = (labels.labels ?? []).find((l) => (l.name || "").trim().toLowerCase() === target);
    if (found) return { id: found.id, name: found.name };
  } catch (e) {
    /* Quota/rate-limit : on ne fait pas semblant que le libellé n'existe pas. */
    if (e instanceof Error && isGmailQuotaError(e.message)) throw e;
    /* autre erreur réseau/parse → libellé introuvable (comportement historique) */
  }
  return null;
}

// ── Parsing MIME ────────────────────────────────────────────────
/* Décodage délégué à mime-text.ts : l'API Gmail renvoie body.data DÉJÀ
   décodé de la transfer-encoding (prouvé live : format=raw contient `=3D`,
   format=full non) — on ne réapplique JAMAIS quoted-printable ici, on
   décroche uniquement selon le charset déclaré dans Content-Type. */

function bodyFromPart(part: {
  body?: { data?: string };
  mimeType?: string;
  headers?: { name: string; value: string }[];
  parts?: unknown[];
}, inheritedCharset?: string | null): string {
  const headers = part.headers ?? [];
  const charset =
    charsetFromContentType(
      headers.find((h) => h.name.toLowerCase() === "content-type")?.value
    ) ??
    inheritedCharset ??
    null;
  const data = part.body?.data || "";
  if (!data) return "";
  try {
    const buf = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (!buf.length) return "";
    return decodeMimeText(buf, charset);
  } catch {
    return "";
  }
}

function walkParts(
  part: {
    mimeType?: string;
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: unknown[];
  },
  acc: { plain: string[]; html: string[] },
  inheritedCharset?: string | null
): void {
  const charset =
    charsetFromContentType(
      part.headers?.find((h) => h.name.toLowerCase() === "content-type")?.value
    ) ??
    inheritedCharset ??
    null;
  if (part.mimeType?.startsWith("text/plain")) acc.plain.push(bodyFromPart(part, charset));
  else if (part.mimeType?.startsWith("text/html")) acc.html.push(bodyFromPart(part, charset));
  for (const child of part.parts ?? []) {
    walkParts(child as typeof part, acc, charset);
  }
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    /* P0-1 : entités numériques DÉCODÉES (jamais supprimées) — miroir de
       gmail-eml : `&#233;` → é, `&#xE9;` → é, avant &amp;. */
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => entityChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => entityChar(parseInt(d, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n +/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** URLs http(s) du texte brut + hrefs HTML, max 60, dédupliquées.
    Les hrefs HTML passent en PRIORITÉ pour ne pas être évincés par le texte. */
function extractLinks(text: string, html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    let u = (raw || "").trim().replace(/&amp;/gi, "&");
    if (u.length < 10) return;
    if (u.startsWith("//")) u = `https:${u}`;
    if (u.startsWith("www.")) u = `https://${u}`;
    if (!/^https?:\/\//i.test(u)) return;
    if (seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };
  /* 1 — hrefs HTML d'abord (quotes simples/doubles, espaces autour de =,
     valeur non quotée). Les relatifs restent rejetés (pas de base URL ici). */
  const hrefRe = /<a\s[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (const m of html.match(hrefRe) ?? []) {
    const href = m.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (href) push(href[1] || href[2] || href[3] || "");
  }
  /* 2 — URLs du texte brut ensuite (quota restant). */
  for (const m of text.match(/https?:\/\/[^\s<>"']+/g) ?? []) push(m);
  return out.slice(0, 60);
}

// ── Lecture des messages du libellé ─────────────────────────────

function parseMessageHeaders(
  msg: {
    payload?: { headers?: { name: string; value: string }[] };
    internalDate?: string;
  }
): { meta: ParsedEmailMeta; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  for (const h of msg.payload?.headers ?? []) headers[h.name] = h.value || "";
  const receivedAt = msg.internalDate
    ? new Date(Number(msg.internalDate)).toISOString()
    : headers["Date"] || new Date().toISOString();
  return {
    meta: {
      subject: decodeRfc2047(headers["Subject"] || "") || "(sans objet)",
      from: decodeRfc2047(headers["From"] || ""),
      receivedAt,
    },
    headers,
  };
}

function emptyParsed(id: string, meta: ParsedEmailMeta): ParsedEmail {
  return {
    id,
    subject: meta.subject,
    from: meta.from,
    receivedAt: meta.receivedAt,
    text: "",
    html: "",
    links: [],
  };
}

/** Liste brute des ids du libellé (pagination seule, plafond MAX_MESSAGES).
    Sert à fetchLabelEmails et au watermark de fin de run (nouveaux reçus
    pendant la synchro) sans re-télécharger les corps. */
export async function listLabelIds(
  accessToken: string,
  label: { id: string }
): Promise<{ ids: string[]; total: number; truncated: boolean }> {
  const ids: string[] = [];
  let pageToken = "";
  let estimate = 0;
  do {
    const list = await gmailJson<{
      messages?: { id: string }[];
      nextPageToken?: string;
      resultSizeEstimate?: number;
    }>(
      `users/me/messages?labelIds=${encodeURIComponent(label.id)}&maxResults=100&fields=messages(id,threadId),nextPageToken,resultSizeEstimate${
        pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
      }`,
      accessToken
    );
    estimate = list.resultSizeEstimate ?? estimate;
    for (const meta of list.messages ?? []) {
      if (ids.length >= MAX_MESSAGES) break;
      ids.push(meta.id);
    }
    pageToken = list.nextPageToken ?? "";
  } while (pageToken && ids.length < MAX_MESSAGES);
  const truncated = Boolean(pageToken) && ids.length >= MAX_MESSAGES;
  return { ids, total: Math.max(estimate, ids.length), truncated };
}

export async function fetchLabelEmails(
  accessToken: string,
  label: { id: string },
  opts?: FetchLabelEmailsOpts
): Promise<FetchLabelEmailsResult> {
  const listing = await listLabelIds(accessToken, label);
  const ids = listing.ids;
  const estimate = listing.total;

  const delay = Math.max(
    0,
    opts?.getDelayMs ?? Number(process.env.GMAIL_GET_DELAY_MS ?? 25) ?? 25
  );
  const emails: ParsedEmail[] = [];
  let skipped = 0;
  const skipErrors: string[] = [];

  /* P1-3 : pré-résolution des modes/métadonnées par chunks parallèles
     (10 concurrents) — c'est le vrai coût séquentiel de la boucle (~267 RTT
     checkpoints). Les fetch Gmail restent séquentiels (quota + délai). */
  const resolved = new Map<string, { mode: FetchMode; meta: ParsedEmailMeta | null }>();
  const RESOLVE_CHUNK = 10;
  for (let i = 0; i < ids.length; i += RESOLVE_CHUNK) {
    await Promise.all(
      ids.slice(i, i + RESOLVE_CHUNK).map(async (id) => {
        let mode: FetchMode = "full";
        try {
          mode = opts?.resolveMode ? await opts.resolveMode(id) : "full";
        } catch {
          mode = "full";
        }
        let meta: ParsedEmailMeta | null = null;
        if (mode === "skip") {
          try {
            meta = opts?.metaFor ? await opts.metaFor(id) : null;
          } catch {
            meta = null;
          }
          if (!meta) mode = "meta";
        }
        resolved.set(id, { mode, meta });
      })
    );
  }

  for (const id of ids) {
    const pre = resolved.get(id);
    let mode: FetchMode = pre?.mode ?? "full";

    if (mode === "skip") {
      const meta = pre?.meta ?? null;
      if (meta) {
        emails.push(emptyParsed(id, meta));
        continue;
      }
      /* pas de meta locale → on retombe sur un get metadata */
      mode = "meta";
    }

    if (delay > 0) await new Promise((r) => setTimeout(r, delay));

    try {
      if (mode === "meta") {
        const msg = await gmailJson<{
          id: string;
          payload?: { headers?: { name: string; value: string }[] };
          internalDate?: string;
        }>(
          `users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date&fields=id,internalDate,payload(headers)`,
          accessToken
        );
        const { meta } = parseMessageHeaders(msg);
        emails.push(emptyParsed(id, meta));
        continue;
      }

      const msg = await gmailJson<{
        id: string;
        payload?: {
          headers?: { name: string; value: string }[];
          body?: { data?: string };
          mimeType?: string;
          parts?: unknown[];
        };
        internalDate?: string;
      }>(
        `users/me/messages/${encodeURIComponent(id)}?format=full&fields=id,internalDate,payload(headers,body,parts,mimeType)`,
        accessToken
      );

      const { meta } = parseMessageHeaders(msg);

      const acc = { plain: [] as string[], html: [] as string[] };
      if (msg.payload) {
        if (msg.payload.mimeType?.startsWith("text/plain")) acc.plain.push(bodyFromPart(msg.payload));
        else if (msg.payload.mimeType?.startsWith("text/html")) acc.html.push(bodyFromPart(msg.payload));
        for (const child of msg.payload.parts ?? []) {
          walkParts(child as Parameters<typeof walkParts>[0], acc);
        }
        if (!acc.plain.length && !acc.html.length && msg.payload.body?.data) {
          acc.plain.push(bodyFromPart(msg.payload));
        }
      }

      const html = acc.html.join("\n");
      const plain = acc.plain.join("\n").trim();
      const text = (plain || htmlToPlainText(html)).slice(0, 40_000);

      emails.push({
        id,
        subject: meta.subject,
        from: meta.from,
        receivedAt: meta.receivedAt,
        text,
        html,
        links: extractLinks(text, html),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      /* Quota en cours de boucle : on arrête fort (retry au caller) au lieu d'avaler. */
      if (isGmailQuotaError(msg)) throw e;
      /* message illisible : compté + journalisé (sinon le sync « réussit » à 0). */
      skipped++;
      if (skipErrors.length < 5) skipErrors.push(`${id}: ${msg.slice(0, 160)}`);
    }
  }

  if (skipped > 0) {
    console.warn(`[gmail] ${skipped}/${ids.length} messages non lus (fetch échoué)`, skipErrors);
  }
  return {
    emails,
    total: Math.max(estimate, emails.length),
    truncated: listing.truncated,
    skipped,
    skipErrors,
  };
}

// ── Représentation structurée HTML pour Gemini ──────────────────

/** Texte structuré d'un HTML d'e-mail pour l'IA : liens [LINK:texte|url],
 *  titres [TITLE:…], scripts/styles retirés. Jamais le HTML brut. */
export function getGeminiHtmlRepresentation(html: string): string {
  if (!html) return "";
  const $ = cheerio.load(html, { scriptingEnabled: false });
  $("script, style, noscript, svg, template, head, [hidden], [aria-hidden]").remove();
  $("a").each((_, el) => {
    const text = $(el).text().trim().slice(0, 80);
    const href = $(el).attr("href") || "";
    if (text || href) $(el).replaceWith(`[LINK:${text}|${href}]`);
  });
  $("h1, h2, h3, h4, h5, h6, .title, .job-title, .company").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 3) $(el).replaceWith(`[TITLE:${text}]`);
  });
  $("[style*='display:none'], [style*='display: none']").remove();
  return $.root().text().replace(/\n{3,}/g, "\n\n").trim();
}
