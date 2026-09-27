/* Inspect Blob checkpoints + enrich cache with private get. */
import { list, get } from "@vercel/blob";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i <= 0) continue;
  const k = line.slice(0, i);
  let v = line.slice(i + 1);
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[k] = v;
}
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.log("no token");
  process.exit(1);
}

const { blobs: cps } = await list({ prefix: "gmail/gmail:processed:", limit: 300, token });
console.log("processed checkpoints:", cps.length);

let total = 0;
let withE = 0;
const statuses = {};
const samples = [];
const n = Math.min(80, cps.length);
for (const b of cps.slice(0, n)) {
  try {
    const res = await get(b.url, { access: "private", token, useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) continue;
    const text = await new Response(res.stream).text();
    const j = JSON.parse(text);
    for (const o of j.offers || []) {
      total++;
      const s = o.enrichStatus || "none";
      statuses[s] = (statuses[s] || 0) + 1;
      if (o.enrichStatus) {
        withE++;
        if (samples.length < 6) samples.push(`${s} | ${(o.title || "").slice(0, 40)} | ${(o.enrichReason || "").slice(0, 40)}`);
      }
    }
  } catch (e) {
    console.log("err", e.message);
  }
}
console.log(`sampled ${n} cps: offers=${total} withEnrich=${withE}`, statuses);
console.log("samples", samples);

const { blobs: en } = await list({ prefix: "gmail/gmail:enrich:", limit: 100, token });
console.log("enrich cache:", en.length);
for (const b of en.slice(0, 5)) {
  try {
    const res = await get(b.url, { access: "private", token, useCache: false });
    const text = await new Response(res.stream).text();
    const j = JSON.parse(text);
    console.log(" ", j.enrichStatus, (j.enrichReason || "").slice(0, 60));
  } catch (e) {
    console.log(" ", e.message);
  }
}

const { blobs: all } = await list({ prefix: "gmail/", limit: 1000, token });
const kinds = {};
for (const b of all) {
  const rest = b.pathname.slice("gmail/".length);
  const k = rest.split(":")[0] || rest.split("/")[0];
  kinds[k] = (kinds[k] || 0) + 1;
}
console.log("kinds", kinds);
