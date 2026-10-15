/* Jalon B — câblage : le flux réel `enrichProcessed` attache à CHAQUE offre
   le niveau L0–L3 réellement atteint et l'issue de page distincte
   (403/login/CAPTCHA/404/429/timeout), sans jamais inventer de description. */

import assert from "node:assert/strict";
import { enrichProcessed, type ParsedEmail, type ProcessedEmail, type RawOffer } from "./gmail-core";
import { enrichBadgeFor, maxLevelFor, outcomeLabel } from "./offer-enrich";

function makeOffer(partial: Partial<RawOffer> = {}): RawOffer {
  return {
    title: "Stage Études Électriques",
    company: "ACME",
    location: "Lyon",
    contract: "Stage",
    duration: "6 mois",
    deadline: "",
    skills: [],
    description: "",
    applicationUrl: "https://example.com/offers/1",
    source: "Indeed",
    ...partial,
  };
}

function makeEmail(id: string, offers: RawOffer[]): ProcessedEmail {
  return {
    id,
    subject: "Alerte offres stages",
    from: "alerts@indeed.com",
    receivedAt: "2026-10-01T10:00:00.000Z",
    isOffer: offers.length > 0,
    reason: "ok",
    finalStatus: offers.length > 0 ? "detected" : "no_offer",
    offers,
    detectionMethod: "code",
    textLen: 1000,
    hasHtml: true,
    linksCount: 5,
    anchorsCount: offers.length,
    detectedOffers: offers.map((o) => ({ title: o.title, company: o.company, applicationUrl: o.applicationUrl })),
    checkpoint: { status: "done", retries: 0, at: "2026-10-01T10:00:00.000Z" },
  } as ProcessedEmail;
}

const PAGE = [
  "Poste : Stage études électriques",
  "Entreprise : BUREAU ACME",
  "Lieu : Lyon",
  "Vous concevrez les tableaux basse tension et dimensionnez les protections des installations en collaborant avec le bureau d'études.",
  "Profil : Formation Bac+5 en génie électrique exigée, maîtrise de Caneco et AutoCAD demandée pour réaliser les schémas.",
].join("\n");

const URLS = {
  blocked: "https://example.com/offers/blocked",
  captcha: "https://example.com/offers/captcha",
  gone: "https://example.com/offers/gone404",
  dest: "https://example.com/offers/destination",
  fiche: "https://example.com/offers/fiche",
};

async function run(): Promise<RawOffer[]> {
  const offers = [
    makeOffer({ applicationUrl: URLS.blocked }),
    makeOffer({ applicationUrl: URLS.captcha }),
    makeOffer({ applicationUrl: URLS.gone }),
    makeOffer({ applicationUrl: URLS.dest }),
    makeOffer({ applicationUrl: URLS.fiche }),
  ];
  const processed = [makeEmail("em-honest", offers)];
  await enrichProcessed(processed, new Map<string, ParsedEmail>(), {
    skipCache: true,
    groundedOnly: true,
    concurrency: 2,
    fetchPageImpl: async (url) => {
      if (url === URLS.blocked)
        return { ok: false, reason: "Accès bloqué (anti-robot ou lien privé)", outcome: { kind: "blocked" } };
      if (url === URLS.captcha)
        return { ok: false, reason: "Page inaccessible : connexion ou anti-robot exigé", outcome: { kind: "captcha" } };
      if (url === URLS.gone)
        return { ok: false, reason: "Site inaccessible (HTTP 404)", outcome: { kind: "not_found", httpStatus: 404 } };
      if (url === URLS.dest)
        return {
          ok: false,
          reason: "Contenu trop court pour être une annonce — fiche basée sur l'e-mail",
          outcome: { kind: "content_unusable", httpStatus: 200 },
        };
      return { ok: true, text: PAGE, outcome: { kind: "ok", httpStatus: 200 } };
    },
  });
  return processed[0].offers;
}

async function main() {
  const offers = await run();
  assert.equal(offers.length, 5, "cinq offres distinctes, aucune fusionnée");

  const [blocked, captcha, gone, dest, fiche] = offers;

  /* 1 — Chaque échec a un ÉTAT DISTINCT attaché à l'offre. */
  assert.equal(blocked.enrichStatus, "blocked", "403 → statut blocked");
  assert.equal(blocked.enrichLevel, "L0", "403 → niveau L0 (aucune donnée de fiche)");
  assert.equal(blocked.enrichOutcome, "blocked", "403 → issue « blocked »");
  assert.equal(captcha.enrichOutcome, "captcha", "CAPTCHA → issue « captcha »");
  assert.equal(gone.enrichOutcome, "not_found", "404 → issue « not_found »");
  assert.equal(gone.enrichLevel, "L0", "404 → niveau L0");
  assert.notEqual(captcha.enrichOutcome, blocked.enrichOutcome, "CAPTCHA ≠ 403");
  assert.notEqual(gone.enrichOutcome, blocked.enrichOutcome, "404 ≠ 403");
  assert.ok(blocked.enrichReason?.includes("anti-robot"), "raison honnête exposée à l'utilisateur");

  /* 2 — Anti-invention : un échec ne produit JAMAIS de description. */
  assert.equal(blocked.description, "", "pas de description inventée après 403");
  assert.equal(blocked.missions, undefined, "pas de missions inventées après 403");
  assert.equal(captcha.missions, undefined, "pas de missions inventées après CAPTCHA");
  assert.equal(gone.missions, undefined, "pas de missions inventées après 404");

  /* 3 — Destination atteinte mais contenu illisible → L1, jamais L2. */
  assert.equal(dest.enrichLevel, "L1", "2xx sans fiche exploitable → L1");
  assert.equal(dest.enrichOutcome, "content_unusable", "issue « content_unusable » distincte");
  assert.equal(dest.enrichStatus, "blocked", "fiche malgré tout non enrichie");

  /* 4 — Fiche analysée → L2, données TRAÇABLES à la page (pas à l'e-mail). */
  assert.equal(fiche.enrichLevel, "L2", "page lue et analysée → L2");
  assert.equal(fiche.enrichOutcome, "ok", "issue « ok »");
  assert.ok((fiche.missions ?? []).length > 0, "missions extraites de la page");
  for (const mission of fiche.missions ?? []) {
    assert.ok(PAGE.includes(mission), `mission traçable dans le texte de la page : ${mission}`);
  }
  assert.ok(fiche.description && PAGE.includes(fiche.description), "description traçable dans le texte de la page");

  /* 5 — Badges honnêtes + libellés français distincts par issue. */
  assert.equal(enrichBadgeFor({ kind: "blocked" }, "L0").label, "Bloquée / login");
  assert.equal(enrichBadgeFor({ kind: "not_found", httpStatus: 404 }, "L0").label, "Expirée vérifiée");
  assert.equal(enrichBadgeFor({ kind: "content_unusable", httpStatus: 200 }, "L1").label, "Destination atteinte");
  assert.equal(enrichBadgeFor({ kind: "ok", httpStatus: 200 }, "L2").label, "Fiche analysée");
  assert.equal(maxLevelFor({ kind: "content_unusable", httpStatus: 200 }), "L1", "L1 plafond sans analyse de fiche");
  assert.equal(maxLevelFor({ kind: "ok", httpStatus: 200 }), "L2");
  const labels = ["blocked", "captcha", "not_found", "rate_limited", "timeout", "network"].map(outcomeLabel);
  assert.equal(new Set(labels).size, labels.length, "chaque issue a un libellé français distinct");
  assert.equal(outcomeLabel("not_found"), "offre absente (404/410)");
  assert.equal(outcomeLabel(undefined), "issue de page non relevée");

  /* 6 — Les niveaux des cinq offres sont cohérents entre eux. */
  const levels = offers.map((o) => o.enrichLevel).join(",");
  assert.equal(levels, "L0,L0,L0,L1,L2", `progression de niveaux honnête (obtenu : ${levels})`);

  console.log(
    "\nJalon B câblé : niveaux L0–L3 + issues de page distinctes attachés\n" +
      "à chaque offre par enrichProcessed, aucune information inventée."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
