import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { emptyData, loadData, getOrCreateData, saveData } from "./data";
import { isCompleteOffer } from "./offer-quality";
import { pfeEligibility } from "./pfe-target";
import { withGmailAccount } from "./gmail-account";
import { runSync, enrichProcessed, type ProcessedEmail } from "./gmail-core";
import { loadSnapshot, saveSnapshot } from "./gmail-snapshot";
import { storeSet } from "./gmail-server";

const results: { name: string; passed: boolean; reason?: string }[] = [];
async function check(name: string, work: () => unknown | Promise<unknown>) {
  try { await work(); results.push({ name, passed: true }); }
  catch (e) { results.push({ name, passed: false, reason: e instanceof Error ? e.message : String(e) }); }
}
const full = { title: "Stage ingénieur électricité", contract: "Stage", location: "Bordeaux, France", duration: "6 mois", startDate: "2027-02", description: "Conception et dimensionnement des installations électriques basse tension pour les infrastructures de transport, rédaction des dossiers techniques et simulation avec CANECO BT.", missions: ["Dimensionner les installations électriques basse tension"], skills: ["CANECO BT"] };
async function main() {
  await check("Offre exploitable sans rubrique prérequis", () => assert.equal(isCompleteOffer(full), true));
  for (const [name, offer, status] of [
    ["ingénieur compatible", full, "eligible"],
    ["technicien", { ...full, title: "Stage technicien électrique" }, "excluded"],
    ["alternance", { ...full, contract: "Alternance" }, "excluded"],
    ["CDI", { ...full, contract: "CDI" }, "excluded"],
    ["durée inconnue", { ...full, duration: "" }, "verify"],
    ["durée six en lettres", { ...full, duration: "six mois" }, "eligible"],
    ["début en mars 2027 (politique « à partir de début 2027 »)", { ...full, startDate: "2027-03" }, "eligible"],
    ["début en septembre 2027 (politique « à partir de début 2027 »)", { ...full, startDate: "2027-09" }, "eligible"],
    ["nucléaire", { ...full, title: "Stage ingénieur nucléaire", description: "Études des réacteurs nucléaires" }, "eligible"],
    ["renouvelable", { ...full, title: "Stage ingénieur photovoltaïque" }, "eligible"],
    ["maintenance industrielle", { ...full, title: "Stage ingénieur maintenance industrielle", description: "Maintenance industrielle et fiabilisation des équipements", skills: ["GMAO"] }, "eligible"],
    ["automatisme", { ...full, title: "Stage ingénieur automatisme" }, "eligible"],
    ["gaz", { ...full, title: "Stage ingénieur réseau gaz", description: "Étude des réseaux de gaz", skills: ["Simulation"] }, "eligible"],
    ["localisation inconnue", { ...full, location: "" }, "verify"],
    ["hors France", { ...full, location: "Dubaï" }, "excluded"],
  ] as [string, Parameters<typeof pfeEligibility>[0], string][]) await check(`PFE ${name}`, () => assert.equal(pfeEligibility(offer).status, status));

  const local = new Map<string, string>(); let readFails = false; let writeFails = false;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (k: string) => { if (readFails) throw Error("read denied"); return local.get(k) ?? null; }, setItem: (k: string, v: string) => { if (writeFails) throw Error("quota"); local.set(k, v); } }, dispatchEvent: () => {} } });
  const email = "student@example.test";
  const data = { ...emptyData("Étudiant Test", email), v: 2, originalCv: { name: "Maître", text: "CV maître privé de test" }, cvs: [{ id: "adapted", name: "CV adapté", file: "cv.pdf", date: "2026-10-08" }], dossiers: { job: { cvText: "Adapté", letterText: "Lettre", notes: "Notes", updatedAt: "" } }, applications: [{ id: "application", company: "Test", role: "Stage", status: "sent" as const, daysAgo: 0, source: "Test", cvText: "CV envoyé immuable", letterText: "Lettre envoyée" }] };
  await check("Migration locale même compte conserve CV/dossiers/candidatures et copie ancienne", () => {
    local.set(`cible:data:${email}`, JSON.stringify(data)); const migrated = loadData(email)!;
    assert.deepEqual(migrated.originalCv, data.originalCv); assert.deepEqual(migrated.cvs, data.cvs); assert.deepEqual(migrated.dossiers, data.dossiers);
    assert.equal(migrated.applications[0].cvText, data.applications[0].cvText); assert.ok(local.has(`cible:data:${email}`));
    assert.equal(loadData("other@example.test"), null);
  });
  await check("Dossier corrompu conservé, création vide refusée", () => {
    const key = "cible:data:v2:corrupt@example.test"; local.set(key, "{broken");
    assert.throws(() => getOrCreateData("Test", "corrupt@example.test")); assert.equal(local.get(key), "{broken");
  });
  await check("Lecture locale refusée ne crée pas un dossier vide", () => {
    const before = local.get(`cible:data:v2:${email}`); readFails = true;
    try { assert.throws(() => getOrCreateData("Test", email)); } finally { readFails = false; }
    assert.equal(local.get(`cible:data:v2:${email}`), before);
  });
  await check("Quota local garde le dossier précédent", () => {
    const before = local.get(`cible:data:v2:${email}`); writeFails = true;
    try { assert.throws(() => saveData(email, emptyData("Test", email))); } finally { writeFails = false; }
    assert.equal(local.get(`cible:data:v2:${email}`), before);
  });
  await check("Dossier JSON structure invalide non remplacé", () => {
    const key = "cible:data:v2:invalid@example.test"; const value = JSON.stringify({ v: 2, originalCv: { text: "À récupérer" } }); local.set(key, value);
    assert.throws(() => getOrCreateData("Test", "invalid@example.test")); assert.equal(local.get(key), value);
  });

  process.env.SUPABASE_URL = "https://validation.invalid"; process.env.SUPABASE_SECRET_KEY = "sb_secret_fixture";
  const objects = new Map<string, string>(); const reads: string[] = []; let interruptSecondCheckpoint = false;
  const html = '<h2>Stage ingénieur électrique</h2><p>Entreprise A · Paris</p><a href="https://www.linkedin.com/jobs/view/1234567890">Stage ingénieur électrique</a><h2>Stage ingénieur nucléaire</h2><p>Entreprise B · Bordeaux</p><a href="https://www.linkedin.com/jobs/view/1234567891">Stage ingénieur nucléaire</a>';
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json"); const url = new URL(req.url!, "http://fixture");
    if (url.pathname.endsWith("/messages")) res.end(JSON.stringify({ messages: [{ id: "mail1" }, { id: "mail2" }], resultSizeEstimate: 2 }));
    else { const id = url.pathname.split("/").pop()!; reads.push(id); res.end(JSON.stringify({ id, payload: { mimeType: "text/html", headers: [{ name: "Subject", value: "Deux offres de stage" }], body: { data: Buffer.from(html).toString("base64url") } } })); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const port = (server.address() as { port: number }).port;
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "gmail.googleapis.com") return nativeFetch(`http://127.0.0.1:${port}${url.pathname}${url.search}`, init);
    assert.equal(url.hostname, "validation.invalid", "unexpected real access forbidden");
    if (init?.method === "POST") {
      if (interruptSecondCheckpoint && url.pathname.includes("gmail:processed:") && url.pathname.endsWith(":mail2")) throw new Error("Injected storage interruption");
      objects.set(url.pathname, String(init.body)); return Response.json({});
    }
    return objects.has(url.pathname) ? new Response(objects.get(url.pathname)) : Response.json({ message: "Object not found" }, { status: 404 });
  };
  try {
    await check("Gmail HTTP synthétique : plusieurs offres et reprise après arrêt d’un lot", () => withGmailAccount(email, async () => {
      const opts = { accessToken: "fixture", label: { id: "test", name: "test" }, skipAi: true, skipEnrich: true, maxProcess: 1, userKey: email };
      const first = await runSync(opts); assert.equal(first.emails[0].offers.length, 2); assert.equal(first.emails[0].id, "mail1");
      const second = await runSync({ ...opts, completedEmailIds: ["mail1"] }); assert.equal(second.emails[0].id, "mail2"); assert.equal(second.emails[0].offers.length, 2);
      assert.equal(reads.filter(id => id === "mail1").length, 1, "saved messages not read again");
    }));
    await check("Reprise après exception de stockage au deuxième checkpoint : premier message conservé", async () => {
      const owner = "interrupted@example.test";
      const opts = { accessToken: "fixture", label: { id: "test", name: "test" }, skipAi: true, skipEnrich: true, maxProcess: 2, userKey: owner };
      interruptSecondCheckpoint = true;
      try { await assert.rejects(withGmailAccount(owner, () => runSync(opts)), /Injected storage interruption/); }
      finally { interruptSecondCheckpoint = false; }
      const previousReads = reads.filter(id => id === "mail1").length;
      const resumed = await withGmailAccount(owner, () => runSync({ ...opts, completedEmailIds: ["mail1"] }));
      assert.equal(resumed.emails[0].id, "mail2"); assert.equal(resumed.emails[0].offers.length, 2);
      assert.equal(reads.filter(id => id === "mail1").length, previousReads);
      assert.ok([...objects.entries()].some(([key,value]) => key.includes("gmail:processed:") && key.endsWith(":mail1") && JSON.parse(value).status === "done"));
    });
    await check("Ancien catalogue lu sans effacement, faux complet rétrogradé, propriétaire isolé", async () => {
      const legacy = { ok: true, emails: [{ id: "old", offers: [{ title: "Stage", description: "Ancienne description", enrichStatus: "ok" }] }] };
      await storeSet(`gmail:snapshot:${email}`, JSON.stringify(legacy)); const loaded = await loadSnapshot(email);
      assert.equal(loaded?.emails[0].offers[0].enrichStatus, "partial"); assert.equal(loaded?.emails[0].offers[0].description, "Ancienne description");
      assert.equal(await loadSnapshot("other@example.test"), null);
      await saveSnapshot(email, { ok: true, emails: [] } as never); assert.equal((await loadSnapshot(email))?.emails.length, 1);
      assert.equal([...objects.values()].includes(JSON.stringify(legacy)), true);
    });
    await check("Catalogue JSON corrompu non remplacé même par une nouvelle extraction", async () => {
      await storeSet("gmail:snapshot:corrupt@example.test", "{broken");
      await assert.rejects(saveSnapshot("corrupt@example.test", { ok: true, emails: [{ id: "new", offers: [] }] } as never));
      assert.ok([...objects.values()].includes("{broken"));
    });
    for (const mode of ["complete", "partial", "impossible"] as const) await check(`Enrichissement ${mode}`, async () => {
      const item = { id: "enrich", isOffer: true, subject: "Stage", offers: [{ ...full, skills: [], description: "", missions: [], applicationUrl: "https://example.test/job", source: "Test" }] } as unknown as ProcessedEmail;
      await enrichProcessed([item], new Map(), { skipCache: true, max: 1, fetchPageImpl: async () => mode === "impossible" ? { ok: false, reason: "Accès impossible" } : { ok: true, text: full.description }, askImpl: async () => ({ results: [{ id: "enrich#0", ...full, ...(mode === "complete" ? {} : { description: "", missions: [], skills: [] }), duration: "", salary: "", deadline: "", prerequisites: [], profile: "" }] }) });
      assert.equal(item.offers[0].enrichStatus, mode === "complete" ? "ok" : mode === "impossible" ? "blocked" : "partial");
      assert.equal(item.offers[0].salary || "", ""); assert.equal(item.offers[0].deadline || "", "");
    });
  } finally { globalThis.fetch = nativeFetch; await new Promise<void>(resolve => server.close(() => resolve())); }
  console.log(JSON.stringify({ results, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length }, null, 2));
  if (results.some(r => !r.passed)) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
