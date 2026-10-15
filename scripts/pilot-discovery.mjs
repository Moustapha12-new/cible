/* Pilote A — Company-first discovery (réel, sans clé).
   Interroge l'API publique Recherche d'entreprises, applique le scoring
   explicable, tente de confirmer le site officiel du top, écrit un rapport
   JSON vérifiable. Aucune annonce n'est inventée.

   Exécution : node scripts/pilot-discovery.mjs
   Sortie    : scratch/pilot-discovery-report.json + résumé console. */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  NAF_FAMILIES,
  DEPARTMENT_ROTATION,
  PILOT_TRANCHES,
  VALID_TRANCHES,
  fetchCompaniesPage,
  scoreCompanyForProfile,
  mergeCompanies,
  splitTrancheQueries,
  websiteHypothesis,
  confirmOfficialWebsite,
} from "../src/lib/discovery.ts";

const TARGET = 100; // cible d'expérimentation, pas une capacité annoncée
const preferredRegion = "Île-de-France";
const regionOf = (code) => DEPARTMENT_ROTATION.find((z) => z.code === code)?.region;

/* Sélection sectorielle × géographique (rotation documentée, pas de requête au hasard). */
const PLAN = [
  { dept: "92", naf: ["71.12B"] }, // Hauts-de-Seine — ingénierie, études techniques
  { dept: "91", naf: ["71.12B"] }, // Essonne — ingénierie
  { dept: "69", naf: ["71.12B"] }, // Rhône — ingénierie (hors IDF, bassin industriel)
  { dept: "92", naf: ["35.11Z", "35.12Z", "35.13Z"] }, // production/transport/distribution électricité
  { dept: "44", naf: ["71.12B"] }, // Loire-Atlantique — énergie
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchImpl = async (url) => {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  return { ok: res.ok, status: res.status, json: () => res.json() };
};

async function main() {
  let companies = [];
  const runs = [];
  /* Priorité aux petites structures : l'API trie par effectif décroissant,
     donc une requête multi-tranches ne montrerait que des ETI. On scinde par
     tranche et on traite les PET/PME en premier (règle : opportunité réelle
     plutôt que volume). */
  /* Liste bornée aux codes RECONNUS par l'API ("33" inexistant → HTTP 400). */
  const bySizePriority = PILOT_TRANCHES.filter((code) => VALID_TRANCHES.has(code));
  const steps = PLAN.flatMap((step) => splitTrancheQueries(step.dept, step.naf, bySizePriority)
    .map((q) => ({ dept: step.dept, naf: step.naf, q })));
  for (const step of steps) {
    await sleep(350); // ≤ 10 req/s côté API — on reste très en dessous
    const res = await fetchCompaniesPage(fetchImpl, step.q);
    const before = companies.length;
    if (res.ok) {
      // mergeCompanies renvoie { merged, added } — un SIREN = une entreprise.
      companies = mergeCompanies(companies, res.companies).merged;
    }
    runs.push({
      department: step.dept,
      nafCodes: step.naf,
      tranche: step.q.tranches[0],
      totalResults: res.total ?? 0,
      received: res.companies.length,
      newUnique: companies.length - before,
      error: res.error,
    });
    console.log(`[run] dept ${step.dept} NAF ${step.naf.join(",")} tranche ${step.q.tranches[0]} → total=${res.total} reçues=${res.companies.length} cumul=${companies.length}${res.error ? ` ERREUR: ${res.error}` : ""}`);
  }

  /* Scoring explicable, avec préférence géographique configurée. */
  companies = companies.map((c) => {
    const { score, reasons, missing } = scoreCompanyForProfile(c, preferredRegion, regionOf(c.departement));
    return { ...c, score, reasons, missing };
  });
  companies.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const scored = companies.length;

  /* Tenter de confirmer le site officiel du top uniquement (économe). */
  const top = companies.slice(0, 8);
  let confirmed = 0;
  let hypothesis = 0;
  for (const c of top) {
    const guess = websiteHypothesis(c.name);
    if (!guess) { c.missing.push("aucune hypothèse de domaine générable"); continue; }
    /* Domaine NU d'abord (réel : www.erese.fr ne résout pas, erese.fr oui),
       puis secours `www.`. Confirmé uniquement par le contenu de la page. */
    const candidates = [guess, guess.replace(/^https:\/\//, "https://www.")];
    let resolved = false;
    for (const url of candidates) {
      if (resolved) break;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: "follow" });
        const html = res.ok ? (await res.text()).slice(0, 40000) : "";
        if (res.ok && confirmOfficialWebsite(html, c.name)) {
          c.website = url; c.websiteStatus = "confirmed"; confirmed++; resolved = true;
          c.reasons.push(`site officiel confirmé (${url})`);
          // Repérer une page carrière/emploi dans le HTML.
          const career = html.match(/href=["']([^"']*(?:carriere|recrut|emploi|job|offres?|stages?)[^"']*)["']/i);
          if (career) { c.careerPage = new URL(career[1], url).href; c.reasons.push("lien carrières détecté"); }
        }
      } catch { /* tentative suivante */ }
      await sleep(250);
    }
    if (!resolved) {
      c.websiteStatus = "hypothesis"; hypothesis++;
      c.missing.push(`domaine ${guess} non confirmé (bare + www) — site non déduit`);
    }
  }

  const byTier = companies.reduce((acc, c) => ((acc[c.nafTier] = (acc[c.nafTier] || 0) + 1), acc), {});
  const bySize = companies.reduce((acc, c) => ((acc[c.size] = (acc[c.size] || 0) + 1), acc), {});
  const withCareer = companies.filter((c) => c.careerPage).length;
  const report = {
    generatedAt: new Date().toISOString(),
    source: "https://recherche-entreprises.api.gouv.fr (API publique, sans clé)",
    targetExperimental: TARGET,
    discovered: scored,
    runs,
    nafFamilies: NAF_FAMILIES.map((f) => f.code),
    tranches: PILOT_TRANCHES,
    preferredRegion,
    byTier,
    bySize,
    top10: companies.slice(0, 10).map((c) => ({
      siren: c.siren, name: c.name, commune: c.commune, naf: `${c.naf} ${c.nafLabel}`,
      size: c.size, tranche: c.trancheLabel, score: c.score,
      website: c.website, websiteStatus: c.websiteStatus, careerPage: c.careerPage,
      reasons: c.reasons, missing: c.missing,
    })),
    websiteResolution: { attempted: top.length, confirmed, hypothesisOnly: hypothesis },
    careerLinksDetected: withCareer,
    stageConfirmed: companies.filter((c) => c.stageConfirmed).length,
    note: "Aucune annonce de stage n'est créée sans vérification. Le code NAF est un signal administratif, pas une preuve de spécialisation.",
  };
  mkdirSync(join(process.cwd(), "scratch"), { recursive: true });
  writeFileSync(join(process.cwd(), "scratch", "pilot-discovery-report.json"), JSON.stringify(report, null, 2));

  console.log("\n══ PILOTE A — DÉCOUVERTE D'ENTREPRISES (réel) ══");
  console.log(`Entreprises découvertes : ${scored} (cible expérimentale ${TARGET})`);
  console.log("Par tier NAF :", JSON.stringify(byTier));
  console.log("Par taille   :", JSON.stringify(bySize));
  console.log(`Sites officiels confirmés : ${confirmed}/${top.length} testés · hypothèses non confirmées : ${hypothesis}`);
  console.log(`Liens carrières détectés  : ${withCareer}`);
  console.log(`Stages « confirmés »      : ${report.stageConfirmed} (jamais créés sans vérification)`);
  console.log("\nTop 10 par score :");
  for (const c of report.top10) console.log(` · ${c.score.toString().padStart(3)} ${c.name} — ${c.commune} (${c.size}, ${c.naf})${c.website ? ` · ${c.website}` : ""}`);
  console.log("\nRapport → scratch/pilot-discovery-report.json");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
