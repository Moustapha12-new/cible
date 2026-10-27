import type { DetectedOffer } from "./data";
import { discoveryUrlKey } from "./discovery-identity";

/** Une même annonce peut changer d'identifiant après une synchronisation. */
export function offerDismissalKeys(offer: Pick<DetectedOffer, "id" | "url" | "title" | "company" | "location">): string[] {
  const keys = [offer.id];
  if (offer.url) {
    try {
      const url = new URL(offer.url);
      url.hash = "";
      for (const name of [...url.searchParams.keys()]) {
        if (/^(utm_.*|fbclid|gclid|msclkid|ref|ref_|trackingId)$/i.test(name)) url.searchParams.delete(name);
      }
      keys.push(`url:${url.href.replace(/\/$/, "").toLowerCase()}`);
    } catch { /* Identifiant seul si le lien est invalide. */ }
    const ats = discoveryUrlKey(offer.url);
    if (ats) keys.push(`ats:${ats}`);
  } else if (offer.title && offer.company) {
    keys.push(`sans-lien:${`${offer.company}|${offer.title}|${offer.location || ""}`.toLowerCase().trim()}`);
  }
  return keys;
}

export function isOfferDismissed(offer: Pick<DetectedOffer, "id" | "url" | "title" | "company" | "location">, dismissed: readonly string[] | undefined): boolean {
  if (!dismissed?.length) return false;
  const keys = new Set(dismissed);
  return offerDismissalKeys(offer).some(key => keys.has(key));
}
