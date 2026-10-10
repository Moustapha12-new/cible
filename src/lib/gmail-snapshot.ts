import { validateOfferQuality } from "./offer-quality";
/* P0-4 — Snapshot serveur du payload dashboard.
   À chaque construction réussie, le payload (allégé P0-5) est persisté sous
   `gmail:snapshot:<email>` ; les GET suivants le servent directement :
   ~2 lectures stockage + vérification OAuth au lieu de ~260 lectures
   de checkpoints + liste Gmail à chaque affichage. */

import { storeGet, storeSet, storeDel } from "@/lib/gmail-server";
import type { DashboardPayload } from "@/lib/gmail-dashboard";
import { gzipSync, gunzipSync } from "node:zlib";

/** Catalogue borné à 20 Mo décompressés ; compression pour les grandes collections. */
const MAX_SNAPSHOT_CHARS = 20_000_000;
const COMPRESSED_PREFIX = "gzip:v1:";

const snapshotKey = (email: string) =>
  `gmail:snapshot:${(email || "").trim().toLowerCase()}`;

/** null uniquement si absent ; un catalogue illisible reste conservé. */
export async function loadSnapshot(email: string): Promise<DashboardPayload | null> {
  if (!email) return null;
  try {
    const raw = await storeGet(snapshotKey(email));
    if (!raw) return null;
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
    if (bytes.length > MAX_SNAPSHOT_CHARS) {
      throw new Error("Catalogue trop volumineux : sauvegarde interrompue, ancien catalogue conservé.");
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
    await storeDel(snapshotKey(email));
  } catch {
    /* best-effort */
  }
}
