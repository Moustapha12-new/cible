import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/user-data/route";
import { emptyData } from "./data";
import { SESSION_COOKIE } from "./auth-server";

async function main() {
  // PostgreSQL WASM executes the original SQL; only Auth/PostgREST transport is a fixture.
  const { PGlite } = await import(join(process.cwd(), ".validation-tools/node_modules/@electric-sql/pglite"));
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(readFileSync("docs/security-rpc.sql", "utf8"));
  const users: Record<string, { id: string; email: string }> = {
    alice: { id: "11111111-1111-4111-8111-111111111111", email: "alice@example.test" },
    bob: { id: "22222222-2222-4222-8222-222222222222", email: "bob@example.test" },
  };
  process.env.SUPABASE_URL = "https://user-data-fixture.invalid"; process.env.SUPABASE_SECRET_KEY = "sb_secret_fixture";
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.hostname, "user-data-fixture.invalid");
    if (url.pathname.endsWith("/auth/v1/user")) {
      const token = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") || "";
      const user = users[token]; return user ? Response.json({ ...user, email_confirmed_at: "2026-01-01", user_metadata: {} }) : Response.json({}, { status: 401 });
    }
    if (url.pathname.includes("/rpc/")) {
      const body = JSON.parse(String(init?.body)); let query: string; let args: unknown[];
      if (url.pathname.endsWith("cible_take_quota")) { query = "select cible_take_quota($1,$2) as value"; args = [body.p_key,body.p_limit]; }
      else { assert.ok(url.pathname.endsWith("cible_save_user_data")); query = "select cible_save_user_data($1,$2,$3) as value"; args = [body.p_user_id,body.p_version,body.p_data]; }
      return Response.json((await db.query(query,args)).rows[0].value);
    }
    assert.ok(url.pathname.endsWith("/cible_user_data"));
    const owner = url.searchParams.get("user_id")?.replace("eq.", "");
    return Response.json((await db.query("select data,version,updated_at from cible_user_data where user_id=$1",[owner])).rows);
  };
  const origin = "https://cible.test";
  const req = (method: string, token: string, body?: object, query="") => new NextRequest(`${origin}/api/user-data${query}`, { method, headers: { origin, cookie: `${SESSION_COOKIE}=${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    const data = { ...emptyData("Alice", users.alice.email), originalCv: { name: "Maître", text: "Original de test" }, cvs: [{ id: "adapté", name: "Adapté", date: "", file: "cv.pdf" }], applications: [{ id: "sent", cvText: "CV envoyé", letterText: "Lettre envoyée", company: "Test", role: "Stage", status: "sent", daysAgo: 0, source: "Test" }] };
    assert.equal((await GET(req("GET", "forged"))).status,401);
    assert.equal((await POST(req("POST", "alice",{ version:0,data, email:users.bob.email }))).status,403);
    assert.equal((await POST(req("POST", "alice",{ version:0,data }))).status,200);
    const restored=await (await GET(req("GET","alice"))).json(); assert.deepEqual(restored.record.data,data);
    assert.equal((await (await GET(req("GET","bob"))).json()).record,null);
    assert.equal((await GET(req("GET","bob",undefined,`?email=${users.alice.email}`))).status,403);
    const updated={...data,note:"Updated"};
    const writes=await Promise.all([POST(req("POST","alice",{version:1,data:updated})),POST(req("POST","alice",{version:1,data:{...data,note:"Other"}}))]);
    assert.deepEqual(writes.map(r=>r.status).sort(),[200,409]);
    const history=(await db.query("select data from cible_user_data_history where user_id=$1 and version=1",[users.alice.id])).rows[0].data;
    assert.deepEqual(history,data);
    assert.equal((await POST(req("POST","alice",{version:2,data:history}))).status,200);
    assert.deepEqual((await (await GET(req("GET","alice"))).json()).record.data,data);
    console.log("API dossier + SQL exécuté : propriété UUID, refus croisé, CV/candidatures conservés, conflit 200/409 et restauration historique passés.");
  } finally { globalThis.fetch=nativeFetch; await db.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
