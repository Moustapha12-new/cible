import { manualUrlExists } from "./manual-duplicate-server";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { emptySummary, type DashboardPayload } from "./gmail-dashboard";
import type { ProcessedEmail, RawOffer } from "./gmail-core";
import { storeGet } from "./gmail-server";
import { loadSnapshot, saveSnapshot } from "./gmail-snapshot";

async function main() {
  const previous = process.cwd();
  const temporary = await mkdtemp(join(tmpdir(), "cible-snapshot-test-"));
  const envNames = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GMAIL_STORAGE_PROVIDER", "FORCE_SUPABASE", "KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "REDIS_REST_API_URL", "BLOB_READ_WRITE_TOKEN", "VERCEL"];
  const oldEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));

  try {
  for (const name of envNames) delete process.env[name];
  process.chdir(temporary);
  const email = "snapshot-test@example.invalid";
  const offer = (index: number, description: string): RawOffer => ({
    title: `Stage ${index}`, company: "Entreprise", location: "Paris",
    contract: "Stage", duration: "6 mois", deadline: "", skills: [],
    description, applicationUrl: `https://example.invalid/jobs/${index}`, source: "test",
  });
  const mail = (index: number, description: string): ProcessedEmail => ({
    id: `mail-${index}`, subject: "Alertes", from: "test@example.invalid",
    receivedAt: "2026-10-28T00:00:00Z", isOffer: true,
    reason: "test", finalStatus: "detected", offers: [offer(index, description)],
  });
  const first = {
    ok: true, labelFound: true, label: "Stages – Alertes offres", totalInLabel: 1,
    connected: true, configured: true, summary: emptySummary(),
    emails: [mail(0, "preuve")],
  } satisfies DashboardPayload;
  await saveSnapshot(email, first);
  assert.equal((await loadSnapshot(email))?.emails.length, 1);
  const user = { id: "test", name: "Test", email };
  assert.equal(await manualUrlExists(user, "https://example.invalid/jobs/0?utm_source=manual", []), true, "offre Gmail trouvée sans dépendre du titre saisi");
  assert.equal(await manualUrlExists(user, "https://example.invalid/jobs/another", []), false, "annonce différente autorisée");
  assert.equal(await manualUrlExists(user, undefined, []), false, "absence de lien ne prouve pas un doublon");

  const large = {
    ...first,
    emails: Array.from({ length: 1000 }, (_, index) => mail(index, `${index}:` + "é".repeat(11_000))),
  } satisfies DashboardPayload;
  assert.ok(Buffer.byteLength(JSON.stringify(large), "utf8") > 20_000_000);
  await saveSnapshot(email, large);
  const manifestBefore = JSON.parse((await storeGet(`gmail:snapshot:${email}`))!.slice("chunks:v1:".length));
  await saveSnapshot(email, large);
  const manifestAfter = JSON.parse((await storeGet(`gmail:snapshot:${email}`))!.slice("chunks:v1:".length));
  assert.deepEqual(manifestAfter.chunks, manifestBefore.chunks, "unchanged fragments reused");
  const restored = await loadSnapshot(email);
  assert.equal(restored?.emails.length, 1000);
  assert.equal(restored?.emails[999].offers[0].title, "Stage 999");
  assert.equal(restored?.emails[0].offers[0].description, large.emails[0].offers[0].description);
  await saveSnapshot(email, { ...large, emails: large.emails.slice(1) });
  assert.equal((await loadSnapshot(email))?.emails.length, 999);
  } finally {
  process.chdir(previous);
  for (const name of envNames) {
    if (oldEnv[name] === undefined) delete process.env[name];
    else process.env[name] = oldEnv[name];
  }
  if (resolve(temporary).startsWith(resolve(tmpdir()) + "\\")) await rm(temporary, { recursive: true, force: true });
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
