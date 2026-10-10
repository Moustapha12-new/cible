/* ══════════════════ Scraping de pages d'annonces ══════════════════
   Utilitaires partagés entre l'endpoint POST /api/scrape et l'enrichissement
   automatique des offres importées via le libellé Gmail.
   Tolérant aux anti-robots : quand une page est bloquée (Cloudflare, login
   LinkedIn, bot-wall Indeed…), on renvoie une raison claire plutôt qu'un échec
   brut — l'app garde alors les informations de l'e-mail. */

import { lookup } from "node:dns/promises";
import * as cheerio from "cheerio";

export const SCRAPE_UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
];

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|ul)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;|&rsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Les données JobPosting restent disponibles sur certaines pages rendues
 * en JavaScript. On les lit avant de supprimer les scripts. */
export function extractJobPostingText(html: string): string {
  const $ = cheerio.load(html);
  const jobs: Record<string, unknown>[] = [];
  function visit(value: unknown) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    const types = Array.isArray(row["@type"]) ? row["@type"] : [row["@type"]];
    if (types.includes("JobPosting")) jobs.push(row);
    if (row["@graph"]) visit(row["@graph"]);
  }
  $('script[type="application/ld+json"]').each((_i, el) => {
    try { visit(JSON.parse($(el).text())); } catch { /* Un bloc invalide n'empêche pas de lire les suivants. */ }
  });
  // Une page de résultats avec plusieurs annonces n'est pas une fiche d'offre.
  if (jobs.length !== 1) return "";
  const job = jobs[0];
  const text = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value) : "";
  const org = job.hiringOrganization as Record<string, unknown> | undefined;
  const locations = Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation];
  const place = locations.map(location => {
    if (!location || typeof location !== "object") return "";
    const address = (location as Record<string, unknown>).address as Record<string, unknown> | undefined;
    return address ? [address.addressLocality, address.addressRegion, address.addressCountry].map(text).filter(Boolean).join(", ") : "";
  }).filter(Boolean).join(" · ");
  return [job.title ? `Poste : ${text(job.title)}` : "", org?.name ? `Entreprise : ${text(org.name)}` : "", place ? `Lieu : ${place}` : "", Array.isArray(job.employmentType) ? job.employmentType.map(text).join(", ") : text(job.employmentType), htmlToText(text(job.description)), text(job.qualifications), text(job.skills), text(job.responsibilities), job.validThrough ? `Date limite : ${text(job.validThrough)}` : ""].filter(Boolean).join("\n\n");
}

/* Marqueurs de pages dédiées au bot/au login : même si la requête aboutit,
   le contenu n'est pas une annonce exploitable. */
const BLOCK_MARKERS =
  /just a moment|enable javascript|cf-chl|attention required|access denied|authwall|session_required|sign ?in\?|captcha|unusual traffic|requested url is not authorized|vérification anti-bot|robot verificaton|antirobot/i;

export type PageResult = { ok: true; text: string } | { ok: false; reason: string };

/* ════════════ SSRF : contrôle d'URL avant tout fetch ════════════
   Règles : http(s) uniquement, pas d'hôte local/privé/réservé, taille max,
   redirects bornés, content-type HTML, timeout. */
const MAX_PAGE_BYTES = 500_000;
const MAX_REDIRECTS = 5;

function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    if (v4.includes(".")) return isPrivateIp(v4);
  }
  return false;
}

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "0.0.0.0" || h === "[::]") return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return isPrivateIp(h);
  if (h.includes(":") || h.startsWith("[")) return isPrivateIp(h);
  return false;
}

/** Valide une URL d'annonce : http(s) public uniquement. */
export function isSafeOfferUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  if (isBlockedHost(u.hostname)) return false;
  return true;
}

/** SSRF complet : en plus du contrôle littéral, résout le DNS et vérifie que
    TOUTES les adresses sont publiques (bloque un domaine pointant vers une
    IP privée / metadata cloud). Échec de résolution = URL refusée. */
async function isSafeOfferUrlResolved(raw: string): Promise<boolean> {
  if (!isSafeOfferUrl(raw)) return false;
  const host = new URL(raw).hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[") || host.includes(":")) {
    return true; /* IP littérale déjà contrôlée par isBlockedHost. */
  }
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

/** Extrait le contenu principal d'une page d'annonce : préfère les
    conteneurs sémantiques (main / article / role=main / blocs d'annonce),
    retire chrome et navigation, et retombe sur le body si aucun bloc n'est
    assez riche — jamais le HTML brut. */
function extractMainHtml(html: string): string {
  const $ = cheerio.load(html, { scriptingEnabled: false });
  $("script, style, noscript, svg, template, iframe, form, nav, header, footer, aside").remove();
  const linkedinDescription = $(".description__text .show-more-less-html__markup, .description__text").first();
  if (linkedinDescription.text().trim().length >= 250) {
    return [`Poste : ${$(".top-card-layout__title").first().text().trim()}`, `Entreprise : ${$(".topcard__org-name-link").first().text().trim()}`, `Lieu : ${$(".topcard__flavor--bullet").first().text().trim()}`, $.html(linkedinDescription)].filter(Boolean).join("\n\n");
  }
  const selectors = [
    "article",
    "main",
    "[role=main]",
    '[itemprop="description"]',
    '[class*="job-description" i]',
    '[class*="jobDescription" i]',
    '[class*="posting" i]',
    '[id*="job" i]',
  ];
  let best = "";
  let bestLen = 0;
  for (const sel of selectors) {
    $(sel).each((_i, el) => {
      const frag = $.html(el) || "";
      const len = $(el).text().replace(/\s+/g, " ").trim().length;
      if (len > bestLen) {
        bestLen = len;
        best = frag;
      }
    });
    if (bestLen >= 600) break;
  }
  if (bestLen >= 250) return best;
  return $.html($("body")) || html;
}

async function fetchOnce(url: string, ua: string, timeoutMs = 15_000): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": ua,
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    redirect: "manual",
    cache: "no-store",
  });
}

/** Télécharge la page d'une annonce et renvoie son texte exploitable (≤ 9 000
    caractères). En cas de blocage anti-robot / login / page morte / URL non
    sûre, renvoie { ok:false, reason } pour repli propre côté appelant. */
export async function fetchOfferPage(url: string, options: { timeoutMs?: number } = {}): Promise<PageResult> {
  const deadline = Date.now() + (options.timeoutMs ?? 20_000);
  if (!(await isSafeOfferUrlResolved(url))) {
    return { ok: false, reason: "Lien non autorisé (hôte local ou protocole invalide)" };
  }
  let lastErr = "Page illisible";
  for (const ua of SCRAPE_UAS) {
    if (Date.now() >= deadline) return { ok: false, reason: "Délai de lecture de l’annonce dépassé" };
    try {
      let current = url;
      let res: Response | null = null;
      let redirects = 0;
      while (redirects <= MAX_REDIRECTS) {
        if (Date.now() >= deadline) return { ok: false, reason: "Délai de lecture de l’annonce dépassé" };
        const r = await fetchOnce(current, ua, Math.min(15_000, deadline - Date.now()));
        if (r.status >= 300 && r.status < 400) {
          const loc = r.headers.get("location");
          r.body?.cancel().catch(() => {});
          if (!loc) {
            res = r;
            break;
          }
          current = new URL(loc, current).href;
          if (!(await isSafeOfferUrlResolved(current))) {
            return { ok: false, reason: "Lien non autorisé (redirection vers un hôte privé)" };
          }
          redirects += 1;
          continue;
        }
        res = r;
        break;
      }
      if (redirects > MAX_REDIRECTS) {
        lastErr = "Redirections trop nombreuses";
        continue;
      }
      if (!res || !res.ok) {
        const status = res?.status ?? 0;
        lastErr =
          status === 403
            ? "Accès bloqué (anti-robot ou lien privé)"
            : `Site inaccessible (HTTP ${status})`;
        continue;
      }
      const ctype = (res.headers.get("content-type") || "").toLowerCase();
      if (ctype && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(ctype)) {
        lastErr = "Type de contenu non HTML — fiche basée sur l'e-mail";
        continue;
      }
      const len = Number(res.headers.get("content-length") || 0);
      if (len && len > MAX_PAGE_BYTES) {
        lastErr = "Page trop volumineuse — fiche basée sur l'e-mail";
        continue;
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_PAGE_BYTES) {
        lastErr = "Page trop volumineuse — fiche basée sur l'e-mail";
        continue;
      }
      const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      const structured = extractJobPostingText(html);
      const $ = cheerio.load(html);
      const publicDescription = $(".description__text").first().text().trim();
      if (structured.length < 250 && publicDescription.length < 250 && BLOCK_MARKERS.test(html.slice(0, 20000))) {
        return { ok: false, reason: "Page inaccessible : connexion ou anti-robot exigé" };
      }
      const text = structured.length >= 250 ? structured : htmlToText(extractMainHtml(html));
      if (text.length < 250) {
        lastErr = "Contenu trop court pour être une annonce — fiche basée sur l'e-mail";
        continue;
      }
      return { ok: true, text: text.slice(0, 9000) };
    } catch {
      lastErr = "Délai dépassé ou site injoignable";
    }
  }
  return { ok: false, reason: lastErr };
}
