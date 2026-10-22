import type { DetectedOffer } from "./data";

/* Filtres réels de la page « Mes offres » — fonctions pures, aucune donnée
   inventée : chaque filtre s'appuie uniquement sur les champs réels de
   l'offre (contrat, durée, titre, compétences, localisation, date). */

export type OfferListFilters = {
  contracts: string[];
  domains: string[];
  sources: string[];
  region: string;
  period: string;
};

export const EMPTY_FILTERS: OfferListFilters = {
  contracts: [],
  domains: [],
  sources: [],
  region: "all",
  period: "all",
};

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Texte recherché pour les filtres de domaine (titre, description, compétences). */
const domainHaystack = (offer: DetectedOffer) =>
  norm(
    [
      offer.title,
      offer.description,
      offer.text,
      offer.contract,
      offer.duration,
      ...(offer.skills || []),
      ...(offer.keywords || []),
      ...(offer.missions || []),
    ].join(" ")
  );

export const DOMAIN_KEYWORDS: Record<string, string[]> = {
  "genie-electrique": ["electri", "automat", "courant fort", "courant faible", "unifilaire", "dimensionnement", "electrotech", "habilitation"],
  "energie-enr": ["energie", "enr", "photovolta", "eolien", "solaire", "renouvelable", "geothermie", "biomasse", "smart grid", "audit energetique", "performance energetique"],
  automatisation: ["automat", "automate", "plc", "scada", "supervision", "robotique", "instrum", "programmable"],
  "bureau-etudes": ["bureau d'etudes", "etude", "conception", "bilan de puissance", "cahier des charges", "dimensionnement"],
  "systemes-embarques": ["embarqu", "embed", "microcontroleur", "fpga", "rtos", "c++", "asynchrone"],
  "reseaux-distribution": ["reseau", "distribution", "poste de distribution", "interconnexion", "transport", "mta", "hta", "bt "],
};

export const REGION_KEYWORDS: Record<string, string[]> = {
  idf: ["paris", "ile-de-france", "nanterre", "suresnes", "la defense", "montreuil", "boulogne", "colombes", "vitry", "creteil", "evry", "massy", "courbevoie", "fontenay"],
  ara: ["lyon", "grenoble", "annecy", "villeurbanne", "saint-priest", "clermont", "auvergne", "rhone", "chambery", "valence"],
  paca: ["marseille", "nice", "toulon", "aix-en-provence", "sophia antipolis", "provence", "cannes", "var ", "bouches-du-rhone"],
  ge: ["strasbourg", "nancy", "metz", "mulhouse", "reims", "grand est", "alsace", "lorraine"],
};

/** Stage de 6 mois : détecté sur le contrat, la durée ou l'intitulé. */
export function isSixMonthStage(offer: DetectedOffer): boolean {
  const h = norm([offer.contract, offer.duration, offer.title].join(" "));
  return /\b6\s*mois\b/.test(h);
}

export function isAlternance(offer: DetectedOffer): boolean {
  const h = norm([offer.contract, offer.title].join(" "));
  return /alternance|apprentissage|alternant/.test(h);
}

export function matchesContractOption(offer: DetectedOffer, option: string): boolean {
  if (option === "stage-6") return isSixMonthStage(offer);
  if (option === "alternance") return isAlternance(offer);
  if (option === "autre") return !isSixMonthStage(offer) && !isAlternance(offer);
  return true;
}

export function matchesDomains(offer: DetectedOffer, domainIds: string[]): boolean {
  if (!domainIds.length) return true;
  const h = domainHaystack(offer);
  return domainIds.some((id) => (DOMAIN_KEYWORDS[id] || []).some((k) => h.includes(k)));
}

/* ── Source de l'offre (site d'origine du lien) ──────────────────────
   Classification déterministe sur le hostname réel de l'URL de l'offre,
   que l'offre vienne de Gmail ou d'un ajout manuel. */

export const SOURCE_SITES: Record<string, { label: string; hosts: string[] }> = {
  linkedin: { label: "LinkedIn", hosts: ["linkedin.com", "lnkd.in"] },
  indeed: { label: "Indeed", hosts: ["indeed.com", "indeed.co.uk"] },
  hellowork: { label: "HelloWork", hosts: ["hellowork.com", "hellowork.fr"] },
  jobteaser: { label: "JobTeaser", hosts: ["jobteaser.com"] },
  wttj: { label: "Welcome to the Jungle", hosts: ["welcometothejungle.com", "wttj.fr"] },
  autre: { label: "Autre site", hosts: [] },
  "sans-lien": { label: "Sans lien", hosts: [] },
};

export const SOURCE_SITE_IDS = Object.keys(SOURCE_SITES);

/** Identifiant du site d'origine d'une offre, déduit de son hostname.
    - hostname connu → l'identifiant du site ;
    - URL présente mais hôte inconnu → « autre » ;
    - aucune URL → « sans-lien ». */
export function offerSourceSite(offer: DetectedOffer): string {
  const raw = (offer.url || "").trim();
  if (!raw) return "sans-lien";
  let host = "";
  try {
    host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    host = raw.toLowerCase().replace(/^www\./, "").split("/")[0];
  }
  if (!host) return "sans-lien";
  for (const [id, site] of Object.entries(SOURCE_SITES)) {
    if (site.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return id;
  }
  return "autre";
}

export function matchesSourceSite(offer: DetectedOffer, sourceIds: string[]): boolean {
  if (!sourceIds.length) return true;
  return sourceIds.includes(offerSourceSite(offer));
}

export function matchesRegion(offer: DetectedOffer, region: string): boolean {
  if (!region || region === "all") return true;
  const keywords = REGION_KEYWORDS[region];
  if (!keywords) return true;
  const loc = norm(offer.location);
  return keywords.some((k) => loc.includes(k));
}

/** Période calculée sur la date réelle de réception ; offre sans date exclue
    des filtres temporels (on ne peut rien affirmer dessus). */
export function matchesPeriod(offer: DetectedOffer, period: string, now = Date.now()): boolean {
  if (!period || period === "all") return true;
  const at = offer.receivedAt ? Date.parse(offer.receivedAt) : NaN;
  if (!Number.isFinite(at)) return false;
  const hours = (now - at) / 3_600_000;
  if (period === "24h") return hours <= 24;
  if (period === "7d") return hours <= 24 * 7;
  if (period === "30d") return hours <= 24 * 30;
  return true;
}

/** AND entre groupes, OR à l'intérieur d'un groupe ; groupe vide = sans effet. */
export function applyOfferFilters(
  offers: DetectedOffer[],
  filters: OfferListFilters,
  now = Date.now()
): DetectedOffer[] {
  return offers.filter(
    (o) =>
      (!filters.contracts.length || filters.contracts.some((c) => matchesContractOption(o, c))) &&
      matchesDomains(o, filters.domains) &&
      matchesSourceSite(o, filters.sources) &&
      matchesRegion(o, filters.region) &&
      matchesPeriod(o, filters.period, now)
  );
}

/** Compteurs réels par facette, calculés sur le catalogue complet (sans filtre actif). */
export function computeFacetCounts(offers: DetectedOffer[]): {
  contracts: Record<string, number>;
  domains: Record<string, number>;
  sources: Record<string, number>;
} {
  const contracts: Record<string, number> = { "stage-6": 0, alternance: 0, autre: 0 };
  const domains: Record<string, number> = {};
  const sources: Record<string, number> = {};
  for (const id of Object.keys(DOMAIN_KEYWORDS)) domains[id] = 0;
  for (const id of SOURCE_SITE_IDS) sources[id] = 0;
  for (const offer of offers) {
    for (const option of Object.keys(contracts)) {
      if (matchesContractOption(offer, option)) contracts[option] += 1;
    }
    for (const id of Object.keys(domains)) {
      if (matchesDomains(offer, [id])) domains[id] += 1;
    }
    const site = offerSourceSite(offer);
    if (site in sources) sources[site] += 1;
  }
  return { contracts, domains, sources };
}
