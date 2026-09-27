/* Vérification Deep Recheck après relance + comparaison gold */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

try {
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]] && m[1] !== "BLOB_READ_WRITE_TOKEN") {
      process.env[m[1]] = m[2];
    }
  }
} catch {}

import { loadDeepMeta, buildDeepReport, collectDetectedOffers } from "./src/lib/deep-recheck";
import { storeGet } from "./src/lib/gmail-server";

const EMAIL = "moustaled.53@gmail.com";
const TARGET = [0, 1, 16, 21];
const GOLD = join(process.cwd(), "_backup_secrets_AVVANT_RESET", "deep_recheck_results.json");

const esc = (s: string) => s.toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
const batchKey = (email: string, i: number) =>
  `gmail:deep:batch:${esc(email)}:${String(i).padStart(3, "0")}`;

async function main() {
  console.log("=== VÉRIFICATION DEEP RECHECK ===\n");

  const meta = await loadDeepMeta(EMAIL);
  if (!meta) {
    console.error("meta introuvable");
    process.exit(1);
  }

  console.log(`Phase : ${meta.phase}`);
  console.log(`Batches : ${meta.batches.length}`);
  console.log(`Detect done (statut non-pending) : ${meta.batches.filter((b) => b.status !== "pending").length} / ${meta.batches.length}`);
  console.log(`Detect done (statut done) : ${meta.batches.filter((b) => b.status === "done").length}`);
  console.log(`Detect error : ${meta.batches.filter((b) => b.status === "error").length}`);
  console.log(`Detect pending : ${meta.batches.filter((b) => b.status === "pending").length}`);
  console.log(`Offers total (meta) : ${meta.offersTotal}`);
  console.log(`Offers analyzed (meta) : ${meta.offersAnalyzed}`);

  console.log("\n── Lots cibles ──");
  for (const i of TARGET) {
    const b = meta.batches.find((x) => x.index === i);
    if (!b) {
      console.log(`Lot ${i}: ABSENT`);
      continue;
    }
    const raw = await storeGet(batchKey(EMAIL, i));
    let results: { emailId: string; offerCount: number; detectStatus: string; offers: { title: string; sourceUrl: string }[] }[] = [];
    if (raw) {
      try {
        results = (JSON.parse(raw) as { results?: typeof results }).results ?? [];
      } catch {}
    }
    const offers = results.reduce((s, r) => s + (r.offerCount || 0), 0);
    const errs = results.filter((r) => r.detectStatus === "error").length;
    const withUrl = results.reduce((s, r) => s + r.offers.filter((o) => o.sourceUrl).length, 0);
    console.log(
      `Lot ${i}: status=${b.status} emails=${b.emailIds.length} results=${results.length} offres=${offers} avecURL=${withUrl} errEmails=${errs}${b.error ? ` | ${b.error}` : ""}`
    );
  }

  const all = await collectDetectedOffers(EMAIL);
  console.log(`\nOffres collectées (collectDetectedOffers) : ${all.length}`);
  const withUrl = all.filter((o) => o.detect.sourceUrl).length;
  console.log(`  avec sourceUrl : ${withUrl}`);
  console.log(`  sans sourceUrl : ${all.length - withUrl}`);

  const report = await buildDeepReport(EMAIL);
  if (report) {
    console.log("\n── Rapport (buildDeepReport) ──");
    console.log(`Emails examinés : ${report.emailsExamined}`);
    console.log(`Avec offre : ${report.emailsWithOffer}`);
    console.log(`Sans offre : ${report.emailsWithoutOffer}`);
    console.log(`Ambigus : ${report.emailsAmbiguous}`);
    console.log(`Offres détectées : ${report.offersDetected}`);
    console.log(`Avec URL : ${report.offersWithUrl} / Sans URL : ${report.offersWithoutUrl}`);
    console.log(`Analysées OK : ${report.offersAnalyzedOk}`);
    console.log(`Bloquées : ${report.offersBlocked}`);
    console.log(`Partielles : ${report.offersPartial}`);
    console.log(`En attente : ${report.offersPending}`);

    console.log("\n── Détail par email des lots cibles ──");
    const targetIds = new Set(TARGET.flatMap((i) => meta.batches.find((b) => b.index === i)?.emailIds ?? []));
    for (const em of report.byEmail) {
      if (!targetIds.has(em.emailId)) continue;
      console.log(
        `  ${em.emailId} offres=${em.offerCount} conf=${em.confidence} | ${em.subject.slice(0, 60)}`
      );
      for (const o of em.offers) {
        console.log(`    ${o.n}. [${o.status}] ${o.title.slice(0, 70)}`);
        if (o.url) console.log(`       ${o.url.slice(0, 80)}`);
      }
    }
  }

  if (existsSync(GOLD)) {
    const gold = JSON.parse(readFileSync(GOLD, "utf8")) as {
      meta?: { full?: { offersTotal?: number } };
      offers?: unknown[];
      report?: { offersDetected?: number };
      totalOffers?: number;
    };
    console.log("\n── Comparaison gold ──");
    console.log(`Gold file : deep_recheck_results.json`);
    const goldKeys = Object.keys(gold);
    console.log(`Clés gold : ${goldKeys.join(", ")}`);
    if (typeof gold.totalOffers === "number") console.log(`gold totalOffers : ${gold.totalOffers}`);
    if (gold.report?.offersDetected != null) console.log(`gold report.offersDetected : ${gold.report.offersDetected}`);
    if (Array.isArray(gold.offers)) console.log(`gold offers[] : ${gold.offers.length}`);
    if (gold.meta?.full?.offersTotal != null) console.log(`gold meta.offersTotal : ${gold.meta.full.offersTotal}`);
    console.log(`Nouveau total (collect) : ${all.length}`);
    if (typeof gold.totalOffers === "number") {
      const d = all.length - gold.totalOffers;
      console.log(`Écart vs gold totalOffers : ${d >= 0 ? "+" : ""}${d}`);
    }
  } else {
    console.log("\nGold file introuvable :", GOLD);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
