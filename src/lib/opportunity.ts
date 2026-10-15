/* Jalon 2 — moteur d'opportunités (pur, sans réseau, sans IA).
   Rôles : (1) décider si une page est une VRAIE annonce exploitable ;
   (2) extraire les liens carrières/ATS d'un HTML d'employeur ;
   (3) mesurer la correspondance avec le profil électrique/énergie ;
   (4) dédoublonner sans fusionner des postes distincts.
   Règle non négociable : rien n'est déduit. Durée absente = inconnue. */

/* ── Vocabulaire du profil (extrait du brief mission, zéro invention) ──── */

const CORE_TERMS: [RegExp, string][] = [
  [/(?:g[ée]nie|conception|concevoir|r[ée]alisation)\s+[ée]lectriqu/i, "génie électrique"],
  [/\b[ée]lectrotechnique\b/i, "électrotechnique"],
  [/\bbureau\s+d['’]?(?:e|é)tudes\s+[ée]lectriqu/i, "bureau d'études électriques"],
  [/\b(?:HTA|haute\s+tension|basse\s+tension|\bBT\b|moyenne\s+tension)/i, "HTA/BT"],
  [/\bCFO\b|\bCFA\b|courants?\s+de\s+fonctionnement|courants?\s+d['’]appel/i, "CFO/CFA"],
  [/\bdimensionn\w*/i, "dimensionnement"],
  [/\bphotovolta[ïi]qu\w*/i, "photovoltaïque"],
  [/\b[ée]olien\w*|\b[ée]olique\b/i, "éolien"],
  [/\bstockage\b|\baccumulateurs?\b|\bbatteries?\b/i, "stockage/batteries"],
  [/\befficacit[ée]\s+[ée]nerg[ée]tique|\br[ée]duction\s+des\s+d[ée]penses/i, "efficacité énergétique"],
  [/\baudit\s+[ée]nerg[ée]tique/i, "audit énergétique"],
  [/\bautomatisme\w*|\bautomatisation\b/i, "automatismes"],
  [/\bcontr[ôo]le[- ]commande\b/i, "contrôle-commande"],
  [/\bsupervision\b|\bsuperviseur\s+[ée]lectriqu/i, "supervision"],
  [/\bmachines?\s+[ée]lectriques?\b/i, "machines électriques"],
  [/\br[ée]seaux?\s+[ée]lectriques?\b/i, "réseaux électriques"],
  [/\bprotection\s+[ée]lectriqu\w*|\brelais\b/i, "protection électrique"],
  [/\b[ée]lectronique\s+de\s+puissance\b/i, "électronique de puissance"],
  [/\bconversion\s+d['’][ée]nergie\b/i, "conversion d'énergie"],
  [/\bessais?\s+[ée]lectriqu\w*|\bvalidation\s+[ée]lectriqu/i, "essais/validation électriques"],
  [/\bsimulation\b|\bMATLAB\b|\bSimulink\b/i, "simulation"],
  [/\bmaintenance\s+industrielle\b/i, "maintenance industrielle"],
];

/* ── Correspondance avec le profil ─────────────────────────────────────── */

export function profileMatch(text: string): { score: number; matched: string[] } {
  const matched = [...new Set(CORE_TERMS.filter(([re]) => re.test(text)).map(([, label]) => label))];
  return { score: matched.length, matched };
}

/* ── Extraction : liens carrières, ATS, JobPosting JSON-LD ─────────────── */

const CAREER_HREF = /(carri[èe]re|recrut|emploi|offres?|job|stages?|nous[-_ ]rejoindre|candidature|rejoignez)/i;
const ATS_PATTERNS: [RegExp, string][] = [
  [/boards-api\.greenhouse\.io|greenhouse\.io/i, "greenhouse"],
  [/api\.lever\.co|jobs\.lever\.co|lever\.co/i, "lever"],
  [/ashbyhq\.com|api\.ashbyhq\.com/i, "ashby"],
  [/myworkdayjobs\.com|wd\d+\.myworkday/i, "workday"],
  [/recruitment\.talentsoft\.com|talentsoft/i, "talentsoft"],
  [/flatchr\.(?:io|co)/i, "flatchr"],
  [/welcometothejungle\.com/i, "wttj"],
  [/apec\.fr/i, "apec"],
];

export function careerLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  for (const match of html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const [, href, label] = match;
    if (!CAREER_HREF.test(href) && !CAREER_HREF.test(label)) continue;
    try {
      const url = new URL(href, baseUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      url.hash = "";
      out.add(url.href);
    } catch { /* lien relatif invalide */ }
    if (out.size >= 12) break;
  }
  return [...out];
}

export function detectAts(text: string): string[] {
  return [...new Set(ATS_PATTERNS.filter(([re]) => re.test(text)).map(([, kind]) => kind))];
}

export type ExtractedJob = { title: string; url: string; location?: string; datePosted?: string; source: "json-ld" | "lien" };

/** Annonces structurées JobPosting (schéma.org) + liens d'offres évidents. */
export function extractJobPostings(html: string, baseUrl: string): ExtractedJob[] {
  const jobs: ExtractedJob[] = [];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown;
    try { parsed = JSON.parse(match[1]); } catch { continue; }
    const stack: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj["@graph"])) stack.push(...obj["@graph"]);
      if (obj["@type"] === "JobPosting" && typeof obj.title === "string") {
        const rawUrl = typeof obj.url === "string" ? obj.url : baseUrl;
        let url = baseUrl;
        try { url = new URL(rawUrl, baseUrl).href; } catch { /* garde baseUrl */ }
        jobs.push({
          title: obj.title.slice(0, 200), url,
          ...(typeof obj.datePosted === "string" ? { datePosted: obj.datePosted } : {}),
          ...(obj.jobLocation && typeof obj.jobLocation === "object" && typeof (obj.jobLocation as { addressLocality?: string }).addressLocality === "string" ? { location: (obj.jobLocation as { addressLocality: string }).addressLocality } : {}),
          source: "json-ld",
        });
      }
    }
  }
  for (const match of html.matchAll(/href=["'](https?:\/\/[^"']*(?:offre|jobs?|stages?|recrut)[^"']*)["']/gi)) {
    try { jobs.push({ title: "", url: new URL(match[1], baseUrl).href, source: "lien" }); } catch { /* URL invalide */ }
  }
  const seen = new Set<string>();
  return jobs.filter(job => { const key = job.url.replace(/\/$/, ""); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 20);
}

/* ── Vérification d'une annonce réelle ─────────────────────────────────── */

export type OfferVerdict = "retenue" | "à examiner" | "rejetée";

export type OfferChecks = {
  isJobPosting: boolean;
  isInternship: boolean;
  contract: string | null;
  durationMonths: number | null;
  durationConfirmed: boolean;
  domain: { score: number; matched: string[] };
  applicationAccessible: boolean;
  companyIdentified: boolean;
  evidence: string[];
  missing: string[];
  verdict: OfferVerdict;
  rejectionReasons: string[];
};

/** Vérifie une page/annonce. `text` = texte EXTRAIT de la source, jamais complété. */
export function verifyOfferPosting(text: string, opts: { company?: string; fromStructuredSource?: boolean } = {}): OfferChecks {
  const evidence: string[] = [];
  const missing: string[] = [];
  const rejection: string[] = [];
  const contract = (/\bCDI\b/i.test(text) ? "CDI" : /\bCDD\b/i.test(text) ? "CDD" : /\balternance\b|\bapprentissage\b/i.test(text) ? "alternance" : /\bstage\b/i.test(text) ? "stage" : null);
  const isInternship = contract === "stage" || /stagiaire|\bstage\b/i.test(text);
  const durWords = /six\s+mois/i.test(text) ? 6 : /huit\s+mois/i.test(text) ? 8 : /neuf\s+mois/i.test(text) ? 9 : null;
  const durNum = [...text.matchAll(/(\d{1,2})\s*mois/gi)].map(m => Number(m[1])).filter(n => n >= 1 && n <= 12);
  const durationMonths = durWords ?? (durNum.length ? Math.max(...durNum) : null);
  const domain = profileMatch(text);
  const isJobPosting = !!opts.fromStructuredSource || (/(?:missions?|profil|comp[ée]tences?|candidates?|postuler|rejoindre)/i.test(text) && text.length >= 300);
  const applicationAccessible = /postuler|candidatur|candidat|envoyez|d[ée]posez|r[ée]ponse/i.test(text);
  const companyIdentified = !!opts.company?.trim();

  if (!isJobPosting) rejection.push("la page n'a pas la structure d'une annonce (missions/profil absents)");
  if (!isInternship) rejection.push("aucun indice de stage ou d'alternance dans le texte source");
  if (domain.score === 0) rejection.push("aucun domaine technique du profil (électrique/énergie) trouvé dans le texte");
  if (!companyIdentified) rejection.push("entreprise non identifiée dans la source");
  if (!applicationAccessible) missing.push("canal de candidature non identifiable dans la page");

  if (durationMonths === null) missing.push("durée absente de la source — jamais déduite, à confirmer auprès de l'employeur");
  else evidence.push(`durée présente dans la source : ${durationMonths} mois`);
  if (domain.score > 0) evidence.push(`domaines du profil présents : ${domain.matched.join(", ")}`);
  if (contract) evidence.push(`contraste de contrat détecté : ${contract}`);

  const verdict: OfferVerdict = rejection.length > 0 ? "rejetée"
    : durationMonths !== null && domain.score >= 2 ? "retenue"
    : "à examiner";
  return { isJobPosting, isInternship, contract, durationMonths, durationConfirmed: durationMonths !== null, domain, applicationAccessible, companyIdentified, evidence, missing, verdict, rejectionReasons: rejection };
}

/* ── Dédoublonnage : un SIREN + intitulé + ville = une annonce ─────────── */

export const normalizeTitle = (title: string) => title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Clé de POSTE (même poste publié plusieurs fois) — sans ville. */
export const jobKey = (company: string, title: string) => `${normalizeTitle(company)}|${normalizeTitle(title)}`;
/** Clé d'OCCURRENCE (ville ou référence distincte = annonce distincte). */
export const offerKey = (company: string, title: string, location?: string) => `${jobKey(company, title)}|${normalizeTitle(location ?? "")}`;
