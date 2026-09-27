/* Probe Supabase Storage readiness — never prints secrets. */
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const url = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const key = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ""
).trim();
const bucket = (process.env.SUPABASE_BUCKET || "cible-gmail-storage").trim();

console.log("supabase_url", url ? "present" : "MISSING", "url_len", url.length);
console.log("supabase_key", key ? "present" : "MISSING", "key_len", key.length);
console.log("bucket", bucket);

if (!url || !key) {
  console.log("STATUS not_configured");
  process.exit(0);
}

const path = `gmail/__health_${Date.now()}.txt`;
const objectUrl = `${url}/storage/v1/object/${bucket}/${path}`;
const headers = {
  Authorization: `Bearer ${key}`,
  apikey: key,
  "Content-Type": "application/octet-stream",
};

try {
  const put = await fetch(objectUrl, {
    method: "PUT",
    headers: { ...headers, "x-upsert": "true" },
    body: "ok",
    cache: "no-store",
  });
  console.log("PUT", put.status, put.ok ? "OK" : await put.text());
  if (put.ok) {
    const get = await fetch(objectUrl, { method: "GET", headers, cache: "no-store" });
    const text = await get.text();
    console.log("GET", get.status, "len", text.length, "body", text.slice(0, 40));
    const del = await fetch(objectUrl, { method: "DELETE", headers, cache: "no-store" });
    console.log("DEL", del.status);
    console.log("STATUS ready");
  } else {
    console.log("STATUS put_failed");
  }
} catch (e) {
  console.log("ERR", String(e.message || e).slice(0, 300));
  console.log("STATUS error");
}
