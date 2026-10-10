import assert from "node:assert/strict";
import { supabaseAuthHeaders, supabaseServerConfig, supabaseStorageError } from "./supabase-server";
import { storageMode, storeGet, storeSet, storeDel } from "./gmail-server";
import { loadSnapshot, saveSnapshot, deleteSnapshot } from "./gmail-snapshot";
import type { DashboardPayload } from "./gmail-dashboard";

async function main() {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const objects = new Map<string, string>();
  try {
    const secret = "sb_secret_test-only";
    assert.deepEqual(supabaseAuthHeaders(secret), { apikey: secret });
    const legacy = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
    assert.equal(supabaseAuthHeaders(legacy).Authorization, `Bearer ${legacy}`);
    assert.equal(supabaseServerConfig({ SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: legacy })?.key, legacy);
    assert.throws(() => supabaseServerConfig({ SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "public-key" }), /clé serveur/);
    assert.match(supabaseStorageError(400, "Unregistered API key").message, /clé serveur/);
    assert.match(supabaseStorageError(403).message, /droits/);
    process.env.SUPABASE_URL = "https://example.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = secret;
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.SUPABASE_BUCKET = "private-test";
    process.env.GMAIL_STORAGE_PROVIDER = "supabase";
    assert.equal(storageMode(), "supabase");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(storageMode, /non configuré/);
    process.env.GMAIL_STORAGE_PROVIDER = "auto";
    assert.throws(storageMode, /incomplète/);
    process.env.SUPABASE_SERVICE_ROLE_KEY = secret;
    globalThis.fetch = async (input, options) => {
      const path = String(input);
      const headers = new Headers(options?.headers);
      assert.equal(headers.get("apikey"), secret);
      assert.equal(headers.has("authorization"), false);
      if (options?.method === "POST") {
        assert.equal(headers.get("x-upsert"), "true");
        objects.set(path, String(options.body));
        return Response.json({ ok: true });
      }
      if (options?.method === "DELETE") { objects.delete(path); return Response.json({ ok: true }); }
      return objects.has(path) ? new Response(objects.get(path)) : Response.json({ message: "Object not found" }, { status: 400 });
    };
    await storeSet("test", "first");
    await storeSet("test", "updated");
    assert.equal(await storeGet("test"), "updated");
    await storeDel("test");
    assert.equal(await storeGet("test"), null);
    const payload = { ok: true, emails: Array.from({ length: 1200 }, (_, i) => ({ id: String(i), offers: [{ title: `Stage ${i}`, description: "Missions et compétences requises. ".repeat(100), keywords: ["Python", "SQL"] }] })) } as unknown as DashboardPayload;
    await saveSnapshot("catalogue@example.test", payload);
    assert.ok([...objects.values()].some(v => v.startsWith("gzip:v1:")));
    const loaded = await loadSnapshot("catalogue@example.test");
    assert.equal(loaded?.emails.length, 1200);
    assert.deepEqual(loaded?.emails[1199].offers, payload.emails[1199].offers);
    await saveSnapshot("catalogue@example.test", { ...payload, emails: [] });
    assert.equal((await loadSnapshot("catalogue@example.test"))?.emails.length, 1200, "empty refresh preserves saved offers");
    await deleteSnapshot("catalogue@example.test");
    assert.equal(await loadSnapshot("catalogue@example.test"), null);
    globalThis.fetch = async () => Response.json({ message: "Unregistered API key" }, { status: 401 });
    await assert.rejects(storeGet("test"), /clé serveur/);
    console.log("Stockage validé : clés secret/JWT, configuration stricte, création/mise à jour, erreurs et catalogue compressé de 1 200 offres.");
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of Object.keys(process.env)) if (!(name in originalEnv)) delete process.env[name];
    Object.assign(process.env, originalEnv);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
