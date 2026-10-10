/* Diagnostic sans affichage de secrets. --create-bucket crée seulement le bucket privé manquant. */
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
if (existsSync(".env.local")) for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
const bucket = process.env.SUPABASE_BUCKET?.trim() || "cible-gmail-storage";
if (!url || !key) { console.log("Supabase : configuration manquante."); throw new Error("Configuration ou accès invalide"); }
const headers = { apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }) };
const request = (path, options = {}) => fetch(url + path, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(10_000) });
try {
  const bucketPath = `/storage/v1/bucket/${encodeURIComponent(bucket)}`;
  let metadata = await request(bucketPath);
  if (!metadata.ok && process.argv.includes("--create-bucket")) {
    const detail = await metadata.json().catch(() => ({}));
    if (metadata.status === 404 || /not found/i.test(detail.message || "")) {
      const created = await request("/storage/v1/bucket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: bucket, name: bucket, public: false }) });
      console.log("Création bucket privé : HTTP", created.status);
      metadata = await request(bucketPath);
    }
  }
  if (!metadata.ok) { console.log("Accès au bucket refusé : HTTP", metadata.status, "(vérifie la clé du bon projet)"); throw new Error("Configuration ou accès invalide"); }
  const info = await metadata.json();
  if (info.public) { console.log("Bucket public : utiliser un bucket privé pour Gmail."); throw new Error("Configuration ou accès invalide"); }
  const objectPath = `/storage/v1/object/${encodeURIComponent(bucket)}/gmail/__health_${randomUUID()}.txt`;
  const content = "cible-storage-health-check";
  const put = await request(objectPath, { method: "POST", headers: { "Content-Type": "application/octet-stream", "x-upsert": "true" }, body: content });
  console.log("Écriture : HTTP", put.status);
  if (!put.ok) throw new Error("Configuration ou accès invalide");
  try {
    const get = await request(objectPath);
    const matches = get.ok && await get.text() === content;
    console.log("Lecture : HTTP", get.status, "contenu vérifié :", matches);
    if (!matches) process.exitCode = 1;
  } finally {
    const del = await request(objectPath, { method: "DELETE" });
    console.log("Nettoyage du fichier de test : HTTP", del.status);
    if (!del.ok) process.exitCode = 1;
  }
} catch (e) { console.log("Diagnostic échoué :", e.name); process.exitCode = 1; }
