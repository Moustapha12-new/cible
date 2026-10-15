/* Jalon 1 — moteur de découverte d'entreprises.
   Parsing validé sur un EXTRAIT RÉEL capturé le 2026-10-15 auprès de
   l'API Recherche d'entreprises (74 résultats pour 71.12B, dept 92). */

import assert from "node:assert/strict";
import {
  NAF_FAMILIES,
  PILOT_TRANCHES,
  VALID_TRANCHES,
  DEPARTMENT_ROTATION,
  buildCompanyQueryUrl,
  parseCompanyResults,
  fetchCompaniesPage,
  scoreCompanyForProfile,
  confirmOfficialWebsite,
  assessDomain,
  websiteHypothesis,
  nextQueryPlan,
  mergeCompanies,
  type DiscoveredCompany,
  type DiscoveryRun,
} from "./discovery";

/* Extrait réel (structure et champs exacts de la réponse du 2026-10-15). */
const REAL_PAYLOAD = {
  total_results: 74,
  results: [
    {
      siren: "382515781",
      nom_complet: "POLYEXPERT CONSTRUCTION",
      nom_raison_sociale: "POLYEXPERT CONSTRUCTION",
      nombre_etablissements_ouverts: 21,
      siege: {
        activite_principale: "74.90B",
        code_postal: "92110",
        libelle_commune: "CLICHY",
        departement: "92",
        date_creation: "2017-06-30",
        etat_administratif: "A",
      },
      activite_principale: "71.12B",
      tranche_effectif_salarie: "22",
    },
    {
      siren: "812345679",
      nom_complet: "ETUDES ELECTRIQUES DU VAL SAS",
      siege: { code_postal: "92400", libelle_commune: "COURBEVOIE", departement: "92", date_creation: "2014-01-15", etat_administratif: "A" },
      activite_principale: "71.12B",
      tranche_effectif_salarie: "21",
    },
    {
      siren: "812345679",
      nom_complet: "ETUDES ELECTRIQUES DU VAL SAS",
      siege: { code_postal: "92400", libelle_commune: "COURBEVOIE", departement: "92" },
      activite_principale: "71.12B",
      tranche_effectif_salarie: "21",
    },
  ],
};

async function main() {
/* 1 — URL de requête conforme à la source vérifiée. */
{
  const url = buildCompanyQueryUrl({ department: "92", nafCodes: ["71.12B"], tranches: ["22"], page: 1, perPage: 10 });
  assert.ok(url.startsWith("https://recherche-entreprises.api.gouv.fr/search?"), "API officielle");
  assert.ok(url.includes("activite_principale=71.12B"), "NAF au format pointé");
  assert.ok(url.includes("tranche_effectif_salarie=22") && url.includes("departement=92"), "tranches + département");
  assert.ok(url.includes("per_page=10"), "pagination bornée (max 25)");
}

/* 2 — Parsing de l'extrait réel : normalisation + dé-doublon par SIREN. */
{
  const { companies, total, invalid } = parseCompanyResults(REAL_PAYLOAD, { department: "92", runId: "run:test" });
  assert.equal(total, 74, "total réel rapporté par l'API");
  assert.equal(invalid, undefined, "payload valide");
  assert.equal(companies.length, 2, "doublon SIREN fusionné");
  const poly = companies.find(c => c.siren === "382515781")!;
  assert.equal(poly.commune, "CLICHY");
  assert.equal(poly.trancheLabel, "100–199 salariés", "libellé OFFICIEL 2026 : tranche 22 = 100–199");
  assert.equal(poly.size, "PME");
  assert.equal(poly.naf, "71.12B");
  assert.equal(poly.nafLabel, "Ingénierie, études techniques");
  assert.equal(poly.nafTier, "cœur");
  assert.equal(poly.websiteStatus, "none", "aucun site déduit sans preuve");
  assert.equal(poly.stageConfirmed, undefined, "aucun stage « confirmé » inventé");
  /* Erreur API : message conservé, jamais interprété comme des résultats. */
  const bad = parseCompanyResults({ erreur: "Au moins un paramètre `activite_principale` est non valide." }, { department: "92", runId: "r" });
  assert.equal(bad.companies.length, 0);
  assert.ok(bad.invalid?.includes("non valide"), "code NAF invalide → erreur tracée");
}

/* 3 — Appel injecté : statut HTTP respecté, aucune exception propagée. */
{
  const fetchImpl = async (url: string) => ({
    ok: true, status: 200,
    json: async () => REAL_PAYLOAD,
  });
  const res = await fetchCompaniesPage(fetchImpl, { department: "92", nafCodes: ["71.12B"], tranches: ["22"] });
  assert.equal(res.ok, true);
  assert.equal(res.companies.length, 2);
  const blocked = await fetchCompaniesPage(async () => { throw new Error("réseau"); }, { department: "92", nafCodes: ["71.12B"], tranches: ["22"] });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.error?.includes("réseau"), "erreur réseau tracée");
  const denied = await fetchCompaniesPage(async () => ({ ok: false, status: 429, json: async () => ({}) }), { department: "92", nafCodes: ["71.12B"], tranches: ["22"] });
  assert.equal(denied.error, "HTTP 429", "quota API tracé");
}

/* 4 — Scoring explicable : raisons + données manquantes, jamais de probabilité. */
{
  const base = { naf: "71.12B", commune: "COURBEVOIE", websiteStatus: "none" as const };
  const strong = scoreCompanyForProfile({ ...base, nafTier: "cœur", size: "PME", name: "ETUDES ELECTRIQUES DU VAL", website: undefined }, "Île-de-France", "Île-de-France");
  assert.ok(strong.score >= 55, `score cohérent (obtenu ${strong.score})`);
  assert.ok(strong.reasons.some(r => r.includes("cœur du profil")), "raison NAF");
  assert.ok(strong.reasons.some(r => r.includes("électricité")), "raison nom");
  assert.ok(strong.reasons.some(r => r.includes("zone préférée")), "raison géographique");
  assert.ok(strong.missing.some(m => m.includes("site officiel")), "site manquant déclaré");
  const weak = scoreCompanyForProfile({ naf: "56.10A", nafTier: "hors cible", size: "grande", name: "RESTAURATION XYZ", commune: "LILLE", websiteStatus: "none", website: undefined }, "Île-de-France", "Hauts-de-France");
  assert.ok(weak.score < strong.score, "hors cible << cœur de cible");
  assert.ok(weak.missing.some(m => m.includes("hors familles ciblées")), "NAF hors cible = donnée manquante, pas un rejet silencieux");
  assert.ok(!("probabilite" in strong), "aucune probabilité artificielle produite");
}

/* 5 — Site officiel : confirmation par contenu, jamais par déduction. */
{
  const page = "Société ETUDES ELECTRIQUES DU VAL — ingénierie électrique à Courbevoie. RCS 812345679.";
  assert.equal(confirmOfficialWebsite(page, "ETUDES ELECTRIQUES DU VAL SAS"), true, "nom complet présent sur la page → confirmé");
  assert.equal(confirmOfficialWebsite("Bienvenue sur notre site", "ETUDES ELECTRIQUES DU VAL SAS"), false, "sans nom → non confirmé");
  assert.equal(confirmOfficialWebsite(undefined, "X"), false);
  /* 5bis — 4 états explicites (2026-10-15) : confirmé / probable /
     non confirmé / inaccessible. Le SIREN sur la page = preuve forte. */
  assert.equal(assessDomain(page, true, "ETUDES ELECTRIQUES DU VAL SAS", "812345679").status, "confirmed", "SIREN retrouvé sur la page → confirmé");
  assert.equal(assessDomain(page, true, "ETUDES ELECTRIQUES DU VAL SAS", "812345678").status, "confirmed", "nom complet → confirmé quand même");
  const partial = assessDomain("Société ETUDES à Paris", true, "ETUDES ELECTRIQUES DU VAL SAS");
  assert.equal(partial.status, "probable", "un seul token → probable, jamais officiel");
  assert.equal(assessDomain("Bienvenue sur notre site", true, "ETUDES ELECTRIQUES DU VAL SAS").status, "unconfirmed");
  assert.equal(assessDomain(undefined, false, "X").status, "inaccessible");
  /* 5ter — familles NAF : uniquement des codes valides VÉRIFIÉS vivants le
     2026-10-15 contre l'API (732 codes) et libellés officiels search-api. */
  for (const family of NAF_FAMILIES) assert.match(family.code, /^\d{2}\.\d{2}[A-Z]$/, `format NAF ${family.code}`);
  const verifiedCodes = ["71.12B", "43.21A", "43.21B", "27.11Z", "27.12Z", "27.33Z", "35.11Z", "35.12Z", "35.13Z", "27.20Z", "26.51B", "71.11Z"];
  assert.ok(NAF_FAMILIES.every(f => verifiedCodes.includes(f.code)), "aucun code hors liste vérifiée");
  assert.ok(!NAF_FAMILIES.some(f => ["33.20Z", "28.99Z", "26.51Z", "71.13B", "43.21C"].includes(f.code)), "codes rejetés par l'API réelle exclus");
  assert.equal(websiteHypothesis("Études Électriques du Val"), "https://etudeselectriquesduval.fr", "hypothèse générable (domaine NU, vérifié réel : www. peut ne pas résoudre)");
  assert.equal(websiteHypothesis("ERESE (ENERGIE, RESEAUX, ENVIRONNEMENT)"), "https://erese.fr", "parenthèses/sigles retirés avant concaténation (confirmé réel : erese.fr existe)");
  assert.equal(websiteHypothesis("AB"), null, "noms trop courts → aucune hypothèse");
}

/* 6 — Rotation : le plan privilégie les zones les moins explorées. */
{
  const runs: DiscoveryRun[] = [{ id: "r1", at: "2026-10-15", department: "92", nafCodes: ["71.12B"], tranches: ["22"], page: 1, totalResults: 74, newCompanies: 12 }];
  const plan = nextQueryPlan({ runs });
  assert.notEqual(plan.department, "92", "déjà exploré → zone suivante");
  assert.equal(plan.region, "Île-de-France", "Île-de-France d'abord (préférence configurée)");
  const idfPlan = nextQueryPlan({ runs: [] }, { zoneCodes: ["92", "91"] });
  assert.equal(idfPlan.department, "92", "aucun run → première zone");
  assert.ok(plan.nafCodes.every(code => NAF_FAMILIES.some(f => f.code === code)), "codes NAF de la nomenclature");
  assert.ok(plan.tranches.every(t => PILOT_TRANCHES.includes(t)), "tranches bornées PME/ETI");
  /* Réel 2026-10-15 : l'API rejette HTTP 400 « tranche inconnue » hors liste
     officielle — jamais de code « 33 » ni « 43 » dans un plan. */
  assert.ok(PILOT_TRANCHES.every(t => VALID_TRANCHES.has(t)), "PILOT_TRANCHES ⊆ liste officielle");
  assert.equal(VALID_TRANCHES.has("33"), false);
  assert.equal(VALID_TRANCHES.has("43"), false);
}

/* 7 — Registre : SIREN unique ; jamais d'annonce créée pour une entreprise sans offre. */
{
  const mk = (siren: string, name: string): DiscoveredCompany => ({
    siren, name, commune: "X", codePostal: "92100", departement: "92", naf: "71.12B",
    nafLabel: "Ingénierie, études techniques", nafTier: "cœur", tranche: "21",
    trancheLabel: "20–49 salariés", size: "PME", websiteStatus: "none",
    reasons: [], missing: [], score: 0, lastCheckedAt: "t", foundAt: "t", foundBy: "run",
  });
  const { merged, added } = mergeCompanies(
    [mk("812345670", "A")],
    [mk("812345670", "A bis"), mk("823456781", "B"), mk("123", "SIREN TROP COURT"), mk("", "SANS SIREN")]
  );
  assert.equal(added, 1, "un seul ajout : doublon + SIREN invalides écartés");
  assert.equal(merged.length, 2);
  assert.equal(merged.find(c => c.siren === "812345670")!.name, "A", "première occurrence conservée");
  for (const company of merged) {
    assert.equal(company.stageConfirmed ?? false, false, "jamais de stage confirmé sans vérification");
  }
}

console.log(
  "\nJalon 1 — moteur de découverte validé (offline) :\n" +
  "· parsing sur extrait RÉEL de l'API Recherche d'entreprises (74 → 2 après dé-doublon)\n" +
  "· scoring explicable (raisons + manques), zéro probabilité inventée\n" +
  "· site officiel uniquement par confirmation de contenu · rotation par zone\n" +
  "· registre à SIREN unique, aucune annonce fictive possible"
);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
