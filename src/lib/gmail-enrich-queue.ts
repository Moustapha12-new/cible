import { isCompleteOffer } from "./offer-quality";
import { loadSnapshot, saveSnapshot } from "./gmail-snapshot";
import { loadCheckpoint, saveCheckpoint, enrichProcessed, type ProcessedEmail } from "./gmail-core";
import { jobKeyOf } from "./offer-links";
import { buildSummary, slimOffers } from "./gmail-dashboard";
import { acquireSyncLock, releaseSyncLock } from "./gmail-server";

const keyOf = (url: string) => jobKeyOf(url) || url;
const fields = ["title", "company", "location", "contract", "duration", "deadline", "salary", "skills", "keywords", "missions", "prerequisites", "profile", "description", "summary", "applicationInfo", "enrichStatus", "enrichReason", "enrichedAt", "enrichAttempts", "enrichAttemptedAt"] as const;
const attemptsOf = (offer: { enrichAttempts?: number; enrichAttemptedAt?: string }) => offer.enrichAttemptedAt && Date.now() - Date.parse(offer.enrichAttemptedAt) > 86_400_000 ? 0 : (offer.enrichAttempts ?? 0);

export function enrichmentTotals(emails: ProcessedEmail[]) {
  const all = [...new Map(emails.flatMap(item => item.offers).filter(o => !o.searchFallback).map(o => [o.applicationUrl, o])).values()];
  return {
    total: all.length, complete: all.filter(o => o.enrichStatus === "ok" && isCompleteOffer(o)).length,
    partial: all.filter(o => o.enrichStatus === "partial").length,
    blocked: all.filter(o => o.enrichStatus === "blocked").length,
    pending: all.filter(o => (o.enrichStatus !== "ok" || !isCompleteOffer(o)) && attemptsOf(o) < 2 && !o.searchFallback).length,
  };
}

/** File indépendante de Gmail et Gemini ; lots persistés et reprenables. */
export async function enrichCatalogueBatch(email: string, limit = 4) {
  const token = await acquireSyncLock(email);
  if (!token) return { busy: true };
  try {
    const snapshot = await loadSnapshot(email);
    if (!snapshot) throw new Error("Aucun catalogue enregistré. Synchronise Gmail une première fois.");
    const donors = new Map(snapshot.emails.flatMap(e => e.offers).filter(o => o.enrichStatus === "ok" && isCompleteOffer(o)).map(o => [keyOf(o.applicationUrl), o]));
    const groups = new Map<string, { emailId: string; index: number; attempts: number }>();
    for (const item of snapshot.emails) item.offers.forEach((offer, index) => {
      if ((offer.enrichStatus === "ok" && isCompleteOffer(offer)) || offer.searchFallback || !offer.applicationUrl) return;
      const key = keyOf(offer.applicationUrl);
      if (!donors.has(key) && attemptsOf(offer) < 2 && !groups.has(key)) groups.set(key, { emailId: item.id, index, attempts: attemptsOf(offer) });
    });
    const selected = [...groups].sort((a, b) => a[1].attempts - b[1].attempts).slice(0, Math.max(1, Math.min(6, limit)));
    const work: ProcessedEmail[] = [];
    const checkpoints = new Map<string, Awaited<ReturnType<typeof loadCheckpoint>>>();
    for (const [, entry] of selected) {
      const cp = await loadCheckpoint(entry.emailId);
      checkpoints.set(entry.emailId, cp);
      const item = snapshot.emails.find(e => e.id === entry.emailId)!;
      const listed = item.offers[entry.index];
      const offer = cp?.offers.find(o => keyOf(o.applicationUrl) === keyOf(listed.applicationUrl)) ?? listed;
      work.push({ ...item, id: `${entry.emailId}-${entry.index}`, isOffer: true, offers: [{ ...offer }] });
    }
    await enrichProcessed(work, new Map(), { retryOnly: true, groundedOnly: true, concurrency: 2, timeBudgetMs: 70_000 });
    work.forEach((item, index) => {
      const [key, entry] = selected[index];
      const previous = snapshot.emails.find(e => e.id === entry.emailId)!.offers[entry.index];
      if (item.offers[0].enrichStatus === "blocked" && previous.enrichStatus === "partial" && previous.description) {
        item.offers[0].enrichStatus = "partial";
        item.offers[0].enrichReason = "Informations déjà extraites conservées ; la source reste inaccessible";
      }
      item.offers[0].enrichAttempts = entry.attempts + 1;
      item.offers[0].enrichAttemptedAt = new Date().toISOString();
      donors.set(key, item.offers[0]);
    });
    const changed = new Set<string>();
    for (const item of snapshot.emails) item.offers.forEach(offer => {
      const donor = donors.get(keyOf(offer.applicationUrl));
      if (!donor || donor === offer || offer.enrichStatus === "ok") return;
      for (const field of fields) {
        const value = donor[field];
        if (value !== undefined) (offer as unknown as Record<string, unknown>)[field] = value;
      }
      changed.add(item.id);
    });
    for (const id of changed) {
      const cp = checkpoints.has(id) ? checkpoints.get(id) : await loadCheckpoint(id);
      const item = snapshot.emails.find(e => e.id === id)!;
      if (cp) {
        // Appliquer les champs enrichis tout en conservant les preuves HTML.
        const updates = new Map(item.offers.map(o => [keyOf(o.applicationUrl), o]));
        cp.offers.forEach(offer => {
          const updated = updates.get(keyOf(offer.applicationUrl));
          if (!updated) return;
          for (const field of fields) if (updated[field] !== undefined) (offer as unknown as Record<string, unknown>)[field] = updated[field];
        });
        await saveCheckpoint(id, cp);
      }
    }
    snapshot.emails = snapshot.emails.map(item => ({ ...item, offers: slimOffers(item.offers) }));
    snapshot.summary = buildSummary(snapshot.emails, snapshot.lastSync, snapshot.totalInLabel);
    await saveSnapshot(email, snapshot);
    return { busy: false, processed: selected.length, ...enrichmentTotals(snapshot.emails) };
  } finally { await releaseSyncLock(email, token); }
}
