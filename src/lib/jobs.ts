/* Agrégateur d'offres RÉELLES — sources publiques vérifiées.
   Aucune offre inventée : tout ce qui sort d'ici renvoie vers une page existante. */

export type JobOffer = {
  id: string;
  title: string;
  company: string;
  location: string;
  source: "LinkedIn" | "Remotive" | "Jobicy";
  date?: string; // ISO
  url: string;
};

/* ─────────────── Parsing LinkedIn guest HTML ─────────────── */

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");

const stripTags = (s: string) =>
  decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

export function parseLinkedInHtml(html: string): JobOffer[] {
  const chunks = html.split('data-entity-urn="urn:li:jobPosting:').slice(1);
  const out: JobOffer[] = [];
  for (const chunk of chunks) {
    const window = chunk.slice(0, 6000);
    const urn = /(\d+)/.exec(window)?.[1];
    if (!urn) continue;
    const hrefMatch = /href="(https:\/\/[^"]*linkedin\.com\/jobs\/view\/[^"]+)"/.exec(window);
    if (!hrefMatch) continue;
    const title = stripTags(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/.exec(window)?.[1] ?? "");
    const company = stripTags(/base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/.exec(window)?.[1] ?? "");
    const location = stripTags(/job-search-card__location[^>]*>([\s\S]*?)<\/span>/.exec(window)?.[1] ?? "");
    const date = /datetime="(\d{4}-\d{2}-\d{2})"/.exec(window)?.[1];
    if (!title) continue;
    out.push({
      id: `li-${urn}`,
      title,
      company,
      location,
      source: "LinkedIn",
      date,
      url: hrefMatch[1].split("?")[0],
    });
  }
  return out;
}

/* ─────────────── Normalisation des autres sources ─────────────── */

type RemotiveJob = {
  id: number;
  url: string;
  title: string;
  company_name?: string;
  candidate_required_location?: string;
  publication_date?: string;
};
type JobicyJob = {
  id: number;
  url: string;
  jobTitle: string;
  companyName?: string;
  jobGeo?: string;
  pubDate?: string;
};

export function mapRemotive(jobs: RemotiveJob[]): JobOffer[] {
  return jobs.map((j) => ({
    id: `re-${j.id}`,
    title: j.title,
    company: j.company_name ?? "",
    location: j.candidate_required_location || "Télétravail",
    source: "Remotive" as const,
    date: j.publication_date?.slice(0, 10),
    url: j.url,
  }));
}

export function mapJobicy(jobs: JobicyJob[]): JobOffer[] {
  return jobs.map((j) => ({
    id: `jb-${j.id}`,
    title: j.jobTitle,
    company: j.companyName ?? "",
    location: j.jobGeo || "Télétravail",
    source: "Jobicy" as const,
    date: j.pubDate?.slice(0, 10),
    url: j.url,
  }));
}

export function dedupeOffers(all: JobOffer[]): JobOffer[] {
  const seen = new Set<string>();
  const out: JobOffer[] = [];
  for (const o of all) {
    const key = `${o.title.toLowerCase().replace(/\W+/g, " ").trim()}|${o.company.toLowerCase().replace(/\W+/g, " ").trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

/* ─────────────── Annuaire des sites français ───────────────
   tier "search" = URL de recherche pré-remplie (motifs officiels stables)
   tier "site"   = page d'accueil du moteur du site (jamais un lien mort)   */

export type FrenchBoard = {
  id: string;
  label: string;
  desc: string;
  tier: "search" | "site";
  build: (q: string, l: string) => string;
};

export const FRENCH_BOARDS: FrenchBoard[] = [
  {
    id: "indeed",
    label: "Indeed France",
    desc: "Plus grand agrégateur mondial — recherche pré-remplie",
    tier: "search",
    build: (q, l) => `https://fr.indeed.com/jobs?q=${encodeURIComponent(q)}&l=${encodeURIComponent(l)}&fromage=14`,
  },
  {
    id: "wttj",
    label: "Welcome to the Jungle",
    desc: "Startups & scale-ups françaises — recherche pré-remplie",
    tier: "search",
    build: (q, l) => `https://www.welcometothejungle.com/fr/jobs?query=${encodeURIComponent(q)}&aroundQuery=${encodeURIComponent(l)}`,
  },
  {
    id: "apec",
    label: "APEC",
    desc: "Cadres et jeunes diplômés — recherche pré-remplie",
    tier: "search",
    build: (q) => `https://www.apec.fr/candidat/recherche-emploi.html/emplois?motsCles=${encodeURIComponent(q)}`,
  },
  {
    id: "monster",
    label: "Monster.fr",
    desc: "Recherche pré-remplie par métier et ville",
    tier: "search",
    build: (q, l) => `https://www.monster.fr/recherche?q=${encodeURIComponent(q)}&where=${encodeURIComponent(l)}`,
  },
  {
    id: "hellowork",
    label: "HelloWork",
    desc: "Alternances, stages, CDI — recherche pré-remplie",
    tier: "search",
    build: (q, l) => `https://www.hellowork.com/fr-fr/emploi/recherche.html?k=${encodeURIComponent(q)}&l=${encodeURIComponent(l)}`,
  },
  {
    id: "lba",
    label: "La Bonne Alternance",
    desc: "Offres d'alternance + entreprises qui recrutent sans publier",
    tier: "site",
    build: () => "https://labonnealternance.fr/",
  },
  {
    id: "1j1s",
    label: "1jeune1solution.gouv.fr",
    desc: "Service public : jobs, stages, alternance pour les jeunes",
    tier: "site",
    build: () => "https://www.1jeune1solution.gouv.fr/",
  },
  {
    id: "letudiant",
    label: "L'Étudiant — Jobs & stages",
    desc: "Stages, alternances et jobs étudiants",
    tier: "site",
    build: () => "https://www.letudiant.fr/jobs-stages-emploi.html",
  },
  {
    id: "jobteaser",
    label: "JobTeaser",
    desc: "Offres via ton école ou ton université (connexion requise)",
    tier: "site",
    build: () => "https://www.jobteaser.com/fr",
  },
  {
    id: "stagefr",
    label: "Stage.fr",
    desc: "Spécialiste des stages en France",
    tier: "site",
    build: () => "https://www.stage.fr/",
  },
  {
    id: "studyrama",
    label: "Studyrama Emploi",
    desc: "Emploi des jeunes diplômés et étudiants",
    tier: "site",
    build: () => "https://www.studyrama-emploi.com/",
  },
  {
    id: "cadremploi",
    label: "Cadremploi",
    desc: "Premier emploi cadre et junior",
    tier: "site",
    build: () => "https://www.cadremploi.fr/",
  },
  {
    id: "keljob",
    label: "Keljob",
    desc: "Comparateur d'offres d'emploi",
    tier: "site",
    build: () => "https://www.keljob.com/",
  },
  {
    id: "eures",
    label: "EURES (Europe)",
    desc: "Mobilité européenne officielle — Commission européenne",
    tier: "site",
    build: () => "https://ec.europa.eu/eures/eures-searchengine/page/home?lang=fr",
  },
];
