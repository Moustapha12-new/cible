/* Relance Deep Recheck — lots pending + lots en erreur (code seul résilient) */
import { readFileSync } from "node:fs";
import { join } from "node:path";

try {
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]] && m[1] !== "BLOB_READ_WRITE_TOKEN") {
      process.env[m[1]] = m[2];
    }
  }
} catch { /* pas de .env.local */ }

import { loadDeepMeta, loadDeepEmails } from "./src/lib/deep-recheck";
import { processEmail } from "./src/lib/gmail-core";
import { storeSet, type ParsedEmail } from "./src/lib/gmail-server";

const EMAIL = process.argv[2] || "moustaled.53@gmail.com";
const MODE = (process.argv[3] || "pending") as "pending" | "errors" | "all" | string;
const FORCE_BATCHES = process.argv.slice(4).map(Number).filter((n) => !Number.isNaN(n));

const esc = (s: string) => s.toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
const metaKey = (email: string) => `gmail:deep:meta:${esc(email)}`;
const batchKey = (email: string, i: number) =>
  `gmail:deep:batch:${esc(email)}:${String(i).padStart(3, "0")}`;

async function saveJson(key: string, value: unknown): Promise<void> {
  await storeSet(key, JSON.stringify(value));
}

type DeepDetectOffer = { title: string; anchorText: string; sourceUrl: string; snippet: string };
type DeepEmailDetect = {
  emailId: string;
  containsInternshipOffer: boolean;
  offerCount: number;
  confidence: string;
  offers: DeepDetectOffer[];
  detectStatus: "ok" | "error";
  detectError?: string;
};

function pickBatches(meta: Awaited<ReturnType<typeof loadDeepMeta>>): number[] {
  if (FORCE_BATCHES.length) return FORCE_BATCHES;
  if (MODE === "all") return meta!.batches.map((b) => b.index);
  if (MODE === "errors") return meta!.batches.filter((b) => b.status === "error").map((b) => b.index);
  return meta!.batches.filter((b) => b.status === "pending").map((b) => b.index);
}

async function main() {
  console.log("=== RELANCE DEEP RECHECK ===");
  console.log(`Email : ${EMAIL}  mode=${MODE}${FORCE_BATCHES.length ? ` lots=${FORCE_BATCHES.join(",")}` : ""}`);
  console.log(`Storage : kv=${!!process.env.KV_REST_API_URL} blob=${!!process.env.BLOB_READ_WRITE_TOKEN} gemini=${!!process.env.GEMINI_API_KEY}`);

  const meta = await loadDeepMeta(EMAIL);
  const email = EMAIL;
  if (!meta) { console.error("Deep Recheck non initialisé"); process.exit(1); }

  console.log(`Phase : ${meta.phase}  detectDone=${meta.detectDone}/${meta.batches.length} offersTotal=${meta.offersTotal}`);

  const emails = await loadDeepEmails(email);
  const byId = new Map(emails.map((e) => [e.id, e] as const));
  const targets = pickBatches(meta);
  console.log(`Cibles (${targets.length}) : ${targets.join(", ")}`);

  let totalOffers = 0;
  let totalErrors = 0;
  let lotsDone = 0;
  let lotsError = 0;

  for (const batchIndex of targets) {
    const bMeta = meta.batches.find((b) => b.index === batchIndex);
    if (!bMeta) { console.log(`⚠ Lot ${batchIndex} absent`); continue; }
    const emailIds = bMeta.emailIds ?? [];
    if (!emailIds.length) { console.log(`⚠ Lot ${batchIndex} vide`); continue; }

    console.log(`\n─── LOT ${batchIndex} (was ${bMeta.status}) ───`);
    const batchEmails: ParsedEmail[] = [];
    for (const id of emailIds) {
      const e = byId.get(id);
      if (e) batchEmails.push(e);
      else console.log(`  ⚠ introuvable: ${id}`);
    }
    if (!batchEmails.length) continue;

    const results: DeepEmailDetect[] = [];
    let lotOffers = 0;
    let lotErrors = 0;

    for (const em of batchEmails) {
      try {
        /* force + pas de skipAi : le pipeline résilient tente l'IA puis retombe sur le code. */
        let result = await processEmail(em, { force: true });
        /* Non-offer structurels (markers=0, unique=0) : l'IA a échoué mais le code
           a exhaustivement scanné le DOM sans trouver d'offre → no_offer, pas error. */
        if (
          result.finalStatus === "analyze_error" &&
          result.detSummary?.markers === 0 &&
          result.detSummary?.unique === 0
        ) {
          result = await processEmail(em, { force: true, skipAi: true });
        }
        const offers: DeepDetectOffer[] = result.offers.map((o) => ({
          title: o.title,
          anchorText: o.anchorText || "",
          sourceUrl: o.sourceUrl || o.applicationUrl || "",
          snippet: o.snippet || "",
        }));
        const detectStatus = result.finalStatus === "analyze_error" ? "error" : "ok";
        results.push({
          emailId: em.id,
          containsInternshipOffer: offers.length > 0,
          offerCount: offers.length,
          confidence: offers.length > 0 ? "high" : "low",
          offers,
          detectStatus,
          detectError: detectStatus === "error" ? result.error : undefined,
        });
        if (offers.length > 0) {
          lotOffers += offers.length;
          console.log(`  ✅ ${em.id.slice(0, 12)}… : ${offers.length} offre(s)`);
        } else {
          console.log(`  ○ ${em.id.slice(0, 12)}… : ${result.finalStatus}${result.error ? ` (${result.error.slice(0, 60)})` : ""}`);
        }
        if (detectStatus === "error") lotErrors++;
        totalOffers += offers.length;
      } catch (err) {
        lotErrors++;
        totalErrors++;
        console.log(`  ❌ ${em.id.slice(0, 12)}… : ${err instanceof Error ? err.message : String(err)}`);
        results.push({
          emailId: em.id,
          containsInternshipOffer: false,
          offerCount: 0,
          confidence: "low",
          offers: [],
          detectStatus: "error",
          detectError: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await saveJson(batchKey(email, batchIndex), {
      index: batchIndex,
      emailIds,
      results,
      updatedAt: new Date().toISOString(),
    });

    const hasError = results.some((r) => r.detectStatus === "error");
    bMeta.status = hasError ? "error" : "done";
    bMeta.error = hasError ? results.find((r) => r.detectStatus === "error")?.detectError : undefined;
    bMeta.updatedAt = new Date().toISOString();
    if (hasError) lotsError++; else lotsDone++;
    console.log(`→ Lot ${batchIndex} : ${lotOffers} offres, ${lotErrors} erreurs → ${bMeta.status}`);
  }

  meta.detectDone = meta.batches.filter((b) => b.status !== "pending").length;
  meta.updatedAt = new Date().toISOString();
  await saveJson(metaKey(email), meta);

  const byStatus: Record<string, number> = {};
  for (const b of meta.batches) byStatus[b.status] = (byStatus[b.status] || 0) + 1;
  console.log("\n=== FIN ===");
  console.log(`Offres ce run : ${totalOffers}  erreurs email : ${totalErrors}`);
  console.log(`Lots: done=${lotsDone} error=${lotsError}`);
  console.log(`Meta: detectDone=${meta.detectDone}/${meta.batches.length} phase=${meta.phase}`);
  console.log(`Status: ${JSON.stringify(byStatus)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
