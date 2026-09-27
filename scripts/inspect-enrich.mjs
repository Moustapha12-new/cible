/* Inspect enrich cache + checkpoints (no secrets printed). */
import { list } from "@vercel/blob";
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

const { blobs: enrich } = await list({ prefix: "gmail/gmail:enrich:", limit: 1000 });
console.log("enrich cache keys:", enrich.length);
for (const b of enrich.slice(0, 5)) {
  const r = await fetch(b.url);
  const t = await r.text();
  try {
    const j = JSON.parse(t);
    console.log(" ", b.pathname.slice(-16), j.enrichStatus, (j.enrichReason || "").slice(0, 60));
  } catch {
    console.log(" ", b.pathname.slice(-16), "non-json", t.slice(0, 80));
  }
}

const { blobs: cps } = await list({ prefix: "gmail/gmail:checkpoint:", limit: 500 });
console.log("checkpoint keys:", cps.length);
let withEnrich = 0;
let totalOffers = 0;
let samples = [];
for (const b of cps.slice(0, 80)) {
  const r = await fetch(b.url);
  const j = await r.json();
  for (const o of j.offers || []) {
    totalOffers++;
    if (o.enrichStatus) withEnrich++;
    if (o.enrichStatus && samples.length < 5) samples.push(o.enrichStatus + ":" + (o.title || "").slice(0, 40));
  }
}
console.log(`sampled 80 cps: offers=${totalOffers} withEnrichStatus=${withEnrich}`);
console.log("samples:", samples);

// also any mail store keys
const { blobs: stores } = await list({ prefix: "gmail/", limit: 200 });
const kinds = {};
for (const b of stores) {
  const m = b.pathname.match(/^gmail\/gmail:([^:]+)/) || b.pathname.match(/^gmail\/([^:]+)/);
  const k = m ? m[1] : b.pathname.split("/")[1] || "root";
  kinds[k] = (kinds[k] || 0) + 1;
}
console.log("blob kinds:", kinds);
