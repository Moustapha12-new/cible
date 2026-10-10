export type OfferContent = { title?: string; description?: string; missions?: string[]; skills?: string[]; prerequisites?: string[]; profile?: string };
const useful = (items: unknown, min: number) => Array.isArray(items) && items.some(value => typeof value === "string" && value.trim().length >= min);
export function missingOfferContent(o: OfferContent): string[] {
  return [
    !o.title?.trim() && "titre",
    (!o.description || o.description.trim().length < 120) && "description détaillée",
    !useful(o.missions, 20) && "missions",
    !useful(o.skills, 2) && "compétences",
  ].filter(Boolean) as string[];
}
export const isCompleteOffer = (o: OfferContent | null | undefined): boolean => !!o && missingOfferContent(o).length === 0;
export function validateOfferQuality<T extends OfferContent & { enrichStatus?: string; enrichReason?: string }>(offer: T): T {
  return offer.enrichStatus === "ok" && !isCompleteOffer(offer)
    ? { ...offer, enrichStatus: "partial", enrichReason: `À compléter : ${missingOfferContent(offer).join(", ")}` } : offer;
}
