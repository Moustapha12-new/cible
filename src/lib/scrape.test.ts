import assert from "node:assert/strict";
import { extractJobPostingText, fetchOfferPage } from "./scrape";

const job = { "@type": "JobPosting", title: "Stage développement", hiringOrganization: { name: "Atelier" }, description: "<p>Développer une application avec TypeScript.</p>", jobLocation: { address: { addressLocality: "Paris", addressCountry: "FR" } }, skills: "TypeScript", validThrough: "2026-11-01" };
const html = (data: unknown) => `<html><script type="application/ld+json">${JSON.stringify(data)}</script><main>Accepter les cookies</main></html>`;
const text = extractJobPostingText(html({ "@graph": [job] }));
assert.ok(text.includes("Stage développement"));
assert.ok(text.includes("Atelier"));
assert.ok(text.includes("Paris, FR"));
assert.ok(text.includes("Développer une application"));
assert.ok(!text.includes("<p>"));
assert.ok(!text.includes("Accepter les cookies"));
assert.equal(extractJobPostingText(html([job, { ...job, title: "Autre stage" }])), "");
assert.equal(extractJobPostingText('<script type="application/ld+json">invalid</script>'), "");
assert.equal(extractJobPostingText(html({ "@type": "WebSite", description: "Autre contenu" })), "");
assert.ok(extractJobPostingText(`<script type="application/ld+json">broken</script>${html(job)}`).includes("Atelier"));
console.log("10 vérifications extraction JobPosting réussies.");

async function checkDeadline() {
  const original = globalThis.fetch;
  const keepAlive = setTimeout(() => {}, 2_000);
  let calls = 0;
  try {
    globalThis.fetch = async (_input, options) => {
      calls++;
      return new Promise((_resolve, reject) => {
        const fail = () => reject(new DOMException("Aborted", "AbortError"));
        if (options?.signal?.aborted) fail();
        else options?.signal?.addEventListener("abort", fail, { once: true });
      });
    };
    const result = await fetchOfferPage("https://example.com/job", { timeoutMs: 40 });
    assert.equal(result.ok, false);
    assert.ok(calls <= 1, "la deadline globale interdit un deuxième essai de 15 secondes");
    console.log("Deadline globale de lecture vérifiée, sans HTTP externe.");
  } finally { clearTimeout(keepAlive); globalThis.fetch = original; }
}
checkDeadline().catch(error => { console.error(error); process.exitCode = 1; });
