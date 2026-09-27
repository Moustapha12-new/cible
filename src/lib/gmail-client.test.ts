/* Tests Gmail Client — fusion des résultats sync dans le store (ingest).
   Exécution : npx tsx src/lib/gmail-client.test.ts
   Étape 8 (P1-6) : dédup dual-format (clé plateforme jk:… + URL legacy)
   et clés titre gelées avant enrichissement. */

import { ingestSyncResults, type GmailStore, type SyncEmailResult } from "./gmail-client";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function assertEq(actual: unknown, expected: unknown, msg: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(
      `  ✗ ${msg}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
}

function emptyStore(): GmailStore {
  return {
    v: 1,
    label: "Stages – Alertes offres",
    offers: [],
    lastSync: null,
    lastSummary: null,
    daily: null,
  };
}

type OfferIn = Partial<SyncEmailResult["offers"][number]>;

function offer(over: OfferIn = {}): SyncEmailResult["offers"][number] {
  return {
    title: "Stage Dev",
    company: "ACME",
    location: "Paris",
    contract: "Stage",
    duration: "6 mois",
    deadline: "",
    skills: [],
    description: "",
    applicationUrl: "https://example.com/job/1",
    source: "LinkedIn",
    ...over,
  };
}

function em(id: string, offers: SyncEmailResult["offers"]): SyncEmailResult {
  return {
    id,
    subject: "Alerte stages",
    from: "jobs@linkedin.com",
    receivedAt: "2026-09-25T10:00:00.000Z",
    isOffer: offers.length > 0,
    reason: "ok",
    finalStatus: offers.length > 0 ? "detected" : "no_offer",
    offers,
  };
}

function main() {
  console.log("═".repeat(72));
  console.log("GMAIL CLIENT — ingestSyncResults (dédup P1-6)");
  console.log("═".repeat(72));

  /* [C-1] Offre neuve → ajout + invariant detected = added + duplicates. */
  {
    const r = ingestSyncResults(emptyStore(), [em("e1", [offer()])]);
    assertEq(r.summary.added, 1, "1re offre → added=1");
    assertEq(r.summary.duplicates, 0, "1re offre → duplicates=0");
    assert(
      r.summary.detected === r.summary.added + r.summary.duplicates,
      "invariant detected = added + duplicates"
    );
    assertEq(r.store.offers[0].urlKey, "https://example.com/job/1", "store.urlKey legacy format");
    assertEq(r.store.offers[0].titleCompanyKey, "stage dev|acme|paris", "store.titleCompanyKey");
  }

  /* [C-2] Clé plateforme gelée (jk:) : URLs à paramètres de session DIFFÉRENTS
     (lipi non retiré par normalizeUrl), même poste → doublon. */
  {
    const r1 = ingestSyncResults(emptyStore(), [
      em("e1", [
        offer({ applicationUrl: "https://www.linkedin.com/jobs/view/555/?lipi=aaa111", dedupUrlKey: "jk:li:555" }),
      ]),
    ]);
    const r2 = ingestSyncResults(r1.store, [
      em("e2", [
        offer({ applicationUrl: "https://www.linkedin.com/jobs/view/555/?lipi=bbb222", dedupUrlKey: "jk:li:555" }),
      ]),
    ]);
    assertEq(r2.summary.added, 0, "jk: identique (URLs à session différentes) → 2e ajout refusé");
    assertEq(r2.summary.duplicates, 1, "jk: identique → doublon");
    assertEq(r2.store.offers.length, 1, "store = 1 offre");
    assertEq(r2.store.offers[0].urlKey, "jk:li:555", "store.urlKey = clé gelée plateforme");
  }

  /* [C-3] Transition formats : store ancien (urlKey = URL normalisée legacy,
     applicationUrl canonique telle que produite par cleanJobUrl) + incoming
     serveur nouveau (jk: + canonique) → match via la clé legacy. */
  {
    const legacy = ingestSyncResults(emptyStore(), [
      em("e1", [offer({ applicationUrl: "https://www.linkedin.com/jobs/view/555/" })]),
    ]);
    assertEq(legacy.store.offers[0].urlKey, "https://www.linkedin.com/jobs/view/555", "store ancien format");
    const r2 = ingestSyncResults(legacy.store, [
      em("e2", [offer({ applicationUrl: "https://www.linkedin.com/jobs/view/555/", dedupUrlKey: "jk:li:555" })]),
    ]);
    assertEq(r2.summary.added, 0, "incoming jk: vs store legacy → doublon");
    assertEq(r2.summary.duplicates, 1, "doublon via clé legacy de l'URL");
  }

  /* [C-4] Inverse : store jk: + incoming sans champ gelé (ancien serveur) →
     match via legacyUrlKey calculé côté client. */
  {
    const fresh = ingestSyncResults(emptyStore(), [
      em("e1", [offer({ applicationUrl: "https://www.linkedin.com/jobs/view/777/", dedupUrlKey: "jk:li:777" })]),
    ]);
    assertEq(fresh.store.offers[0].urlKey, "jk:li:777", "store = clé plateforme");
    const r2 = ingestSyncResults(fresh.store, [
      em("e2", [offer({ applicationUrl: "https://www.linkedin.com/jobs/view/777/" })]),
    ]);
    assertEq(r2.summary.added, 0, "incoming legacy vs store jk: → doublon (URL identique normalisée)");
    assertEq(r2.summary.duplicates, 1, "doublon via URL normalisée");
  }

  /* [C-5] Tck gelé (avant enrich) : titre/entreprise réécrits côté incoming →
     le tck gelé matche le store même si le tck actuel diffère. */
  {
    const r1 = ingestSyncResults(emptyStore(), [
      em("e1", [offer({ dedupTclKey: "stage dev|acme|paris" })]),
    ]);
    assertEq(r1.store.offers[0].titleCompanyKey, "stage dev|acme|paris", "store.titleCompanyKey = tck gelé");
    const r2 = ingestSyncResults(r1.store, [
      em("e2", [
        offer({
          title: "Développeur Back-end Stage", // enrich a réécrit
          company: "ACME SAS",
          applicationUrl: "https://other.com/j/9",
          dedupTclKey: "stage dev|acme|paris",
        }),
      ]),
    ]);
    assertEq(r2.summary.added, 0, "tck gelé identique → doublon malgré champs enrichis");
    assertEq(r2.summary.duplicates, 1, "doublon via titre+entreprise+localité gelé");
  }

  /* [C-6] Fallback sans champ gelé : tck calculé sur les champs actuels
     (comportement historique conservé). */
  {
    const r1 = ingestSyncResults(emptyStore(), [em("e1", [offer()])]);
    const r2 = ingestSyncResults(r1.store, [
      em("e2", [offer({ applicationUrl: "https://other.com/j/9" })]),
    ]);
    assertEq(r2.summary.added, 0, "même T|C|L actuel → doublon");
    assertEq(r2.summary.duplicates, 1, "doublon via tck courant");
  }

  /* [C-7] Offres distinctes → toutes ajoutées, invariant préservé. */
  {
    const r = ingestSyncResults(emptyStore(), [
      em("e1", [offer(), offer({ title: "Stage Marketing", applicationUrl: "https://example.com/job/2" })]),
    ]);
    assertEq(r.summary.added, 2, "2 offres distinctes → added=2");
    assert(
      r.summary.detected === r.summary.added + r.summary.duplicates,
      "invariant préservé (2 = 2 + 0)"
    );
  }

  /* [C-8] Email sans offre / erreur : rejected / errors comptés, rien ajouté. */
  {
    const r = ingestSyncResults(emptyStore(), [
      em("e1", []),
      { ...em("e2", []), finalStatus: "analyze_error" },
    ]);
    assertEq(r.summary.added, 0, "aucune offre → added=0");
    assertEq(r.summary.rejected, 1, "no_offer → rejected");
    assertEq(r.summary.errors, 1, "analyze_error → errors");
    assert(r.store.offers.length === 0, "store inchangé");
  }

  console.log("─".repeat(72));
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
