import { emptyData, type DetectedOffer } from "./data";
import { analyzePfeOffer } from "./pfe-matching";
import { canonicalizeOfferUrl } from "./offer-links";
import { discoveryUrlKey } from "./discovery-identity";

/** Only explicit page labels or user-confirmed fields become metadata. */
export function prepareManualOffer(input: { text: string; title?: string; company?: string; url?: string }, id: string, now: string): DetectedOffer {
  const text = input.text.trim().slice(0, 30_000);
  const label = (name: string) => text.match(new RegExp(`^${name}[ \\t]*:[ \\t]*([^\\r\\n]*)`, "im"))?.[1]?.trim() || "";
  const offer: DetectedOffer = {
    id, title: (input.title?.trim() || label("Poste")).slice(0, 200),
    company: (input.company?.trim() || label("Entreprise")).slice(0, 120),
    location: label("Lieu").slice(0, 120), salary: "", match: 0, keywords: [], text,
    description: text, url: input.url ? canonicalizeOfferUrl(input.url) || input.url : undefined,
    source: "Ajout manuel", receivedAt: now,
    contract: /\b(stage|stagiaire|internship|intern)\b/i.test(input.title || label("Poste") || label("Contrat")) ? "Stage" : undefined,
    duration: text.match(/(?:stage|durée)[^.!?\n]{0,35}?\b((?:[1-9]|1[0-2])(?:\s*(?:à|-)\s*(?:[1-9]|1[0-2]))?\s*mois)\b/i)?.[1],
    deadline: label("Date limite") || undefined,
  };
  // Same requirement extraction as the Gmail → matching → CV pathway.
  const analysis = analyzePfeOffer(offer, emptyData("", ""));
  offer.skills = analysis.requirements.map(r => r.term);
  offer.keywords = offer.skills;
  return offer;
}

export function sameManualOfferUrl(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const strongA = discoveryUrlKey(a), strongB = discoveryUrlKey(b);
  if (strongA && strongB) return strongA === strongB;
  const normalize = (url: string) => (canonicalizeOfferUrl(url) || url).replace(/\/$/, "");
  return normalize(a) === normalize(b);
}
