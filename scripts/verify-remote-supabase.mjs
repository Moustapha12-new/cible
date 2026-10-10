import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const project = "ucgetwemaxigkblzvndo";
const url = `https://${project}.supabase.co`;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (process.env.SUPABASE_URL !== url || !key) throw new Error("Projet ou clé locale incohérent ; aucun contrôle lancé.");
const headers = { apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }) };
const tables = ["cible_user_data", "cible_user_data_history", "cible_api_quota", "cible_sync_lease", "cible_catalog_offers", "cible_catalog_import_batches"];
let failed = 0;
for (const table of tables) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) }).catch(() => null);
  const okay = res?.ok === true;
  console.log(`Table ${table}: ${okay ? "OK" : `HTTP ${res?.status ?? "réseau"}`}`);
  if (!okay) failed++;
}
const schema = await fetch(`${url}/rest/v1/`, { headers: { ...headers, Accept: "application/openapi+json" }, signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null).catch(() => null);
for (const name of ["cible_save_user_data", "cible_take_quota", "cible_take_sync_lease", "cible_release_sync_lease", "cible_import_catalog_batch"]) {
  const okay = Boolean(schema?.paths?.[`/rpc/${name}`]);
  console.log(`RPC ${name}: ${okay ? "présente" : "non vérifiée"}`);
  if (!okay) failed++;
}
const bucketsRes = await fetch(`${url}/storage/v1/bucket`, { headers, signal: AbortSignal.timeout(10000) }).catch(() => null);
const buckets = bucketsRes?.ok ? await bucketsRes.json() : [];
for (const name of ["cible-gmail-storage", "cible-documents"]) {
  const bucket = Array.isArray(buckets) ? buckets.find(item => item.id === name) : undefined;
  const okay = bucket && bucket.public === false;
  console.log(`Bucket ${name}: ${okay ? "privé" : "absent ou non privé"}`);
  if (!okay) failed++;
}
console.log(`Vérification distante : ${failed ? `${failed} échec(s)` : "tables, signatures RPC et buckets privés confirmés"}.`);
if (failed) process.exitCode = 1;
