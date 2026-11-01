import { validateOfferQuality } from "./offer-quality";
/* P0-4 — Snapshot serveur du payload dashboard.
   À chaque construction réussie, le payload (allégé P0-5) est persisté sous
   `gmail:snapshot:<email>` ; les GET suivants le servent directement :
   ~2 lectures stockage + vérification OAuth au lieu de ~260 lectures
   de checkpoints + liste Gmail à chaque affichage. */

import { storeGet, storeSet, storeDel } from "@/lib/gmail-server";
import type { DashboardPayload } from "@/lib/gmail-dashboard";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

/** Chaque fragment est borné à 20 Mo décompressés ; le catalogue peut en contenir plusieurs. */
const MAX_SNAPSHOT_CHARS = 20_000_000;
const COMPRESSED_PREFIX = "gzip:v1:";
const CHUNKED_PREFIX = "chunks:v1:";
const CHUNK_TARGET_BYTES = 6_000_000;

type ChunkManifest = {
  version: 1;
  chunks: string[];
  /** Fragments de la génération précédente, conservés le temps des lectures en cours. */
  garbage?: string[];
  base: Omit<DashboardPayload, "emails">;
};

const snapshotKey = (email: string) =>
  `gmail:snapshot:${(email || "").trim().toLowerCase()}`;

/** null uniquement si absent ; un catalogue illisible reste conservé. */
export async function loadSnapshot(email: string): Promise<DashboardPayload | null> {
  if (!email) return null;
  try {
    const raw = await storeGet(snapshotKey(email));
    if (!raw) return null;
    if (raw.startsWith(CHUNKED_PREFIX)) {
      const manifest = JSON.parse(raw.slice(CHUNKED_PREFIX.length)) as ChunkManifest;
      if (manifest.version !== 1 || !Array.isArray(manifest.chunks) || !manifest.chunks.length || !manifest.base) {
        throw new Error("Manifest du catalogue invalide");
      }
      const parts = await Promise.all(manifest.chunks.map(async key => {
        const stored = await storeGet(key);
        if (!stored?.startsWith(COMPRESSED_PREFIX)) throw new Error("Fragment du catalogue absent ou invalide");
        const decoded = gunzipSync(Buffer.from(stored.slice(COMPRESSED_PREFIX.length), "base64"), {
          maxOutputLength: MAX_SNAPSHOT_CHARS,
        }).toString("utf8");
        const rows = JSON.parse(decoded) as DashboardPayload["emails"];
        if (!Array.isArray(rows)) throw new Error("Fragment du catalogue invalide");
        return rows;
      }));
      const emails = parts.flat();
      if (manifest.base.ok !== true || emails.some(e => !e || !Array.isArray(e.offers))) {
        throw new Error("Structure du catalogue invalide");
      }
      return { ...manifest.base, emails: emails.map(e => ({ ...e, offers: e.offers.map(validateOfferQuality) })), fromSnapshot: true };
    }
    const json = raw.startsWith(COMPRESSED_PREFIX)
      ? gunzipSync(Buffer.from(raw.slice(COMPRESSED_PREFIX.length), "base64"), { maxOutputLength: MAX_SNAPSHOT_CHARS }).toString("utf8")
      : raw;
    const j = JSON.parse(json) as DashboardPayload;
    if (!j || j.ok !== true || !Array.isArray(j.emails) || j.emails.some(e => !e || !Array.isArray(e.offers))) throw new Error("Structure du catalogue invalide");
    return { ...j, emails: j.emails.map(e => ({ ...e, offers: e.offers.map(validateOfferQuality) })), fromSnapshot: true };
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Catalogue illisible, copie existante conservée. Récupération nécessaire avant remplacement.");
    throw error;
  }
}

/** Écrit le snapshot ; refuse d'écraser une copie existante illisible. */
export async function saveSnapshot(
  email: string,
  payload: DashboardPayload
): Promise<void> {
  if (!email || !payload?.ok) return;
  try {
    // Empty/interrupted refreshes cannot destroy the saved catalogue.
    const previous = await loadSnapshot(email);
    if (!payload.emails.length && previous?.emails.length) return;
    const json = JSON.stringify({ ...payload, snapshotAt: new Date().toISOString() });
    const bytes = Buffer.from(json, "utf8");
    if (bytes.length > CHUNK_TARGET_BYTES) {
      const oldRaw = await storeGet(snapshotKey(email));
      const oldManifest = oldRaw?.startsWith(CHUNKED_PREFIX)
        ? JSON.parse(oldRaw.slice(CHUNKED_PREFIX.length)) as ChunkManifest : null;
      const chunks: DashboardPayload["emails"][] = [];
      let current: DashboardPayload["emails"] = [];
      let currentBytes = 2;
      for (const item of payload.emails) {
        const itemBytes = Buffer.byteLength(JSON.stringify(item), "utf8") + 1;
        if (itemBytes + 2 > MAX_SNAPSHOT_CHARS) throw new Error("Un e-mail dépasse la taille maximale d’un fragment.");
        if (current.length && currentBytes + itemBytes > CHUNK_TARGET_BYTES) {
          chunks.push(current);
          current = [];
          currentBytes = 2;
        }
        current.push(item);
        currentBytes += itemBytes;
      }
      if (current.length) chunks.push(current);
      const serialized = chunks.map(chunk => JSON.stringify(chunk));
      const keys = serialized.map(part => `${snapshotKey(email)}:part:${createHash("sha256").update(part).digest("hex")}`);
      const reusable = new Set([...(oldManifest?.chunks ?? []), ...(oldManifest?.garbage ?? [])]);
      // Immutable fragments: a retry writes only the changed portions.
      // Publish the manifest last, so failed writes keep the old catalogue intact.
      for (let index = 0; index < keys.length; index++) {
        if (!reusable.has(keys[index])) {
          await storeSet(keys[index], COMPRESSED_PREFIX + gzipSync(Buffer.from(serialized[index], "utf8")).toString("base64"));
        }
      }
      const { emails: _emails, ...base } = { ...payload, snapshotAt: new Date().toISOString() };
      const garbage = (oldManifest?.chunks ?? []).filter(key => !keys.includes(key));
      const manifest: ChunkManifest = { version: 1, chunks: keys, garbage, base };
      await storeSet(snapshotKey(email), CHUNKED_PREFIX + JSON.stringify(manifest));
      const retained = new Set([...keys, ...garbage]);
      for (const key of oldManifest?.garbage ?? []) {
        if (!retained.has(key) && key.startsWith(`${snapshotKey(email)}:part:`)) await storeDel(key).catch(() => {});
      }
      return;
    }
    await storeSet(snapshotKey(email), bytes.length > 512_000
      ? COMPRESSED_PREFIX + gzipSync(bytes).toString("base64") : json);
  } catch {
    throw new Error("Sauvegarde du catalogue indisponible. La synchronisation doit être reprise.");
  }
}

/** Purge le snapshot (déconnexion Gmail). */
export async function deleteSnapshot(email: string): Promise<void> {
  if (!email) return;
  try {
    const raw = await storeGet(snapshotKey(email));
    if (raw?.startsWith(CHUNKED_PREFIX)) {
      const manifest = JSON.parse(raw.slice(CHUNKED_PREFIX.length)) as ChunkManifest;
      for (const key of [...(manifest.chunks ?? []), ...(manifest.garbage ?? [])]) {
        if (key.startsWith(`${snapshotKey(email)}:part:`)) await storeDel(key);
      }
    }
    await storeDel(snapshotKey(email));
  } catch {
    /* best-effort */
  }
}
