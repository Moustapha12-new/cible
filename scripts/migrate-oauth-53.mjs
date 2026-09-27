/* Migrate Gmail OAuth → moustaled.53@gmail.com in Blob.
   NOTE HISTORIQUE : SRC / SRC_LEGACY référencent volontairement l'ancienne
   adresse moustaled.ibr.dj@gmail.com (source de la migration one-shot).
   Ne pas remplacer par 53 — casserait la lecture de l'ancien chemin Blob.
   Ancien email : moustaled.ibr.dj@gmail.com
   Never prints token values. */
import { readFileSync } from "node:fs";

function getEnv(key) {
  const text = readFileSync(".env.local", "utf8");
  const m = new RegExp(`^${key}=(.*)$`, "m").exec(text);
  if (!m) return "";
  return m[1].trim().replace(/^['"]|['"]$/g, "");
}

const token = getEnv("BLOB_READ_WRITE_TOKEN");
const { get, put, list } = await import("@vercel/blob");

const SRC = "gmail/gmail:oauth:moustaled.ibr.dj@gmail.com"; // source historique (ne pas changer)
const DST = "gmail/gmail:oauth:moustaled.53@gmail.com";
const SRC_LEGACY = "gmail/gmail:token:moustaled.ibr.dj@gmail.com"; // source historique (ne pas changer)

async function readBlob(pathname) {
  try {
    const res = await get(pathname, { access: "private", token, useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    return await new Response(res.stream).text();
  } catch {
    return null;
  }
}

async function writeBlob(pathname, value) {
  await put(pathname, value, {
    access: "private",
    token,
    allowOverwrite: true,
    contentType: "application/octet-stream",
  });
}

// List oauth-related blobs
const l = await list({ prefix: "gmail/", token, access: "private" });
const oauthish = (l.blobs || [])
  .map((b) => b.pathname)
  .filter((p) => /oauth|token:/.test(p));
console.log("oauth-ish blobs:", oauthish.length);
for (const p of oauthish.slice(0, 20)) console.log(" -", p);

const src = await readBlob(SRC);
console.log("src oauth present:", Boolean(src), "len", src ? src.length : 0, "enc", src ? src.startsWith("enc:v1:") : false);

if (src) {
  const exists = await readBlob(DST);
  console.log("dst already present:", Boolean(exists));
  if (!exists) {
    await writeBlob(DST, src);
    console.log("MIGRATED oauth ibr → 53 OK");
  } else {
    console.log("skip migrate — 53 already has oauth");
  }
} else {
  // Try other known oauth keys as source (profile showed 53 under ibr)
  for (const alt of [
    "gmail/gmail:oauth:moustaleddistallo@gmail.com",
    "gmail/gmail:oauth:momom@gmaio.com",
  ]) {
    const altVal = await readBlob(alt);
    console.log("alt", alt, "present", Boolean(altVal), "len", altVal ? altVal.length : 0);
    if (altVal && !(await readBlob(DST))) {
      await writeBlob(DST, altVal);
      console.log("MIGRATED from", alt, "→ 53 OK");
      break;
    }
  }
  const legacy = await readBlob(SRC_LEGACY);
  console.log("legacy oauth present:", Boolean(legacy), "len", legacy ? legacy.length : 0);
  if (legacy) {
    const exists = await readBlob(DST);
    if (!exists) {
      await writeBlob(DST, legacy);
      console.log("MIGRATED legacy oauth ibr → 53 OK");
    }
  }
}

// Also copy lastSync metadata oauth connection if any
const final = await readBlob(DST);
console.log("53 oauth after:", Boolean(final), "len", final ? final.length : 0);
