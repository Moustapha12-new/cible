import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "../.validation-tools/node_modules/@electric-sql/pglite/dist/index.js";

const db = new PGlite();
await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
await db.exec(readFileSync("docs/catalog-rpc.sql", "utf8"));
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const call = (user, batch, source, records) => db.query(
  "select public.cible_import_catalog_batch($1::uuid,$2,$3,$4::jsonb) as result",
  [user, batch, source, JSON.stringify(records)]
);
const record = { id: "legacy-1", title: "Stage HTA ETAP", company: "Entreprise A", location: "Lieu à vérifier", domain: "Électricité", searchText: "Stage HTA BT ETAP", qualification: { state: "shortlisted", note: "Mon choix", updatedAt: "2026-10-10T10:00:00Z" }, applicationId: "app-1", dossierId: "legacy-1", sources: [{ type: "local", nativeId: "legacy-1" }], original: { text: "Source conservée" } };
assert.deepEqual((await call(alice, "batch-a", "local", [record])).rows[0].result, { saved: 1, skipped: 0, replayed: false });
assert.deepEqual((await call(alice, "batch-a", "local", [record])).rows[0].result, { saved: 0, skipped: 1, replayed: true });
await assert.rejects(call(alice, "batch-a", "local", [{ ...record, title: "Changed" }]));
const updated = { ...record, title: "Stage HTA ETAP confirmé", qualification: { state: "rejected", updatedAt: "2026-10-09T10:00:00Z" }, applicationId: "different", sources: [{ type: "gmail", nativeId: "mail-2" }] };
assert.equal((await call(alice, "batch-b", "gmail", [updated])).rows[0].result.skipped, 1);
const stored = await db.query("select * from public.cible_catalog_offers where user_id=$1 and id='legacy-1'", [alice]);
assert.equal(stored.rows.length, 1);
assert.equal(stored.rows[0].title, updated.title);
assert.equal(stored.rows[0].qualification.state, "shortlisted", "manual decision survives reimport");
assert.equal(stored.rows[0].application_id, "app-1", "application link survives reimport");
assert.equal(stored.rows[0].dossier_id, "legacy-1");
assert.equal(stored.rows[0].source_payload.sources.length, 2, "source provenance is accumulated");
assert.equal(stored.rows[0].source_payload.original.text, "Source conservée");
await call(alice, "batch-c", "local", [{ ...record, qualification: { state: "interesting", updatedAt: "2026-10-11T10:00:00Z" } }]);
assert.equal((await db.query("select qualification from public.cible_catalog_offers where user_id=$1", [alice])).rows[0].qualification.state, "interesting", "newer manual decision is imported");
assert.equal((await db.query("select count(*)::int as n from public.cible_catalog_import_batches where user_id=$1", [alice])).rows[0].n, 3);

await call(bob, "batch-a", "local", [{ ...record, qualification: { state: "new" } }]);
assert.equal((await db.query("select qualification from public.cible_catalog_offers where user_id=$1", [bob])).rows[0].qualification.state, "new", "accounts are isolated");
await assert.rejects(call(alice, "bad-batch", "local", [record, { id: "", title: "Bad", sources: [] }]));
assert.equal((await db.query("select count(*)::int as n from public.cible_catalog_import_batches where user_id=$1", [alice])).rows[0].n, 3, "failed batch leaves no receipt");
assert.equal((await db.query("select count(*)::int as n from public.cible_catalog_offers where user_id=$1", [alice])).rows[0].n, 1, "failed batch is atomic");

const bulk = Array.from({ length: 50 }, (_, i) => ({ ...record, id: `bulk-${i}`, applicationId: undefined, dossierId: undefined, qualification: undefined }));
await call(alice, "bulk-1", "local", bulk);
assert.equal((await db.query("select count(*)::int as n from public.cible_catalog_offers where user_id=$1", [alice])).rows[0].n, 51);
await assert.rejects(call(alice, "too-large", "local", [...bulk, record]));
assert.equal((await db.query("select relrowsecurity from pg_class where relname='cible_catalog_offers'")).rows[0].relrowsecurity, true);
console.log("P4-A SQL: isolation, import, replay, batch atomicity, source and decision preservation passed");
