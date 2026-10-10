import assert from "node:assert/strict";
import { readGmailJson } from "./gmail-response";
import { fetchLabelEmails } from "./gmail-server";
import { mergeCatalogue } from "./gmail-dashboard";
import { askJsonRaw } from "./gmail-core";

async function main() {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  try {
    await assert.rejects(readGmailJson(new Response("An error occurred", { status: 504 })), /déjà enregistrées/);
    await assert.rejects(readGmailJson(new Response("<html>Proxy error</html>", { status: 502 })), /HTTP 502/);
    await assert.rejects(readGmailJson(new Response("null")), /invalide/);
    assert.deepEqual(await readGmailJson(Response.json({ ok: true })), { ok: true });
    let messageReads = 0;
    globalThis.fetch = async input => {
      const url = String(input);
      if (url.includes("/messages?")) return Response.json({ messages: Array.from({ length: 12 }, (_, i) => ({ id: String(i) })), resultSizeEstimate: 12 });
      messageReads++;
      return Response.json({ id: url.split("/messages/")[1]?.split("?")[0], payload: { headers: [{ name: "Subject", value: "Stage informatique" }], body: { data: Buffer.from("Offre de stage").toString("base64url") } } });
    };
    const first = await fetchLabelEmails("test", { id: "test" }, { maxFullMessages: 3, getDelayMs: 0 });
    assert.equal(messageReads, 3);
    assert.equal(first.emails.length, 3);
    assert.equal(first.deferred, 9);
    const finished = new Set(first.emails.map(e => e.id));
    const second = await fetchLabelEmails("test", { id: "test" }, {
      maxFullMessages: 3, getDelayMs: 0,
      resolveMode: id => finished.has(id) ? "skip" : "full",
      metaFor: id => ({ subject: `Stage ${id}`, from: "test", receivedAt: "" }),
    });
    assert.equal(messageReads, 6);
    assert.equal(second.deferred, 6);
    assert.equal(second.emails.filter(e => e.text).length, 3);
    const expired = await fetchLabelEmails("test", { id: "test" }, { deadlineAt: Date.now() - 1 });
    assert.equal(messageReads, 6);
    assert.equal(expired.deferred, 12);
    assert.equal(expired.listedIds?.length, 12, "watermark includes deferred messages");
    const oldNow = Date.now;
    let clock = oldNow();
    Date.now = () => clock;
    try {
      const slow = await fetchLabelEmails("test", { id: "test" }, {
        deadlineAt: clock + 11, getDelayMs: 0, maxFullMessages: 3,
        resolveMode: () => { clock++; return "full"; },
      });
      assert.equal(slow.emails.length, 3, "process the first chunk before resolving the archive");
      assert.equal(slow.listedIds?.length, 12);
    } finally { Date.now = oldNow; }
    const existing = { id: "saved", offers: [{ title: "Stage" }], checkpoint: { status: "done" } } as never;
    const pending = { id: "saved", offers: [], checkpoint: { status: "pending" } } as never;
    assert.deepEqual(mergeCatalogue([existing], [pending]), [existing]);
    assert.deepEqual(mergeCatalogue([existing], []), [existing]);
    const excluding = await fetchLabelEmails("test", { id: "test" }, {
      excludeIds: Array.from({ length: 10 }, (_, i) => String(i)), maxFullMessages: 3, getDelayMs: 0,
    });
    assert.equal(excluding.emails.length, 2);
    assert.equal(excluding.deferred, 0);
    assert.equal(excluding.listedIds?.length, 12);
    process.env.GEMINI_API_KEY = "test-only";
    let aiCalls = 0;
    await assert.rejects(askJsonRaw("prompt", "system", {
      deadlineAt: Date.now() - 1,
      fetchImpl: async () => { aiCalls++; return Response.json({}); },
    }), /Budget/);
    assert.equal(aiCalls, 0);
    console.log("Vérifié : erreurs proxy non JSON, lots limités, reprise sans relecture des messages terminés et budget IA global.");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
