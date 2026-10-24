import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { emptyData, mergeUserData, type UserData } from "./data";
import { SESSION_COOKIE } from "./auth-server";

/* Parcours réel revu de bout en bout contre les VRAIES routes :
   1. offre ajoutée manuellement (POST /api/offres/manual)
   2. « J'ai envoyé ce CV » (POST /api/candidatures/apply)
   3. retour sur Mes offres : le push local de la page (POST /api/user-data)
   Contrôle négatif : l'ancien push (état local non fusionné) effaçait la
   candidature archivée — c'est exactement le bug signalé.
   Puis le nouveau push fusionné : la candidature doit SURVIVRE. */

async function main() {
  // Le marqueur « server-only » n'existe pas hors du runtime Next : stub local.
  const nodeModule = (await import("node:module")) as unknown as { Module?: { _load: (request: string, parent: unknown, isMain: boolean) => unknown }; default?: { _load: (request: string, parent: unknown, isMain: boolean) => unknown } };
  const ModuleCtor = (nodeModule.Module || nodeModule.default) as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
  const originalLoad = ModuleCtor._load;
  ModuleCtor._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, parent, isMain);
  };

  // PostgreSQL WASM exécute le SQL original ; Auth/PostgREST/Storage = fixtures.
  const { PGlite } = createRequire(import.meta.url)(join(process.cwd(), ".validation-tools/node_modules/@electric-sql/pglite"));
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(readFileSync("docs/security-rpc.sql", "utf8"));
  const users: Record<string, { id: string; email: string }> = {
    alice: { id: "11111111-1111-4111-8111-111111111111", email: "alice@example.test" },
  };
  process.env.SUPABASE_URL = "https://cible-fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_fixture";

  const objects = new Map<string, Uint8Array>();
  const nativeFetch = globalThis.fetch;
  const nativeNow = Date.now;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "cible-fixture.invalid");
    if (url.pathname.endsWith("/auth/v1/user")) {
      const token = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") || "";
      const user = users[token];
      return user
        ? new Response(JSON.stringify({ ...user, email_confirmed_at: "2026-01-01", user_metadata: {} }), { status: 200, headers: { "Content-Type": "application/json" } })
        : new Response("{}", { status: 401, headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname.includes("/rpc/")) {
      const body = JSON.parse(String(init?.body)); let query: string; let args: unknown[];
      if (url.pathname.endsWith("cible_take_quota")) { query = "select cible_take_quota($1,$2) as value"; args = [body.p_key, body.p_limit]; }
      else { assert.ok(url.pathname.endsWith("cible_save_user_data")); query = "select cible_save_user_data($1,$2,$3) as value"; args = [body.p_user_id, body.p_version, body.p_data]; }
      const row = (await db.query(query, args)).rows[0] as { value: unknown };
      return new Response(JSON.stringify(row.value ?? null), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname.includes("/storage/v1/object/")) {
      const key = decodeURIComponent(url.pathname.split("/storage/v1/object/")[1] || "");
      if (init?.method === "POST") { objects.set(key, new Uint8Array(init.body as unknown as ArrayLike<number>)); return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }); }
      const bytes = objects.get(key);
      if (!bytes) return new Response("Not found", { status: 404 });
      return new Response(Buffer.from(bytes), { status: 200, headers: { "Content-Type": "application/pdf" } });
    }
    if (url.pathname.includes("/cible_user_data")) {
      const owner = url.searchParams.get("user_id")?.replace("eq.", "");
      const rows = (await db.query("select data,version,updated_at from cible_user_data where user_id=$1", [owner])).rows;
      return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Fixture fetch inattendue : ${url.pathname}`);
  };

  try {
    // Routes réelles (import après le stub server-only).
    const { POST: manualPost } = await import("../app/api/offres/manual/route");
    const { POST: applyPost } = await import("../app/api/candidatures/apply/route");
    const { GET: userDataGet, POST: userDataPost } = await import("../app/api/user-data/route");
    const { putDocument } = await import("./document-storage");

    const origin = "https://cible.test";
    const req = (method: string, path: string, body?: unknown) =>
      new NextRequest(`${origin}${path}`, {
        method,
        headers: { origin, cookie: `${SESSION_COOKIE}=alice`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const readRecord = async (): Promise<{ data: UserData; version: number }> => {
      const json = await (await userDataGet(req("GET", "/api/user-data"))).json();
      assert.equal(json.ok, true);
      return json.record as { data: UserData; version: number };
    };

    // ── 1. Offre ajoutée manuellement (vraie route) ──
    const rawOffer = {
      id: "manual-test-flow",
      title: "Stage PFE - Assistant Chargé de Projet Exploitation Énergie H/F",
      company: "Groupe NGE",
      text: "Poste : Stage PFE - Assistant Chargé de Projet Exploitation Énergie. Entreprise : Groupe NGE. Lieu : Issy-les-Moulineaux. Les missions du poste participer à la construction et à la rénovation d'infrastructures au service des territoires.",
      keywords: [],
    };
    const manualRes = await manualPost(req("POST", "/api/offres/manual", { offer: rawOffer }));
    const manualJson = await manualRes.json();
    assert.equal(manualRes.status, 200, JSON.stringify(manualJson));
    assert.equal(manualJson.ok, true);
    const offer = manualJson.offer as { id: string };
    assert.ok(offer.id.startsWith("manual-"));
    let record = await readRecord();
    assert.equal(record.data.offers.length, 1, "l'offre manuelle est au serveur");
    assert.equal(record.data.applications.length, 0);

    // ── 2. « J'ai envoyé ce CV » (vraie route apply, PDF réellement stocké) ──
    const pdfBytes = new Uint8Array(Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n"));
    const sha256 = createHash("sha256").update(pdfBytes).digest("hex");
    const documentId = "doc-test-flow-1";
    const versionId = "ver-test-flow-1";
    await putDocument(users.alice.id, documentId, versionId, pdfBytes, "application/pdf");
    const applyBody = {
      offer: { ...offer, text: rawOffer.text, source: "Ajout manuel" },
      documentId, versionId, sha256, fileName: "Moustapha_IBRAHIM_Energie_NGE.pdf",
      cvText: "MOUSTAPHA IBRAHIM DIAMA - Élève-ingénieur énergie",
    };
    const applyRes = await applyPost(req("POST", "/api/candidatures/apply", applyBody));
    const applyJson = await applyRes.json();
    assert.equal(applyRes.status, 200, JSON.stringify(applyJson));
    assert.equal(applyJson.ok, true);
    const applicationId = applyJson.application.id as string;
    record = await readRecord();
    assert.equal(record.data.applications.length, 1, "la candidature est archivée côté serveur");
    assert.equal(record.data.applications[0].cvName, "Moustapha_IBRAHIM_Energie_NGE.pdf");

    // ── 3a. CONTRÔLE NÉGATIF : l'ANCIEN push de la page offres écrasait ──
    // (état local complet envoyé tel quel, sans la candidature archivée)
    const localNext: UserData = { ...emptyData("Alice", users.alice.email), offers: [{ ...offer, text: rawOffer.text } as UserData["offers"][number]] };
    const before = await readRecord();
    const oldPush = await userDataPost(req("POST", "/api/user-data", { data: localNext, version: before.version }));
    assert.equal(oldPush.status, 200, "l'ancien push passait bien (c'est le bug)");
    record = await readRecord();
    assert.equal(record.data.applications.length, 1, "le serveur protège la candidature même face à un ancien client sans fusion");
    console.log("Régression corrigée : une sauvegarde locale incomplète ne supprime plus la candidature archivée.");

    // ── 3b. Ré-archivage, puis NOUVEAU push (logique fusionnée de la page) ──
    const reapplyJson = await (await applyPost(req("POST", "/api/candidatures/apply", applyBody))).json();
    assert.equal(reapplyJson.ok, true, JSON.stringify(reapplyJson));
    const reAppId = reapplyJson.application.id as string;
    record = await readRecord();
    assert.equal(record.data.applications.length, 1);
    const fresh = await readRecord();
    const merged = mergeUserData(fresh.data, localNext);
    const newPush = await userDataPost(req("POST", "/api/user-data", { data: merged, version: fresh.version }));
    const newPushJson = await newPush.json();
    assert.equal(newPush.status, 200, JSON.stringify(newPushJson));
    assert.equal(newPushJson.version, fresh.version + 1);

    // ── VÉRIFICATION FINALE : la candidature SURVIT au retour sur Mes offres ──
    record = await readRecord();
    assert.equal(record.data.applications.length, 1, "LA CANDIDATURE EST TOUJOURS LÀ après le push fusionné");
    assert.ok(record.data.applications.some(a => a.id === reAppId), "la candidature archivée est toujours la même");
    assert.ok(record.data.applications.some(a => a.offerId === offer.id), "candidature liée à l'offre manuelle présente");
    assert.equal(record.data.applications[0].cvText, "MOUSTAPHA IBRAHIM DIAMA - Élève-ingénieur énergie", "le CV envoyé est conservé");
    assert.equal(record.data.offers.length, 1, "l'offre manuelle est toujours là");
    assert.equal(record.data.offers[0].id, offer.id);

    // Idempotence : re-« J'ai envoyé ce CV » avec le même PDF n double pas.
    const again = await applyPost(req("POST", "/api/candidatures/apply", applyBody));
    const againJson = await again.json();
    assert.equal(again.status, 200);
    assert.equal(againJson.alreadySaved, true);
    record = await readRecord();
    assert.equal(record.data.applications.length, 1, "pas de doublon de candidature");

    Date.now = () => nativeNow() + 120_000;
    const twentyFive = { ...record.data, applications: Array.from({ length: 25 }, (_, i) => ({ ...record.data.applications[0], id: `app-${i}`, offerId: `offer-${i}` })) };
    assert.equal((await userDataPost(req("POST", "/api/user-data", { data: twentyFive, version: record.version }))).status, 200);
    const full = await readRecord();
    const incomplete = { ...full.data, applications: full.data.applications.slice(0, 11) };
    assert.equal((await userDataPost(req("POST", "/api/user-data", { data: incomplete, version: full.version }))).status, 200);
    const preserved = await readRecord();
    assert.deepEqual(preserved.data.applications, full.data.applications, "une sauvegarde de 11 ne peut supprimer les autres candidatures ni leurs CV");
    assert.equal((await userDataPost(req("POST", "/api/user-data", { data: incomplete, version: full.version }))).status, 409, "une version périmée est refusée");
    console.log("Sauvegarde partielle de 11 candidatures : toutes les candidatures et tous les CV serveur conservés ; conflit concurrent refusé.");

    console.log("Parcours complet OK : offre manuelle → envoi CV → sauvegarde incomplète bloquée → push fusionné → candidature préservée, pas de doublon.");
  } finally {
    globalThis.fetch = nativeFetch;
    Date.now = nativeNow;
    await db.close();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
