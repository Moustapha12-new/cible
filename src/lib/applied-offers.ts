import type { UserData } from "./data";
import { discoveryUrlKey } from "./discovery-identity";

function postingKey(value?: string): string | null {
  const source = discoveryUrlKey(value);
  if (source) return source;
  try {
    const url = new URL(value || "");
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(trk|trackingId|refId)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href.replace(/\/$/, "");
  } catch { return null; }
}

/** Une candidature reste une candidature, même après refus ou entretien.
 * Ne rapproche jamais deux annonces sur leur seul titre. */
export function appliedOfferIds(data: UserData): Set<string> {
  const ids = new Set(data.applications.flatMap(a => a.offerId ? [a.offerId] : []));
  const applicationIds = new Set(data.applications.map(a => a.id));
  for (const [id, dossier] of Object.entries(data.dossiers || {})) if (dossier.applicationId && applicationIds.has(dossier.applicationId)) ids.add(id);
  const urls = new Set(data.applications.map(a => postingKey(a.offerUrl)).filter((v): v is string => !!v));
  for (const offer of data.offers) if (ids.has(offer.id)) { const key = postingKey(offer.url); if (key) urls.add(key); }
  for (const offer of data.offers) { const key = postingKey(offer.url); if (key && urls.has(key)) ids.add(offer.id); }
  return ids;
}

export function visibleInOfferTab(status: string | undefined, tab: string): boolean {
  return tab === "applied" ? status === "postulee" : status !== "postulee";
}
