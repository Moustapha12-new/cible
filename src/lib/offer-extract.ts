/* ════════════════ Extraction multi-offres au niveau CARTE ════════════════
   Chantier 2 — Jalon A. Un e-mail d'alerte peut contenir une annonce vedette,
   plusieurs sous-offres, des recommandations et des doublons. Ce module identifie
   TOUTES les véritables annonces distinctes, préserve leurs liens individuels et
   attache une provenance complète à chaque occurrence.

   Règles par plateforme (démontrées sur les fixtures de docs/freebuff/fixtures) :
   · Indeed     — chaque `viewjob?jk=<id>` est une offre ; 8 jk uniques = 8 offres.
   · LinkedIn   — chaque `/jobs/view/<jobId>` est une offre ; les 3 ancres d'une
                  même carte (logo, zone, titre) partagent le jobId → fusionnées ;
                  le lien de l'objet (dans <h1>) est une RÉFÉRENCE CONTEXTUELLE,
                  jamais une recommandée → exclu.
   · HelloWork  — chaque carte `/clic/…/details` est une offre ; dédup par
                  (titre, entreprise, localisation) car l'URL de tracking change
                  entre deux apparitions ; deux villes distinctes = deux offres.
   · Générique  — fallback sur les règles d'URL d'offer-links.

   AUCUNE offre n'est inventée : on ne collecte que des ancres réellement
   présentes dans le HTML. Le pied de page, la recherche, le désabonnement et le
   branding ne sont jamais des offres. */

import * as cheerio from "cheerio";
import { canonicalizeOfferUrl, extractOfferLinks, isValidIndeedJk } from "./offer-links";
import type { Element } from "domhandler";

export type ExtractProvider = "Indeed" | "LinkedIn" | "HelloWork" | "Generique";

/** Présence d'une carte d'annonce dans un e-mail, avec provenance exacte. */
export type OfferOccurrence = {
  gmailMessageId: string;
  domPath: string;
  sourceText: string;
  provider: ExtractProvider;
  /** Index de carte dans l'ordre du document (0-based). */
  cardIndex: number;
  /** Identifiant source (jk Indeed, jobId LinkedIn, id clic HelloWork). */
  sourceJobId?: string;
  /** URL brute du mail (traçabilité — jamais affichée telle quelle). */
  rawHref: string;
  title: string;
  company: string;
  location: string;
  contract?: string;
  /** Confiance 0-1 sur la classification carte-offre (texte/chrome). */
  confidence: number;
};

/** Offre distincte après déduplication, avec toutes ses occurrences. */
export type JobOffer = {
  occurrences: OfferOccurrence[];
  /** Identifiant stable : provider:jobId, ou provider:hash(titre|entreprise|lieu). */
  id: string;
  provider: ExtractProvider;
  sourceJobId?: string;
  title: string;
  company: string;
  location: string;
  contract?: string;
  /** URL canonique (tracking retiré) pour la candidature. */
  canonicalUrl: string;
  /** Toutes les URLs brutes rencontrées pour cette offre (preuves). */
  rawHrefs: string[];
  occurrenceCount: number;
  /** Biais de déduplication employé. */
  dedupBasis: "provider_id" | "title_company_location" | "canonical_url";
};

export type ExtractResult = {
  provider: ExtractProvider;
  occurrences: OfferOccurrence[];
  offers: JobOffer[];
  /** Diagnostics d'exhaustivité (réconciliation messages ≠ cartes ≠ offres). */
  diagnostics: {
    anchorsTotal: number;
    offerAnchors: number;
    duplicatesMerged: number;
    /** Référence contextuelle exclue (ex. jobId de l'objet LinkedIn). */
    contextExcluded: number;
  };
};

/* ── Utilitaires ───────────────────────────────────────────────── */

const T = (s: string) => s.replace(/\s+/g, " ").trim();

function provenance($: cheerio.CheerioAPI, el: Element, messageId: string, text: string) {
  const path = $(el).parents().toArray().reverse().concat(el).map(node => `${node.tagName}:nth-of-type(${$(node).prevAll(node.tagName).length + 1})`).join(" > ");
  return { gmailMessageId: messageId, domPath: path, sourceText: text };
}

function sourceHost(href: string, domain: string): boolean {
  try { const u = new URL(href); return /^https?:$/.test(u.protocol) && (u.hostname === domain || u.hostname.endsWith(`.${domain}`)); }
  catch { return false; }
}

/** Diacritiques → ASCII + minuscules (clé de dédup robuste aux accents). */
export const normKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Hash court déterministe (clé HelloWork sans jobId). */
function hashShort(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Chrome digest : texte qui n'est JAMAIS un titre d'offre. */
function isChromeTitle(title: string): boolean {
  const t = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (!t) return true;
  if (t.length > 120) return false;
  return /^(voir l'?offre|voir toutes|postuler|cliquez|acceder|en savoir plus|unsubscribe|se desabonner|desinscrire|gerer|instagram|facebook|youtube|tiktok|twitter|linkedin|hellowork|espace candidat|aide et contact|politique|mon compte|connexion|logo\b|offres? (d'?emploi|similaires)|voir plus|precedent|suivant)/i.test(
    t
  );
}

/** Localisation HelloWork « Ville - département » → la Ville seule.
    Le séparateur est un tiret ENTOURÉ d'espaces (« - 93 ») pour ne pas couper
    les hyphens internes d'une ville (Aulnay-sous-Bois, Joué-lès-Tours).
    Chiffres acceptés dans la ville (« Paris 18e »). Deux villes restent
    distinctes ; l'attendu d'identité porte sur la ville. */
function parseHwLocation(text: string): string {
  const m = text.match(/([A-Za-zÀ-ÿ'’.\d\- ]+?)\s+-\s+(\d{2,3})\b/);
  return m ? T(m[1]) : "";
}

/* ── Détection de la plateforme dominante ──────────────────────── */

export function detectProvider(input: { from?: string; subject?: string; html?: string }): ExtractProvider {
  const blob = `${input.from || ""} ${input.subject || ""}`.toLowerCase();
  if (/indeed/.test(blob)) return "Indeed";
  if (/linkedin/.test(blob)) return "LinkedIn";
  if (/hellowork/.test(blob)) return "HelloWork";
  const html = (input.html || "").toLowerCase();
  if (/indeed\.com/.test(html)) return "Indeed";
  if (/linkedin\.com/.test(html)) return "LinkedIn";
  if (/hellowork\.com/.test(html)) return "HelloWork";
  return "Generique";
}

/* ── Parseur Indeed ────────────────────────────────────────────── */

function parseIndeed($: cheerio.CheerioAPI, messageId: string): OfferOccurrence[] {
  const out: OfferOccurrence[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_i, el) => {
    const href = ($(el).attr("href") || "").replace(/&amp;/g, "&").trim();
    if (!href) return;
    let u: URL;
    try {
      u = new URL(href, "https://localhost");
    } catch {
      return;
    }
    if (!sourceHost(href, "indeed.com")) return;
    const jk = (u.searchParams.get("jk") || "").trim();
    if (!jk || !isValidIndeedJk(jk) || seen.has(jk)) return;
    // Titre/entreprise : bloc englobant le plus proche.
    const block = $(el).closest("table");
    const text = T(block.text());
    const title = T($(el).text()) || text.split("|")[0] || "";
    if (!title || isChromeTitle(title)) return;
    seen.add(jk);
    out.push({
      ...provenance($, el, messageId, text || title),
      provider: "Indeed",
      cardIndex: out.length,
      sourceJobId: jk,
      rawHref: href,
      title,
      company: T(block.find("p").eq(0).text()),
      location: T(block.find("p").eq(1).text()),
      confidence: 0.9,
    });
  });
  return out;
}

/* ── Parseur LinkedIn ──────────────────────────────────────────── */

function parseLinkedIn($: cheerio.CheerioAPI, messageId: string): OfferOccurrence[] {
  const out: OfferOccurrence[] = [];
  const seen = new Set<string>();

  $("a[href*='/jobs/view/']").each((_i, el) => {
    const href = ($(el).attr("href") || "").replace(/&amp;/g, "&").trim();
    if (!sourceHost(href, "linkedin.com")) return;
    const m = href.match(/\/jobs\/view\/(\d+)/);
    if (!m) return;
    const jobId = m[1];
    // Exclude only the contextual occurrence, not a genuine card with the same ID.
    if ($(el).closest("h1").length) return;
    if (seen.has(jobId)) return; // 3 ancres/même jobId → 1 carte
    const siblings = $("a[href]").filter((_i, anchor) => !$(anchor).closest("h1").length && ($(anchor).attr("href") || "").match(/\/jobs\/view\/(\d+)/)?.[1] === jobId);
    const titleAnchor = siblings.toArray().filter(anchor => T($(anchor).text()) && !$(anchor).find("table, img").length && !isChromeTitle(T($(anchor).text())))
      .sort((a,b) => T($(a).text()).length - T($(b).text()).length)[0];
    if (!titleAnchor) return;
    seen.add(jobId);
    const block = $(titleAnchor).closest("table");
    const meta = T(block.find("p").first().text()).split(/\s+·\s+/);
    const imgAlt = T(siblings.find("img").first().attr("alt") || "");

    out.push({
      ...provenance($, titleAnchor, messageId, T(block.text()) || T($(titleAnchor).text())),
      provider: "LinkedIn",
      cardIndex: out.length,
      sourceJobId: jobId,
      rawHref: $(titleAnchor).attr("href") || href,
      title: T($(titleAnchor).text()),
      company: meta.length > 1 ? meta[0] : imgAlt,
      location: meta.length > 1 ? meta.slice(1).join(" · ") : "",
      confidence: 0.92,
    });
  });

  return out;
}

/* ── Parseur HelloWork ─────────────────────────────────────────── */

function parseHelloWork($: cheerio.CheerioAPI, messageId: string): OfferOccurrence[] {
  const out: OfferOccurrence[] = [];
  $("a[href*='/clic/']").each((_i, el) => {
    const href = ($(el).attr("href") || "").replace(/&amp;/g, "&").trim();
    if (!sourceHost(href, "hellowork.com")) return;
    const title = T($(el).text());
    if (!title || isChromeTitle(title)) return; // lien social/footer sans titre

    // Entreprise + localisation : cellules de la table de carte la plus proche.
    const table = $(el).closest("table");
    const cells = table
      .find("td")
      .map((_j, t) => T($(t).text()))
      .get()
      .filter(Boolean);
    let company = "";
    let location = "";
    let contract = "";
    for (const c of cells) {
      if (!company && c !== title && !/\d{2,3}|Stage|Voir|Alternance/i.test(c) && c.length > 2) company = c;
      const loc = parseHwLocation(c);
      if (!location && loc) location = loc;
      const cm = c.match(/\b(Stage|Alternance|CDI|CDD|VIE)\b/i);
      if (!contract && cm) contract = cm[1];
    }
    // Identifiant clic (segment après /clic/) pour la traçabilité.
    const clicId = (href.match(/\/clic\/([^/]+)/) ?? [])[1] || "";

    out.push({
      ...provenance($, el, messageId, T(table.text())),
      provider: "HelloWork",
      cardIndex: out.length,
      // An opaque click token is not an employer job identifier.
      rawHref: href,
      title,
      company,
      location,
      contract,
      confidence: 0.85,
    });
  });
  return out;
}

/* ── Déduplication → offres distinctes ─────────────────────────── */

function dedupToOffers(
  occurrences: OfferOccurrence[],
  provider: ExtractProvider
): { offers: JobOffer[]; merged: number } {
  const offers: JobOffer[] = [];
  const byId = new Map<string, JobOffer>();
  const byKey = new Map<string, JobOffer>();
  let merged = 0;

  for (const occ of occurrences) {
    const canonicalUrl = canonicalizeOfferUrl(occ.rawHref) || occ.rawHref;

    if (provider === "HelloWork" && occ.company && occ.location) {
      // Clé sémantique : titre|entreprise|localisation (URL de tracking variable).
      const key = `${normKey(occ.title)}|${normKey(occ.company)}|${normKey(occ.location)}`;
      const hit = byKey.get(key);
      if (hit) {
        hit.occurrenceCount += 1;
        hit.occurrences.push(occ);
        if (!hit.rawHrefs.includes(occ.rawHref)) hit.rawHrefs.push(occ.rawHref);
        merged += 1;
        continue;
      }
      const offer: JobOffer = {
        occurrences: [occ],
        id: `hw:${hashShort(key)}`,
        provider,
        sourceJobId: occ.sourceJobId,
        title: occ.title,
        company: occ.company,
        location: occ.location,
        contract: occ.contract,
        canonicalUrl,
        rawHrefs: [occ.rawHref],
        occurrenceCount: 1,
        dedupBasis: "title_company_location",
      };
      byKey.set(key, offer);
      offers.push(offer);
    } else {
      // Clé provider (jk / jobId) — identifiant source stable.
      const jk = occ.sourceJobId || hashShort(canonicalUrl);
      const id = `${provider === "Indeed" ? "in" : provider === "LinkedIn" ? "li" : "p"}:${jk}`;
      const hit = byId.get(id);
      if (hit) {
        hit.occurrenceCount += 1;
        hit.occurrences.push(occ);
        if (!hit.rawHrefs.includes(occ.rawHref)) hit.rawHrefs.push(occ.rawHref);
        merged += 1;
        continue;
      }
      const offer: JobOffer = {
        occurrences: [occ],
        id,
        provider,
        sourceJobId: occ.sourceJobId,
        title: occ.title,
        company: occ.company,
        location: occ.location,
        contract: occ.contract,
        canonicalUrl,
        rawHrefs: [occ.rawHref],
        occurrenceCount: 1,
        dedupBasis: occ.sourceJobId ? "provider_id" : "canonical_url",
      };
      byId.set(id, offer);
      offers.push(offer);
    }
  }
  return { offers, merged };
}

/* ── Point d'entrée ────────────────────────────────────────────── */

/** Extrait TOUTES les offres distinctes d'un e-mail, avec provenance.
    Aucune offre n'est fabriquée : seules les ancres réelles du HTML comptent. */
export function extractOffersFromEmail(email: {
  id: string;
  from?: string;
  subject?: string;
  html?: string;
}): ExtractResult {
  const provider = detectProvider(email);
  const empty: ExtractResult = {
    provider,
    occurrences: [],
    offers: [],
    diagnostics: { anchorsTotal: 0, offerAnchors: 0, duplicatesMerged: 0, contextExcluded: 0 },
  };
  if (!email.html || email.html.trim().length === 0) return empty;

  const $ = cheerio.load(email.html, { scriptingEnabled: false });
  const anchorsTotal = $("a[href]").length;

  let occurrences: OfferOccurrence[] = [];
  let contextExcluded = 0;
  if (provider === "Indeed") occurrences = parseIndeed($, email.id);
  else if (provider === "LinkedIn") {
    occurrences = parseLinkedIn($, email.id);
    // Recalcule l'exclusion contextuelle pour le diagnostic.
    const h1Ids = new Set<string>();
    $("h1 a[href]").each((_i, el) => {
      const m = ($(el).attr("href") || "").match(/\/jobs\/view\/(\d+)/);
      if (m) h1Ids.add(m[1]);
    });
    $("a[href*='/jobs/view/']").each((_i, el) => {
      const m = ($(el).attr("href") || "").match(/\/jobs\/view\/(\d+)/);
      if (m && h1Ids.has(m[1]) && $(el).closest("h1").length) contextExcluded += 1;
    });
  } else if (provider === "HelloWork") occurrences = parseHelloWork($, email.id);
  else {
    const accepted = new Set(extractOfferLinks(email.html).offers.map(offer => offer.href));
    // Générique : ancres vers des URLs d'offres, dédup par clé plateforme.
    $("a[href]").each((_i, el) => {
      const href = ($(el).attr("href") || "").replace(/&amp;/g, "&").trim();
      if (!href || !/^https?:\/\//i.test(href)) return;
      if (!accepted.has(href)) return;
      const title = T($(el).text());
      if (!title || isChromeTitle(title)) return;
      occurrences.push({
        ...provenance($, el, email.id, T($(el).closest("td, article, div").text()) || title),
        provider: "Generique",
        cardIndex: occurrences.length,
        rawHref: href,
        title,
        company: "",
        location: "",
        confidence: 0.6,
      });
    });
  }

  const { offers, merged } = dedupToOffers(occurrences, provider);
  return {
    provider,
    occurrences,
    offers,
    diagnostics: {
      anchorsTotal,
      offerAnchors: occurrences.length,
      duplicatesMerged: merged,
      contextExcluded,
    },
  };
}
