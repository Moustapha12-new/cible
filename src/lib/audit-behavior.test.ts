import assert from "node:assert/strict";
import { isCompleteOffer, validateOfferQuality } from "./offer-quality";
import { isCacheableEnrichResult } from "./gmail-enrich";
import { calculateAtsScore, saveCheckpoint } from "./gmail-core";
import { pfeEligibility } from "./pfe-target";
import { acquireSyncLock, releaseSyncLock, fetchLabelEmails } from "./gmail-server";
import { withGmailAccount } from "./gmail-account";
const complete = { title: "Stage ingénieur électrique", description: "Conception et dimensionnement des installations électriques basse tension dans les projets de transport et rédaction des dossiers techniques détaillés.", missions: ["Dimensionner les installations électriques basse tension"], skills: ["CANECO BT"], prerequisites: ["Préparation d’un diplôme Bac+5 en génie électrique"], contract: "Stage", duration: "6 mois", location: "Paris", startDate: "2027-02" };
async function main() {
  assert.equal(isCompleteOffer({ title: "Stage" }), false);
  for (const field of ["description", "missions", "skills"] as const) assert.equal(isCompleteOffer({ ...complete, [field]: undefined }), false, field);
  assert.equal(isCompleteOffer({ ...complete, prerequisites: undefined }), true, "prerequisites not required when missions/skills are usable");
  assert.equal(isCompleteOffer(complete), true);
  assert.equal(validateOfferQuality({ ...complete, missions: [], enrichStatus: "ok" }).enrichStatus, "partial");
  assert.equal(isCacheableEnrichResult({ enrichStatus: "ok", enrichReason: "", data: { title: "Stage" } }), false);
  assert.equal(isCacheableEnrichResult({ enrichStatus: "ok", enrichReason: "", data: complete }), true);
  assert.equal(isCacheableEnrichResult({ enrichStatus: "partial", enrichReason: "", data: complete }), false);
  assert.equal(calculateAtsScore(["Git"], "digital"), 0);
  assert.equal(calculateAtsScore(["génie électrique"], "Génie électrique"), 100);
  assert.equal(pfeEligibility(complete).status, "eligible");
  for (const title of ["Alternance ingénieur électricité", "CDI ingénieur énergie", "Stage technicien électrique"]) assert.equal(pfeEligibility({ ...complete, title }).status, "excluded", title);
  assert.equal(pfeEligibility({ ...complete, duration: "3 mois" }).status, "excluded");
  assert.equal(pfeEligibility({ ...complete, startDate: "2027-03" }).status, "verify");
  assert.equal(pfeEligibility({ ...complete, location: "Dubaï" }).status, "excluded");
  assert.equal(pfeEligibility({ ...complete, location: undefined }).status, "verify");
  assert.equal(pfeEligibility({ title: "Stage ingénieur énergie" }).status, "verify");
  for (const title of ["Stage ingénieur nucléaire électricité", "Stage ingénieur photovoltaïque", "Stage ingénieur réseaux électriques", "Stage ingénieur hydrogène", "Stage ingénieur thermique", "Stage ingénieur batteries"]) assert.equal(pfeEligibility({ ...complete, title }).status, "eligible", title);
  await assert.rejects(acquireSyncLock("fixture@example.test", { get: async () => { throw new Error("offline"); }, set: async () => {}, del: async () => {} }), /Verrou indisponible/);
  process.env.SUPABASE_URL = "https://fixture.invalid";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_fixture";
  process.env.GMAIL_MAX_MESSAGES = "2000";
  const objects = new Map<string, string>();
  let lease: string | null = null;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "fixture.invalid") {
      if (url.pathname.endsWith("cible_take_sync_lease")) {
        const body = JSON.parse(String(init?.body)); const taken = !lease;
        if (taken) lease = body.p_token;
        return Response.json(taken);
      }
      if (url.pathname.endsWith("cible_release_sync_lease")) {
        if (JSON.parse(String(init?.body)).p_token === lease) lease = null;
        return Response.json(null);
      }
      if (init?.method === "POST") { objects.set(url.pathname, String(init.body)); return Response.json({}); }
      return objects.has(url.pathname) ? new Response(objects.get(url.pathname)) : Response.json({ message: "Object not found" }, { status: 404 });
    }
    assert.equal(url.hostname, "gmail.googleapis.com", "no real provider traffic");
    if (url.pathname.endsWith("/messages")) {
      const start = Number(url.searchParams.get("pageToken") || 0); const end = Math.min(start + 100, 2050);
      return Response.json({ messages: Array.from({ length: end - start }, (_, i) => ({ id: `m${start + i}` })), nextPageToken: end < 2050 ? String(end) : undefined, resultSizeEstimate: 2050 });
    }
    return Response.json({ id: url.pathname.split("/").pop(), payload: { headers: [], body: { data: Buffer.from("Stage ingénieur énergie").toString("base64url") } } });
  };
  const token = await acquireSyncLock("fixture@example.test"); assert.ok(token);
  assert.equal(await acquireSyncLock("fixture@example.test"), null);
  await releaseSyncLock("fixture@example.test", "foreign-token");
  assert.equal(await acquireSyncLock("fixture@example.test"), null);
  await releaseSyncLock("fixture@example.test", token);
  assert.ok(await acquireSyncLock("fixture@example.test"));
  await withGmailAccount("fixture@example.test", async () => {
    const completed = Array.from({ length: 2000 }, (_, i) => `m${i}`);
    const run = () => fetchLabelEmails("fixture", { id: "label" }, { excludeIds: completed, maxFullMessages: 1, getDelayMs: 0 });
    assert.equal((await run()).emails[0].id, "m2000", "historical cursor crosses the 2000-message window");
    assert.equal([...objects.values()][0], "2000");
    assert.equal((await run()).emails[0].id, "m2000", "unfinished messages stay on the same window");
    await fetchLabelEmails("fixture", { id: "label" }, { excludeIds: Array.from({ length: 2050 }, (_, i) => `m${i}`), getDelayMs: 0 });
    assert.equal([...objects.values()][0], "", "completed archive resets cursor for new arrivals");
  });
  globalThis.fetch = async () => { throw new Error("storage offline fixture"); };
  await assert.rejects(saveCheckpoint("fixture-email", { status: "done", offers: [], retries: 0, at: "" }), /offline/);
  console.log("Audit: strict completeness/cache, PFE mixed corpus, phrase matching, lock/storage failures passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
