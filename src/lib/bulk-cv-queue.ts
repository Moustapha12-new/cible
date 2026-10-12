import { createHash } from "node:crypto";
import type { DetectedOffer, UserData } from "./data";

export type BulkItem = NonNullable<UserData["bulkCvQueue"]>[number];

export function bulkFingerprint(offer: DetectedOffer, data: UserData): string {
  return createHash("sha256").update(JSON.stringify([offer.id, offer.title, offer.company, offer.text, data.originalCv?.text, data.cvData, data.cvDesign, "bulk-v1"])).digest("hex");
}

export function planBulkQueue(data: UserData, ids: string[], incoming: DetectedOffer[]): UserData {
  const offerIds = [...new Set(ids)].slice(0, 20);
  if (!offerIds.length || !data.originalCv?.text || !data.cvData) throw new Error("Ajoute ton CV principal et sélectionne des offres.");
  const known = new Map([...data.offers, ...incoming.filter(o => offerIds.includes(o.id))].map(o => [o.id, o]));
  if (offerIds.some(id => !known.has(id))) throw new Error("Une offre sélectionnée est introuvable.");
  const queue = new Map((data.bulkCvQueue || []).map(item => [item.offerId, item]));
  for (const id of offerIds) {
    const key = bulkFingerprint(known.get(id)!, data);
    const previous = queue.get(id);
    if (!previous || previous.key !== key || previous.status === "failed") queue.set(id, { offerId: id, key, status: "pending", updatedAt: new Date().toISOString() });
  }
  const existing = new Set(data.offers.map(o => o.id));
  return { ...data, offers: [...data.offers, ...incoming.filter(o => offerIds.includes(o.id) && !existing.has(o.id))], bulkCvQueue: [...queue.values()] };
}

export function resumableItems(queue: BulkItem[], now: number): BulkItem[] {
  return queue.filter(item => item.status === "pending" || item.status === "failed" || (item.status === "running" && now - Date.parse(item.updatedAt) > 5 * 60_000));
}
