/* Relance Deep Recheck — lots 0, 1, 16, 21 (pipeline résilient gmail-core) */
import { readFileSync } from "node:fs";
import { join } from "node:path";

try {
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    /* On n'active PAS BLOB_* : token refusé → force le mode local (.gmail-tokens). */
    if (m && !process.env[m[1]] && m[1] !== "BLOB_READ_WRITE_TOKEN") {
      process.env[m[1]] = m[2];
    }
  }
} catch {
  /* pas de .env.local */
}

import { loadDeepMeta, loadDeepEmails } from "./src/lib/deep-recheck";
import { processEmail } from "./src/lib/gmail-core";
import { storeSet, type ParsedEmail } from "./src/lib/gmail-server";

const EMAIL = process.argv[2] || "moustaled.53@gmail.com";
const TARGET_BATCHES = [0, 1, 16, 21];

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

async function main() {
  console.log("=== RELANCE DEEP RECHECK — lots 0, 1, 16, 21 ===");
  console.log(`Email : ${EMAIL}`);
  console.log(
    `Storage : kv=${!!process.env.KV_REST_API_URL} blob=${!!process.env.BLOB_READ_WRITE_TOKEN} gemini=${!!process.env.GEMINI_API_KEY}`
  );

  const meta = await loadDeepMeta(EMAIL);
  const email = EMAIL;
  if (!meta) {
    console.error("Deep Recheck non initialisé pour", email);
    process.exit(1);
  }

  console.log(`Phase : ${meta.phase}`);
  console.log(
    `Batches : ${meta.batches.length} (detectDone: ${meta.detectDone}, offersTotal: ${meta.offersTotal})`
  );
  for (const b of meta.batches) {
    if (TARGET_BATCHES.includes(b.index)) {
      console.log(
        `  Lot ${b.index}: status=${b.status}${b.error ? ` error=${b.error}` : ""} emails=${b.emailIds.length}`
      );
    }
  }
  console.log("");

  const emails = await loadDeepEmails(email);
  console.log(`Emails corpus : ${emails.length}`);
  if (!emails.length) {
    console.error("Corpus vide — impossible de relancer");
    process.exit(1);
  }
  const byId = new Map(emails.map((e) => [e.id, e] as const));
  let totalOffers = 0;
  let totalErrors = 0;

  for (const batchIndex of TARGET_BATCHES) {
    const bMeta = meta.batches.find((b) => b.index === batchIndex);
    if (!bMeta) {
      console.log(`⚠ Lot ${batchIndex} : absent du meta`);
      continue;
    }

    const emailIds = bMeta.emailIds ?? [];
    if (!emailIds.length) {
      console.log(`⚠ Lot ${batchIndex} : aucun email`);
      continue;
    }

    console.log(`\n─── LOT ${batchIndex} (status: ${bMeta.status}) ───`);

    const batchEmails: ParsedEmail[] = [];
    for (const id of emailIds) {
      const e = byId.get(id);
      if (e) batchEmails.push(e);
      else console.log(`  ⚠ email introuvable: ${id}`);
    }
    if (!batchEmails.length) {
      console.log(`⚠ Lot ${batchIndex} : 0 email résolu`);
      continue;
    }

    const results: DeepEmailDetect[] = [];
    let lotOffers = 0;
    let lotErrors = 0;

    for (const em of batchEmails) {
      try {
        const result = await processEmail(em);
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
          for (const o of offers) {
            console.log(`     → ${o.title.slice(0, 80)}`);
            console.log(`       ${(o.sourceUrl || "(sans URL)").slice(0, 70)}`);
          }
        } else {
          console.log(`  ○ ${em.id.slice(0, 12)}… : sans offre (${result.finalStatus})`);
        }
        if (detectStatus === "error") lotErrors++;
        totalOffers += offers.length;
      } catch (err) {
        lotErrors++;
        totalErrors++;
        console.log(
          `  ❌ ${em.id.slice(0, 12)}… : ${err instanceof Error ? err.message : String(err)}`
        );
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
    bMeta.error = hasError
      ? results.find((r) => r.detectStatus === "error")?.detectError
      : undefined;
    bMeta.updatedAt = new Date().toISOString();

    console.log(
      `→ Lot ${batchIndex} : ${lotOffers} offre(s), ${lotErrors} erreur(s) → status ${bMeta.status}`
    );
  }

  meta.detectDone = meta.batches.filter((b) => b.status !== "pending").length;
  meta.updatedAt = new Date().toISOString();
  await saveJson(metaKey(email), meta);

  console.log("\n=== FIN ===");
  console.log(`Total offres détectées : ${totalOffers}`);
  console.log(`Total erreurs email : ${totalErrors}`);
  console.log("Lots cibles :");
  for (const b of meta.batches) {
    if (TARGET_BATCHES.includes(b.index)) {
      console.log(`  Lot ${b.index}: ${b.status}${b.error ? ` — ${b.error}` : ""}`);
    }
  }
  console.log(
    `Récap meta : detectDone=${meta.detectDone}/${meta.batches.length} phase=${meta.phase}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
