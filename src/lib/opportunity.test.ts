/* Jalon 2 — moteur d'opportunités : tests hors réseau. */

import assert from "node:assert/strict";
import { profileMatch, careerLinks, detectAts, extractJobPostings, verifyOfferPosting, jobKey, offerKey } from "./opportunity";

/* 1 — Correspondance profil : le vocabulaire électrique/énergie est reconnu. */
{
  const hit = profileMatch("Stage de 6 mois : dimensionnement d'installations BT/HTA, études CFO/CFA et essais de protection dans un bureau d'études électriques.");
  assert.ok(hit.score >= 4, `score attendu ≥ 4, obtenu ${hit.score}`);
  assert.ok(hit.matched.includes("dimensionnement"));
  assert.ok(hit.matched.includes("CFO/CFA"));
  const miss = profileMatch("Vente de mobilier de bureau et décoration.");
  assert.equal(miss.score, 0);
}

/* 2 — Liens carrières : seuls les liens pertinents sont retenus, absolus. */
{
  const html = `<a href="/carriere">Nous rejoindre</a><a href="https://jobs.example.com/offres">Offres</a><a href="/produits">Produits</a><a href="/recrutement/stages">Stages</a>`;
  const links = careerLinks(html, "https://exemple.fr");
  assert.equal(links.length, 3, "le lien /produits est écarté");
  assert.ok(links.every(l => l.startsWith("https://")), "URLs absolues");
}

/* 3 — Détection ATS : hébergeurs connus reconnus dans l'HTML ou l'URL. */
{
  assert.deepEqual(detectAts("Script src='https://boards-api.greenhouse.io/v1/boards/x/job_board'"), ["greenhouse"]);
  assert.deepEqual(detectAts("https://api.lever.co/v0/postings/acme"), ["lever"]);
  assert.deepEqual(detectAts("https://www.example.fr/careers"), []);
}

/* 4 — JobPosting JSON-LD : extraction avec URL, date et ville ; jamais de titre inventé. */
{
  const html = `<script type="application/ld+json">{"@type":"JobPosting","title":"Stage ingénieur études électriques","url":"https://be.example.fr/offres/stage-elec-2026","datePosted":"2026-09-01","jobLocation":{"addressLocality":"Lyon"}}</script><a href="https://be.example.fr/offres/autre">Autre offre</a>`;
  const jobs = extractJobPostings(html, "https://be.example.fr/");
  const ld = jobs.find(j => j.source === "json-ld");
  assert.ok(ld, "JSON-LD trouvé");
  assert.equal(ld!.title, "Stage ingénieur études électriques");
  assert.equal(ld!.location, "Lyon");
  assert.equal(jobs.filter(j => j.url.endsWith("/offres/autre")).length, 1, "lien d'offre non dupliqué");
  assert.equal(extractJobPostings("<script type=\"application/ld+json\">{corrompu</script>", "https://x.fr").length, 0, "JSON corrompu ignoré");
}

/* 5 — Vérification d'annonce : la durée absente n'est JAMAIS inventée. */
{
  const full = verifyOfferPosting(
    "Stage 6 mois — Dimensionnement d'installations électriques BT/HTA et études CFO/CFA. Missions : conception de tableaux, essais de protection. Profil : bac+5 électronique. Postulez via notre formulaire.",
    { company: "BE Exemple" });
  assert.equal(full.verdict, "retenue");
  assert.equal(full.durationMonths, 6);
  assert.equal(full.durationConfirmed, true);
  assert.ok(full.domain.matched.includes("HTA/BT"));

  const noDuration = verifyOfferPosting(
    "Stage — Bureau d'études électriques : dimensionnement, schémas unifilaires, études de protection. Candidature par formulaire.",
    { company: "BE Exemple" });
  assert.equal(noDuration.durationMonths, null, "durée absente → inconnue");
  assert.equal(noDuration.durationConfirmed, false);
  assert.ok(noDuration.missing.some(m => /jamais déduite/.test(m)), "manque explicitement signalé");

  const cdiCommercial = verifyOfferPosting(
    "CDI — Commercial terrain : prospection, développement du portefeuille clients, visites et négociation. Postulez !", { company: "Dupont SARL" });
  assert.equal(cdiCommercial.verdict, "rejetée");
  assert.ok(cdiCommercial.rejectionReasons.some(r => /stage/.test(r)), "CDI sans stage → rejeté avec raison écrite");

  const blogPage = verifyOfferPosting("Notre équipe a participé au salon SIE 2026. Photos et retours.", { company: "X" });
  assert.equal(blogPage.isJobPosting, false, "page d'actualité = pas une annonce");
  assert.equal(blogPage.verdict, "rejetée");
}

/* 6 — Dédoublonnage : même poste en deux villes = deux occurrences distinctes. */
{
  assert.equal(jobKey("BE Exemple", "Stage ingénieur électrique"), jobKey("be-exemple", "STAGE Ingénieur électrique"));
  assert.notEqual(offerKey("BE Exemple", "Stage ingénieur électrique", "Lyon"), offerKey("BE Exemple", "Stage ingénieur électrique", "Nantes"), "villes différentes = occurrences distinctes");
  assert.equal(offerKey("BE Exemple", "Stage ingénieur électrique", "Lyon"), offerKey("BE Exemple", "Stage ingénieur électrique", "Lyon "));
}

console.log(
  "\nJalon 2 — moteur d'opportunités validé (hors réseau) :\n" +
  "· profil électrique/énergie reconnu, vocabulaire hors profil ignoré\n" +
  "· liens carrières et ATS extraits sans faux positif\n" +
  "· JobPosting JSON-LD extrait (titre, URL, date, ville)\n" +
  "· durée absente = inconnue JAMAIS inventée ; CDI/blog rejetés avec raisons écrites\n" +
  "· un poste en deux villes = deux occurrences (pas de fusion abusive)"
);
