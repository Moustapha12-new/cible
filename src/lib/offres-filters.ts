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

/** Texte recherché pour les filtres de domaine (titre, description, compétences).
    Mémoïsé par objet d'offre : le catalogue est analysé plusieurs fois (compteurs
    de facettes, liste filtrée, recherche) sans reconstruire la même chaîne. */
const haystackCache = new WeakMap<DetectedOffer, string>();
const domainHaystack = (offer: DetectedOffer) => {
  const cached = haystackCache.get(offer);
  if (cached !== undefined) return cached;
  const text = norm(
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
  haystackCache.set(offer, text);
  return text;
};

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

/* ── File d'attente du mode Rafale ───────────────────────────────
   Les identifiants des offres du filtre actif, dans l'ordre affiché, sont
   partagés entre Mes offres et Mon CV pour que l'offre suivante reste celle
   du même filtre — jamais une offre hors filtre. */
export const RAFALE_QUEUE_KEY = "cible:rafale-queue:v1";
const RAFALE_OFFERS_KEY = "cible:rafale-offers:v1";

/** Copie de session des offres de la file : permet de retrouver la suivante
    même si elle ne faisait pas encore partie du dossier CV local. */
export function writeRafaleOffers<T extends { id: string; text?: string; description?: string }>(offers: T[]): void {
  try {
    sessionStorage.setItem(RAFALE_OFFERS_KEY, JSON.stringify(offers.map(offer => ({
      ...offer,
      text: offer.text?.slice(0, 3000),
      description: offer.description?.slice(0, 3000),
    }))));
  } catch { /* Le parcours garde le dossier déjà enregistré. */ }
}

export function readRafaleOffers<T extends { id: string }>(): T[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(RAFALE_OFFERS_KEY) || "[]");
    return Array.isArray(value) ? value.filter((offer): offer is T => !!offer && typeof offer.id === "string") : [];
  } catch { return []; }
}

export function readRafaleQueue(): string[] {
  try {
    const raw = sessionStorage.getItem(RAFALE_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(0, 5000) : [];
  } catch {
    return [];
  }
}

export function writeRafaleQueue(ids: string[]): void {
  try {
    sessionStorage.setItem(RAFALE_QUEUE_KEY, JSON.stringify(ids.slice(0, 5000)));
  } catch {
    /* stockage indisponible : le filtre reste actif, seule la file est perdue */
  }
}

/** Offres restantes dans l'ordre du filtre actif, une fois la candidature
    courante enregistrée. La file du filtre passe en premier ; les offres du
    dossier complètent si elle est absente. L'offre courante et les offres
    déjà postulées sont toujours exclues. */
export function nextRafaleCandidates<T extends { id: string; title?: string }>(
  offers: T[],
  appliedIds: Set<string>,
  currentId: string,
  queue: readonly string[] = []
): T[] {
  const byId = new Map(offers.map((offer) => [offer.id, offer]));
  const ordered: T[] = [
    ...queue.map((id) => byId.get(id)).filter((offer): offer is T => Boolean(offer)),
    ...(queue.length ? [] : offers),
  ];
  const seen = new Set<string>();
  return ordered.filter((offer) => {
    if (!offer.id || !offer.title || offer.id === currentId || appliedIds.has(offer.id) || seen.has(offer.id)) return false;
    seen.add(offer.id);
    return true;
  });
}

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
export function matchesOfferFilters(
  offer: DetectedOffer,
  filters: OfferListFilters,
  now = Date.now()
): boolean {
  return (
    (!filters.contracts.length || filters.contracts.some((c) => matchesContractOption(offer, c))) &&
    matchesDomains(offer, filters.domains) &&
    matchesSourceSite(offer, filters.sources) &&
    matchesRegion(offer, filters.region) &&
    matchesPeriod(offer, filters.period, now)
  );
}

export function applyOfferFilters(
  offers: DetectedOffer[],
  filters: OfferListFilters,
  now = Date.now()
): DetectedOffer[] {
  if (!offers.length) return offers;
  return offers.filter((o) => matchesOfferFilters(o, filters, now));
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
