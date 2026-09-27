/* Sample local checkpoints for enrichStatus (no secrets). */
import fs from "fs";
import path from "path";

const dir = ".gmail-tokens";
const files = fs.readdirSync(dir).filter((f) => f.includes("processed") || f.includes("gmail%3Aprocessed"));
console.log("processed-like files:", files.length);

let total = 0;
let withEnrich = 0;
const statuses = {};
const samples = [];
for (const f of files.slice(0, 200)) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const o of j.offers || []) {
      total++;
      const s = o.enrichStatus || "none";
      statuses[s] = (statuses[s] || 0) + 1;
      if (o.enrichStatus) {
        withEnrich++;
        if (samples.length < 8) samples.push(`${s} | ${o.title} | ${(o.enrichReason || "").slice(0, 50)}`);
      }
    }
  } catch {}
}
console.log({ totalOffers: total, withEnrich, statuses, samples });

// Also list all key patterns
const all = fs.readdirSync(dir);
const kinds = {};
for (const f of all) {
  const decoded = decodeURIComponent(f);
  const m = decoded.match(/^(gmail:[^:]+)/) || decoded.match(/^([^:.]+)/);
  const k = m ? m[1] : "other";
  kinds[k] = (kinds[k] || 0) + 1;
}
console.log("kinds", kinds);

// Sample one processed offer fully (fields only)
const one = files.find((f) => decodeURIComponent(f).includes("processed"));
if (one) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, one), "utf8"));
  const o = (j.offers || [])[0];
  if (o) {
    console.log("sample offer fields:", Object.keys(o).join(","));
    console.log("enrichStatus", o.enrichStatus, "enrichReason", o.enrichReason, "title", o.title);
  }
}
