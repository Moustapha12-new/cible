import type { VerifiedUser } from "./auth-server";
import type { DetectedOffer } from "./data";
import { loadSnapshot } from "./gmail-snapshot";
import { storeGet } from "./gmail-server";
import { sameManualOfferUrl } from "./manual-offer";

/** Fail closed if a catalogue cannot be read: never confirm uniqueness blindly. */
export async function manualUrlExists(user: VerifiedUser, url: string | undefined, offers: DetectedOffer[]): Promise<boolean> {
  if (!url) return false;
  if (offers.some(offer => sameManualOfferUrl(offer.url, url))) return true;
  const snapshot = await loadSnapshot(user.email);
  if (snapshot?.emails.some(email => email.offers.some(offer =>
    sameManualOfferUrl(offer.applicationUrl, url) || sameManualOfferUrl(offer.sourceUrl, url)))) return true;
  const raw = await storeGet("discovery:offers:v1");
  if (!raw) return false;
  const discovery = JSON.parse(raw);
  if (!Array.isArray(discovery.offers)) throw new Error("Catalogue Discovery illisible");
  return discovery.offers.some((offer: { applicationUrl?: string }) => sameManualOfferUrl(offer.applicationUrl, url));
}
export const DUPLICATE_OFFER_MESSAGE = "Cette offre existe déjà dans tes offres ou tes candidatures. Import refusé pour éviter une double candidature.";
