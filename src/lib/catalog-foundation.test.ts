import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withGmailAccount } from "./gmail-account";
import { emptyData } from "./data";
import { catalogGet, catalogSet, getOffer, loadCatalogIndex, listOffersFromIndex } from "./permanent-offer-server";
import { runMigration } from "./catalog-migration";

async function main() {
  process.chdir(mkdtempSync(join(tmpdir(), "cible-p4-foundation-")));
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VERCEL;

  await withGmailAccount("alice@example.test", async () => {
    await catalogSet("isolation", "alice");
  });
  await withGmailAccount("bob@example.test", async () => {
    assert.equal(await catalogGet("isolation"), null, "catalogues must be isolated by account");
  });

  await withGmailAccount("alice@example.test", async () => {
    const data = emptyData("Alice", "alice@example.test");
    data.offers = [{ id: "historical-offer-42", title: "Stage ingénieur HTA", company: "Exemple", location: "Lieu à vérifier", salary: "", match: 0, keywords: [], text: "Études HTA et ETAP", source: "manual" }];
    data.applications = [{ id: "application-42", offerId: "historical-offer-42", company: "Exemple", role: "Stage ingénieur HTA", status: "sent", daysAgo: 0, source: "manual", cvText: "CV envoyé figé" }];
    data.dossiers = { "historical-offer-42": { cvText: "CV dossier", letterText: "", notes: "", updatedAt: "2026-10-10T00:00:00Z" } };

    const first = await runMigration(data, { source: "detected_offers" });
    assert.equal(first.created, 1);
    const raw = await getOffer("historical-offer-42");
    assert.ok(raw, "historical ID remains addressable");
    const saved = JSON.parse(raw);
    assert.equal(saved.id, "historical-offer-42");
    assert.equal(saved.applicationId, "application-42");
    assert.equal(saved.dossierId, "historical-offer-42");
    assert.equal(saved.archived, false);
    assert.equal(saved.location.city, undefined, "ambiguous location cannot become a city");
    assert.equal((await listOffersFromIndex({ page: 1, pageSize: 1 })).total, 1);

    const second = await runMigration(data, { source: "detected_offers" });
    assert.equal(second.skipped, 1, "reimport keeps the existing offer");
    assert.equal((await loadCatalogIndex()).entries.length, 1);

    await catalogSet("catalog:index", "{broken-json");
    await assert.rejects(loadCatalogIndex(), /illisible/);
    await assert.rejects(runMigration(data, { source: "detected_offers" }), /illisible/);
    assert.equal(await getOffer("historical-offer-42"), raw, "corrupt index cannot overwrite the offer");
  });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
