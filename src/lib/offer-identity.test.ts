/* Contrat terrain : les offres importées doivent porter un vrai nom.
   Cas réels issus du catalogue (« Stage TFE - », « STAGE – », société « ST »,
   « ENE »…) : le titre et l'entreprise ne doivent plus être un fragment d'objet
   ni une initiale, et aucune valeur ne doit être inventée. */

import assert from "node:assert/strict";
import {
  cleanLabel,
  companyFromSender,
  companyFromUrl,
  groundKeywords,
  isGenericTitle,
  isUnusableCompany,
  normalizeLabel,
  repairOfferIdentity,
  titleFromEvidence,
  UNKNOWN_COMPANY,
  UNKNOWN_TITLE,
} from "./offer-identity";

/* ── 1. Nettoyage : plus de tiret orphelin ─────────────────────── */
assert.equal(cleanLabel("Stage TFE -"), "Stage TFE");
assert.equal(cleanLabel("STAGE – "), "STAGE");
assert.equal(cleanLabel("—"), "");
assert.equal(cleanLabel("  <b>Stage</b>&nbsp;ingénieur  "), "Stage ingénieur");
assert.equal(normalizeLabel("Électricité"), "electricite");

/* ── 2. Titres génériques : un type de contrat n'est pas un titre ── */
for (const value of [
  "Stage",
  "STAGE –",
  "Stage -",
  "Stage TFE -",
  "Stage PFE",
  "Stagiaire de fin d'études -",
  "OFFRE",
  "Internship",
  "",
  "S-",
  "Voir l'offre",
]) {
  assert.equal(isGenericTitle(value), true, `générique attendu : « ${value} »`);
}
for (const value of [
  "Stage TFE - Ingénieur électricité (H/F)",
  "Stage – UX réseaux électriques",
  "Stage ingénieur systèmes de stockage",
  "Alternance technicien de maintenance",
]) {
  assert.equal(isGenericTitle(value), false, `titre réel attendu : « ${value} »`);
}

/* ── 3. Entreprises inutilisables ──────────────────────────────── */
for (const value of ["S", "ST", "S-", "—", "", "Entreprise non précisée", "LinkedIn", "Indeed", "Stage TFE -", "STAGE -", "Stagiaire de fin d'études", "11/10/2026"]) {
  assert.equal(isUnusableCompany(value, "Stage ingénieur"), true, `inutilisable : « ${value} »`);
}
assert.equal(isUnusableCompany("Logiciels recherchés", "Logiciels recherchés"), true, "entreprise identique au titre");
assert.equal(isUnusableCompany("ST", "Stage TFE -"), true, "sigle fabriqué quand le titre lui-même est générique");
for (const value of ["Orano", "Bouygues", "Sanofi", "Enedis", "EDF", "Energies", "Lyapunov F-H"]) {
  assert.equal(isUnusableCompany(value, "Stage ingénieur réseaux électriques"), false, `entreprise valable : « ${value} »`);
}
assert.equal(isUnusableCompany("EDF", "Stage ingénieur réseaux électriques"), false, "un sigle réel garde son nom quand le titre est exploitable");

/* ── 4. Réparation complète d'une ligne abîmée ─────────────────── */
const broken = repairOfferIdentity({ title: "Stage TFE -", company: "ST" });
assert.equal(broken.title, UNKNOWN_TITLE);
assert.equal(broken.company, UNKNOWN_COMPANY);
assert.equal(broken.titleRepaired, true);
assert.equal(broken.companyRepaired, true);

/* Objet du mail = vrai nom de l'offre (alerte à offre unique). */
const fromSubject = repairOfferIdentity({
  title: "STAGE -",
  company: "ENE",
  subjectHint: "Stage TFE - Ingénieur électricité (H/F)",
});
assert.equal(fromSubject.title, "Stage TFE - Ingénieur électricité (H/F)");
assert.equal(isGenericTitle(fromSubject.title), false);

/* Objet d'alerte généraliste : jamais utilisé comme titre. */
const newsletter = repairOfferIdentity({ title: "Stage", company: "ST", subjectHint: "Votre alerte emploi du 11/10/2026" });
assert.equal(newsletter.title, UNKNOWN_TITLE);

/* Entreprise citée dans le texte réel de l'annonce. */
const fromText = repairOfferIdentity({
  title: "Stage TFE -",
  company: "Stage TFE -",
  description: "Stage de 6 mois chez RTE au sein du département réseaux. Missions : études HTA.",
});
assert.equal(fromText.company, "RTE");

/* Entreprise déduite de l'hôte du lien puis de l'expéditeur. */
assert.equal(companyFromUrl("https://jobs.smartrecruiters.com/Orano/744000123"), "Orano");
assert.equal(companyFromUrl("https://careers.edf.fr/job/1234"), "Edf");
assert.equal(companyFromUrl("https://www.linkedin.com/jobs/view/123"), "");
assert.equal(companyFromSender("alertes@orano.com"), "Orano");
assert.equal(companyFromSender("jobs-noreply@linkedin.com"), "");
assert.equal(
  repairOfferIdentity({ title: "Stage", company: "—", fromHint: "offres@orano.com" }).company,
  "Orano"
);
assert.equal(repairOfferIdentity({ title: "Offre", company: "ST" }).company, UNKNOWN_COMPANY);

/* Une offre déjà correcte n'est jamais réécrite. */
const intact = repairOfferIdentity({
  title: "Stage ingénieur études électriques",
  company: "Schneider Electric",
  description: "Missions : dimensionnement des armoires BT.",
});
assert.deepEqual(intact, {
  title: "Stage ingénieur études électriques",
  company: "Schneider Electric",
  titleRepaired: false,
  companyRepaired: false,
});

/* ── 5. Titre récupéré depuis le texte réel uniquement ─────────── */
assert.equal(
  titleFromEvidence({ snippet: "Dimensionnement des installations électriques" }),
  "Dimensionnement des installations électriques"
);
assert.equal(titleFromEvidence({ description: "Nous recherchons un stagiaire en génie électrique pour renforcer nos équipes." }), "");
assert.equal(titleFromEvidence({ subjectHint: "Nouvelles offres pour vous" }), "");

/* ── 6. Mots-clés : un badge affiché doit avoir une preuve ─────── */
const longDescription =
  "Stage de six mois au sein du bureau d'études réseaux. Missions : dimensionnement des " +
  "installations HTA et basse tension, rédaction des notes de calcul, suivi des essais sur site, " +
  "participation aux réunions de chantier avec les équipes d'exploitation, mise à jour des schémas " +
  "unifilaires et des dossiers de recolement. Environnement technique : Safran, équipes " +
  "pluridisciplinaires, outils de calcul et de simulation, VHDL pour la partie électronique " +
  "des cartes de commande. Durée : six mois, démarrage février 2027.";
assert.ok(longDescription.length > 300, "preuve suffisamment longue pour juger");
assert.deepEqual(
  groundKeywords(["FPGA", "VHDL", "électricité"], longDescription),
  ["VHDL"],
  "un badge absent du texte réel est retiré, les autres restent"
);
assert.deepEqual(groundKeywords(["vhdl"], longDescription), ["vhdl"], "casse ignorée");
assert.deepEqual(groundKeywords(["électronique"], longDescription), ["électronique"], "accents ignorés");
assert.deepEqual(groundKeywords(["Python"], longDescription), [], "mot-clé absent d'une fiche détaillée : retiré");
assert.deepEqual(groundKeywords(["Python", "FPGA"], "Stage court"), ["Python", "FPGA"], "preuve trop courte : rien n'est retiré");

/* ── 7. Cas réels du catalogue : annonce écrite d'une seule phrase ──
   « (H/F) Chargé d'études … chez Enedis. Missions : … » : le titre vient de la
   phrase, l'entreprise s'arrête à la ponctuation. */
const oneSentence = repairOfferIdentity({
  title: "Stagiaire de fin d'études -",
  company: "",
  description: "(H/F) Chargé d'études réseaux électriques HTA/BT chez Enedis. Missions : schémas unifilaires, dimensionnement.",
});
assert.equal(oneSentence.title, "Chargé d'études réseaux électriques HTA/BT");
assert.equal(oneSentence.company, "Enedis", "l'entreprise s'arrête à la fin de phrase, jamais « Enedis. Missions »");

/* Annonce qui commence par le type de contrat : le début de phrase est le titre. */
const contractFirst = repairOfferIdentity({
  title: "Orano",
  company: "",
  description: "Stage — Simulation thermique du coeur. Vous participerez aux études neutroniques et à la modélisation. Postulez via notre site carrière.",
});
assert.equal(contractFirst.title, "Stage — Simulation thermique du coeur");
assert.equal(contractFirst.company, "Orano", "un nom d'entreprise stocké comme titre reprend sa place");

/* « Sanofi recrute un stagiaire ingénieur génie électrique pour son site… » */
const hires = repairOfferIdentity({
  title: "Sanofi",
  company: "",
  description: "Sanofi recrute un stagiaire ingénieur génie électrique pour son site de Vitry. Missions : mise à jour des schémas.",
});
assert.equal(hires.title, "Stagiaire ingénieur génie électrique");
assert.equal(hires.company, "Sanofi");

/* ── 8. Jamais un texte d'interface ni une référence de dossier ─── */
assert.equal(isUnusableCompany("Voir l'offre", "Stage ingénieur"), true, "« Voir l'offre » n'est pas une entreprise");
assert.equal(isUnusableCompany("Réf. 2026-045", "Stage ingénieur"), true, "une référence de dossier n'est pas une entreprise");
assert.equal(titleFromEvidence({ description: "Réf. 2026-045\nPoste à pourvoir rapidement." }), "", "référence + phrase administrative → aucun titre inventé");
assert.equal(titleFromEvidence({ description: "Nous recherchons un stagiaire en génie électrique pour renforcer nos équipes." }), "", "phrase descriptive → aucun titre inventé");

/* L'URL d'un job board ne nomme jamais l'employeur. */
assert.equal(companyFromUrl("https://www.hellowork.com/fr-fr/emploi/stage-12345.html"), "");
assert.equal(companyFromUrl("https://fr.indeed.com/viewjob?jk=abc"), "");
assert.equal(companyFromUrl("https://jobs.smartrecruiters.com/orano/744000123"), "Orano", "segment ATS capitalisé");

process.stdout.write("offer-identity: titres, entreprises, récupération, mots-clés ancrés passed\n");
