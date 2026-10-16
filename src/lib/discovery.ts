/* ═══════════════ Moteur A — Company-first discovery ═══════════════
   Source réelle : API publique Recherche d'entreprises (administration
   française) — https://recherche-entreprises.api.gouv.fr/docs/
   Vérifiée en conditions réelles (appel du 2026-10-15) : filtres
   `activite_principale` (NAF au format pointé, ex. « 71.12B »),
   `tranche_effectif_salarie` et `departement` répondent et filtrent.

   PRINCIPE : on découvre des ENTREPRISES pertinentes avant leurs offres.
   · Le code NAF est un signal administratif, JAMAIS une preuve de
     spécialisation (une ingénierie généraliste peut avoir une équipe
     énergie très pertinente ; une boîte classée « électricité » peut
     n'avoir aucun poste ingénieur).
   · Le scoring produit des RAISONS et des données manquantes, jamais une
     probabilité artificielle.
   · Aucune annonce n'est créée pour une entreprise qui n'en a pas publié. */

/* ── Familles NAF ciblées (nomenclature officielle, format pointé) ─────── */

export type NafFamily = {
  code: string;
  label: string;
  /** Coeur = génie électrique/études ; énergie ; connexe = automatisation… */
  tier: "cœur" | "énergie" | "connexe";
};

/* Familles VÉRIFIÉES le 2026-10-15 contre la nomenclature réellement
   utilisée par l'API (NAF rév. 2 révisée 2023, 732 codes valides listés par
   l'API elle-même en erreur 400) et libellés officiels du fichier
   codes-NAF.json du dépôt annuaire-entreprises-data-gouv-fr/search-api.
   Codes REJETÉS car inexistants côté API : 33.20Z, 28.99Z, 26.51Z,
   71.13B, 71.14B, 43.21C, 43.22C. 71.12A retiré : libellé réel
   « Activité des géomètres », hors profil. */
export const NAF_FAMILIES: NafFamily[] = [
  { code: "71.12B", label: "Ingénierie, études techniques", tier: "connexe" },
  { code: "43.21A", label: "Travaux d'installation électrique dans tous locaux", tier: "cœur" },
  { code: "43.21B", label: "Travaux d'installation électrique sur la voie publique", tier: "cœur" },
  { code: "27.11Z", label: "Fabrication de moteurs, génératrices et transformateurs électriques", tier: "cœur" },
  { code: "27.12Z", label: "Fabrication de matériel de distribution et de commande électrique", tier: "cœur" },
  { code: "27.33Z", label: "Fabrication de matériel d'installation électrique", tier: "cœur" },
  { code: "35.11Z", label: "Production d'électricité", tier: "énergie" },
  { code: "35.12Z", label: "Transport d'électricité", tier: "énergie" },
  { code: "35.13Z", label: "Distribution d'électricité", tier: "énergie" },
  { code: "27.20Z", label: "Fabrication de piles et d'accumulateurs électriques", tier: "énergie" },
  { code: "26.51B", label: "Fabrication d'instrumentation scientifique et technique", tier: "connexe" },
  { code: "71.11Z", label: "Activités d'architecture", tier: "connexe" },
];

/* ── Tranches d'effectif : PME / ETI / petites structures ───────────────── */

export type SizeCategory = "micro" | "petite" | "PME" | "ETI" | "grande" | "inconnue";

/* Libellés OFFICIELS (fichier tranches-effectifs.json du dépôt
   annuaire-entreprises-data-gouv-fr/search-api, récupéré le 2026-10-15).
   La nomenclature actuelle place exactement le seuil PME/UE (250) à la
   frontière 31/32 : 31 = 200–249 (PME), 32 = 250–499 (donc ETI, plus PME). */
export const TRANCHE_LABELS: Record<string, { label: string; size: SizeCategory }> = {
  "00": { label: "0 salarié", size: "micro" },
  "01": { label: "1–2 salariés", size: "micro" },
  "02": { label: "3–5 salariés", size: "micro" },
  "03": { label: "6–9 salariés", size: "petite" },
  "11": { label: "10–19 salariés", size: "petite" },
  "12": { label: "20–49 salariés", size: "PME" },
  "21": { label: "50–99 salariés", size: "PME" },
  "22": { label: "100–199 salariés", size: "PME" },
  "31": { label: "200–249 salariés", size: "PME" },
  "32": { label: "250–499 salariés", size: "ETI" },
  "41": { label: "500–999 salariés", size: "ETI" },
  "42": { label: "1 000–1 999 salariés", size: "ETI" },
  "51": { label: "2 000–4 999 salariés", size: "ETI" },
  "52": { label: "5 000–9 999 salariés", size: "grande" },
  "53": { label: "10 000 salariés et plus", size: "grande" },
};

/** Cible du pilote : structures où un stage d'ingénieur est plausible. */
/* Liste VALIDE vérifiée en réel sur l'API (message d'erreur du 2026-10-15) :
   ['NN','00','01','02','03','11','12','21','22','31','32','41','42','51','52','53'].
   Il n'existe NI code « 33 » NI « 43 ». 31 = 200–249 salariés, 32 = 250–499
   (source : tranches-effectifs.json officiel). */
export const VALID_TRANCHES = new Set(["NN", "00", "01", "02", "03", "11", "12", "21", "22", "31", "32", "41", "42", "51", "52", "53"]);

export const PILOT_TRANCHES = ["03", "11", "21", "22", "31", "32", "41", "42"].filter((code) => VALID_TRANCHES.has(code));

/* ── Rotation géographique ──────────────────────────────────────────────── */

export type DiscoveryZone = { code: string; label: string; region: string };

export const DEPARTMENT_ROTATION: DiscoveryZone[] = [
  { code: "92", label: "Hauts-de-Seine", region: "Île-de-France" },
  { code: "91", label: "Essonne", region: "Île-de-France" },
  { code: "94", label: "Val-de-Marne", region: "Île-de-France" },
  { code: "78", label: "Yvelines", region: "Île-de-France" },
  { code: "93", label: "Seine-Saint-Denis", region: "Île-de-France" },
  { code: "95", label: "Val-d'Oise", region: "Île-de-France" },
  { code: "77", label: "Seine-et-Marne", region: "Île-de-France" },
  { code: "75", label: "Paris", region: "Île-de-France" },
  { code: "69", label: "Rhône", region: "Auvergne-Rhône-Alpes" },
  { code: "38", label: "Isère", region: "Auvergne-Rhône-Alpes" },
  { code: "13", label: "Bouches-du-Rhône", region: "Provence-Alpes-Côte d'Azur" },
  { code: "44", label: "Loire-Atlantique", region: "Pays de la Loire" },
  { code: "33", label: "Gironde", region: "Nouvelle-Aquitaine" },
  { code: "59", label: "Nord", region: "Hauts-de-France" },
  { code: "67", label: "Bas-Rhin", region: "Grand Est" },
  { code: "31", label: "Haute-Garonne", region: "Occitanie" },
  { code: "35", label: "Ille-et-Vilaine", region: "Bretagne" },
  { code: "25", label: "Doubs", region: "Bourgogne-Franche-Comté" },
];

/* ── Modèle normalisé ───────────────────────────────────────────────────── */

export type DiscoveredCompany = {
  siren: string;
  name: string;
  commune: string;
  codePostal: string;
  departement: string;
  naf: string;
  nafLabel: string;
  nafTier: NafFamily["tier"] | "hors cible";
  tranche: string;
  trancheLabel: string;
  size: SizeCategory;
  dateCreation?: string;
  /** Site officiel UNIQUEMENT si confirmé (page contenant le nom exact). */
  website?: string;
  /* États : confirmé = preuve de propriété (SIREN ou nom complet sur la page) ;
     probable = page répond + nom partiel ; unconfirmed = répond sans nom ;
     inaccessible = aucun hébergement ; none = pas encore testé. */
  websiteStatus: "confirmed" | "probable" | "unconfirmed" | "inaccessible" | "none";
  careerPage?: string;
  stageConfirmed?: boolean;
  /** Raisons de pertinence — chaque point est vérifiable. */
  reasons: string[];
  /** Données manquantes — jamais comblées par invention. */
  missing: string[];
  score: number;
  lastCheckedAt: string;
  foundAt: string;
  foundBy: string;
};

export type DiscoveryRun = {
  id: string;
  at: string;
  department: string;
  nafCodes: string[];
  tranches: string[];
  page: number;
  totalResults: number;
  newCompanies: number;
  /** Erreurs réseau/API rencontrées — tracées, jamais ignorées. */
  error?: string;
};

/* ── Requêtage (injection fetch pour les tests) ─────────────────────────── */

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export const RE_API = "https://recherche-entreprises.api.gouv.fr/search";

export type CompanyQuery = { department: string; nafCodes: string[]; tranches: string[]; page?: number; perPage?: number };

/* L'API trie ses résultats par effectif DÉCROISSANT (constaté en réel : avec
   plusieurs tranches sur une même requête, la première page ne contient que
   des tranches hautes). Pour couvrir les PME/PET, on scinde : une requête par
   tranche — chaque page est alors homogène et la couverture est réelle. */
export function splitTrancheQueries(department: string, nafCodes: string[], tranches: string[]): CompanyQuery[] {
  return tranches.map((tranche) => ({ department, nafCodes, tranches: [tranche], perPage: 10, page: 1 }));
}

/** Construit l'URL normalisée (limitée à 10 appels/s côté API, pas de clé). */
export function buildCompanyQueryUrl(query: CompanyQuery): string {
  const params = new URLSearchParams();
  for (const code of query.nafCodes) params.append("activite_principale", code);
  for (const tranche of query.tranches) params.append("tranche_effectif_salarie", tranche);
  params.set("departement", query.department);
  params.set("per_page", String(Math.max(1, Math.min(25, query.perPage ?? 10))));
  params.set("page", String(Math.max(1, query.page ?? 1)));
  return `${RE_API}?${params.toString()}`;
}

type RawSiege = { adresse?: string | null; code_postal?: string | null; libelle_commune?: string | null; departement?: string | null; date_creation?: string | null; etat_administratif?: string | null };
type RawResult = {
  siren?: string;
  nom_complet?: string | null;
  nom_raison_sociale?: string | null;
  activite_principale?: string | null;
  tranche_effectif_salarie?: string | null;
  siege?: RawSiege;
};

const nafLabelOf = (code: string) => NAF_FAMILIES.find(f => f.code === code)?.label ?? "";
const nafTierOf = (code: string): DiscoveredCompany["nafTier"] => NAF_FAMILIES.find(f => f.code === code)?.tier ?? "hors cible";

/** Normalise la réponse API en entreprises découvertes (dé-doublon par SIREN). */
export function parseCompanyResults(payload: unknown, context: { department: string; runId: string; now?: string }): { companies: DiscoveredCompany[]; total: number; invalid?: string } {
  const body = payload as { results?: RawResult[]; total_results?: number; erreur?: string } | null | undefined;
  if (!body || typeof body !== "object") return { companies: [], total: 0 };
  if (body.erreur) return { companies: [], total: 0, invalid: String(body.erreur).slice(0, 200) };
  const now = context.now ?? new Date().toISOString();
  const seen = new Set<string>();
  const companies: DiscoveredCompany[] = [];
  for (const row of body.results ?? []) {
    if (!row?.siren || seen.has(row.siren)) continue;
    seen.add(row.siren);
    const tranche = row.tranche_effectif_salarie ?? "";
    const meta = TRANCHE_LABELS[tranche];
    companies.push({
      siren: row.siren,
      name: (row.nom_complet || row.nom_raison_sociale || "").trim(),
      commune: (row.siege?.libelle_commune || "").trim(),
      codePostal: (row.siege?.code_postal || "").trim(),
      departement: (row.siege?.departement || context.department).trim(),
      naf: (row.activite_principale || "").trim(),
      nafLabel: nafLabelOf((row.activite_principale || "").trim()),
      nafTier: nafTierOf((row.activite_principale || "").trim()),
      tranche,
      trancheLabel: meta?.label ?? (tranche ? `tranche ${tranche}` : "effectif inconnu"),
      size: meta?.size ?? "inconnue",
      dateCreation: row.siege?.date_creation || undefined,
      websiteStatus: "none",
      reasons: [],
      missing: [],
      score: 0,
      lastCheckedAt: now,
      foundAt: now,
      foundBy: context.runId,
    });
  }
  return { companies, total: Number(body.total_results ?? companies.length) };
}

/** Appel réel à l'API (limité à 10 req/s côté source ; on n'en fait qu'une). */
export async function fetchCompaniesPage(fetchImpl: FetchLike, query: CompanyQuery) {
  const url = buildCompanyQueryUrl(query);
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return { ok: false as const, status: res.status, companies: [] as DiscoveredCompany[], total: 0, error: `HTTP ${res.status}` };
    const parsed = parseCompanyResults(await res.json(), { department: query.department, runId: `run:${query.department}:${query.page ?? 1}` });
    return { ok: parsed.invalid ? false as const : true as const, status: 200, ...parsed, ...(parsed.invalid ? { error: parsed.invalid } : {}) };
  } catch (error) {
    return { ok: false as const, status: 0, companies: [] as DiscoveredCompany[], total: 0, error: error instanceof Error ? error.message : "réseau indisponible" };
  }
}

/* ── Scoring de pertinence (explicable, sans probabilité inventée) ──────── */

export type DiscoveryPrefs = {
  /** Région préférée configurable (défaut Île-de-France). */
  preferredRegion?: string;
  /** Date de disponibilité configurable — jamais codée en dur. */
  availableFrom?: string;
};

/* Signaux HORS domaine : une bureau d'études structure/bâtiment n'est pas
   ciblé par le profil (génie électrique, énergie). Pénalité documentée. */
const OUT_OF_DOMAIN_SIGNALS: [RegExp, string][] = [
  [/patholog|g[ée]otechnique|voirie|assainissement|cartographie|topographie/i, "hors domaine (génie civil/topographie, pas énergie)"],
];

const NAME_SIGNALS: [RegExp, string][] = [
  [/[\u00e9e]lectr/i, "nom évoque l'électricité"],
  [/[\u00e9e]nerg/i, "nom évoque l'énergie"],
  [/bureau d'?[\u00e9e]tudes|etudes techniques|ing[ée]nierie/i, "nom évoque des études/ingénierie"],
  [/photovolta|[\u00e9e]olien|stockage|batterie/i, "nom évoque les renouvelables/le stockage"],
  [/automatisme|automation|contr[\u00f4o]le|supervision/i, "nom évoque l'automatisation"],
  [/cfocfa|cfo|cfa|haute tension|basse tension|\bbt\b|\bhta\b/i, "nom évoque les réseaux BT/HTA"],
];

/** Score additif documenté : chaque point correspond à une raison écrite. */
export function scoreCompanyForProfile(company: Pick<DiscoveredCompany, "nafTier" | "naf" | "size" | "name" | "commune" | "website" | "websiteStatus">, region: string | undefined, zoneRegion?: string): { score: number; reasons: string[]; missing: string[] } {
  const reasons: string[] = [];
  const missing: string[] = [];
  let score = 0;
  if (company.nafTier === "cœur") { score += 30; reasons.push(`activité administrative au cœur du profil (NAF ${company.naf})`); }
  else if (company.nafTier === "énergie") { score += 24; reasons.push(`activité orientée énergie (NAF ${company.naf})`); }
  else if (company.nafTier === "connexe") { score += 14; reasons.push(`activité connexe exploitable (NAF ${company.naf})`); }
  else { missing.push("code NAI hors familles ciblées — spécialisation à vérifier sur le site"); }
  for (const [pattern, reason] of NAME_SIGNALS) {
    if (pattern.test(company.name)) { score += 8; reasons.push(reason); }
  }
  for (const [pattern, reason] of OUT_OF_DOMAIN_SIGNALS) {
    if (pattern.test(company.name ?? "")) { score -= 10; reasons.push(reason); }
  }
  if (company.size === "petite" || company.size === "PME") { score += 10; reasons.push(`taille ${company.size} — structure pouvant accueillir un stagiaire`); }
  else if (company.size === "ETI") { score += 6; reasons.push("ETI — structures d'accueil de stages établies"); }
  else if (company.size === "inconnue") { missing.push("tranche d'effectif inconnue"); }
  if (region && zoneRegion) {
    if (zoneRegion === region) { score += 10; reasons.push(`zone préférée (${region})`); }
    else { missing.push(`hors zone préférée (${region}) — ${zoneRegion}`); }
  }
  if (company.websiteStatus === "confirmed") { score += 6; reasons.push("site officiel confirmé (preuve : SIREN ou nom complet)"); }
  else if (company.websiteStatus === "probable") { score += 3; reasons.push("site probable (nom partiel) — preuve de propriété manquante"); }
  else missing.push(company.websiteStatus === "inaccessible" ? "site officiel injoignable" : "site officiel non confirmé");
  return { score, reasons, missing };
}

/* ── Confirmation du site officiel (aucune déduction sans preuve) ───────── */

export type DomainAssessment = { status: "confirmed" | "probable" | "unconfirmed" | "inaccessible"; reasons: string[] };

/** Évaluation d'une page réellement fetchée : 4 états explicites, zéro
    déduction. confirmé = SIREN retrouvé sur la page, ou nom complet présent.
    probable = au moins un token significatif du nom présent. */
export function assessDomain(pageText: string | undefined, reachable: boolean, companyName: string, siren?: string): DomainAssessment {
  if (!reachable) return { status: "inaccessible", reasons: ["aucun hébergement joignable (bare + www, timeout/erreur réseau)"] };
  if (!pageText || pageText.length < 15 || !companyName.trim()) return { status: "unconfirmed", reasons: ["page vide ou illisible — propriété non établie"] };
  const norm = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const page = norm(pageText);
  if (siren && /^\d{9}$/.test(siren) && pageText.includes(siren)) {
    return { status: "confirmed", reasons: [`SIREN ${siren} retrouvé sur la page (preuve de propriété)`] };
  }
  const tokens = norm(companyName).split(" ").filter(token => token.length >= 3 && !/^(sas|sasu|sarl|sa|societe|groupe|ingenierie|etudes)$/.test(token));
  if (!tokens.length) return { status: "unconfirmed", reasons: ["nom exploitable vide"] };
  const hits = tokens.filter(token => new RegExp(`\\b${token}\\b`).test(page));
  if (hits.length === tokens.length && hits.length >= 2) return { status: "confirmed", reasons: [`nom distinctif complet présent sur la page (${hits.length}/${tokens.length} tokens)`] };
  if (hits.length >= 1) return { status: "probable", reasons: [`nom partiel seulement (${hits.length}/${tokens.length} tokens) — propriété non établie`] };
  return { status: "unconfirmed", reasons: ["la page ne contient aucun élément d'identité de l'entreprise"] };
}

/** Compat : confirmé = assessDomain.status === "confirmed". */
export function confirmOfficialWebsite(pageText: string | undefined, companyName: string): boolean {
  return assessDomain(pageText, true, companyName).status === "confirmed";
}

const LEGAL_FORMS = /^(?:sas|sasu|sa|sarls?|sarl|scop|scopi|eurl|sci|sasul|sciul|saup|groupe|groupement)$/i;

/** Hypothèse de domaine à PROUVER (jamais présentée comme officielle).
    On retire les parenthèses (sigles) et les formes juridiques avant de
    concaténer ; le domaine nu est préféré à `www.` (vérifié en réel :
    www.erese.fr ne résout pas alors que erese.fr existe). */
export function websiteHypothesis(companyName: string): string | null {
  const core = companyName.replace(/\([^)]*\)/g, " ");
  const words = core.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 2 && !LEGAL_FORMS.test(word));
  if (!words.length) return null;
  const base = words.join("").slice(0, 30);
  return base.length >= 4 ? `https://${base}.fr` : null;
}

/* ── Historique de rotation (pas de refaire les mêmes recherches) ───────── */

export function nextQueryPlan(state: { runs: DiscoveryRun[] }, prefs?: { zoneCodes?: string[]; nafCodes?: string[]; tranches?: string[] }): { department: string; departmentLabel: string; region: string; nafCodes: string[]; tranches: string[] } {
  const zones = (prefs?.zoneCodes?.length ? DEPARTMENT_ROTATION.filter(z => prefs.zoneCodes!.includes(z.code)) : DEPARTMENT_ROTATION);
  const nafCodes = prefs?.nafCodes?.length ? prefs.nafCodes : NAF_FAMILIES.map(f => f.code);
  const tranches = prefs?.tranches?.length ? prefs.tranches : PILOT_TRANCHES;
  const counts = new Map<string, number>();
  for (const run of state.runs) counts.set(run.department, (counts.get(run.department) || 0) + 1);
  const next = [...zones].sort((a, b) => (counts.get(a.code) || 0) - (counts.get(b.code) || 0))[0] ?? zones[0];
  return { department: next.code, departmentLabel: next.label, region: next.region, nafCodes, tranches };
}

/** Fusionne dans le registre existant : un SIREN = une entreprise. */
export function mergeCompanies(existing: DiscoveredCompany[], incoming: DiscoveredCompany[]): { merged: DiscoveredCompany[]; added: number } {
  const bySiren = new Map(existing.map(company => [company.siren, company]));
  let added = 0;
  for (const company of incoming) {
    /* Sans SIREN vérifiable, l'entrée ne peut pas être contrôlée ni
       dédupliquée : elle n'entre pas au registre (zéro donnée fantôme). */
    if (!/^\d{9}$/.test(company.siren) || !company.name || bySiren.has(company.siren)) continue;
    bySiren.set(company.siren, company);
    added++;
  }
  return { merged: [...bySiren.values()], added };
}
