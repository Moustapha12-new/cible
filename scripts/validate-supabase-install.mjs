import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "../.validation-tools/node_modules/@electric-sql/pglite/dist/index.js";

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema storage;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (bucket_id text, name text);
`);
for (const file of [
  "supabase/migrations/20241011000001_initial_schema.sql",
  "supabase/migrations/20241011000002_rpc_functions.sql",
  "supabase/migrations/20241011000003_storage_policies.sql",
]) {
  const sql = readFileSync(file, "utf8");
  await db.exec(sql);
  await db.exec(sql);
}
const buckets = await db.query("select id, public from storage.buckets order by id");
assert.deepEqual(buckets.rows, [
  { id: "cible-documents", public: false },
  { id: "cible-gmail-storage", public: false },
]);
const policies = await db.query("select count(*)::integer as n from pg_policies where schemaname='storage' and tablename='objects'");
assert.equal(policies.rows[0].n, 8);
const rpc = await db.query("select count(*)::integer as n from pg_proc where proname in ('cible_save_user_data','cible_take_quota','cible_take_sync_lease','cible_release_sync_lease','cible_import_catalog_batch')");
assert.equal(rpc.rows[0].n, 5);
await db.exec("set role authenticated");
await assert.rejects(db.query("select public.cible_take_quota('x', 1)"), /permission denied/);
await db.exec("reset role");
await db.exec("set role service_role");
assert.equal((await db.query("select public.cible_take_quota('synthetic:test', 1) as allowed")).rows[0].allowed, true);
assert.equal((await db.query("select public.cible_take_quota('synthetic:test', 1) as allowed")).rows[0].allowed, false);
await db.exec("reset role");
await db.close();
console.log("Migrations 1-3 : installation et réexécution sans erreur ; buckets privés, 8 politiques et RPC protégées.");
