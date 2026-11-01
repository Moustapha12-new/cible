import { isCompleteOffer } from "./offer-quality";
import type { RawOffer } from "./gmail-core";

/** Prefer the richest sourced copy, not whichever alert happens to come first. */
export function evidenceRank(offer: RawOffer): number {
  return (offer.enrichStatus === "ok" && isCompleteOffer(offer) ? 100_000 : 0)
    + (offer.enrichOutcome === "ok" ? 20_000 : 0)
    + Math.min(offer.description?.length ?? 0, 9000)
    + Math.min(offer.missions?.length ?? 0, 8) * 100
    + Math.min(offer.skills?.length ?? 0, 24) * 10;
}
export function preferredEvidence<T extends RawOffer>(a: T, b: T): T {
  const difference = evidenceRank(b) - evidenceRank(a);
  if (difference !== 0) return difference > 0 ? b : a;
  return Date.parse(b.enrichedAt ?? "") > Date.parse(a.enrichedAt ?? "") ? b : a;
}
