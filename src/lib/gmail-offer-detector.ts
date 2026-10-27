/* Détection multi-offres dans un email — URLs UNIQUEMENT présentes dans le mail. */

import type { DetectedOffer } from "@/lib/data";
import { extractOfferLinks, isolateBlock, canonicalizeOfferUrl } from "@/lib/offer-links";
import {
  cleanLabel,
  evidenceText,
  isGenericTitle,
  isUnusableCompany,
  repairOfferIdentity,
  type OfferIdentityInput,
} from "@/lib/offer-identity";
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

/** Un intitulé plausible : une ligne courte, pas une phrase recopiée ni un
    paragraphe concaténé. Au-delà, mieux vaut « Titre à vérifier » qu'un faux. */
function plausibleTitleLine(line: string): boolean {
  const value = (line || "").trim();
  if (value.length <= 5 || value.length > 110) return false;
  if (value.split(/\s+/).length > 14) return false;
  if (/(?:voir l'offre|postuler|en savoir plus|d[ée]couvrir)/i.test(value)) return false;
  return true;
}

function inferTitle(anchorText: string, context: string, fallback: string): string {
  /* Jamais de découpe sur « - » : « Stage TFE - Ingénieur électricité » devenait
     « Stage TFE » — un titre tronqué, pire qu'aucun titre. */
  const t = cleanLabel(anchorText);
  if (t && t.length > 3 && !/^https?:/i.test(t) && !isGenericTitle(t)) return t.slice(0, 140);
  const lines = context
    .split(/\n|•|·|\||\u2013|\u2014/)
    .map((l) => cleanLabel(l))
    .filter(plausibleTitleLine);
  const candidate = lines.find((l) => !isGenericTitle(l)) || cleanLabel(fallback);
  if (!candidate || isGenericTitle(candidate) || !plausibleTitleLine(candidate)) return "";
  return candidate.slice(0, 140);
}

function inferCompany(context: string, from: string): string {
  const m =
    context.match(/\b(?:chez|at|–|-)\s+([A-Z][\w&.'-]+(?:\s+[A-Z][\w&.'-]+){0,3})/) ||
    context.match(/\b([A-Z][\w&.'-]{2,}(?:\s+[A-Z][\w&.'-]+){0,2})\s+(?:recherche|recrute|propose)/i);
  const found = m ? cleanLabel(m[1]).slice(0, 60) : "";
  if (found && !isUnusableCompany(found)) return found;
  const fromName = cleanLabel((from.split("@")[0] || "").replace(/[._-]+/g, " "));
  if (fromName && !isUnusableCompany(fromName)) return fromName.slice(0, 40);
  return "";
}

function inferLocation(context: string): string {
  const m = context.match(
    /\b(Paris|Lyon|Marseille|Bordeaux|Toulouse|Lille|Nantes|Rennes|Strasbourg|Nice|Montpellier|Grenoble|Remote|Télétravail|France|Belgique|Suisse)[\w\s,.-]{0,40}/i
  );
  return m ? m[0].trim().slice(0, 60) : "—";
}

/** Détecte les offres — URLs réelles uniquement (règle absolue).

    Objet du mail : jamais repris comme titre d'une sous-offre. Un mail d'alerte
    peut contenir jusqu'à dix annonces ; l'objet décrit le mail, pas chacune
    d'elles. Il n'est utilisé que si le mail ne contient QU'UNE offre, et après
    coup — au moment de détecter, on ne connaît pas encore le total. */
export function detectOffersInEmail(parsed: ParsedEmailOut): DetectResult {
  const html = parsed.bodyHtml || "";
  const text = parsed.bodyPlain || parsed.text || "";
  const offers: DetectedOffer[] = [];
  /* Entrées brutes de chaque offre : permet de finaliser l'identité après
     détection, quand le nombre d'offres du mail est connu. */
  const rawIdentities: OfferIdentityInput[] = [];
  const seen = new Set<string>();

  // a) Liens détérministes par plateforme (si HTML présent)
  if (html) {
    try {
      const { offers: anchors } = extractOfferLinks(html);
      for (const a of anchors) {
        const url = canonicalizeOfferUrl(a.canonicalUrl) || a.canonicalUrl;
        if (!url || seen.has(url) || !hostOk(url)) continue;
        seen.add(url);
        /* Bloc de CETTE annonce, lignes conservées : jamais le mail entier. */
        const context = evidenceText(isolateBlock(html, a.canonicalUrl)?.snippet || "");
        const rawIdentity: OfferIdentityInput = {
          title: inferTitle(a.rawTitle, context, a.platform),
          company: inferCompany(context || text.slice(0, 400), parsed.from),
          url,
          snippet: context,
          fromHint: parsed.from,
        };
        rawIdentities.push(rawIdentity);
        const identity = repairOfferIdentity(rawIdentity);
        offers.push({
          id: `gm_${parsed.id}_${seen.size}`,
          title: identity.title,
          company: identity.company,
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
    const rawIdentity: OfferIdentityInput = {
      /* Le sujet du mail n'est jamais un titre de repli : il nomme le mail. */
      title: inferTitle("", context, ""),
      company: inferCompany(context, parsed.from),
      url: u,
      snippet: context,
      fromHint: parsed.from,
    };
    rawIdentities.push(rawIdentity);
    const identity = repairOfferIdentity(rawIdentity);
    offers.push({
      id: `gm_${parsed.id}_${seen.size}`,
      title: identity.title,
      company: identity.company,
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

  /* Mail à offre unique : l'objet peut nommer cette offre. */
  if (offers.length === 1 && rawIdentities.length === 1) {
    const identity = repairOfferIdentity({ ...rawIdentities[0], subjectHint: parsed.subject || "" });
    offers[0] = { ...offers[0], title: identity.title, company: identity.company };
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
