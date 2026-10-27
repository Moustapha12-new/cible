/* File de réanalyse persistée : elle survit au rechargement de la page et
   reprend exactement là où elle s'est arrêtée (curseur), sans retraiter en
   boucle les mêmes premiers mails. */

import { storeDel, storeGet, storeSet } from "./gmail-server";
import type { ProcessedEmail } from "./gmail-core";
import { EMPTY_REANALYZE_REPORT, type ReanalyzeReport } from "./gmail-reanalyze";

export type ReanalyzeQueue = {
  /** E-mails à relire, dans l'ordre de traitement. */
  ids: string[];
  /** Position courante : les e-mails avant ce curseur sont traités. */
  cursor: number;
  /** Nombre de lots déjà exécutés (information d'affichage). */
  batches: number;
  /** Bilan cumulé honnête de la file. */
  stats: ReanalyzeReport;
  startedAt: string;
  at: string;
};

const queueKey = (email: string) => `gmail:reanalyze:${(email || "").trim().toLowerCase()}`;

export function isReanalyzeQueue(value: unknown): value is ReanalyzeQueue {
  const q = value as ReanalyzeQueue | null;
  return !!q && typeof q === "object" && Array.isArray(q.ids) && typeof q.cursor === "number";
}

export async function loadReanalyzeQueue(email: string): Promise<ReanalyzeQueue | null> {
  if (!email) return null;
  try {
    const raw = await storeGet(queueKey(email));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isReanalyzeQueue(parsed)) return null;
    return { ...parsed, stats: { ...EMPTY_REANALYZE_REPORT, ...parsed.stats } };
  } catch {
    /* file illisible : on repart d'une file neuve, jamais bloquant */
    return null;
  }
}

export async function saveReanalyzeQueue(email: string, queue: ReanalyzeQueue): Promise<void> {
  if (!email) return;
  await storeSet(queueKey(email), JSON.stringify({ ...queue, at: new Date().toISOString() }));
}

export async function clearReanalyzeQueue(email: string): Promise<void> {
  if (!email) return;
  await storeDel(queueKey(email)).catch(() => {});
}

/** E-mails à relire : ceux qu'un mauvais import a déjà remplis d'annonces.
    Les e-mails sans aucune annonce détectée ne sont pas dans cette file — ils
    se reprennent par une synchronisation normale ou une relance d'erreurs. */
export function buildReanalyzeQueue(emails: readonly ProcessedEmail[]): ReanalyzeQueue {
  const ids = emails
    .filter((item) => (item.offers?.length ?? 0) > 0)
    .sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || ""))
    .map((item) => item.id);
  return {
    ids,
    cursor: 0,
    batches: 0,
    stats: { ...EMPTY_REANALYZE_REPORT },
    startedAt: new Date().toISOString(),
    at: new Date().toISOString(),
  };
}
