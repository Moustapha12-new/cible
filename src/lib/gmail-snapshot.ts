/* P0-4 — Snapshot serveur du payload dashboard.
   À chaque construction réussie, le payload (allégé P0-5) est persisté sous
   `gmail:snapshot:<email>` ; les GET suivants le servent directement :
   ~2 lectures stockage + vérification OAuth au lieu de ~260 lectures
   de checkpoints + liste Gmail à chaque affichage. */

import { storeGet, storeSet, storeDel } from "@/lib/gmail-server";
import type { DashboardPayload } from "@/lib/gmail-dashboard";

/** Garde-fou : au-delà de ~3 Mo de JSON on saute l'écriture (best-effort). */
const MAX_SNAPSHOT_CHARS = 3_000_000;

const snapshotKey = (email: string) =>
  `gmail:snapshot:${(email || "").trim().toLowerCase()}`;

/** Lit le snapshot persisté ; null si absent/corrompu/invalid. */
export async function loadSnapshot(email: string): Promise<DashboardPayload | null> {
  if (!email) return null;
  try {
    const raw = await storeGet(snapshotKey(email));
    if (!raw) return null;
    const j = JSON.parse(raw) as DashboardPayload;
    if (!j || j.ok !== true || !Array.isArray(j.emails)) return null;
    return { ...j, fromSnapshot: true };
  } catch {
    return null;
  }
}

/** Écrit le snapshot (best-effort : jamais bloquant pour la réponse). */
export async function saveSnapshot(
  email: string,
  payload: DashboardPayload
): Promise<void> {
  if (!email || !payload?.ok) return;
  try {
    const json = JSON.stringify({ ...payload, snapshotAt: new Date().toISOString() });
    if (json.length > MAX_SNAPSHOT_CHARS) {
      console.warn("[gmail-snapshot] payload trop volumineux — snapshot non écrit");
      return;
    }
    await storeSet(snapshotKey(email), json);
  } catch {
    /* best-effort : un snapshot non écrit ne bloque rien */
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
