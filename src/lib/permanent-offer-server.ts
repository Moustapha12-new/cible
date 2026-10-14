/* ══════════════════ STOCKAGE SERVEUR CATALOGUE PERMANENT — P4 ══════════════
   Couche d'abstraction pour Supabase/PostgreSQL avec fallback local.
   Utilise le même pattern que gmail-server.ts (storeGet/storeSet/storeDel).
   ═══════════════════════════════════════════════════════════════════════ */

import { supabaseServerConfig, supabaseStorageError } from "@/lib/supabase-server";
import { createHash, randomUUID } from "node:crypto";
import { gmailAccountContext } from "@/lib/gmail-account";

const PERMANENT_CATALOG_PREFIX = "catalog:offers:";
const CATALOG_INDEX_KEY = "catalog:index";
const CATALOG_STATS_KEY = "catalog:stats";
const CATALOG_DEDUP_PREFIX = "catalog:dedup:";

interface SupabaseConfig {
  url: string;
  key: string;
  bucket: string;
}

function getSupabaseConfig(): SupabaseConfig | null {
  const cfg = supabaseServerConfig();
  if (!cfg) return null;
  return {
    url: cfg.url,
    key: cfg.key,
    bucket: cfg.bucket || "cible-permanent-catalog",
  };
}

function objectPath(key: string): string {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error("Supabase non configuré");
  const clean = key.replace(/^\/+/, "");
  return `${cfg.url}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${clean
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function authHeaders(): Record<string, string> {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error("Supabase non configuré");
  return {
    Authorization: `Bearer ${cfg.key}`,
    apikey: cfg.key,
    "Content-Type": "application/json",
  };
}

/* ── Mode de stockage ────────────────────────────────────────────── */

type StorageMode = "supabase" | "local";

function storageMode(): StorageMode {
  if (getSupabaseConfig()) return "supabase";
  if (process.env.VERCEL === "1") throw new Error("Supabase requis en production");
  return "local";
}

function localCatalogDir(): string {
  return join(process.cwd(), ".permanent-catalog");
}

function localKeyPath(key: string): string {
  return join(localCatalogDir(), `${encodeURIComponent(key)}.json`);
}

function scopedKey(key: string): string {
  const account = gmailAccountContext();
  if (!account?.email) throw new Error("Compte utilisateur requis pour le catalogue");
  const owner = createHash("sha256").update(account.email.toLowerCase()).digest("hex");
  return `users/${owner}/${key}`;
}

/* ── Opérations de bas niveau ────────────────────────────────────── */

async function supabaseGet(key: string): Promise<string | null> {
  const res = await fetch(objectPath(key), {
    headers: authHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({})) as { message?: string; error?: string };
    const message = error.message || error.error || "";
    if (/object.*not found/i.test(message) || (res.status === 404 && !/bucket/i.test(message))) return null;
    throw supabaseStorageError(res.status, message);
  }
  const text = await res.text();
  return text.length ? text : null;
}

async function supabaseSet(key: string, value: string): Promise<void> {
  const res = await fetch(objectPath(key), {
    method: "POST",
    headers: { ...authHeaders(), "x-upsert": "true" },
    body: value,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw supabaseStorageError(res.status, await res.text().catch(() => ""));
  }
}

async function supabaseDel(key: string): Promise<void> {
  try {
    const res = await fetch(objectPath(key), {
      method: "DELETE",
      headers: authHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok && res.status !== 404) {
      /* best-effort */
    }
  } catch {
    /* best-effort */
  }
}

async function localGet(key: string): Promise<string | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    return await readFile(localKeyPath(key), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function localSet(key: string, value: string): Promise<void> {
  const { mkdir, writeFile, rename, rm } = await import("node:fs/promises");
  await mkdir(localCatalogDir(), { recursive: true });
  const destination = localKeyPath(key);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, value, "utf8");
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function localDel(key: string): Promise<void> {
  try {
    const { rm } = await import("node:fs/promises");
    await rm(localKeyPath(key), { force: true });
  } catch {
    /* ignore */
  }
}

/* ── API publique ────────────────────────────────────────────────── */

export async function catalogGet(key: string): Promise<string | null> {
  key = scopedKey(key);
  const mode = storageMode();
  if (mode === "supabase") return supabaseGet(key);
  return localGet(key);
}

export async function catalogSet(key: string, value: string): Promise<void> {
  key = scopedKey(key);
  const mode = storageMode();
  if (mode === "supabase") return supabaseSet(key, value);
  return localSet(key, value);
}

export async function catalogDel(key: string): Promise<void> {
  key = scopedKey(key);
  const mode = storageMode();
  if (mode === "supabase") return supabaseDel(key);
  return localDel(key);
}

/* ── Index et recherche ──────────────────────────────────────────── */

export interface CatalogIndexEntry {
  id: string;
  dedupKey: string;
  title: string;
  company: string;
  city?: string;
  region?: string;
  department?: string;
  contractType?: string;
  durationMonths?: number;
  startDate?: string;
  domainPrimary: string;
  domainsSecondary: string[];
  technicalKeywords: string[];
  enrichStatus: string;
  qualificationState?: string;
  qualificationPriority: number;
  isArchived: boolean;
  hasApplication: boolean;
  hasDossier: boolean
  createdAt: string;
  updatedAt: string;
  sourceTypes: string[];
}

export interface CatalogIndex {
  version: number;
  updatedAt: string;
  entries: CatalogIndexEntry[];
  /* Index inversés pour filtres rapides */
  byDedupKey: Record<string, string>;        // dedupKey -> offerId
  byUrlDedupKey: Record<string, string>;     // urlDedupKey -> offerId
  byDomain: Record<string, string[]>;        // domain -> offerIds[]
  byRegion: Record<string, string[]>;        // region -> offerIds[]
  byCity: Record<string, string[]>;          // city -> offerIds[]
  byContractType: Record<string, string[]>;  // contractType -> offerIds[]
  byQualificationState: Record<string, string[]>; // state -> offerIds[]
  bySourceType: Record<string, string[]>;    // sourceType -> offerIds[]
}

const EMPTY_INDEX: CatalogIndex = {
  version: 1,
  updatedAt: new Date().toISOString(),
  entries: [],
  byDedupKey: {},
  byUrlDedupKey: {},
  byDomain: {},
  byRegion: {},
  byCity: {},
  byContractType: {},
  byQualificationState: {},
  bySourceType: {},
};

export async function loadCatalogIndex(): Promise<CatalogIndex> {
  const raw = await catalogGet(CATALOG_INDEX_KEY);
  if (!raw) return { ...EMPTY_INDEX, entries: [], byDedupKey: {}, byUrlDedupKey: {}, byDomain: {}, byRegion: {}, byCity: {}, byContractType: {}, byQualificationState: {}, bySourceType: {} };
  try {
    const parsed = JSON.parse(raw) as CatalogIndex;
    if (!parsed || !Array.isArray(parsed.entries)) throw new Error("Index du catalogue invalide");
    return { ...EMPTY_INDEX, ...parsed };
  } catch {
    throw new Error("Index du catalogue illisible ; aucune écriture ne doit le remplacer.");
  }
}

export async function saveCatalogIndex(index: CatalogIndex): Promise<void> {
  const next: CatalogIndex = {
    ...index,
    version: index.version + 1,
    updatedAt: new Date().toISOString(),
  };
  await catalogSet(CATALOG_INDEX_KEY, JSON.stringify(next));
}

export async function rebuildCatalogIndex(): Promise<CatalogIndex> {
  throw new Error("Reconstruction indisponible sans inventaire fiable des offres.");
}

/* ── Statistiques ────────────────────────────────────────────────── */

export interface CatalogStatsData {
  totalOffers: number;
  byState: Record<string, number>;
  byEnrichStatus: Record<string, number>;
  byDomain: { domain: string; count: number }[];
  byRegion: { region: string; count: number }[];
  byContractType: { type: string; count: number }[];
  bySource: { source: string; count: number }[];
  newThisWeek: number;
  newThisMonth: number;
  archived: number;
  withApplication: number;
  withDossier: number;
  duplicatesDetected: number;
  lastSyncAt?: string;
  updatedAt: string;
}

export async function loadCatalogStats(): Promise<CatalogStatsData | null> {
  const raw = await catalogGet(CATALOG_STATS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CatalogStatsData;
  } catch {
    return null;
  }
}

export async function saveCatalogStats(stats: CatalogStatsData): Promise<void> {
  await catalogSet(CATALOG_STATS_KEY, JSON.stringify({ ...stats, updatedAt: new Date().toISOString() }));
}

export async function computeCatalogStats(index: CatalogIndex): Promise<CatalogStatsData> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthAgo = new Date(now.getTime() - 30 * 86400000);

  const stats: CatalogStatsData = {
    totalOffers: index.entries.length,
    byState: {},
    byEnrichStatus: {},
    byDomain: [],
    byRegion: [],
    byContractType: [],
    bySource: [],
    newThisWeek: 0,
    newThisMonth: 0,
    archived: 0,
    withApplication: 0,
    withDossier: 0,
    duplicatesDetected: 0,
    updatedAt: new Date().toISOString(),
  };

  const domainCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  const contractCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();

  for (const entry of index.entries) {
    if (entry.isArchived) stats.archived++;
    if (entry.hasApplication) stats.withApplication++;
    if (entry.hasDossier) stats.withDossier++;

    stats.byState[entry.qualificationState || "none"] = (stats.byState[entry.qualificationState || "none"] || 0) + 1;
    stats.byEnrichStatus[entry.enrichStatus] = (stats.byEnrichStatus[entry.enrichStatus] || 0) + 1;

    domainCounts.set(entry.domainPrimary, (domainCounts.get(entry.domainPrimary) || 0) + 1);
    if (entry.city) regionCounts.set(entry.city, (regionCounts.get(entry.city) || 0) + 1);
    if (entry.contractType) contractCounts.set(entry.contractType, (contractCounts.get(entry.contractType) || 0) + 1);
    for (const src of entry.sourceTypes) {
      sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
    }

    const created = new Date(entry.createdAt);
    if (created >= weekAgo) stats.newThisWeek++;
    if (created >= monthAgo) stats.newThisMonth++;
  }

  stats.byDomain = [...domainCounts.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count);
  stats.byRegion = [...regionCounts.entries()].map(([region, count]) => ({ region, count })).sort((a, b) => b.count - a.count);
  stats.byContractType = [...contractCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
  stats.bySource = [...sourceCounts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);

  return stats;
}

/* ── Clés de déduplication ───────────────────────────────────────── */

export async function getDedupMapping(dedupKey: string): Promise<string | null> {
  const raw = await catalogGet(`${CATALOG_DEDUP_PREFIX}${dedupKey}`);
  return raw;
}

export async function setDedupMapping(dedupKey: string, offerId: string): Promise<void> {
  await catalogSet(`${CATALOG_DEDUP_PREFIX}${dedupKey}`, offerId);
}

export async function getUrlDedupMapping(urlDedupKey: string): Promise<string | null> {
  const raw = await catalogGet(`${CATALOG_DEDUP_PREFIX}url:${urlDedupKey}`);
  return raw;
}

export async function setUrlDedupMapping(urlDedupKey: string, offerId: string): Promise<void> {
  await catalogSet(`${CATALOG_DEDUP_PREFIX}url:${urlDedupKey}`, offerId);
}

/* ── Offres individuelles ────────────────────────────────────────── */

export function offerKey(id: string): string {
  return `${PERMANENT_CATALOG_PREFIX}${id}`;
}

export async function getOffer(id: string): Promise<string | null> {
  return catalogGet(offerKey(id));
}

export async function setOffer(id: string, data: string): Promise<void> {
  return catalogSet(offerKey(id), data);
}

export async function deleteOffer(id: string): Promise<void> {
  return catalogDel(offerKey(id));
}

/* ── Liste paginée depuis l'index ────────────────────────────────── */

export interface ListOffersOptions {
  filters?: {
    states?: string[];
    domains?: string[];
    regions?: string[];
    cities?: string[];
    contractTypes?: string[];
    enrichStatus?: string[];
    qualificationStates?: string[];
    sourceTypes?: string[];
    isArchived?: boolean;
    hasApplication?: boolean;
    hasDossier?: boolean;
    searchQuery?: string;
    searchFields?: string[];
    startDateFrom?: string;
    startDateTo?: string;
  };
  sortBy?: "relevance" | "createdAt" | "updatedAt" | "startDate" | "title" | "company" | "qualificationState" | "priority";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export async function listOffersFromIndex(options: ListOffersOptions = {}): Promise<{
  entries: CatalogIndexEntry[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const index = await loadCatalogIndex();
  let entries = [...index.entries];

  const { filters, sortBy = "updatedAt", sortDir = "desc", page = 1, pageSize = 50 } = options;

  if (filters) {
    if (filters.isArchived !== undefined) {
      entries = entries.filter(e => e.isArchived === filters.isArchived);
    }
    if (filters.hasApplication) {
      entries = entries.filter(e => e.hasApplication);
    }
    if (filters.hasDossier) {
      entries = entries.filter(e => e.hasDossier);
    }
    if (filters.states?.length) {
      entries = entries.filter(e => filters.states!.includes(e.qualificationState || "none"));
    }
    if (filters.domains?.length) {
      entries = entries.filter(e => filters.domains!.includes(e.domainPrimary) || e.domainsSecondary.some(d => filters.domains!.includes(d)));
    }
    if (filters.regions?.length) {
      entries = entries.filter(e => e.region && filters.regions!.includes(e.region));
    }
    if (filters.cities?.length) {
      entries = entries.filter(e => e.city && filters.cities!.includes(e.city));
    }
    if (filters.contractTypes?.length) {
      entries = entries.filter(e => e.contractType && filters.contractTypes!.includes(e.contractType));
    }
    if (filters.enrichStatus?.length) {
      entries = entries.filter(e => filters.enrichStatus!.includes(e.enrichStatus));
    }
    if (filters.qualificationStates?.length) {
      entries = entries.filter(e => filters.qualificationStates!.includes(e.qualificationState || "none"));
    }
    if (filters.sourceTypes?.length) {
      entries = entries.filter(e => e.sourceTypes.some(s => filters.sourceTypes!.includes(s)));
    }
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const fields = filters.searchFields || ["title", "company", "city", "region"];
      entries = entries.filter(e => {
        const haystack = [
          fields.includes("title") ? e.title : "",
          fields.includes("company") ? e.company : "",
          fields.includes("city") ? e.city : "",
          fields.includes("region") ? e.region : "",
          fields.includes("description") ? "" : "", // description not in index
          fields.includes("skills") ? e.technicalKeywords.join(" ") : "",
        ].join(" ").toLowerCase();
        return haystack.includes(query);
      });
    }
    if (filters.startDateFrom) {
      entries = entries.filter(e => e.startDate && e.startDate >= filters.startDateFrom!);
    }
    if (filters.startDateTo) {
      entries = entries.filter(e => e.startDate && e.startDate <= filters.startDateTo!);
    }
  }

  // Tri
  entries.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "createdAt": cmp = a.createdAt.localeCompare(b.createdAt); break;
      case "updatedAt": cmp = a.updatedAt.localeCompare(b.updatedAt); break;
      case "startDate": {
        const da = a.startDate ? new Date(a.startDate).getTime() : 0;
        const db = b.startDate ? new Date(b.startDate).getTime() : 0;
        cmp = da - db;
        break;
      }
      case "title": cmp = a.title.localeCompare(b.title, "fr"); break;
      case "company": cmp = a.company.localeCompare(b.company, "fr"); break;
      case "qualificationState": cmp = (a.qualificationState || "").localeCompare(b.qualificationState || ""); break;
      case "priority": cmp = b.qualificationPriority - a.qualificationPriority; break;
      default: cmp = b.updatedAt.localeCompare(a.updatedAt);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const total = entries.length;
  const start = (page - 1) * pageSize;
  const paginated = entries.slice(start, start + pageSize);

  return { entries: paginated, total, page, pageSize };
}

/* ── Recherche plein texte (simple, côté serveur) ────────────────── */

export async function searchOffersFullText(query: string, limit = 100): Promise<CatalogIndexEntry[]> {
  const index = await loadCatalogIndex();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  
  return index.entries
    .filter(e => {
      const haystack = [e.title, e.company, e.city, e.region, e.domainPrimary, ...e.domainsSecondary, ...e.technicalKeywords]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every(t => haystack.includes(t));
    })
    .slice(0, limit);
}

import { join } from "node:path";
