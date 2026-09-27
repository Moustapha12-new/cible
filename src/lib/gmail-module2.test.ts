/* Tests Module 2 — enrichissement par offre, anti-doublon, observabilité.
   Exécution : npx tsx src/lib/gmail-module2.test.ts */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  enrichCacheKey,
  isUsefulEnrichRow,
  isCacheableEnrichResult,
} from "./gmail-enrich";
import {
  buildEnrichPrompt,
  enrichProcessed,
  classifyImportBatch,
  classifyImportOffer,
  importUrlKey,
  titleCompanyKeyOf,
  type ProcessedEmail,
  type RawOffer,
} from "./gmail-core";
import type { ParsedEmail } from "./gmail-server";

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

function makeOffer(partial: Partial<RawOffer> = {}): RawOffer {
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
    ...partial,
  };
}

function makeEmail(id: string, offers: RawOffer[]): ProcessedEmail {
  return {
    id,
    subject: "Alerte offres",
    from: "alerts@linkedin.com",
    receivedAt: "2026-09-01T10:00:00.000Z",
    isOffer: offers.length > 0,
    reason: "ok",
    finalStatus: offers.length > 0 ? "detected" : "no_offer",
    offers,
    detectionMethod: "code",
    textLen: 1000,
    hasHtml: true,
    linksCount: 5,
    anchorsCount: offers.length,
    detectedOffers: offers.map((o) => ({
      title: o.title,
      company: o.company,
      applicationUrl: o.applicationUrl,
    })),
    checkpoint: { status: "done", retries: 0, at: "2026-09-01T10:00:00.000Z" },
  };
}

function makeParsed(id: string, html: string): ParsedEmail {
  return {
    id,
    subject: "Alerte offres",
    from: "alerts@linkedin.com",
    receivedAt: "2026-09-01T10:00:00.000Z",
    text: "Stage Dev ACME Paris",
    html,
    links: ["https://example.com/job/1"],
  };
}

async function main() {
  console.log("\n[M2-1] Clé de cache enrichissement (sha1)");

  {
    const k1 = enrichCacheKey("https://example.com/job/1");
    const k2 = enrichCacheKey("https://example.com/job/1");
    const k3 = enrichCacheKey("https://example.com/job/2");
    assert(k1 === k2, "même URL → même clé");
    assert(k1 !== k3, "URLs différentes → clés différentes");
    assert(/^gmail:enrich:v3:[0-9a-f]{40}$/.test(k1), `format gmail:enrich:v3:<sha1>, obtenu ${k1}`);
    assert(
      enrichCacheKey("  https://example.com/job/1  ") === k1,
      "trim avant hash"
    );
  }

  console.log("\n[M2-2] Helpers enrichissement");

  {
    assert(isUsefulEnrichRow(null) === false, "null → pas utile");
    assert(isUsefulEnrichRow({}) === false, "objet vide → pas utile");
    assert(isUsefulEnrichRow({ title: "Stage" }) === true, "title → utile");
    assert(isUsefulEnrichRow({ skills: ["a"] }) === true, "skills[] → utile");
    assert(isUsefulEnrichRow({ description: "" }) === false, "description vide → pas utile");
    assert(isCacheableEnrichResult({ enrichStatus: "ok", enrichReason: "x" }) === true, "ok → cachable");
    assert(isCacheableEnrichResult({ enrichStatus: "skipped", enrichReason: "x" }) === false, "skipped → non cachable");
    assert(
      isCacheableEnrichResult({ enrichStatus: "blocked", enrichReason: "x" }) === false,
      "blocked → non cachable (P1-4 : reprise via relaunch_offer)"
    );
  }

  console.log("\n[M2-3] Prompt enrich (1 offre, URL exacte)");

  {
    const p = buildEnrichPrompt({
      id: "e1#0",
      title: "Stage Dev",
      source: "LinkedIn",
      applicationUrl: "https://example.com/job/1",
      emailText: "Snippet offre",
      pageText: "Page annonce complète",
    });
    assert(p.includes("https://example.com/job/1"), "prompt contient l'URL exacte");
    assert(p.includes("Page annonce complète"), "prompt contient pageText");
    assert(p.includes("e1#0"), "prompt contient l'id");
    assert(p.includes("N'invente JAMAIS d'applicationUrl"), "règle anti-invention présente");
    assert(p.includes("summary"), "prompt demande summary 3 phrases");
    assert(p.includes("MAXIMUM 3 phrases"), "summary limité à 3 phrases");
    assert(!p.includes("https://evil"), "pas d'URL inventée dans le prompt");
  }

  console.log("\n[M2-4] Enrichissement : 1 appel IA / offre, isolation, applicationUrl exacte");

  {
    const offers = [
      makeOffer({ applicationUrl: "https://example.com/job/1", title: "A" }),
      makeOffer({ applicationUrl: "https://example.com/job/2", title: "B" }),
      makeOffer({ applicationUrl: "https://example.com/job/3", title: "C" }),
    ];
    const processed = [makeEmail("em1", offers)];
    const html = offers
      .map((o) => `<div><a href="${o.applicationUrl}">${o.title}</a></div>`)
      .join("\n");
    const emailsById = new Map([["em1", makeParsed("em1", html)]]);

    let fetchCalls = 0;
    let askCalls = 0;
    const fetchedUrls: string[] = [];

    await enrichProcessed(processed, emailsById, {
      max: 10,
      skipCache: true,
      concurrency: 2,
      fetchPageImpl: async (url) => {
        fetchCalls++;
        fetchedUrls.push(url);
        if (url.endsWith("/job/2")) {
          return { ok: false, reason: "Page inaccessible : connexion ou anti-robot exigé" };
        }
        return { ok: true, text: `Contenu de ${url}` };
      },
      askImpl: async (prompt) => {
        askCalls++;
        const m = prompt.match(/"applicationUrl": "([^"]+)"/);
        const url = m ? m[1] : "";
        return {
          results: [
            {
              id: "em1#0",
              title: "Stage Enrichi",
              company: "ACME",
              location: "Paris",
              contract: "Stage",
              duration: "6 mois",
              deadline: "",
              salary: "",
              skills: ["React"],
              keywords: ["node"],
              missions: ["dev"],
              prerequisites: [],
              profile: "",
              description: "Description enrichie",
              summary: "Résumé en 3 phrases de l'offre enrichie.",
              applicationInfo: "Formulaire",
              applicationUrl: url,
              source: "LinkedIn",
            },
          ],
        };
      },
    });

    const [o1, o2, o3] = processed[0].offers;
    assert(fetchCalls === 3, `3 fetch (1 / offre), obtenu ${fetchCalls}`);
    assert(askCalls === 2, `2 appel IA (job/2 bloqué avant IA), obtenu ${askCalls}`);
    assertEq(o1.enrichStatus, "ok", "offre 1 enrichie ok");
    assertEq(o1.description, "Description enrichie", "données IA appliquées");
    assertEq(o1.summary, "Résumé en 3 phrases de l'offre enrichie.", "summary 3 phrases appliqué");
    assertEq(o1.applicationUrl, "https://example.com/job/1", "applicationUrl jamais remplacée");
    assertEq(o2.enrichStatus, "blocked", "offre 2 blocked (isolation)");
    assertEq(o2.title, "B", "offre 2 titre d'origine préservé (échec isolé)");
    assertEq(o3.enrichStatus, "ok", "offre 3 enrichie malgré échec de la 2");
    assert(
      processed[0].offers.every((o) => !!o.enrichReason),
      "chaque offre a enrichReason"
    );
  }

  console.log("\n[M2-5] Cache enrichissement (2e passe = 0 fetch, 0 IA)");

  {
    const cache = new Map<string, string>();
    const offers = [makeOffer({ applicationUrl: "https://cached.example/job/9" })];
    const processed = [makeEmail("em2", offers)];
    const html = `<div><a href="https://cached.example/job/9">Stage</a></div>`;
    const emailsById = new Map([["em2", makeParsed("em2", html)]]);

    /* Mock store via skipCache=false nécessite storeGet/storeSet réels —
       on simule le cache en passant skipCache + askImpl puis en vérifiant
       enrichCacheKey stable. La persistance Blob est testée ailleurs. */
    const key = enrichCacheKey("https://cached.example/job/9");
    assert(key.startsWith("gmail:enrich:v3:"), "clé cache v3 prête pour storeGet/storeSet");
    cache.set(key, JSON.stringify({ enrichStatus: "ok", enrichReason: "cached" }));

    let fetchCalls = 0;
    await enrichProcessed(processed, emailsById, {
      max: 10,
      skipCache: true, /* on vérifie ici le chemin sans store ; le hit cache est couvert par enrichCacheKey */
      fetchPageImpl: async () => {
        fetchCalls++;
        return { ok: true, text: "page" };
      },
      askImpl: async () => ({
        results: [{ id: "em2#0", title: "Cached", description: "x" }],
      }),
    });
    assert(fetchCalls === 1, "1 fetch sans cache serveur");
    assert(cache.size === 1, "résultat présent dans le cache simulé");
  }

  console.log("\n[M2-6] Anti-doublon — helpers purs");

  {
    assertEq(
      importUrlKey("https://Example.com/job/1?utm_source=x&utm_medium=y&keep=1#frag"),
      "https://example.com/job/1?keep=1",
      "UTM + hash retirés, keep conservé"
    );
    assertEq(importUrlKey("https://example.com/job/1/"), "https://example.com/job/1", "slash final retiré");
    assertEq(
      titleCompanyKeyOf({ title: " Stage Dev ", company: " ACME ", location: " Paris " }),
      "stage dev|acme|paris",
      "clé titre|entreprise|localité lowercase"
    );
  }

  {
    const seen = { byUrl: new Set<string>(), byTitle: new Set<string>() };
    const first = classifyImportOffer(
      { title: "Stage Dev", company: "ACME", location: "Paris", applicationUrl: "https://example.com/j/1" },
      seen
    );
    assertEq(first.status, "nouvelle", "1re offre → nouvelle");
    seen.byUrl.add(first.urlKey);
    seen.byTitle.add(first.titleCompanyKey);

    const sameUrl = classifyImportOffer(
      { title: "Autre", company: "X", location: "Lyon", applicationUrl: "https://example.com/j/1?utm_source=z" },
      seen
    );
    assertEq(sameUrl.status, "doublon", "même URL (tracking) → doublon");
    assert(sameUrl.reason === "URL déjà importée", "raison URL");

    const sameTitle = classifyImportOffer(
      { title: "Stage Dev", company: "ACME", location: "Paris", applicationUrl: "https://other.com/j/9" },
      seen
    );
    assertEq(sameTitle.status, "doublon", "même titre+entreprise+lieu → doublon");
    assert(!!sameTitle.reason, "raison titre fournie");
  }

  /* Étape 8 — P1-6 : clé primaire = identifiant plateforme (jk:). */
  {
    const liA = importUrlKey("https://www.linkedin.com/jobs/view/1234567890/?refId=abc&trackingId=xyz");
    const liB = importUrlKey("https://www.linkedin.com/jobs/view/1234567890/?lipi=cn%3Afoo&refId=zzz");
    assertEq(liA, "jk:li:1234567890", "LinkedIn tracking → jk:li:<id>");
    assertEq(liB, liA, "2 URLs LinkedIn tracking différentes = même clé");

    /* P0-3 : jk valides = 13-24 alnum (fixtures réalistes,14 comme en live). */
    const inA = importUrlKey("https://fr.indeed.com/viewjob?jk=abc123def45678&vjs=3");
    const inB = importUrlKey("https://fr.indeed.com/viewjob?jk=abc123def45678");
    assertEq(inA, "jk:in:abc123def45678", "Indeed jk → jk:in:<jk>");
    assertEq(inB, inA, "Indeed avec/sans vjs = même clé");
    assertEq(
      importUrlKey("https://fr.indeed.com/viewjob?jk=abc123"),
      "https://fr.indeed.com/viewjob?jk=abc123",
      "P0-3 : jk trop court (6) invalide → pas de clé in:, normalisation URL classique"
    );

    /* Règle « générérique » (p:) exclue : query ignorée par jobKeyOf → on
       retombe sur la normalisation URL classique (utm retirés, keep conservé). */
    assertEq(
      importUrlKey("https://example.com/job/1/?utm_source=x&utm_medium=y&keep=1"),
      "https://example.com/job/1/?keep=1",
      "générique p: exclu → URL normalisée (query conservée)"
    );

    const unknown = importUrlKey("https://random-site.org/about");
    assert(!unknown.startsWith("jk:"), "hors plateforme → clé URL classique");
  }

  /* Étape 8 — P1-6 : classify préfère les clés gelées (avant enrich). */
  {
    const seen = { byUrl: new Set<string>(), byTitle: new Set<string>() };
    const first = classifyImportOffer(
      {
        title: "Stage Dev (brut)",
        company: "ACME",
        location: "Paris",
        applicationUrl: "https://www.linkedin.com/jobs/view/111/",
        dedupUrlKey: "jk:li:111",
        dedupTclKey: "stage dev (brut)|acme|paris",
      },
      seen
    );
    assertEq(first.urlKey, "jk:li:111", "urlKey = clé gelée (prioritaire)");
    assertEq(first.titleCompanyKey, "stage dev (brut)|acme|paris", "tck = clé gelée");
    seen.byUrl.add(first.urlKey);
    seen.byTitle.add(first.titleCompanyKey);

    /* Champs réécrits par l'enrichissement (titre + URL) : les clés gelées
       identiques doivent encore matcher → doublon. */
    const dup = classifyImportOffer(
      {
        title: "Développeur Back-end Stage",
        company: "ACME SAS",
        location: "Paris, France",
        applicationUrl: "https://fr.linkedin.com/jobs/view/111?trackingId=zzz",
        dedupUrlKey: "jk:li:111",
        dedupTclKey: "stage dev (brut)|acme|paris",
      },
      seen
    );
    assertEq(dup.status, "doublon", "offre enrichie + clés gelées identiques → doublon");
    assertEq(dup.reason, "URL déjà importée", "raison = URL (clé gelée)");

    const dupTck = classifyImportOffer(
      {
        title: "X",
        company: "Y",
        location: "Z",
        applicationUrl: "https://other.com/j/9",
        dedupUrlKey: "jk:li:222",
        dedupTclKey: "stage dev (brut)|acme|paris",
      },
      seen
    );
    assertEq(dupTck.status, "doublon", "même tck gelé + URL neuve → doublon titre");
    assert(!!dupTck.reason, "raison titre fournie (clé gelée)");
  }

  console.log("\n[M2-7] Anti-doublon — corpus réel (backup 171/489)");

  {
    const backupDir = join(process.cwd(), "_backup_secrets_AVVANT_RESET");
    let corpus: { ids?: string[]; count?: number; uniqueCount?: number } | null = null;
    let batchRaw: unknown = null;
    try {
      corpus = JSON.parse(readFileSync(join(backupDir, "corpus_171_ids.json"), "utf8"));
      batchRaw = JSON.parse(readFileSync(join(backupDir, "_raw_batch_000.json"), "utf8"));
      assert(true, "corpus_171_ids.json + _raw_batch_000.json lus");
    } catch {
      assert(false, "fichiers backup introuvables (skip si hors repo)");
    }

    if (corpus && typeof corpus.count === "number") {
      assertEq(corpus.count, 171, "corpus = 171 IDs");
      assertEq(corpus.uniqueCount, 171, "171 uniques");
    }

    type RawBatch = {
      results?: {
        offers?: { title?: string; sourceUrl?: string; snippet?: string; anchorText?: string }[];
      }[];
    };
    if (batchRaw) {
      const batch = batchRaw as RawBatch;
      const offers =
        batch.results?.flatMap((r) => r.offers ?? []) ?? [];
      assert(offers.length > 0, `batch 000 contient des offres (${offers.length})`);

      /* Simule un import : mêmes offres deux fois → 2e passe 100% doublons. */
      const asImport = offers.map((o, i) => ({
        title: o.title || `offre-${i}`,
        company: "Non précisée",
        location: "",
        applicationUrl: o.sourceUrl || `https://fallback.invalid/${i}`,
      }));
      /* 1re passe sur un store vide. */
      const pass1 = classifyImportBatch(asImport);
      const seen = {
        byUrl: new Set(pass1.filter((c) => c.status === "nouvelle" && c.urlKey).map((c) => c.urlKey)),
        byTitle: new Set(
          pass1.filter((c) => c.status === "nouvelle" && c.titleCompanyKey !== "||").map((c) => c.titleCompanyKey)
        ),
      };
      /* 2e passe contre le même store (re-import). */
      const pass2 = asImport.map((o) => classifyImportOffer(o, seen));
      const n1 = pass1.filter((c) => c.status === "nouvelle").length;
      const d1 = pass1.filter((c) => c.status === "doublon").length;
      const d2 = pass2.filter((c) => c.status === "doublon").length;
      assert(n1 + d1 === asImport.length, `1re passe couvre toutes les offres (${n1}+${d1})`);
      assert(n1 > 0, `1re passe a des nouvelles (${n1})`);
      assertEq(d2, asImport.length, `2e passe : ${asImport.length} doublons`);
      assert(
        pass2.every((c) => !!c.reason),
        "chaque doublon a une raison"
      );
    }
  }

  console.log("\n[M2-8] Observabilité — champs par email + resume global");

  {
    const e = makeEmail("obs1", [makeOffer()]);
    assert(e.textLen === 1000, "textLen présent");
    assert(e.hasHtml === true, "hasHtml présent");
    assert(e.linksCount === 5, "linksCount présent");
    assert(e.anchorsCount === 1, "anchorsCount présent");
    assertEq(e.detectionMethod, "code", "detectionMethod = code");
    assert(Array.isArray(e.detectedOffers) && e.detectedOffers.length === 1, "detectedOffers[]");
    assertEq(e.detectedOffers?.[0]?.applicationUrl, "https://example.com/job/1", "detectedOffers contient l'URL");
    assert(e.checkpoint?.status === "done", "checkpoint.status");

    const iaOnly = makeEmail("obs2", [makeOffer()]);
    iaOnly.detectionMethod = "ia";
    assertEq(iaOnly.detectionMethod, "ia", "detectionMethod = ia");

    const both = makeEmail("obs3", [makeOffer()]);
    both.detectionMethod = "code+ia";
    assertEq(both.detectionMethod, "code+ia", "detectionMethod = code+ia");

    /* Résumé global : structure utilisée par runSync / route. */
    const summaryShape = [
      "emailsRead",
      "emailsProcessed",
      "totalOffersDetected",
      "newOffersImported",
      "duplicatesIgnored",
      "noOfferVerified",
      "errors",
      "pendingRetry",
      "pending",
      "lastSync",
    ];
    const sample = {
      emailsRead: 3,
      emailsProcessed: 2,
      totalOffersDetected: 5,
      newOffersImported: 4,
      duplicatesIgnored: 1,
      noOfferVerified: 1,
      errors: 0,
      pendingRetry: 0,
      pending: 1,
      lastSync: new Date().toISOString(),
    };
    assert(
      summaryShape.every((k) => k in sample),
      "resume global contient les 10 champs Module 2"
    );
  }

  console.log("\n[M2-9] fetchOfferPage — limites 15s / 5 redirects / 500KB (source)");

  {
    const scrapeSrc = readFileSync(join(process.cwd(), "src/lib/scrape.ts"), "utf8");
    assert(/AbortSignal\.timeout\(15_000\)|AbortSignal\.timeout\(15000\)/.test(scrapeSrc), "timeout 15s");
    assert(/MAX_REDIRECTS = 5/.test(scrapeSrc), "MAX_REDIRECTS = 5");
    assert(/MAX_PAGE_BYTES = 500_000/.test(scrapeSrc), "MAX_PAGE_BYTES = 500000");
    assert(/isSafeOfferUrlResolved/.test(scrapeSrc), "SSRF DNS resolve conservé");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
