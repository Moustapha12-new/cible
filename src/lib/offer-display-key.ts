/* ══════════ Clé d'affichage d'une offre : identité stable, client-safe ══════════
   Cette clé sert d'identifiant d'offre (candidatures, CV envoyés, favoris,
   notes, « déjà postulée »). Elle est calculée à l'identique côté serveur
   (réanalyse) et côté navigateur : un seul algorithme, une seule source.

   Aucune dépendance Node : ce module est importable dans un composant client.
   ═════════════════════════════════════════════════════════════════════════════ */

export type DisplayKeyOffer = {
  title?: string;
  company?: string;
  location?: string;
  applicationUrl?: string;
  /** Clé gelée d'une annonce déjà connue : prioritaire, jamais recalculée. */
  stableKey?: string;
};

/** URL comparable : sans fragment, sans paramètre de suivi, sans « / » final. */
export function comparableUrl(value?: string): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return raw.toLowerCase();
    url.hash = "";
    for (const name of [...url.searchParams.keys()]) {
      if (/^(utm_.*|fbclid|gclid|msclkid|trk|trackingId|refId|from|fromage)$/i.test(name)) url.searchParams.delete(name);
    }
    url.searchParams.sort();
    return url.href.replace(/\/+$/, "").toLowerCase();
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

/** Clé d'affichage : clé gelée si l'annonce est déjà connue, sinon URL
    canonique, sinon titre|entreprise|localité. */
export function offerDisplayKey(offer: DisplayKeyOffer): string {
  const stable = (offer.stableKey || "").trim().toLowerCase();
  if (stable) return stable;
  const url = comparableUrl(offer.applicationUrl);
  if (url) return `u:${url}`;
  const t = [
    (offer.title || "").trim().toLowerCase(),
    (offer.company || "").trim().toLowerCase(),
    (offer.location || "").trim().toLowerCase(),
  ].join("|");
  return `t:${t}`;
}
