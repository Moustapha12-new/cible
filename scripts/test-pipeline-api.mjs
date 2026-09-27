/* End-to-end API pipeline test: offer detail data → match → letter → Module 03 bridge.
   Uses only localhost APIs + pure helpers. Never prints secrets. */
import {
  offerBridgeKey,
  offerToOfferText,
  offerToDetectedOffer,
  saveCandidature,
  getCandidature,
  writeQuickAdapt,
  CANDIDATURE_STEPS,
  candidatureRank,
} from "../src/lib/gmail-bridge.ts";

const BASE = "http://localhost:3000";
const EMAIL = "moustaled.53@gmail.com";

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT " + msg);
  console.log("  ✓", msg);
}

async function main() {
  console.log("=== 1. status ===");
  const st = await fetch(`${BASE}/api/gmail/status?email=${encodeURIComponent(EMAIL)}`);
  const sj = await st.json();
  assert(sj.ok && sj.connected, "gmail connected");
  assert(sj.gmailAccount === EMAIL, "gmailAccount is 53");

  console.log("=== 2. dashboard ===");
  const dr = await fetch(`${BASE}/api/gmail/dashboard?email=${encodeURIComponent(EMAIL)}`);
  const dj = await dr.json();
  assert(dj.ok, "dashboard ok");
  assert((dj.emails?.length ?? 0) > 0, `emails > 0 (${dj.emails?.length ?? 0})`);
  const offers = (dj.emails || []).flatMap((e) => e.offers || []);
  assert(offers.length > 0, `offers > 0 (${offers.length})`);
  const enrichCounts = {};
  for (const o of offers) {
    const s = o.enrichStatus || "none";
    enrichCounts[s] = (enrichCounts[s] || 0) + 1;
  }
  console.log("  enrich:", enrichCounts);
  const okEnrich = offers.filter((o) => o.enrichStatus === "ok");
  const sample = okEnrich[0] || offers[0];
  const key = offerBridgeKey(sample);
  const offerText = offerToOfferText(sample);
  assert(offerText.length >= 30, `offerText >=30 (${offerText.length})`);
  console.log("  sample key:", key.slice(0, 40) + "…");
  console.log("  sample title:", sample.title);

  console.log("=== 3. offer detail page ===");
  const detailUrl = `${BASE}/app/alertes-gmail/offre?k=${encodeURIComponent(key)}`;
  const pr = await fetch(detailUrl);
  assert(pr.status === 200, `offre page HTTP ${pr.status}`);

  console.log("=== 4. AI match ===");
  const profile = {
    firstName: "Moustapha",
    lastName: "Distallo",
    title: "Développeur web",
    email: "m@example.com",
    phone: "0600000000",
    city: "Paris",
    skills: ["JavaScript", "React", "HTML", "CSS", "Node.js"],
    experiences: [{ title: "Dev", place: "Freelance", period: "2024-2026", detail: "Sites web" }],
    educations: [{ degree: "Bac+3", school: "Université", period: "2020-2023" }],
  };
  const matchRes = await fetch(`${BASE}/api/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: "match", profile, offerText }),
  });
  const mj = await matchRes.json();
  assert(mj.ok, "match ok");
  assert(typeof mj.result?.score === "number", `match score ${mj.result?.score}`);
  assert(Array.isArray(mj.result?.missing), "match missing array");

  console.log("=== 5. AI letter ===");
  const letterRes = await fetch(`${BASE}/api/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: "letter",
      profile,
      offerText,
      company: sample.company || "ACME",
      role: sample.title || "Poste",
    }),
  });
  const lj = await letterRes.json();
  assert(lj.ok, "letter ok");
  assert((lj.result?.body || "").length > 50, `letter body len ${(lj.result?.body || "").length}`);

  console.log("=== 6. candidature store shape (jsdom-free localStorage mock) ===");
  const store = new Map();
  (globalThis).window = {
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
  };
  const state = {
    key,
    status: "letter_ready",
    score: mj.result.score,
    present: mj.result.matched || [],
    missing: mj.result.missing || [],
    strategy: mj.result.strategy,
    letter: lj.result.body,
    updatedAt: new Date().toISOString(),
  };
  saveCandidature(EMAIL, state);
  const back = getCandidature(EMAIL, key);
  assert(back?.status === "letter_ready", "candidature status letter_ready");
  assert(back?.letter?.length > 50, "candidature letter persisted");
  assert(candidatureRank("sent") === 3, "pipeline sent rank 3");
  assert(CANDIDATURE_STEPS.length === 4, "4 pipeline steps");

  console.log("=== 7. DetectedOffer bridge ===");
  const det = offerToDetectedOffer(sample, mj.result.score);
  assert(det.text.length >= 30, "detected offer text");
  assert(det.title.length > 0, "detected offer title");

  console.log("=== 8. Module 03 bridge (writeQuickAdapt) ===");
  writeQuickAdapt(offerText, mj.result.missing || [], {
    title: sample.title,
    company: sample.company,
    location: sample.location,
    salary: sample.salary,
    summary: sample.summary,
    keywords: sample.keywords,
    source: sample.source,
    url: sample.applicationUrl,
    match: mj.result.score,
  });
  const qa = JSON.parse(store.get("cible:quick-adapt") || "null");
  assert(qa && typeof qa.offerText === "string" && qa.offerText.length >= 30, "quick-adapt offerText");
  assert(Array.isArray(qa.selected), "quick-adapt selected array");
  assert(qa.meta?.title === sample.title, "quick-adapt meta.title");
  assert(typeof qa.meta?.match === "number", "quick-adapt meta.match score");
  assert(Array.isArray(qa.meta?.keywords), "quick-adapt meta.keywords");

  const withSummary = offers.filter((o) => typeof o.summary === "string" && o.summary.trim().length > 0);
  console.log(`  summary present: ${withSummary.length}/${offers.length} (rempli au prochain enrich v2)`);

  console.log("\nALL PIPELINE API TESTS PASSED");
  console.log(JSON.stringify({
    emails: dj.emails.length,
    offers: offers.length,
    enrichCounts,
    withSummary: withSummary.length,
    matchScore: mj.result.score,
    letterLen: (lj.result.body || "").length,
    sampleTitle: sample.title,
    module03: { offerTextLen: qa.offerText.length, match: qa.meta.match },
  }, null, 2));
}

main().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
