import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { gunzipSync } from "node:zlib";
import { enrichProcessed, type ProcessedEmail } from "../src/lib/gmail-core";
import { missingOfferContent, isCompleteOffer } from "../src/lib/offer-quality";
config({ path: ".env.local", quiet: true });
async function main() {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const bucket = db.storage.from(process.env.SUPABASE_GMAIL_BUCKET || "cible-gmail-storage");
  const snapshots: string[] = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const { data, error } = await bucket.list("gmail", { limit: 1000, offset });
    if (error) throw error;
    snapshots.push(...data.filter(row => row.name.startsWith("gmail:snapshot:") && !row.name.includes(":part:")).map(row => row.name));
    if (data.length < 1000) break;
  }
  if (snapshots.length !== 1) throw new Error("Diagnostic limité à un catalogue unique ; aucun compte choisi implicitement.");
  const { data, error } = await bucket.download(`gmail/${snapshots[0]}`);
  if (error) throw error;
  const raw = await data.text();
  if (raw.startsWith("chunks:")) throw new Error("Utiliser le lecteur de fragments pour ce catalogue migré.");
  const payload = JSON.parse(raw.startsWith("gzip:v1:") ? gunzipSync(Buffer.from(raw.slice(8), "base64")).toString() : raw);
  const hosts = new Set<string>();
  const sample: ProcessedEmail[] = [];
  for (const email of payload.emails as ProcessedEmail[]) {
    for (const offer of email.offers) {
      if (offer.enrichStatus !== "partial" || offer.searchFallback) continue;
      let host: string; try { host = new URL(offer.applicationUrl).hostname; } catch { continue; }
      if (hosts.has(host)) continue;
      hosts.add(host);
      sample.push({ ...email, id: `probe-${sample.length}`, offers: [structuredClone(offer)] });
      if (sample.length === 3) break;
    }
    if (sample.length === 3) break;
  }
  await enrichProcessed(sample, new Map(), { skipCache: true, groundedOnly: true, concurrency: 2, timeBudgetMs: 70000 });
  console.log(JSON.stringify(sample.map(item => ({ host: new URL(item.offers[0].applicationUrl).hostname,
    status: item.offers[0].enrichStatus, outcome: item.offers[0].enrichOutcome,
    complete: isCompleteOffer(item.offers[0]), missing: missingOfferContent(item.offers[0]), descriptionLength: item.offers[0].description?.length ?? 0 })), null, 2));
  console.log("Lecture seule : aucun changement aux offres, candidatures ou caches serveur.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
