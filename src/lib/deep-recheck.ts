/* ═══════════ Deep Recheck — audit indépendant des e-mails Gmail ═══════════
   Deuxième passe VÉRITÉ, totalement découplée du pipeline /api/gmail/sync :
   1. Détection exhaustive par lots de ≤5 e-mails (fallback 5→3→1).
   2. Analyse profonde 1 offre / requête (bloc isolé + lien réel + page).
   AUCUNE déduplication : chaque observation est conservée telle quelle.
   Checkpoints persistants (storeGet/storeSet) pour reprise après erreur. */

import { askJson } from "@/lib/ai";
import {
  fetchLabelEmails,
  findLabel,
  getAccessToken,
  storeDel,
  storeGet,
  storeSet,
  GMAIL_LABEL,
  type ParsedEmail,
} from "@/lib/gmail-server";
import { extractAnchorMap, isolateBlock } from "@/lib/offer-links";
import { fetchOfferPage } from "@/lib/scrape";

/* ── Types ─────────────────────────────────────────────────────── */

export type DeepDetectOffer = {
  title: string;
  anchorText: string;
  sourceUrl: string;
  snippet: string;
};

export type DeepEmailDetect = {
  emailId: string;
  containsInternshipOffer: boolean;
  offerCount: number;
  confidence: "high" | "medium" | "low" | string;
  offers: DeepDetectOffer[];
  detectStatus: "ok" | "error";
  detectError?: string;
};

export type DeepOfferStatus = "pending" | "ok" | "blocked" | "partial";

export type DeepOfferData = {
  title: string;
  company: string;
  location: string;
  contract: string;
  duration: string;
  deadline: string;
  skills: string[];
  missions: string[];
  profile: string[];
  description: string;
  applicationInfo: string;
  sourceUrl: string;
  anchorText: string;
  snippet: string;
};

export type DeepOfferRecord = {
  key: string;
  emailId: string;
  emailSubject: string;
  emailFrom: string;
  receivedAt: string;
  index: number;
  detect: DeepDetectOffer;
  status: DeepOfferStatus;
  reason: string;
  data: DeepOfferData;
  analyzedAt?: string;
};

export type DeepBatchStatus = "pending" | "done" | "error";

export type DeepBatchMeta = {
  index: number;
  emailIds: string[];
  status: DeepBatchStatus;
  updatedAt: string;
  error?: string;
};

export type DeepPhase = "init" | "detect" | "analyze" | "done";

export type DeepMeta = {
  v: 1;
  email: string;
  phase: DeepPhase;
  startedAt: string;
  updatedAt: string;
  totalEmails: number;
  batchSize: number;
  batches: DeepBatchMeta[];
  detectDone: number;
  offersTotal: number;
  offersAnalyzed: number;
  lastError?: string;
};

export type DeepReport = {
  emailsExamined: number;
  emailsWithOffer: number;
  emailsWithoutOffer: number;
  emailsAmbiguous: number;
  offersDetected: number;
  offersWithUrl: number;
  offersWithoutUrl: number;
  emailsWithOneOffer: number;
  emailsWithMultipleOffers: number;
  offersAnalyzedOk: number;
  offersBlocked: number;
  offersPartial: number;
  offersPending: number;
  byEmail: {
    emailId: string;
    subject: string;
    from: string;
    offerCount: number;
    containsInternshipOffer: boolean;
    confidence: string;
    offers: {
      n: number;
      title: string;
      url: string;
      status: DeepOfferStatus;
      reason: string;
    }[];
  }[];
  text: string;
};

/* ── Clés de checkpoint (indépendantes du pipeline sync) ───────── */

const esc = (s: string) => s.toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
const metaKey = (email: string) => `gmail:deep:meta:${esc(email)}`;
const emailsKey = (email: string) => `gmail:deep:emails:${esc(email)}`;
const batchKey = (email: string, i: number) => `gmail:deep:batch:${esc(email)}:${String(i).padStart(3, "0")}`;
const offerKey = (email: string, key: string) => `gmail:deep:offer:${esc(email)}:${esc(key)}`;

const BATCH_SIZE = 5;
const nowIso = () => new Date().toISOString();

async function loadJson<T>(key: string): Promise<T | null> {
  const raw = await storeGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function saveJson(key: string, value: unknown): Promise<void> {
  await storeSet(key, JSON.stringify(value));
}

/* ── Utilitaires ───────────────────────────────────────────────── */

async function mapLimit<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/** sourceUrl n'est acceptée que si elle figure dans links ou anchors de l'e-mail. */
function sanitizeSourceUrl(
  candidate: string,
  links: string[],
  anchors: { text: string; href: string }[]
): string {
  const raw = (candidate || "").trim();
  if (!raw) return "";
  const set = new Set<string>();
  for (const l of links || []) if (l) set.add(l.trim());
  for (const a of anchors || []) if (a?.href) set.add(a.href.trim());
  if (set.has(raw)) return raw;
  return "";
}

function asStrList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 20);
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function emptyData(partial?: Partial<DeepOfferData>): DeepOfferData {
  return {
    title: "",
    company: "",
    location: "",
    contract: "",
    duration: "",
    deadline: "",
    skills: [],
    missions: [],
    profile: [],
    description: "",
    applicationInfo: "",
    sourceUrl: "",
    anchorText: "",
    snippet: "",
    ...partial,
  };
}

/* ── INIT : charger les e-mails du libellé ─────────────────────── */

export async function initDeepRecheck(email: string): Promise<DeepMeta> {
  const accessToken = await getAccessToken(email);
  const label = await findLabel(accessToken, GMAIL_LABEL);
  if (!label) throw new Error(`Libellé introuvable : ${GMAIL_LABEL}`);
  const { emails } = await fetchLabelEmails(accessToken, label);
  if (!emails.length) throw new Error("Aucun e-mail dans le libellé");

  const batches: DeepBatchMeta[] = [];
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const slice = emails.slice(i, i + BATCH_SIZE);
    batches.push({
      index: batches.length,
      emailIds: slice.map((e) => e.id),
      status: "pending",
      updatedAt: nowIso(),
    });
  }

  /* Persiste le HTML nécessaire à isolateBlock + anchors. */
  const slim: ParsedEmail[] = emails.map((e) => ({
    id: e.id,
    subject: e.subject,
    from: e.from,
    receivedAt: e.receivedAt,
    text: e.text,
    html: e.html,
    links: e.links,
  }));
  await saveJson(emailsKey(email), slim);

  const meta: DeepMeta = {
    v: 1,
    email,
    phase: "detect",
    startedAt: nowIso(),
    updatedAt: nowIso(),
    totalEmails: emails.length,
    batchSize: BATCH_SIZE,
    batches,
    detectDone: 0,
    offersTotal: 0,
    offersAnalyzed: 0,
  };
  await saveJson(metaKey(email), meta);
  return meta;
}

export async function loadDeepMeta(email: string): Promise<DeepMeta | null> {
  return loadJson<DeepMeta>(metaKey(email));
}

export async function loadDeepEmails(email: string): Promise<ParsedEmail[]> {
  return (await loadJson<ParsedEmail[]>(emailsKey(email))) ?? [];
}

export async function resetDeepRecheck(email: string): Promise<void> {
  /* Charge AVANT suppression pour pouvoir purger les clés d'offres. */
  const meta = await loadDeepMeta(email);
  const emails = await loadDeepEmails(email);
  const keys: string[] = [metaKey(email), emailsKey(email)];
  if (meta) {
    for (const b of meta.batches) keys.push(batchKey(email, b.index));
  }
  for (const e of emails) {
    for (let i = 0; i < 40; i++) {
      keys.push(offerKey(email, `${e.id}#${i}`));
    }
  }
  /* Uniquement des clés gmail:deep:* — jamais oauth / sync / store client. */
  for (const k of keys) await storeDel(k).catch(() => {});
}

/* ── ÉTAPE 1 — Détection par lots (fallback 5→3→1) ────────────── */

type DetectApiResponse = {
  results?: {
    emailId: string;
    containsInternshipOffer?: boolean;
    offerCount?: number;
    confidence?: string;
    offers?: { title?: string; anchorText?: string; sourceUrl?: string; snippet?: string }[];
  }[];
};

async function detectChunk(
  emails: ParsedEmail[],
  anchorsById: Map<string, { text: string; href: string }[]>
): Promise<DeepEmailDetect[]> {
  const payload = emails.map((e) => ({
    id: e.id,
    subject: e.subject,
    text: (e.text || "").slice(0, 12_000),
    links: e.links,
    anchors: anchorsById.get(e.id) ?? [],
  }));
  const r = await askJson<DetectApiResponse>(
    "deep-recheck-detect",
    { emails: payload },
    { temperature: 0.2 }
  );
  const byId = new Map((r.results ?? []).map((x) => [x.emailId, x]));
  return emails.map((e) => {
    const row = byId.get(e.id);
    const anchors = anchorsById.get(e.id) ?? [];
    const offers: DeepDetectOffer[] = (row?.offers ?? []).map((o) => ({
      title: asStr(o.title),
      anchorText: asStr(o.anchorText),
      sourceUrl: sanitizeSourceUrl(asStr(o.sourceUrl), e.links, anchors),
      snippet: asStr(o.snippet).slice(0, 400),
    }));
    const has = row?.containsInternshipOffer === true && offers.length > 0;
    return {
      emailId: e.id,
      containsInternshipOffer: has,
      offerCount: has ? offers.length : 0,
      confidence: row?.confidence || (has ? "medium" : "low"),
      offers: has ? offers : [],
      detectStatus: "ok" as const,
    };
  });
}

/** Détecte un sous-ensemble d'e-mails avec repli taille 5 → 3 → 1. */
async function detectWithFallback(
  emails: ParsedEmail[],
  anchorsById: Map<string, { text: string; href: string }[]>
): Promise<DeepEmailDetect[]> {
  const out: DeepEmailDetect[] = [];
  let i = 0;
  let size = BATCH_SIZE;
  while (i < emails.length) {
    const slice = emails.slice(i, i + size);
    try {
      const r = await detectChunk(slice, anchorsById);
      out.push(...r);
      i += slice.length;
      size = BATCH_SIZE;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur Gemini";
      if (size <= 1) {
        out.push({
          emailId: slice[0].id,
          containsInternshipOffer: false,
          offerCount: 0,
          confidence: "low",
          offers: [],
          detectStatus: "error",
          detectError: msg,
        });
        i += 1;
        size = BATCH_SIZE;
      } else {
        size = size <= 3 ? 1 : 3;
      }
    }
  }
  return out;
}

export async function processNextBatch(email: string): Promise<{ done: boolean; meta: DeepMeta }> {
  const meta = await loadDeepMeta(email);
  if (!meta) throw new Error("Deep Recheck non initialisé — appelle d'abord init");
  if (meta.phase !== "detect") {
    return { done: meta.phase === "done", meta };
  }
  const emails = await loadDeepEmails(email);
  const byId = new Map(emails.map((e) => [e.id, e]));
  const next = meta.batches.find((b) => b.status === "pending");
  if (!next) {
    meta.phase = "analyze";
    meta.updatedAt = nowIso();
    await saveJson(metaKey(email), meta);
    return { done: false, meta };
  }

  const slice = next.emailIds.map((id) => byId.get(id)).filter((e): e is ParsedEmail => !!e);
  const anchorsById = new Map(
    slice.map((e) => [e.id, extractAnchorMap(e.html, 250)] as const)
  );

  try {
    const results = await detectWithFallback(slice, anchorsById);
    await saveJson(batchKey(email, next.index), {
      index: next.index,
      emailIds: next.emailIds,
      results,
      updatedAt: nowIso(),
    });
    next.status = results.some((r) => r.detectStatus === "error") ? "error" : "done";
    next.updatedAt = nowIso();
    if (results.some((r) => r.detectStatus === "error")) {
      next.error = results.find((r) => r.detectStatus === "error")?.detectError;
    }
  } catch (e) {
    next.status = "error";
    next.error = e instanceof Error ? e.message : "Erreur inconnue";
    next.updatedAt = nowIso();
  }

  meta.detectDone = meta.batches.filter((b) => b.status !== "pending").length;
  meta.updatedAt = nowIso();
  meta.lastError = next.error;
  await saveJson(metaKey(email), meta);
  return { done: false, meta };
}

/* ── Collecte des offres détectées (sans dédup) ────────────────── */

export async function collectDetectedOffers(email: string): Promise<DeepOfferRecord[]> {
  const meta = await loadDeepMeta(email);
  const emails = await loadDeepEmails(email);
  if (!meta) return [];
  const byId = new Map(emails.map((e) => [e.id, e] as const));
  const out: DeepOfferRecord[] = [];

  for (const b of meta.batches) {
    const batch = await loadJson<{
      results?: DeepEmailDetect[];
    }>(batchKey(email, b.index));
    for (const r of batch?.results ?? []) {
      const e = byId.get(r.emailId);
      r.offers.forEach((o, idx) => {
        const key = `${r.emailId}#${idx}`;
        out.push({
          key,
          emailId: r.emailId,
          emailSubject: e?.subject ?? "",
          emailFrom: e?.from ?? "",
          receivedAt: e?.receivedAt ?? "",
          index: idx,
          detect: o,
          status: "pending",
          reason: "",
          data: emptyData({
            title: o.title,
            sourceUrl: o.sourceUrl,
            anchorText: o.anchorText,
            snippet: o.snippet,
          }),
        });
      });
    }
  }
  return out;
}

/* ── ÉTAPE 2 — Analyse profonde (1 offre / requête) ────────────── */

type AnalyzeApiResponse = {
  results?: {
    id: string;
    title?: string;
    company?: string;
    location?: string;
    contract?: string;
    duration?: string;
    deadline?: string;
    skills?: unknown;
    missions?: unknown;
    profile?: unknown;
    description?: string;
    applicationInfo?: string;
    sourceUrl?: string;
    anchorText?: string;
    snippet?: string;
  }[];
};

async function analyzeOne(
  email: string,
  rec: DeepOfferRecord,
  emailsById: Map<string, ParsedEmail>
): Promise<DeepOfferRecord> {
  /* Ne JAMAIS throw : une erreur isolée ne doit pas faire échouer le lot
     d'analyse (mapLimit) — l'offre est conservée en partial/blocked. */
  try {
    const e = emailsById.get(rec.emailId);
    const sourceUrl = rec.detect.sourceUrl;
    let block = rec.detect.snippet || "";
    try {
      if (sourceUrl && e?.html) {
        block = isolateBlock(e.html, sourceUrl)?.snippet || block;
      }
    } catch {
      /* isolateBlock best-effort */
    }

    let pageText = "";
    let pageOk = true;
    let pageReason = "";
    if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
      try {
        const page = await fetchOfferPage(sourceUrl);
        if (page.ok) {
          pageText = page.text;
        } else {
          pageOk = false;
          pageReason = page.reason;
        }
      } catch (pe) {
        pageOk = false;
        pageReason = pe instanceof Error ? pe.message : "erreur HTTP";
      }
    }

    try {
      const r = await askJson<AnalyzeApiResponse>(
        "deep-recheck-analyze",
        {
          deepAnalyze: [
            {
              id: rec.key,
              subject: (rec.emailSubject || "").slice(0, 300),
              block: block.slice(0, 4000),
              sourceUrl,
              anchorText: rec.detect.anchorText,
              snippet: rec.detect.snippet,
              pageText: pageText.slice(0, 9000),
            },
          ],
        },
        { temperature: 0.2 }
      );
      const row = (r.results ?? []).find((x) => x.id === rec.key) ?? r.results?.[0];
      const useful =
        (!!row &&
          [row.title, row.company, row.location, row.description, row.applicationInfo].some((v) =>
            asStr(v)
          )) ||
        asStrList(row?.skills).length > 0 ||
        asStrList(row?.missions).length > 0;

      if (!useful) {
        return {
          ...rec,
          status: pageOk ? "partial" : "blocked",
          reason: pageOk
            ? "Analyse IA sans données exploitables — offre conservée (snippet e-mail)"
            : `Page inaccessible (${pageReason || "erreur"}) + analyse IA vide — offre conservée`,
          data: emptyData({
            title: rec.detect.title || asStr(row?.title),
            sourceUrl: rec.detect.sourceUrl,
            anchorText: rec.detect.anchorText,
            snippet: rec.detect.snippet,
          }),
          analyzedAt: nowIso(),
        };
      }

      const status: DeepOfferStatus = pageOk ? "ok" : "blocked";
      const reason = pageOk
        ? "Analyse complète"
        : `Offre conservée — page inaccessible : ${pageReason || "erreur"}`;
      return {
        ...rec,
        status,
        reason,
        data: emptyData({
          title: asStr(row?.title) || rec.detect.title,
          company: asStr(row?.company),
          location: asStr(row?.location),
          contract: asStr(row?.contract),
          duration: asStr(row?.duration),
          deadline: asStr(row?.deadline),
          skills: asStrList(row?.skills),
          missions: asStrList(row?.missions),
          profile: asStrList(row?.profile),
          description: asStr(row?.description),
          applicationInfo: asStr(row?.applicationInfo),
          sourceUrl: rec.detect.sourceUrl,
          anchorText: rec.detect.anchorText,
          snippet: rec.detect.snippet || block.slice(0, 400),
        }),
        analyzedAt: nowIso(),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur Gemini";
      return {
        ...rec,
        status: pageOk ? "partial" : "blocked",
        reason: `Erreur d'analyse (${msg}) — offre conservée avec données e-mail`,
        data: emptyData({
          title: rec.detect.title,
          sourceUrl: rec.detect.sourceUrl,
          anchorText: rec.detect.anchorText,
          snippet: rec.detect.snippet || block.slice(0, 400),
        }),
        analyzedAt: nowIso(),
      };
    }
  } catch (outer) {
    const msg = outer instanceof Error ? outer.message : "Erreur inattendue";
    return {
      ...rec,
      status: "partial",
      reason: `Erreur isolée (${msg}) — offre conservée`,
      data: emptyData({
        title: rec.detect.title,
        sourceUrl: rec.detect.sourceUrl,
        anchorText: rec.detect.anchorText,
        snippet: rec.detect.snippet,
      }),
      analyzedAt: nowIso(),
    };
  }
}

export async function processNextOffers(
  email: string,
  opts?: { limit?: number; concurrency?: number }
): Promise<{ remaining: number; analyzed: number; meta: DeepMeta }> {
  const meta = await loadDeepMeta(email);
  if (!meta) throw new Error("Deep Recheck non initialisé");
  if (meta.phase === "detect") {
    const step = await processNextBatch(email);
    return { remaining: step.meta.batches.filter((b) => b.status === "pending").length, analyzed: 0, meta: step.meta };
  }
  if (meta.phase === "done") {
    return { remaining: 0, analyzed: 0, meta };
  }

  const emails = await loadDeepEmails(email);
  const emailsById = new Map(emails.map((e) => [e.id, e] as const));
  const all = await collectDetectedOffers(email);
  meta.offersTotal = all.length;

  const pending: DeepOfferRecord[] = [];
  for (const rec of all) {
    const existing = await loadJson<DeepOfferRecord>(offerKey(email, rec.key));
    if (!existing || existing.status === "pending") pending.push(rec);
  }

  const limit = Math.max(1, opts?.limit ?? 4);
  const concurrency = Math.max(1, opts?.concurrency ?? 2);
  const todo = pending.slice(0, limit);

  await mapLimit(todo, concurrency, async (rec) => {
    const result = await analyzeOne(email, rec, emailsById);
    await saveJson(offerKey(email, rec.key), result);
  });

  /* Recalcule les compteurs. */
  let analyzed = 0;
  for (const rec of all) {
    const stored = await loadJson<DeepOfferRecord>(offerKey(email, rec.key));
    if (stored && stored.status !== "pending") analyzed += 1;
  }
  meta.offersTotal = all.length;
  meta.offersAnalyzed = analyzed;
  meta.updatedAt = nowIso();
  const detectPending = meta.batches.some((b) => b.status === "pending");
  if (detectPending) {
    meta.phase = "detect";
  } else if (all.length === 0 || analyzed >= all.length) {
    meta.phase = "done";
  } else {
    meta.phase = "analyze";
  }
  await saveJson(metaKey(email), meta);

  const remaining = all.length - analyzed;
  return { remaining, analyzed: todo.length, meta };
}

/* ── Rapport final (audit de vérité, sans dédup) ───────────────── */

export async function buildDeepReport(email: string): Promise<DeepReport | null> {
  const meta = await loadDeepMeta(email);
  if (!meta) return null;
  const emails = await loadDeepEmails(email);
  const all = await collectDetectedOffers(email);

  const detectById = new Map<string, DeepEmailDetect>();
  for (const b of meta.batches) {
    const batch = await loadJson<{ results?: DeepEmailDetect[] }>(batchKey(email, b.index));
    for (const r of batch?.results ?? []) detectById.set(r.emailId, r);
  }

  const offersWithRecord = new Map<string, DeepOfferRecord>();
  for (const rec of all) {
    const stored = await loadJson<DeepOfferRecord>(offerKey(email, rec.key));
    offersWithRecord.set(rec.key, stored ?? rec);
  }

  let emailsWithOffer = 0;
  let emailsWithoutOffer = 0;
  let emailsAmbiguous = 0;
  let emailsWithOne = 0;
  let emailsWithMultiple = 0;
  let offersWithUrl = 0;
  let offersWithoutUrl = 0;
  let ok = 0;
  let blocked = 0;
  let partial = 0;
  let pending = 0;

  const byEmail: DeepReport["byEmail"] = [];

  for (const e of emails) {
    const d = detectById.get(e.id);
    const offerRecs = all.filter((r) => r.emailId === e.id);
    const count = offerRecs.length;
    const has = (d?.containsInternshipOffer && count > 0) || count > 0;
    if (d?.detectStatus === "error") emailsAmbiguous += 1;
    else if (has) emailsWithOffer += 1;
    else emailsWithoutOffer += 1;
    if (count === 1) emailsWithOne += 1;
    else if (count > 1) emailsWithMultiple += 1;

    const offersDetail = offerRecs.map((rec, i) => {
      const full = offersWithRecord.get(rec.key) ?? rec;
      if (full.detect.sourceUrl) offersWithUrl += 1;
      else offersWithoutUrl += 1;
      if (full.status === "ok") ok += 1;
      else if (full.status === "blocked") blocked += 1;
      else if (full.status === "partial") partial += 1;
      else pending += 1;
      return {
        n: i + 1,
        title: full.detect.title || full.data.title || "(sans titre)",
        url: full.detect.sourceUrl || "",
        status: full.status,
        reason: full.reason || "",
      };
    });

    byEmail.push({
      emailId: e.id,
      subject: e.subject,
      from: e.from,
      offerCount: count,
      containsInternshipOffer: has,
      confidence: d?.confidence ?? "low",
      offers: offersDetail,
    });
  }

  const offersDetected = all.length;
  const report: DeepReport = {
    emailsExamined: emails.length,
    emailsWithOffer,
    emailsWithoutOffer,
    emailsAmbiguous,
    offersDetected,
    offersWithUrl,
    offersWithoutUrl,
    emailsWithOneOffer: emailsWithOne,
    emailsWithMultipleOffers: emailsWithMultiple,
    offersAnalyzedOk: ok,
    offersBlocked: blocked,
    offersPartial: partial,
    offersPending: pending,
    byEmail,
    text: "",
  };

  const lines: string[] = [];
  lines.push(`${report.emailsExamined} emails examinés`);
  lines.push("");
  lines.push(`Emails contenant au moins une offre : ${report.emailsWithOffer}`);
  lines.push(`Emails sans offre : ${report.emailsWithoutOffer}`);
  lines.push(`Emails ambigus : ${report.emailsAmbiguous}`);
  lines.push("");
  lines.push(`Offres détectées : ${report.offersDetected}`);
  lines.push(`Offres avec URL réelle : ${report.offersWithUrl}`);
  lines.push(`Offres sans URL : ${report.offersWithoutUrl}`);
  lines.push("");
  lines.push(`Emails avec 1 offre : ${report.emailsWithOneOffer}`);
  lines.push(`Emails avec plusieurs offres : ${report.emailsWithMultipleOffers}`);
  lines.push("");
  lines.push(`Offres analysées en profondeur (OK) : ${report.offersAnalyzedOk}`);
  lines.push(`Offres bloquées : ${report.offersBlocked}`);
  lines.push(`Offres partiellement analysées : ${report.offersPartial}`);
  lines.push(`Offres en attente : ${report.offersPending}`);
  lines.push("");
  lines.push("── Détail par e-mail ──");
  for (const em of report.byEmail) {
    lines.push("");
    lines.push(`Email #${em.emailId}`);
    lines.push(`Sujet : ${em.subject}`);
    lines.push(`Offres trouvées : ${em.offerCount}`);
    if (!em.offers.length) {
      lines.push("  (aucune offre)");
      continue;
    }
    for (const o of em.offers) {
      lines.push("");
      lines.push(`${o.n}. ${o.title}`);
      lines.push(`   URL : ${o.url || "(aucune)"}`);
      lines.push(`   statut : ${o.status.toUpperCase()}${o.reason ? ` — ${o.reason}` : ""}`);
    }
  }
  report.text = lines.join("\n");
  return report;
}

/* ── Boucle principale (budget temps, reprenable) ──────────────── */

export async function runDeepRecheck(
  email: string,
  opts?: { timeBudgetMs?: number; offersPerStep?: number }
): Promise<{
  phase: DeepPhase;
  detectPending: number;
  offersTotal: number;
  offersAnalyzed: number;
  remaining: number;
  meta: DeepMeta;
  report?: DeepReport;
}> {
  const deadline = Date.now() + (opts?.timeBudgetMs ?? 200_000);
  let meta = await loadDeepMeta(email);
  if (!meta) meta = await initDeepRecheck(email);

  while (Date.now() < deadline) {
    meta = (await loadDeepMeta(email))!;
    if (meta.phase === "done") break;

    if (meta.phase === "detect") {
      const pendingBatches = meta.batches.filter((b) => b.status === "pending").length;
      if (pendingBatches === 0) {
        meta.phase = "analyze";
        meta.updatedAt = nowIso();
        await saveJson(metaKey(email), meta);
        continue;
      }
      const step = await processNextBatch(email);
      meta = step.meta;
      continue;
    }

    if (meta.phase === "analyze") {
      const step = await processNextOffers(email, {
        limit: opts?.offersPerStep ?? 3,
        concurrency: 2,
      });
      meta = step.meta;
      if (step.remaining === 0 && meta.phase !== "detect") {
        meta.phase = "done";
        meta.updatedAt = nowIso();
        await saveJson(metaKey(email), meta);
        break;
      }
      if (step.analyzed === 0 && step.remaining > 0) {
        /* rien de traité — évite la boucle infinie */
        break;
      }
      continue;
    }
    break;
  }

  meta = (await loadDeepMeta(email))!;
  const report = meta.phase === "done" ? ((await buildDeepReport(email)) ?? undefined) : undefined;
  const detectPending = meta.batches.filter((b) => b.status === "pending").length;
  return {
    phase: meta.phase,
    detectPending,
    offersTotal: meta.offersTotal,
    offersAnalyzed: meta.offersAnalyzed,
    remaining: Math.max(0, meta.offersTotal - meta.offersAnalyzed),
    meta,
    report,
  };
}

export async function deepStatus(email: string): Promise<{
  meta: DeepMeta | null;
  detectPending: number;
  offersTotal: number;
  offersAnalyzed: number;
  remaining: number;
}> {
  const meta = await loadDeepMeta(email);
  if (!meta) {
    return { meta: null, detectPending: 0, offersTotal: 0, offersAnalyzed: 0, remaining: 0 };
  }
  const detectPending = meta.batches.filter((b) => b.status === "pending").length;
  return {
    meta,
    detectPending,
    offersTotal: meta.offersTotal,
    offersAnalyzed: meta.offersAnalyzed,
    remaining: Math.max(0, meta.offersTotal - meta.offersAnalyzed),
  };
}
