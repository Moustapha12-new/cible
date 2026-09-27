/* Détection multi-offres dans un email — URLs UNIQUEMENT présentes dans le mail. */

import type { DetectedOffer } from "@/lib/data";
import { extractOfferLinks, isolateBlock, canonicalizeOfferUrl } from "@/lib/offer-links";
import type { ParsedEmailOut } from "@/lib/gmail-parser";

export type DetectResult = {
  offers: DetectedOffer[];
  reason: string;
  isNoOffer: boolean;
};

const TRACKING = /unsubscribe|list-manage|doubleclick|click\.|track\.|pixel|mailto:|facebook\.com|twitter\.com|x\.com|instagram\.com/i;

function hostOk(u: string): boolean {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return false;
    if (TRACKING.test(u)) return false;
    const h = url.hostname;
    if (/^(mail\.|tracking|pixels)/i.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}

function inferTitle(anchorText: string, context: string, fallback: string): string {
  const t = (anchorText || "").replace(/\s+/g, " ").trim();
  if (t && t.length > 3 && !/^https?:/i.test(t) && !/^(cliquez|click|voir l'offre|postuler)$/i.test(t)) {
    return t.slice(0, 120);
  }
  const lines = context
    .split(/\n|•|·|-/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 5 && l.length < 120);
  return (lines[0] || fallback || "Offre").slice(0, 120);
}

function inferCompany(context: string, from: string): string {
  const m =
    context.match(/\b(?:chez|at|–|-)\s+([A-Z][\w&.'-]+(?:\s+[A-Z][\w&.'-]+){0,3})/) ||
    context.match(/\b([A-Z][\w&.'-]{2,}(?:\s+[A-Z][\w&.'-]+){0,2})\s+(?:recherche|recrute|propose)/i);
  if (m) return m[1].trim().slice(0, 60);
  const fromName = (from.split("@")[0] || "").replace(/[._-]+/g, " ").trim();
  return fromName.slice(0, 40) || "—";
}

function inferLocation(context: string): string {
  const m = context.match(
    /\b(Paris|Lyon|Marseille|Bordeaux|Toulouse|Lille|Nantes|Rennes|Strasbourg|Nice|Montpellier|Grenoble|Remote|Télétravail|France|Belgique|Suisse)[\w\s,.-]{0,40}/i
  );
  return m ? m[0].trim().slice(0, 60) : "—";
}

/** Détecte les offres — URLs réelles uniquement (règle absolue). */
export function detectOffersInEmail(parsed: ParsedEmailOut): DetectResult {
  const html = parsed.bodyHtml || "";
  const text = parsed.bodyPlain || parsed.text || "";
  const offers: DetectedOffer[] = [];
  const seen = new Set<string>();

  // a) Liens détérministes par plateforme (si HTML présent)
  if (html) {
    try {
      const { offers: anchors } = extractOfferLinks(html);
      for (const a of anchors) {
        const url = canonicalizeOfferUrl(a.canonicalUrl) || a.canonicalUrl;
        if (!url || seen.has(url) || !hostOk(url)) continue;
        seen.add(url);
        const block = isolateBlock(html, a.canonicalUrl)?.snippet || "";
        const context = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        offers.push({
          id: `gm_${parsed.id}_${seen.size}`,
          title: inferTitle(a.rawTitle, context, a.platform),
          company: inferCompany(context || text.slice(0, 400), parsed.from),
          location: inferLocation(context || text),
          salary: "",
          match: 0,
          keywords: [],
          text: context || text.slice(0, 500),
          url,
          source: a.platform,
          reason: "link_platform",
        });
      }
    } catch {
      /* fallback textuel */
    }
  }

  // b) Liens textuels job-like non déjà couverts par les plateformes
  for (const u of parsed.links) {
    if (seen.has(u) || !hostOk(u)) continue;
    if (!/job|offer|offre|stage|intern|career|emploi|recrut|welcome|hellowork|apec|linkedin|greenhouse|lever|workable/i.test(u))
      continue;
    seen.add(u);
    const idx = text.indexOf(u);
    const context = idx >= 0 ? text.slice(Math.max(0, idx - 120), idx + 80) : text.slice(0, 200);
    offers.push({
      id: `gm_${parsed.id}_${seen.size}`,
      title: inferTitle("", context, parsed.subject || "Offre"),
      company: inferCompany(context, parsed.from),
      location: inferLocation(context),
      salary: "",
      match: 0,
      keywords: [],
      text: context,
      url: u,
      source: "Generique",
      reason: "link_text",
    });
    if (offers.length >= 40) break;
  }

  // c) Texte structuré sans lien exploitable → NO_OFFER
  if (offers.length === 0) {
    const hasJobWords = /stage|alternance|emploi|offre|recrut|candidat/i.test(text);
    if (!hasJobWords) {
      return { offers: [], reason: "NO_OFFER", isNoOffer: true };
    }
    return { offers: [], reason: "NO_OFFER", isNoOffer: true };
  }

  return {
    offers,
    reason: `detected_${offers.length}_offers`,
    isNoOffer: false,
  };
}
