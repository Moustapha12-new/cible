import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const dir = mkdtempSync(join(tmpdir(), "cible-all-"));
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "--noEmit", "false", "--outDir", dir, "--module", "commonjs", "--moduleResolution", "node", "--incremental", "false"],
  { stdio: "inherit" }
);
const runner = join(dir, "run.cjs");
writeFileSync(
  runner,
  `const Module = require('module'); const path = require('path');
const original = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...args) { if(name.startsWith('@/')) name = path.join(${JSON.stringify(dir)}, 'src', name.slice(2)); return original.call(this, name, parent, ...args); };
require(path.join(${JSON.stringify(dir)}, 'src/lib', process.argv[2] + '.test.js'));`
);

const suites = [
  "audit-behavior", "auth-security", "bulk-cv-queue", "catalog-foundation", "catalog-import",
  "cv-adaptation", "cv-auto-adapt", "cv-design", "cv-keywords", "cv-one-page",
  "daily-recommendations", "enrich-honest", "gmail-bridge", "gmail-client", "gmail-core",
  "gmail-dashboard-request", "gmail-module2", "gmail-module3", "gmail-module4", "gmail-pipeline",
  "gmail-storage", "gmail-sync-batch", "grounded-offer", "mime-text", "offer-enrich",
  "offer-extract", "offer-links", "offer-location", "offres-filters", "offres-snapshot",
  "pfe-documents", "pfe-matching", "preprod-user-data", "preprod-validation", "scrape", "text-repair",
];

const env = { ...process.env, NODE_PATH: join(process.cwd(), "node_modules") };
const failed = [];
for (const suite of suites) {
  try {
    const out = execFileSync(process.execPath, [runner, suite], { stdio: "pipe", env, encoding: "utf8" });
    const m = (out || "").match(/(\d+) passed, (\d+) failed/);
    console.log(`PASS ${suite}${m ? ` (${m[1]} ok)` : ""}`);
  } catch (e) {
    const out = String(e.stdout || "") + String(e.stderr || "");
    const m = out.match(/(\d+) passed, (\d+) failed/);
    const firstErr = (out.match(/AssertionError[^\n]*\n[^\n]*\n[^\n]*/) || [""])[0].replace(/\s+/g, " ").slice(0, 200);
    console.log(`FAIL ${suite}${m ? ` (${m[1]} ok / ${m[2]} échecs)` : ` ${firstErr}`}`);
    failed.push(suite);
  }
}
console.log("\n==== BASELINE ====");
console.log(failed.length ? `Échecs (${failed.length}) : ${failed.join(", ")}` : "Toutes les suites passent.");
