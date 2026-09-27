/* Tests Module 1 — gmail-core : askJson résilient (JSON tronqué + 429/backoff).
   Exécution : npx tsx src/lib/gmail-core.test.ts
   Pas de framework de test dans le projet (scripts one-off). */

import {
  recoverJson,
  askJsonRaw,
  backoffDelay,
  resolveModels,
  shouldProcessEmail,
  classifyFailure,
  matchRealUrl,
  applyIndeedTargets,
  migrateIndeedOffers,
  buildEnrichCandidates,
  fetchLabelEmails,
  runSync,
  processEmail,
  sanitizeAiOffers,
  splitEmailForAi,
  loadCheckpoint,
  saveCheckpoint,
  beginCheckpointCache,
  endCheckpointCache,
  MAX_EMAIL_RETRIES,
  type EmailCheckpoint,
  type FetchLike,
  type ProcessedEmail,
} from "./gmail-core";
import { normalizeUrl } from "./gmail-client";
import { gzipSync } from "node:zlib";
import {
  acquireSyncLock,
  releaseSyncLock,
  isSyncLockFresh,
  storeSet,
  type SimpleKv,
} from "./gmail-server";
import { isGmailQuotaError, pickGmailDisplayAddress, type ParsedEmail } from "./gmail-server";

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function geminiBody(text: string) {
  return { candidates: [{ content: { parts: [{ text: text }] } }] };
}

async function main() {
  /* ── 1. recoverJson ───────────────────────────────────────────── */

  console.log("\n[1] recoverJson — JSON tronqué / fences / partiel");

  {
    const full = { results: [{ id: "a", isOffer: true, offers: [{ title: "Dev" }] }] };
    const r = recoverJson<typeof full>(JSON.stringify(full));
    assert(r !== null && r.partial === false, "JSON valide → partial=false");
    assertEq(r?.data, full, "JSON valide → data intact");
  }

  {
    const fenced = '```json\n{"results":[{"id":"x","isOffer":true}]}\n```';
    const r = recoverJson<{ results: unknown[] }>(fenced);
    assert(r !== null && r.partial === false, "fences ```json → parse direct");
    assertEq(r?.data.results.length, 1, "fences → 1 result");
  }

  {
    const truncated =
      '{"results":[{"id":"1a0cd67c5331ac38","isOffer":true,"reason":"ok","offers":[{"title":"Stage Dev Fullstack","company":"ACME","location":"Paris","contract":"Stage","duration":"6 mois","deadline":"","skills":["React","Node"],"description":"Build features","applicationUrl":"https://example.com/jobs/1"';
    type TruncShape = { results?: { id?: string; offers?: unknown[] }[] };
    const r = recoverJson<TruncShape>(truncated);
    assert(r !== null, "JSON tronqué → recovery non-null");
    assert(r?.partial === true, "JSON tronqué → partial=true");
    const results0 = r?.data.results;
    assert(Array.isArray(results0) && results0.length >= 1, "recovery → results[0] présent");
    const first = Array.isArray(results0) ? results0[0] : undefined;
    assert(!!first && first.id === "1a0cd67c5331ac38", "recovery → id préservé");
  }

  {
    const openStr = '{"results":[{"id":"abc","offers":[{"title":"St';
    const r = recoverJson<{ results?: unknown[] }>(openStr);
    assert(r !== null && r.partial === true, "chaîne ouverte → recovery partial");
    assert(Array.isArray(r?.data.results), "chaîne ouverte → results tableau");
  }

  {
    const r = recoverJson("pas du du tout { [");
    assert(r === null || typeof r.data === "object", "texte invalide → null ou objet (pas de throw)");
  }

  {
    const r = recoverJson("");
    assert(r === null, "empty string → null");
  }

  /* ── 2. askJsonRaw : 429 → backoff → succès ──────────────────── */

  console.log("\n[2] askJsonRaw — 429 backoff exponentiel + bascule modèle");

  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-key-not-real";

  {
    const sleeps: number[] = [];
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls++;
      if (calls <= 2) return jsonResponse({ error: "rate limited" }, 429);
      return jsonResponse(geminiBody('{"ok":true,"n":3}'));
    };
    const sleepImpl = async (ms: number) => {
      sleeps.push(ms);
    };

    const r = await askJsonRaw<{ ok: boolean; n: number }>("prompt", "system", {
      fetchImpl,
      sleepImpl,
      models: ["model-a"],
    });

    assert(r.partial === false, "429×2 puis 200 → partial=false");
    assertEq(r.data, { ok: true, n: 3 }, "429×2 puis 200 → data correct");
    assert(calls === 3, `3 appels HTTP (2×429 + 1×200), obtenu ${calls}`);
    assertEq(sleeps, [1000, 2000], "backoff 1s puis 2s (pas de sleep avant 1er appel)");
  }

  {
    const sleeps: number[] = [];
    let callsA = 0;
    let callsB = 0;
    const fetchImpl: FetchLike = async (url) => {
      if (url.includes("model-a")) {
        callsA++;
        return jsonResponse({ error: "quota" }, 429);
      }
      callsB++;
      return jsonResponse(geminiBody('{"from":"b"}'));
    };
    const sleepImpl = async (ms: number) => {
      sleeps.push(ms);
    };

    const r = await askJsonRaw<{ from: string }>("prompt", "system", {
      fetchImpl,
      sleepImpl,
      models: ["model-a", "model-b"],
    });

    assert(r.data.from === "b", "bascule modèle → data du modèle B");
    assert(callsA === 3, `modèle A = 3 attempts (429), obtenu ${callsA}`);
    assert(callsB === 1, `modèle B = 1 appel, obtenu ${callsB}`);
    assert(
      sleeps.length >= 2 && sleeps[0] === 1000 && sleeps[1] === 2000,
      `backoff A = [1000, 2000], obtenu [${sleeps.join(", ")}]`
    );
  }

  {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls++;
      if (calls === 1) return new Response("unavailable", { status: 503 });
      return jsonResponse(geminiBody('{"ok":1}'));
    };
    const sleeps: number[] = [];
    const r = await askJsonRaw<{ ok: number }>("p", "s", {
      fetchImpl,
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
      models: ["m"],
    });
    assert(r.data.ok === 1 && calls === 2, "503 puis 200 → succès en 2 appels");
    assertEq(sleeps, [1000], "503 → backoff 1s avant retry");
  }

  {
    const truncated = '{"results":[{"id":"e1","offers":[{"title":"Stage';
    const fetchImpl: FetchLike = async () => jsonResponse(geminiBody(truncated));
    const r = await askJsonRaw<{ results?: unknown[] }>("p", "s", {
      fetchImpl,
      sleepImpl: async () => {},
      models: ["m"],
    });
    assert(r.partial === true, "200 + JSON tronqué → partial=true");
    assert(Array.isArray(r.data.results), "recovery → results présent");
  }

  {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls++;
      return jsonResponse({ error: "bad request" }, 400);
    };
    let threw = false;
    let msg = "";
    try {
      await askJsonRaw("p", "s", {
        fetchImpl,
        sleepImpl: async () => {},
        models: ["m"],
      });
    } catch (e) {
      threw = true;
      msg = e instanceof Error ? e.message : String(e);
    }
    assert(threw, "HTTP 400 → throw");
    assert(calls === 1, `HTTP 400 → 1 seul appel (pas de retry), obtenu ${calls}`);
    assert(/HTTP 400/.test(msg), "erreur contient HTTP 400");
  }

  {
    const fetchImpl: FetchLike = async () => jsonResponse(geminiBody(""));
    let threw = false;
    let msg = "";
    try {
      await askJsonRaw("p", "s", {
        fetchImpl,
        sleepImpl: async () => {},
        models: ["m"],
      });
    } catch (e) {
      threw = true;
      msg = e instanceof Error ? e.message : String(e);
    }
    assert(threw, "réponse vide → throw");
    assert(/vide|JSON|Aucun/i.test(msg), `message clair, obtenu: ${msg.slice(0, 80)}`);
  }

  /* ── 3. Helpers purs ──────────────────────────────────────────── */

  console.log("\n[3] Helpers — backoff, models, checkpoints, URL guards");

  assertEq(backoffDelay(0), 0, "backoff attempt 0 = 0");
  assertEq(backoffDelay(1), 1000, "backoff attempt 1 = 1000");
  assertEq(backoffDelay(2), 2000, "backoff attempt 2 = 2000");
  assertEq(backoffDelay(3), 4000, "backoff attempt 3 = 4000");
  assertEq(backoffDelay(9), 4000, "backoff attempt 9 = plafond 4000");

  {
    const models = resolveModels("custom-model");
    assert(models[0] === "custom-model", "resolveModels priorise l'env");
    assert(models.length >= 2, "resolveModels a des fallbacks");
    assert(models.includes("gemini-3.1-flash-lite"), "fallback flash-lite présent");
    assert(new Set(models).size === models.length, "pas de doublons");
  }

  {
    const base: EmailCheckpoint = {
      status: "done",
      offers: [],
      at: "",
      retries: 0,
    };
    assert(shouldProcessEmail(null) === true, "pas de checkpoint → traiter");
    assert(shouldProcessEmail({ ...base, status: "done" }) === false, "done → skip");
    assert(shouldProcessEmail({ ...base, status: "pending" }) === true, "pending → traiter");
    assert(
      shouldProcessEmail({ ...base, status: "pending_retry" }) === true,
      "pending_retry → traiter"
    );
    assert(
      shouldProcessEmail({ ...base, status: "error", retries: 1 }) === true,
      "error retries=1 → rejeu"
    );
    assert(
      shouldProcessEmail({ ...base, status: "error", retries: MAX_EMAIL_RETRIES }) === false,
      `error retries=${MAX_EMAIL_RETRIES} → définitif (skip)`
    );
  }

  {
    const c429 = classifyFailure(null, "Gemini gemini-3.1-flash-lite HTTP 429");
    assertEq(c429.status, "pending_retry", "429 → pending_retry");
    assertEq(c429.retries, 1, "429 → retries=1");

    const c429b = classifyFailure(c429, "HTTP 429");
    assertEq(c429b.status, "pending_retry", "429 encore → pending_retry");

    const cErr = classifyFailure(null, "JSON invalide après recovery");
    assertEq(cErr.status, "error", "autre erreur → error");
    assertEq(cErr.retries, 1, "autre erreur → retries=1");

    const cFinal = classifyFailure({ ...cErr, retries: MAX_EMAIL_RETRIES - 1 }, "boom");
    assertEq(cFinal.retries, MAX_EMAIL_RETRIES, `retries atteint ${MAX_EMAIL_RETRIES}`);
    assertEq(cFinal.status, "error", "atteint max → error définitif");
  }

  {
    const real = [
      "https://www.linkedin.com/jobs/view/123/",
      "https://fr.indeed.com/viewjob?jk=abc",
    ];
    assert(matchRealUrl("https://www.linkedin.com/jobs/view/123/", real) !== null, "match exact");
    assert(
      matchRealUrl("https://www.linkedin.com/jobs/view/123?utm_source=x", real) !== null,
      "match avec tracking retiré"
    );
    assert(
      matchRealUrl("https://evil.example.com/steal", real) === null,
      "URL absente du mail → null (règle d'or)"
    );
    assert(matchRealUrl("", real) === null, "empty → null");

    /* P0 enrich : pont canonique ↔ URL brute du mail via clé plateforme. */
    const rawComm = ["https://www.linkedin.com/comm/jobs/view/4470469053/?trackingId=xyz"];
    assert(
      matchRealUrl("https://www.linkedin.com/jobs/view/4470469053/", rawComm) === rawComm[0],
      "match par clé plateforme (canonique ↔ /comm/ tracking)"
    );
    assert(
      matchRealUrl("https://fr.indeed.com/viewjob?jk=f1e2d3c4b5a697", [
        "https://fr.indeed.com/rc/clk/dl?jk=f1e2d3c4b5a697&from=ja",
      ]) !== null,
      "match Indeed viewjob → rc/clk via jk (14 car. valides, P0-3)"
    );
  }

  /* P0 enrich : une offre canonique reste candidate même si le mail ne
     contient que l'URL de tracking /comm/. */
  {
    const html = `<a href="https://www.linkedin.com/comm/jobs/view/9876543210/?trk=email">Dev Backend</a>`;
    const email: ParsedEmail = {
      id: "e-enrich",
      subject: "Alerte offres",
      from: "alertes@linkedin.com",
      receivedAt: "2026-09-25T10:00:00.000Z",
      text: "Offre Dev Backend chez ACME à Paris.",
      html,
      links: ["https://www.linkedin.com/comm/jobs/view/9876543210/?trk=email"],
    };
    const emailsById = new Map<string, ParsedEmail>([[email.id, email]]);
    const processed = [
      {
        id: email.id,
        isOffer: true,
        offers: [
          {
            title: "Dev Backend",
            company: "ACME",
            applicationUrl: "https://www.linkedin.com/jobs/view/9876543210/",
            source: "LinkedIn",
          },
        ],
      },
    ] as unknown as ProcessedEmail[];
    const cands = buildEnrichCandidates(processed, emailsById);
    assert(
      cands.length === 1,
      `enrich candidate conservée (canonique ↔ tracking), obtenu ${cands.length}`
    );
  }

  /* normalizeUrl (gmail-client) : les params utm_* sont bien retirés. */
  {
    assert(
      normalizeUrl("https://x.com/j/1?utm_source=a&utm_medium=b&fbclid=z") === "https://x.com/j/1",
      "normalizeUrl retire utm_* et fbclid"
    );
    assert(
      normalizeUrl("https://x.com/j/1?keep=this&utm_campaign=c") ===
        "https://x.com/j/1?keep=this",
      "normalizeUrl garde les params non-trackers"
    );
  }

  /* Étape 3 — verrou anti-double-run (TTL 300 s, token-safe). */
  {
    const mem = new Map<string, string>();
    const kv: SimpleKv = {
      get: async (k) => mem.get(k) ?? null,
      set: async (k, v) => void mem.set(k, v),
      del: async (k) => void mem.delete(k),
    };
    const t1 = await acquireSyncLock("u@test.com", kv, 1_000);
    assert(t1 !== null, "verrou acquise au premier essai");
    const t2 = await acquireSyncLock("u@test.com", kv, 2_000);
    assert(t2 === null, "2e acquire refusé pendant le run");
    assert(
      !isSyncLockFresh(JSON.stringify({ at: 1_000, token: "x" }), 1_000 + 300_000),
      "verrou expiré exactement au TTL 300 s"
    );
    assert(
      isSyncLockFresh(JSON.stringify({ at: 1_000, token: "x" }), 1_000 + 299_000),
      "verrou encore frais avant le TTL"
    );
    if (t1) await releaseSyncLock("u@test.com", t1, kv);
    const t3 = await acquireSyncLock("u@test.com", kv, 3_000);
    assert(t3 !== null, "verrou acquise après release");
    await releaseSyncLock("u@test.com", "autre-token", kv);
    assert(
      (await acquireSyncLock("u@test.com", kv, 4_000)) === null,
      "release avec token étranger ignoré"
    );
  }

  /* Étape 3 — flag truncated : plafond MAX_MESSAGES (500) remonté. */
  {
    const origFetch = globalThis.fetch;
    let idsSet: string[] = Array.from({ length: 550 }, (_, i) => `m${i}`);
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const meta = {
      subject: "Alerte offres",
      from: "alertes@x.com",
      receivedAt: "2026-09-25T10:00:00.000Z",
    };
    globalThis.fetch = (async (input: string) => {
      const url = String(input);
      if (url.includes("/messages?")) {
        const token = new URL(url).searchParams.get("pageToken");
        const start = token ? Number(token) : 0;
        const slice = idsSet.slice(start, start + 100);
        const next = start + 100 < idsSet.length ? String(start + 100) : "";
        return json({
          messages: slice.map((id) => ({ id })),
          nextPageToken: next,
          resultSizeEstimate: idsSet.length,
        });
      }
      return json({});
    }) as typeof fetch;
    try {
      const big = await fetchLabelEmails("tok", { id: "Label_1" }, {
        resolveMode: () => "skip",
        metaFor: () => meta,
        getDelayMs: 0,
      });
      assert(big.truncated === true, "550 ids > plafond 500 → truncated=true");
      assert(
        big.emails.length === 500,
        `plafond appliqué (500 max), obtenu ${big.emails.length}`
      );
      assert(big.total >= 550, `total (~550) conservé, obtenu ${big.total}`);

      idsSet = Array.from({ length: 150 }, (_, i) => `s${i}`);
      const small = await fetchLabelEmails("tok", { id: "Label_1" }, {
        resolveMode: () => "skip",
        metaFor: () => meta,
        getDelayMs: 0,
      });
      assert(small.truncated === false, "150 ids → truncated=false");
      assert(small.emails.length === 150, "150/150 lus sans troncature");
    } finally {
      globalThis.fetch = origFetch;
    }
  }

  /* Étape 3 — deadline murale → interrupted + remaining exact. */
  {
    const origFetch = globalThis.fetch;
    const ids5 = ["d1", "d2", "d3", "d4", "d5"];
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    globalThis.fetch = (async (input: string) => {
      const url = String(input);
      if (url.includes("/messages?")) {
        return json({ messages: ids5.map((id) => ({ id })), resultSizeEstimate: 5 });
      }
      if (url.includes("/messages/")) {
        return json({
          id: "x",
          internalDate: "1789000000000",
          payload: {
            mimeType: "text/plain",
            headers: [
              { name: "Subject", value: "Alerte stage" },
              { name: "From", value: "bot@x.com" },
              { name: "Date", value: "Thu, 25 Sep 2026 10:00:00 +0000" },
            ],
            body: { data: "" },
          },
        });
      }
      return json({});
    }) as typeof fetch;
    try {
      const out = await runSync({
        accessToken: "tok",
        label: { id: "Label_1", name: "Stages – Alertes offres" },
        skipAi: true,
        skipEnrich: true,
        deadlineMs: 1,
        fetchImpl: (async () => json({})) as FetchLike,
      });
      assert(out.interrupted === true, "deadline dépassée → interrupted=true");
      assert(
        out.remaining === 5,
        `remaining = 5 non traités, obtenu ${out.remaining}`
      );
      assert(out.summary.emailsProcessed === 0, "0 e-mail traité avant interruption");
      assert(out.truncated === false, "libellé non tronqué → truncated=false");
    } finally {
      globalThis.fetch = origFetch;
    }
  }

  {
    const offers = sanitizeAiOffers([
      {
        title: "A",
        company: "X",
        location: "",
        contract: "",
        duration: "",
        deadline: "",
        skills: ["a"],
        description: "",
        applicationUrl: "https://x",
        source: "LinkedIn",
      },
      null,
      "not-an-object",
      { title: 123, company: null },
    ]);
    assert(
      offers.length === 2,
      `sanitize garde 2 offres valides (rejette null/string), obtenu ${offers.length}`
    );
    assert(offers[0].title === "A" && offers[1].title === "", "champs non-string assainis");
  }

  {
    const short = "a".repeat(1000);
    assertEq(splitEmailForAi(short).length, 1, "texte court → 1 segment");
    const long = "paragraphe.\n\n".repeat(4000);
    const parts = splitEmailForAi(long);
    assert(parts.length === 2, `texte >40k → 2 segments, obtenu ${parts.length}`);
    assert(
      parts[0].length + parts[1].length === long.length,
      "recomposition = longueur originale"
    );
  }

  {
    assert(
      isGmailQuotaError("Gmail API error 403: Total Query Cost exceeded"),
      "403 Total Query Cost → quota"
    );
    assert(isGmailQuotaError("Gmail API error 429: rate limit"), "429 → quota");
    assert(!isGmailQuotaError("Gmail API error 404: not found"), "404 ≠ quota");
    assert(
      pickGmailDisplayAddress("moustaled.53@gmail.com", "moustaled.ibr.dj@gmail.com", "app@x") ===
        "moustaled.53@gmail.com",
      "display priorise le profil"
    );
    assert(
      pickGmailDisplayAddress("moustaled.ibr.dj@gmail.com", "moustaled.53@gmail.com", "a@b") ===
        "moustaled.53@gmail.com",
      "display ignore l'adresse migrée ibr"
    );
    assert(
      pickGmailDisplayAddress(null, null, "moustaled.ibr.dj@gmail.com") === undefined,
      "display ne renvoie jamais l'ancienne ibr seule"
    );
    assert(
      pickGmailDisplayAddress(null, null, "moustaled.53@gmail.com") === "moustaled.53@gmail.com",
      "display fallback sur le compte app"
    );
  }

  /* Étape 6 — P1-3 : cache checkpoints borné (write-through + end() fraîcheur). */
  {
    const id = "cachetest1";
    const key = `gmail:processed:${id}`;
    await storeSet(key, JSON.stringify({ status: "done", offers: [], at: "t0", retries: 0 }));
    beginCheckpointCache();
    try {
      const a = await loadCheckpoint(id);
      assert(a?.status === "done", "cache : lecture initiale depuis le store");
      await saveCheckpoint(id, { ...(a as EmailCheckpoint), status: "pending" });
      const c = await loadCheckpoint(id);
      assert(c?.status === "pending", "saveCheckpoint write-through (pas de relecture store)");
      await storeSet(key, JSON.stringify({ status: "error", offers: [], at: "t1", retries: 3 }));
      const b = await loadCheckpoint(id);
      assert(b?.status === "pending", "pendant le run : valeur en cache (poison store ignoré)");
    } finally {
      endCheckpointCache();
    }
    const d = await loadCheckpoint(id);
    assert(d?.status === "error", "endCheckpointCache → lecture fraîche du store");
    await storeSet(key, "");
  }

  {
    const id = "cachetest2";
    const key = `gmail:processed:${id}`;
    beginCheckpointCache();
    try {
      const a = await loadCheckpoint(id);
      assert(a === null, "cache : absent → null");
      await storeSet(key, JSON.stringify({ status: "done", offers: [], at: "t0", retries: 0 }));
      const b = await loadCheckpoint(id);
      assert(b === null, "pendant le run : null caché (pas de ré-ingestion silencieuse)");
    } finally {
      endCheckpointCache();
    }
    const c = await loadCheckpoint(id);
    assert(c?.status === "done", "hors run : écriture externe visible");
    await storeSet(key, "");
  }

  /* P0-1 : réparation heuristique à la lecture (mojibake + entités) et
     re-synchronisation forcée si le texte reste irréparable. */
  {
    const id = `repair-${Date.now()}`;
    const key = `gmail:processed:${id}`;
    const mojibakeSubject = Buffer.from("Alerte stages développement", "utf8").toString("latin1");
    await storeSet(
      key,
      JSON.stringify({
        status: "done",
        offers: [
          {
            title: "Ing&#xE9;nieur stage",
            company: Buffer.from("Café Associé", "utf8").toString("latin1"),
            location: "Paris",
            contract: "Stage",
            duration: "",
            deadline: "",
            skills: [Buffer.from("réseaux", "utf8").toString("latin1")],
            applicationUrl: "https://example.com/j/1",
          },
        ],
        at: "t0",
        retries: 0,
        subject: mojibakeSubject,
        isOffer: true,
      })
    );
    const cp = await loadCheckpoint(id);
    assert(cp?.subject === "Alerte stages développement", "P0-1 : subject mojibake réparé à la lecture");
    assert(cp?.offers[0]?.title === "Ingénieur stage", "P0-1 : entière hexa de l'offre réparée");
    assert(cp?.offers[0]?.company === "Café Associé", "P0-1 : company mojibake réparée");
    assert(cp?.offers[0]?.skills?.[0] === "réseaux", "P0-1 : skill mojibake réparé");
    assert(cp?.status === "done", "P0-1 : réparé → statut done inchangé");

    /* Irréparable (octets perdus → U+FFFD) sur un done → re-sync forcé. */
    const id2 = `repair-broken-${Date.now()}`;
    const key2 = `gmail:processed:${id2}`;
    await storeSet(
      key2,
      JSON.stringify({
        status: "done",
        offers: [],
        at: "t0",
        retries: 0,
        subject: "Objet \uFFFD\uFFFD illisible",
      })
    );
    const cp2 = await loadCheckpoint(id2);
    assert(cp2?.status === "pending", "P0-1 : texte irréparable → status pending (re-sync forcé)");
    assert(
      (cp2?.reason ?? "").includes("re-synchronisation forcée"),
      "P0-1 : raison explicite de re-sync forcée"
    );
    await storeSet(key, "");
    await storeSet(key2, "");
  }

  /* Étape 6 — P1-4 : filtres buildEnrichCandidates (ok/blocked/retryOnly). */
  {
    const html = `<a href="https://www.linkedin.com/jobs/view/111/">Dev</a>`;
    const email: ParsedEmail = {
      id: "e-filt",
      subject: "Alerte offres",
      from: "alertes@linkedin.com",
      receivedAt: "2026-09-25T10:00:00.000Z",
      text: "Stage Dev ACME Paris",
      html,
      links: ["https://www.linkedin.com/jobs/view/111/"],
    };
    const emailsById = new Map([[email.id, email]]);
    const mk = (enrichStatus?: string) => ({
      title: "Dev",
      company: "ACME",
      applicationUrl: "https://www.linkedin.com/jobs/view/111/",
      source: "LinkedIn",
      ...(enrichStatus ? { enrichStatus } : {}),
    });
    const processed = [
      { id: email.id, isOffer: true, offers: [mk("ok"), mk("blocked"), mk("partial"), mk()] },
    ] as unknown as ProcessedEmail[];
    const norm = buildEnrichCandidates(processed, emailsById);
    assert(
      norm.length === 2,
      `normal : ok + blocked exclus, obtenu ${norm.length}`
    );
    const retry = buildEnrichCandidates(processed, emailsById, { retryOnly: true });
    assert(
      retry.length === 3,
      `retryOnly : blocked re-tenté (ok seul exclu), obtenu ${retry.length}`
    );
    const noHtml = new Map<string, ParsedEmail>();
    const rel = buildEnrichCandidates(processed, noHtml, { retryOnly: true });
    assert(
      rel.length === 3,
      `retryOnly sans html (vue checkpoint) : preuve réelle non re-filtrée, obtenu ${rel.length}`
    );
  }

  /* Étape 6 — P1-5 : échec IA partiel → error (jamais done) + retries. */
  {
    const parsed: ParsedEmail = {
      id: "p15",
      subject: "Alerte stages du jour",
      from: "alertes@linkedin.com",
      receivedAt: "2026-09-25T10:00:00.000Z",
      text: "Stage Dev ACME Paris",
      html: `<a href="https://www.linkedin.com/jobs/view/12345">Stage Dev</a>`,
      links: ["https://www.linkedin.com/jobs/view/12345"],
    };
    const pr = await processEmail(parsed, {
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: "bad" }), { status: 400 })) as FetchLike,
    });
    assert(
      pr.finalStatus === "detected",
      "code ≥ 1 offre → détecté malgré l'IA en échec (P1-5)"
    );
    assert(
      typeof pr.error === "string" && pr.error.length > 0,
      "error IA propagé sur l'e-mail"
    );
    assert(
      pr.reason.includes("échec"),
      `reason signale l'échec IA, obtenu : ${pr.reason}`
    );
    const cp = await loadCheckpoint("p15");
    assert(cp?.status === "error", `checkpoint = error (jamais done), obtenu ${cp?.status}`);
    assert((cp?.retries ?? 0) === 1, `retries incrémenté, obtenu ${cp?.retries}`);

    const okRun = await processEmail(parsed, { skipAi: true });
    const cp2 = await loadCheckpoint("p15");
    assert(okRun.finalStatus === "detected", "sans IA (skipAi) → détecté");
    assert(cp2?.status === "done", "sans IA (skipAi) → done");
    await storeSet("gmail:processed:p15", "");
  }

  /* Étape 8 — P1-6 : clés anti-doublon gelées AU MOMENT de la détection
     (avant enrichissement, qui réécrit titre/entreprise/URL). */
  {
    const parsed: ParsedEmail = {
      id: "p16",
      subject: "Alerte stages",
      from: "alertes@linkedin.com",
      receivedAt: "2026-09-25T11:00:00.000Z",
      text: "Stage Dev ACME Paris",
      html: `<a href="https://www.linkedin.com/jobs/view/998877/">Stage Dev chez ACME</a>`,
      links: ["https://www.linkedin.com/jobs/view/998877/"],
    };
    const pr = await processEmail(parsed, { skipAi: true });
    const o = pr.offers[0];
    assert(!!o, "offre détectée (gel des clés)");
    assertEq(o?.dedupUrlKey, "jk:li:998877", "dedupUrlKey gelée = identifiant plateforme");
    assert(
      !o?.company.trim() || typeof o?.dedupTclKey === "string",
      "dedupTclKey gelée dès que company non vide"
    );
    if (o) {
      const frozenUrl = o.dedupUrlKey;
      const frozenTck = o.dedupTclKey;
      /* Simule l'enrichissement : muter les champs ne doit PAS réécrire les clés. */
      o.title = "Titre réécrit par l'IA";
      o.company = "ACME SAS (enrichie)";
      o.applicationUrl = "https://www.linkedin.com/jobs/view/998877/?lipi=x";
      assertEq(o.dedupUrlKey, frozenUrl, "clé URL gelée stable malgré mutation enrich");
      assertEq(o.dedupTclKey, frozenTck, "clé tck gelée stable malgré mutation enrich");
    }
    await storeSet("gmail:processed:p16", "");
  }

  /* Étape 6 — P1-4 : run enrichOnly (relaunch_offer) = re-tente bloquées,
     zéro détection, résultat enrichi persisté. */
  {
    const origFetch = globalThis.fetch;
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const cpKey = "gmail:processed:eo1";
    await storeSet(
      cpKey,
      JSON.stringify({
        status: "done",
        subject: "Alerte offres",
        from: "bot@x.com",
        receivedAt: "2026-09-25T10:00:00.000Z",
        at: "2026-09-25T10:05:00.000Z",
        retries: 0,
        isOffer: true,
        reason: "Traité (checkpoint)",
        detectedByCode: 1,
        offers: [
          {
            title: "Stage Dev",
            company: "ACME",
            location: "Paris",
            contract: "Stage",
            duration: "6 mois",
            deadline: "",
            skills: [],
            description: "",
            applicationUrl: "https://www.hellowork.com/fr/fr/jobs/stage-dev-123.html",
            source: "HelloWork",
            enrichStatus: "blocked",
            enrichReason: "anti-robot",
          },
        ],
      })
    );
    globalThis.fetch = (async (input: string) => {
      const url = String(input);
      if (url.includes("/messages?")) {
        return json({ messages: [{ id: "eo1" }], resultSizeEstimate: 1 });
      }
      return json({});
    }) as typeof fetch;
    try {
      const out = await runSync({
        accessToken: "tok",
        label: { id: "Label_1", name: "Stages – Alertes offres" },
        onlyEmailIds: ["eo1"],
        enrichOnly: true,
        enrichOpts: {
          skipCache: true,
          fetchPageImpl: async () => ({
            ok: true,
            text: "Page annonce complète Stage Dev ACME Paris.",
          }),
          askImpl: async () => ({
            results: [{ id: "eo1#0", title: "Stage Dev", company: "ACME", location: "Paris" }],
          }),
        },
      });
      assert(
        out.checkpointStats.processedThisRun === 0,
        "enrichOnly : 0 e-mail re-détecté"
      );
      assert(out.emailsRead === 1, `enrichOnly : lecture seule du cp, obtenu ${out.emailsRead}`);
      const er = out.enrichRetry;
      assert(er !== undefined && er.tried === 1, `enrichRetry tenté = 1, obtenu ${er?.tried}`);
      assert(
        er?.okNow === 1 && er?.stillBlocked === 0,
        `enrichRetry ok = 1 / blocked = 0, obtenu ${JSON.stringify(er)}`
      );
      assert(
        out.emails[0]?.offers[0]?.enrichStatus === "ok",
        "offre enrichie en mémoire"
      );
      const cp = await loadCheckpoint("eo1");
      assert(
        cp?.offers[0]?.enrichStatus === "ok",
        "offre enrichie persistée dans le checkpoint"
      );
    } finally {
      globalThis.fetch = origFetch;
      await storeSet(cpKey, "");
    }
  }

  /* P0-3 : applyIndeedTargets — résolution / éjection / indirect, 100% hors ligne. */
  {
    const mk = (u: string) =>
      "https://cts.indeed.com/v3/" + gzipSync(Buffer.from(JSON.stringify({ u }), "utf8")).toString("base64url");
    const base = {
      title: "Stage H/F",
      company: "ACME",
      location: "",
      contract: "",
      duration: "",
      deadline: "",
      skills: [] as string[],
      description: "",
      applicationUrl: "",
      source: "Indeed",
    };

    const jk = "f1e2d3c4b5a697";
    const r1 = applyIndeedTargets([{ ...base, applicationUrl: mk(`https://fr.indeed.com/viewjob?jk=${jk}`) }]);
    assert(r1.length === 1 && r1[0].applicationUrl === `https://fr.indeed.com/viewjob?jk=${jk}`, "cts→jk = viewjob résolu, obtenu " + JSON.stringify(r1[0]?.applicationUrl));
    assert(r1[0] && !r1[0].indirect, "jk résolu = pas indirect");

    const r2 = applyIndeedTargets([{ ...base, applicationUrl: mk("https://fr.indeed.com/pagead/clk?jrtk=abc123def456") }]);
    assert(r2.length === 1 && r2[0].applicationUrl === "https://fr.indeed.com/pagead/clk?jrtk=abc123def456", "cts→pagead = u complet conservé");
    assert(r2[0] && r2[0].indirect === true, "pagead = indirect");

    const r3 = applyIndeedTargets([{ ...base, applicationUrl: mk("https://subscriptions.indeed.com/optout?co=FR") }]);
    assert(r3.length === 0, "cts→optout chrome = offre éjectée");

    const r4 = applyIndeedTargets([{ ...base, applicationUrl: "https://cts.indeed.com/v3/H4sIAAAA_tronque" }]);
    assert(r4.length === 1 && r4[0].indirect === true, "cts indécodable = conservé + indirect");

    const r5 = applyIndeedTargets([{ ...base, applicationUrl: "https://engage.indeed.com/f/a/tok~~/x~/y" }]);
    assert(r5.length === 1 && r5[0].indirect === true, "engage offre = indirect");

    const r6 = applyIndeedTargets([{ ...base, title: "Se désabonner", applicationUrl: "https://engage.indeed.com/f/a/un~~/x~/y" }]);
    assert(r6.length === 0, "engage titre chrome = éjecté");

    const r7 = applyIndeedTargets([{ ...base, title: "", applicationUrl: "https://engage.indeed.com/f/a/nv~~/x~/y" }]);
    assert(r7.length === 1 && r7[0].indirect === true, "engage titre vide = conservé (pas d'éjection aveugle)");

    const r8 = applyIndeedTargets([{ ...base, applicationUrl: "https://fr.indeed.com/pagead/clk/dl?from=x&jrtk=z" }]);
    assert(r8.length === 1 && r8[0].indirect === true, "pagead seul = indirect");

    const r9 = applyIndeedTargets([{ ...base, applicationUrl: "https://www.linkedin.com/jobs/view/123/" }]);
    assert(r9.length === 1 && !r9[0].indirect, "linkedin intact (non-Indeed jamais touché)");

    const r10 = applyIndeedTargets([{ ...base, applicationUrl: "https://fr.indeed.com/viewjob?jk=f1e2d3c4b5a697" }]);
    assert(r10.length === 1 && !r10[0].indirect, "viewjob jk valide = direct, inchangé");
  }

  console.log("P0-3 : migrateIndeedOffers — migration à la lecture des checkpoints");
  {
    const mk = (u: string) =>
      "https://cts.indeed.com/v3/" + gzipSync(Buffer.from(JSON.stringify({ u }), "utf8")).toString("base64url");
    const base = {
      title: "Stage Data Engineer H/F",
      company: "ACME",
      location: "",
      contract: "",
      duration: "",
      deadline: "",
      skills: [] as string[],
      description: "",
      source: "Indeed",
    };

    const pageadUrl = "https://fr.indeed.com/pagead/clk?from=jobi2a_jobmatch-fr-FR_email&jrtk=5-cmh1-1-1k395t5roit2v800";
    const m1 = migrateIndeedOffers([{ ...base, applicationUrl: mk(pageadUrl), dedupUrlKey: "" }]);
    assert(m1.length === 1 && m1[0].applicationUrl === pageadUrl, "checkpoint cts → pagead décodé");
    assert(m1[0].indirect === true, "checkpoint cts → indirect");
    assert(!!m1[0].dedupUrlKey, "clé dédup recalculée sur URL remplacée, obtenu " + JSON.stringify(m1[0].dedupUrlKey));

    const m2 = migrateIndeedOffers([{ ...base, applicationUrl: mk("https://subscriptions.indeed.com/optout?co=FR") }]);
    assert(m2.length === 0, "checkpoint cts → chrome optout éjecté");

    const engageUrl = "https://engage.indeed.com/f/a/tok~~/x~/y";
    const m3 = migrateIndeedOffers([{ ...base, applicationUrl: engageUrl }]);
    assert(m3.length === 1 && m3[0].indirect === true, "checkpoint engage → indirect");
    const m4 = migrateIndeedOffers(m3);
    assert(m4[0].indirect === true && m4[0].applicationUrl === engageUrl, "migration idempotente");

    const m5 = migrateIndeedOffers([
      { ...base, applicationUrl: "https://fr.indeed.com/viewjob?jk=f1e2d3c4b5a697", dedupUrlKey: "jk:in:f1e2d3c4b5a697" },
    ]);
    assert(m5[0].dedupUrlKey === "jk:in:f1e2d3c4b5a697", "URL inchangée → clé figée préservée");

    const m6 = migrateIndeedOffers([{ ...base, title: "Se désabonner de cette alerte Emploi", applicationUrl: engageUrl }]);
    assert(m6.length === 0, "checkpoint engage au titre chrome → éjecté");

    assert(migrateIndeedOffers([]).length === 0, "offres vides → inchangé");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
