/* ════════════════ Extraction déterministe des offres d'un mail ════════════════
   PRINCIPE (à ne jamais violer) :
   Trouver / compter / lister les offres = code déterministe (parsing DOM en
   boucle complète). Un LLM ne « lit » jamais le mail pour en lister les offres :
   plusieurs centaines d'ancres HTML répètent des blocs similaires et un LLM
   résume ou saute la fin — c'est un problème d'attention, pas de prompt.

   Pipeline (garanti par le code, pas par l'IA) :
   1. find_all('a') sur TOUT le DOM (aucune limite), via Cheerio.
   2. filtre regex des href vers les offres, par plateforme.
   3. extraction de l'ID + reconstruction de l'URL canonique (tracking retiré).
   4. déduplication par ID : le nombre d'IDs uniques = nombre VRAI d'offres.
   5. remontée DOM pour isoler le bloc HTML de chaque offre (contenant unique).
   6. compteur de marqueurs indépendant (blocs logo / classe « job-item ») :
      si unique ≠ marqueurs, le pattern de lien est à corriger — jamais un LLM. */

import * as cheerio from "cheerio";
import { inflateRawSync } from "node:zlib";

export type Platform =
  | "LinkedIn"
  | "Indeed"
  | "JobTeaser"
  | "Welcome to the Jungle"
  | "HelloWork"
  | "Apec"
  | "Generique";

export type OfferAnchor = {
  platform: Platform;
  href: string;
  canonicalUrl: string;
  /** Clé de déduplication : l'ID d'offre (jamais l'URL de tracking). */
  key: string;
  rawTitle: string;
};

export type DetectSummary = {
  htmlPresent: boolean;
  /** Nombre total d'ancres <a> parcourues (exhaustivité de la boucle). */
  anchorsTotal: number;
  /** Ancres reconnues comme offres (avant déduplication). */
  offerAnchors: number;
  /** Marqueurs indépendants comptés (blocs logo / « job-item »). */
  markers: number;
  /** Offres uniques (après déduplication par ID). */
  unique: number;
  /** true si unique === marqueurs (complétude vérifiée), false si écart,
      null si aucun marqueur exploitable. */
  verifyOk: boolean | null;
};

export type BlockInfo = {
  title: string;
  company: string;
  location: string;
  /** Fragment HTML isolé du bloc de CETTE offre (pour un éventuel passage
      LLM limité à ce fragment — jamais le mail entier). */
  snippet: string;
};

type Rule = {
  platform: Platform;
  match: (host: string, path: string, query: URLSearchParams) => boolean;
  canonical: (host: string, path: string, query: URLSearchParams) => { url: string; key: string } | null;
};

const RULES: Rule[] = [
  {
    platform: "LinkedIn",
    /* Les emails d'alerte LinkedIn pointent aussi vers
       /comm/jobs/view/<id> (suivi) — jamais une ancre du domaine ne doit
       échapper à l'extraction à cause du préfixe « comm/ ». */
    match: (host, p) => /linkedin\.com$/i.test(host) && /\/(?:comm\/)?jobs\/view\/([\w-]+)/i.test(p),
    canonical: (_h, path) => {
      const id = (path.match(/\/(?:comm\/)?jobs\/view\/([\w-]+)/i) ?? [])[1];
      return id ? { url: `https://www.linkedin.com/jobs/view/${encodeURIComponent(id)}/`, key: `li:${id}` } : null;
    },
  },
  {
    platform: "Indeed",
    /* Indeed route ses candidatures via /rc/clk, /viewjob, /jobs, /cmp/{co}/jobs :
       le seul critère fiable, quelle que soit la forme du lien, est le jobKey
       « jk » présent en query. Les liens de désinscription / compte / footer
       n'en portent jamais.
       Robustesse : certains mails stockés ont « jk<corpus> » SANS '=' (le '='
       a été corrompu en un octet non-ASCII) — on accepte aussi une clé de
       query qui commence par « jk ».
       Tracking opaque (match/jobalert) :
       - cts.indeed.com/v3/{b64}  → clé = hash du path (titre + CTA partagent le même path)
       - engage.indeed.com/f/a/…  → clé = path complet
       - fr.indeed.com/pagead/clk/dl?…&jrtk=… → clé = jrtk
       Le chrome (désinscription, oui/non, footer) est filtré par titre dans
       extractOfferLinks via isChromeTrackingTitle. */
    match: (host, p, q) => {
      if (!/indeed\.com$/i.test(host)) return false;
      if (extractIndeedJk(q) !== null) return true;
      if (/^cts\.indeed\.com$/i.test(host) && /^\/v3\//i.test(p)) return true;
      if (/engage\.indeed\.com$/i.test(host) && /\/f\/a\//i.test(p)) return true;
      if (/\/pagead\/clk\/dl/i.test(p)) return true;
      return false;
    },
    canonical: (host, p, q) => {
      const jk = extractIndeedJk(q);
      if (jk) return { url: `https://fr.indeed.com/viewjob?jk=${encodeURIComponent(jk)}`, key: `in:${jk}` };
      if (/^cts\.indeed\.com$/i.test(host)) {
        const h = hashShort(p);
        return h ? { url: `https://${host}${p}`, key: `incts:${h}` } : null;
      }
      if (/engage\.indeed\.com$/i.test(host)) {
        return { url: `https://${host}${p}`, key: `ineng:${hashShort(p)}` };
      }
      if (/\/pagead\/clk\/dl/i.test(p)) {
        const jrtk = (q.get("jrtk") || "").trim();
        const key = jrtk ? hashShort(jrtk) : hashShort(`${p}?${q.toString()}`);
        return { url: `https://${host}${p}`, key: `inpk:${key}` };
      }
      return null;
    },
  },
  {
    platform: "JobTeaser",
    match: (host, p) => /jobteaser\.com$/i.test(host) && /^\/(?:en|fr)\/(?:jobs|offres)\//i.test(p),
    canonical: (_h, p) => {
      const id = (p.match(/(\d+)[\w-]*$/i) ?? [])[1];
      return id ? { url: `https://www.jobteaser.com${p}`, key: `jt:${id}` } : null;
    },
  },
  {
    platform: "Welcome to the Jungle",
    match: (host, p) => /welcometothejungle\.com$/i.test(host) && /\/(?:jobs|offres|postings)\//i.test(p),
    canonical: (host, p) => {
      const id = (p.match(/([\w-]+)$/i) ?? [])[1];
      return id ? { url: `https://${host}${p}`, key: `wttj:${id}` } : null;
    },
  },
  {
    platform: "HelloWork",
    /* Alertes Hellowork : URL classiques (/offres/, /emploi/) OU liens de
       tracking emails.hellowork.com/clic/{campaign}/{n}/{hash}/{payload}.
       Le payload base64 contient l'URL réelle (…/emplois/{id}.html…) — c'est
       l'identifiant d'offre fiable pour la dédup (titre + CTA + localité
       pointent tous vers le même id). Les liens logo/social/footer n'ont pas
       /emplois/\d+ → canonical null → ignorés. */
    match: (host, p) =>
      /(?:^|\.)hellowork\.com$/i.test(host) &&
      (/\/(?:offres|offres\/[\w-]+|emploi)\//i.test(p) || /\/clic\//i.test(p)),
    canonical: (host, p) => {
      const clic = p.match(/\/clic\/[^/]+\/\d+\/[0-9a-f]+\/(.+)$/i);
      if (clic) {
        const real = decodeHelloWorkPayload(clic[1]);
        const job = real?.match(/\/emplois\/(\d+)/i);
        if (job) {
          return {
            url: `https://www.hellowork.com/fr-fr/emplois/${job[1]}.html`,
            key: `hw:${job[1]}`,
          };
        }
        return null;
      }
      const id = (p.match(/([\w-]+)$/i) ?? [])[1];
      return id ? { url: `https://${host}${p}`, key: `hw:${id}` } : null;
    },
  },
  {
    platform: "Apec",
    match: (host, p) => /apec\.fr$/i.test(host) && /\/emplois?\//i.test(p),
    canonical: (host, p) => {
      const id = (p.match(/([\d]+)/i) ?? [])[1];
      return id ? { url: `https://${host}${p}`, key: `apec:${id}` } : null;
    },
  },
  {
    /* Règle générique (sites carrière directs + notre mock local) : une URL
       dont le chemin porte un marqueur d'offre ET un identifiant. Les liens de
       "liste" (/offers/, /jobs/) sans identifiant sont ignorés. L'URL est
       conservée telle quelle (query de tracking retirée), la clé est le chemin. */
    platform: "Generique",
    match: (_h, p) => {
      if (/^\/jobs\/view\//i.test(p)) return true;
      const m = p.match(/^\/(?:offers?|offres?|stage|stages|annonce|annonces|emploi|emplois|postings?|jobs?)\/(.+)$/i);
      if (!m) return false;
      const rest = m[1];
      return Boolean(rest && rest !== "/" && rest.length >= 2);
    },
    canonical: (host, p) => {
      const clean = p.replace(/\/+$/, "") || "/";
      return { url: `https://${host}${clean}`, key: `p:${host.toLowerCase()}${clean.toLowerCase()}` };
    },
  },
];

function canonicalize(href: string): OfferAnchor | null {
  const url = new URL(href, "https://localhost");
  const host = url.hostname;
  const path = decodeURIComponent(url.pathname);
  const query = url.searchParams;
  const rule = RULES.find((r) => r.match(host, path, query));
  if (!rule) return null;
  const c = rule.canonical(host, path, query);
  if (!c) return null;
  return {
    platform: rule.platform,
    href,
    canonicalUrl: c.url,
    key: c.key,
    rawTitle: "",
  };
}

/** Canonicalise une URL d'offre (tracking → URL propre) via les RULES.
    Retourne null si la plateforme n'est pas reconnue (l'appelant garde l'originale). */
export function canonicalizeOfferUrl(href: string): string | null {
  if (!href || typeof href !== "string") return null;
  try {
    return canonicalize(href)?.canonicalUrl ?? null;
  } catch {
    return null;
  }
}

/** Clé plateforme de l'URL d'offre (li:<id>, in:<jk>, hw:<id>…) — null si
    plateforme inconnue. Ponte l'URL canonique et l'URL brute du mail. */
export function jobKeyOf(href: string): string | null {
  return offerKeyOf(href);
}

/** Nettoie une URL d'offre pour l'affichage/candidature : plateforme connue →
    URL canonique (tracking retiré) ; pattern non reconnu → inchangée.
    Idempotent — point d'écriture unique du pipeline. */
export function cleanJobUrl(url: string): string {
  if (!url) return url;
  return canonicalizeOfferUrl(url) ?? url;
}

/** Hash court déterministe d'une chaîne (clé de dédup tracking opaque). */
function hashShort(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Décode le payload base64 d'un clic Hellowork → URL réelle (ou null).
    Forme observée : base64(email + octets séparateur + url). */
function decodeHelloWorkPayload(payload: string): string | null {
  try {
    const decoded = Buffer.from(payload, "base64").toString("utf8");
    const idx = decoded.indexOf("https://");
    if (idx >= 0) return decoded.slice(idx);
  } catch {
    /* payload non-base64 */
  }
  return null;
}

/** Textes Hellowork qui ne sont JAMAIS un titre d'offre (chrome du digest).
    P0-3 : texte normalisé sans diacritiques avant match (mêmes accents cassés). */
function isHelloWorkNonOfferTitle(title: string): boolean {
  const t = stripAccents(title.trim());
  if (!t) return true;
  if (t.length > 120) return false;
  return /^(logo\b|voir l['’]?offre\b|voir toutes|instagram|facebook|youtube|tiktok|twitter|x\.com|linkedin|hellowork|espace candidat|aide et contact|politique|vos pr|vous d|se d|unsubscribe|en savoir plus|cliquez|acceder|mon compte|connexion|parametre|gerer)/i.test(
    t
  );
}

/** Chrome des liens de tracking Indeed (match / jobalert / pagead).
    P0-3 : le texte est normalisé (NFD → sans diacritiques, minuscules) AVANT
    le match — « Se désabonner » / « Gérer les alertes » / « vous désinscrire »
    (accents réels) passaient avant les classes `[âe]`. */
export function isChromeTrackingTitle(title: string): boolean {
  const t = stripAccents(title.trim());
  if (!t) return true;
  if (t.length > 140) return false;
  return /^(ne correspond pas|oui|non|modifier( le profil| c| ce)?|en savoir plus|voir l['’]?emploi\b|afficher (tous les emplois|plus)|depuis hier|sur les \d+ derniers|vous de?s?inscrire|suspendre|gerer les alertes|se desabonner|desinscrire|politique|conditions|centre d['’]?aide|indeed$|rechercher|connexion|examiner mon profil|acceder|essayer|essayer gratuitement|linkedin premium|assistance|decouvrez)/i.test(
    t
  );
}

/** Diacritiques → ASCII, minuscules (« Désabonner » = « desabonner »). */
function stripAccents(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** P0-3 : jobKey Indeed valide — 13 à 24 caractères alphanumériques
    (observé 13–15 sur les digest 2024-2026, marge pour les formes anciennes).
    Rejette les fragments corrompus (« jk&08478d… », slugs, chaînes courtes) :
    jamais de `viewjob?jk=` fabriqué à partir d'un déchet. */
export function isValidIndeedJk(jk: string): boolean {
  return /^[0-9a-zA-Z]{13,24}$/.test(jk);
}

/** Extrait le jobKey Indeed (query « jk ») y compris si le '=' a été corrompu
    en un octet non-ASCII (clé de query « jk<reste> » sans valeur).
    P0-3 : seules les clés VALIDES (isValidIndeedJk, 13-24 alnum) sont
    retournées — un déchet ne devient jamais un viewjob?jk= fake. */
function extractIndeedJk(q: URLSearchParams): string | null {
  const direct = (q.get("jk") || "").trim();
  if (direct && isValidIndeedJk(direct)) return direct;
  for (const k of q.keys()) {
    const m = k.match(/^jk(.+)$/i);
    if (!m) continue;
    /* Conserve uniquement les caractères plausibles d'un jobKey Indeed. */
    const raw = m[1].replace(/[^0-9a-zA-Z]/g, "");
    if (isValidIndeedJk(raw)) return raw;
  }
  return null;
}

/** P0-3 : décode HORS LIGNE la cible d'un lien tracking Indeed
    `cts.indeed.com/v3/{base64url}` = `gzip(JSON {"u": "<url cible>"})`.
    Aucun réseau : Indeed bloque les robots (403 vérifié) — décodage local
    uniquement. null = indécodable (payload tronqué / non-JSON). */
export function decodeIndeedCtsTarget(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/^cts\.indeed\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/v3\/(.+)$/i);
    if (!m) return null;
    let b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    /* Les payloads cts réels ont un trailer gzip absent/corrompu :
       gunzipSync échoue (« incorrect header check »). On saute l'en-tête
       gzip (10 octets, magic 1f 8b 08 vérifié) et on inflate le deflate
       brut — le JSON est complet et le trailer n'est pas nécessaire.
       Vérifié sur les 36 URLs cts du jeu live : 36/36 décodées. */
    const raw = Buffer.from(b64, "base64");
    if (raw.length <= 10 || raw[0] !== 0x1f || raw[1] !== 0x8b || raw[2] !== 0x08) return null;
    const json = inflateRawSync(raw.subarray(10)).toString("utf8");
    const target = (JSON.parse(json) as { u?: unknown }).u;
    if (typeof target !== "string" || !/^https?:\/\//i.test(target)) return null;
    return target;
  } catch {
    return null;
  }
}

/** P0-3 : cible Indeed = chrome (désinscription, optout, gestion d'alerte)
    → l'offre qui y pointe est ÉJECTÉE (ce n'est pas une offre d'emploi). */
export function isIndeedChromeTargetUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/indeed\.com$/i.test(u.hostname)) return false;
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    if (host.startsWith("subscriptions.")) return true;
    if (/\/alerts?\/cancel/i.test(path)) return true;
    return /(^|\/)(optout|unsubscribe|unsub|cancel)(\/|$)/i.test(path);
  } catch {
    return false;
  }
}

/** P0-3 : URL Indeed opaque = redirection non décodable ici
    (engage /f/a/…, cts /v3/… non décodé, pagead /clk) SANS jobKey valide.
    Ces liens restent utilisables par l'utilisateur mais sont affichés avec le
    badge « Lien non direct » (voir gmail-dashboard.isIndirectOfferUrl, miroir
    client pur — ce module n'est jamais importé côté client). */
export function isIndeedOpaqueUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/indeed\.com$/i.test(u.hostname)) return false;
    const jk = (u.searchParams.get("jk") || "").trim();
    if (isValidIndeedJk(jk)) return false;
    return (
      /^\/f\/a\//i.test(u.pathname) ||
      /^\/v3\//i.test(u.pathname) ||
      /\/pagead\/clk/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

/** Marqueurs indépendants : éléments répétés une fois par offre (logo, carte,
    ligne de tableau). Si lescartes sont structurées en classes, on compte ces
    classes ; sinon on compte les images avec alt. */
const MARKER_SELECTORS = [
  '[class*="job-item"]',
  '[class*="job-card"]',
  '[class*="job-tile"]',
  '[class*="offer-card"]',
  '[class*="listings"] li',
  'tr[class*="job"]',
  'li[class*="job"]',
  'div[class*="result"] img[alt]',
  'img[alt*="ogo"]',
  'img[alt*="Company"]',
];

export type AnchorEntry = { text: string; href: string };

/* Liens jamais porteurs d'offre (ancres internes, actions, formulaires). Les
   liens de TRACKING (clk/track/redirect/comm/lnkd.in…) sont VOLONTAIREMENT
   conservés : ce sont souvent les vrais liens de candidature des alertes. */
const NON_OFFER_ANCHOR =
  /^(#|javascript:|mailto:|tel:|sms:|viber:|whatsapp:|line:|wechat:|data:)/i;

/** Enumération déterministe de TOUTES les ancres du mail (texte visible → lien),
    dans l'ordre du document, dédupliquées par href complète. C'est la matière
    que l'IA reçoit quand le code ne reconnaît aucune ancre d'offre : elle peut
    ainsi relire chaque bloc du mail et associer chaque annonce à son lien réel,
    même si ces liens sont des liens de tracking. */
export function extractAnchorMap(html: string | undefined, max = 250): AnchorEntry[] {
  if (!html || html.trim().length === 0) return [];
  const $ = cheerio.load(html, { scriptingEnabled: false });
  const out: AnchorEntry[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_i, el) => {
    if (out.length >= max) return;
    const href = (el.attribs.href || "").trim().replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    if (!href || NON_OFFER_ANCHOR.test(href)) return;
    if (seen.has(href)) return;
    seen.add(href);
    let text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) text = $(el).find("img").first().attr("alt")?.trim() || "";
    if (!text) text = $(el).attr("title")?.trim() || "";
    if (text.length > 140) text = `${text.slice(0, 140)}…`;
    out.push({ text, href });
  });
  return out;
}

export function extractOfferLinks(html: string | undefined): { offers: OfferAnchor[]; summary: DetectSummary } {
  if (!html || html.trim().length === 0) {
    return {
      offers: [],
      summary: { htmlPresent: false, anchorsTotal: 0, offerAnchors: 0, markers: 0, unique: 0, verifyOk: null },
    };
  }
  const $ = cheerio.load(html, { scriptingEnabled: false });
  const rawTitleByHref = new Map<string, string>();

  let anchorsTotal = 0;
  const seenKey = new Set<string>();
  const offers: OfferAnchor[] = [];
  const hrefsSeen = new Set<string>();

  /* 1-4 — boucle exhaustive sur TOUTES les ancres du document. */
  $("a[href]").each((_i, el) => {
    anchorsTotal += 1;
    const href = (el.attribs.href || "").replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const visibleText = $(el).text().replace(/\s+/g, " ").trim();
      const title = visibleText ||
        $(el).find("img").first().attr("alt")?.trim() ||
        $(el).attr("title")?.trim() || "";
      try {
      const canon = canonicalize(href);
      if (!canon) return;
      /* Filtres chrome sur le texte VISIBLE (pas l'alt d'image). */
      if (canon.platform === "HelloWork" && isHelloWorkNonOfferTitle(visibleText)) return;
      if (
        canon.platform === "Indeed" &&
        (canon.key.startsWith("incts:") || canon.key.startsWith("ineng:") || canon.key.startsWith("inpk:")) &&
        isChromeTrackingTitle(visibleText)
      ) {
        return;
      }
      canon.rawTitle = title || rawTitleByHref.get(canon.canonicalUrl) || "";
      if (title) rawTitleByHref.set(canon.canonicalUrl, title);
      if (seenKey.has(canon.key)) return;
      seenKey.add(canon.key);
      if (!hrefsSeen.has(canon.href)) hrefsSeen.add(canon.href);
      offers.push(canon);
    } catch {
      /* URL invalide : ignorée */
    }
  });

  /* 6 — compteur indépendant de marqueurs. */
  let markers = 0;
  for (const sel of MARKER_SELECTORS) {
    const n = $(sel).length;
    if (n > markers) markers = n;
  }
  const unique = offers.length;
  const verifyOk = markers > 0 ? markers === unique : null;

  return {
    offers,
    summary: { htmlPresent: true, anchorsTotal, offerAnchors: anchorsTotal, markers, unique, verifyOk },
  };
}

/** Clé d'offre d'un href (via les mêmes RULES) — pour matcher
    isolateBlock entre URL canonique et URL de tracking. */
function offerKeyOf(href: string): string | null {
  try {
    const url = new URL(href, "https://localhost");
    const host = url.hostname;
    const path = decodeURIComponent(url.pathname);
    const query = url.searchParams;
    const rule = RULES.find((r) => r.match(host, path, query));
    if (!rule) return null;
    return rule.canonical(host, path, query)?.key ?? null;
  } catch {
    return null;
  }
}

/** Pathname normalisé d'un href (absolu ou relatif), sans query/hash ni slash final. */
function pathOf(href: string): string {
  try {
    return new URL(href, "https://localhost").pathname.replace(/\/+$/, "");
  } catch {
    return href.split(/[?#]/)[0].replace(/\/+$/, "");
  }
}

/** Remonte le DOM pour isoler le bloc HTML qui encapsule CETTE offre : le plus
    petit ancêtre qui ne contient que ce lien d'offre (les ancres logo/titre/
    bouton pointent toutes vers la même offre) + un logo image.
    Matching : href exact → clé d'offre (jk / id / hw) → path normalisé.
    La clé est indispensable : Indeed partage /rc/clk/dl pour tous les jk. */
export function isolateBlock(html: string, href: string): BlockInfo | null {
  if (!html) return null;
  const $ = cheerio.load(html, { scriptingEnabled: false });

  let targetHref = href;
  try {
    targetHref = new URL(href, "https://localhost").href;
  } catch {
    /* href non parsable : on garde tel quel */
  }
  const targetPath = pathOf(href);
  const targetKey = offerKeyOf(href);

  let node: { attribs?: Record<string, string> } | null = null;
  let nodeByKey: { attribs?: Record<string, string> } | null = null;
  let nodeByPath: { attribs?: Record<string, string> } | null = null;

  $("a[href]").each((_i, el) => {
    const h = (el.attribs.href || "").replace(/&amp;/g, "&").trim();
    if (!h) return;
    let abs = h;
    try {
      abs = new URL(h, "https://localhost").href;
    } catch {
      /* garder h */
    }
    if (!node && (abs === targetHref || h === href)) {
      node = el;
      return;
    }
    if (!nodeByKey && targetKey) {
      const k = offerKeyOf(h);
      if (k && k === targetKey) nodeByKey = el;
    }
    if (!nodeByPath && pathOf(h) === targetPath) nodeByPath = el;
  });
  const found = node || nodeByKey || nodeByPath;
  if (!found) return null;

  let $best: ReturnType<typeof $> | null = null;
  let $cur = $(found).parent();
  while ($cur.length) {
    const tag = ($cur.get(0)?.tagName || "").toLowerCase();
    if (tag === "html" || tag === "body") break;
    const uniqueHrefs = new Set<string>();
    $cur.find("a[href]").each((_i, el) => {
      const h = (el.attribs.href || "").split(/[?#]/)[0].replace(/\/+$/, "");
      if (h) uniqueHrefs.add(h);
    });
    const onlyOffer = uniqueHrefs.size === 1;
    const text = $cur.text().replace(/\s+/g, " ").trim();
    const okSize = text.length >= 25 && text.length <= 2000;
    const hasImg = $cur.find("img").length > 0;
    if (onlyOffer && okSize && hasImg) {
      $best = $cur;
      break;
    }
    if (onlyOffer && okSize && !$best) $best = $cur;
    $cur = $cur.parent();
  }
  const $block = $best && $best.length ? $best : $(found).parent();
  const blockText = ($block.text() || "").replace(/\s+/g, " ").trim();

  let title = "";
  $block.find("a").each((_i, el) => {
    if (title) return;
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t && t.length >= 3 && t.length <= 180) title = t;
  });

  const lines = blockText.split(/(?=[A-ZÀ-Ý][a-zà-ÿ]+)/);
  const titleAt = lines.findIndex((l) => title && l.includes(title.slice(0, 40)));
  const neighbors = lines.filter(
    (l) =>
      l.trim().length > 0 &&
      l.length <= 80 &&
      !/^https?:\/\//i.test(l) &&
      l !== title &&
      !/\b(?:Copyright|©|Suivez-nous|Se désabonner|Unsubscribe)\b/i.test(l)
  );
  const company = titleAt >= 0
    ? (lines[titleAt + 1] || neighbors[0] || "").trim().replace(/^[|•\-\s]+/, "")
    : (neighbors[0] || "").trim();
  const location =
    (lines.find((l) => /(?:Paris|Lyon|Toulouse|Nantes|Bordeaux|Lille|Rennes|Marseille|Strasbourg|Grenoble|Montpellier|Nice|Télétravail|Remote|À distance|Full remote)/i.test(l)) || "").trim() ||
    (lines[lines.length - 1] || "").trim();

  return {
    title,
    company,
    location,
    snippet: $block.html()?.slice(0, 2000) ?? "",
  };
}