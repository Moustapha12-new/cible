import assert from "node:assert/strict";
import { requestGmailDashboard } from "./gmail-dashboard-request";

async function main() {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 5));
      return Response.json({ ok: true, emails: [], connected: true });
    };
    const a = requestGmailDashboard("test@example.test");
    const b = requestGmailDashboard("test@example.test");
    assert.equal(a, b);
    assert.equal((await a).connected, true);
    assert.equal(calls, 1);
    await requestGmailDashboard("other@example.test");
    assert.equal(calls, 2);
    await requestGmailDashboard("test@example.test", true);
    assert.equal(calls, 3);
    globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
    await assert.rejects(requestGmailDashboard("slow@example.test", false, 10), /tarde à répondre/);
    globalThis.fetch = async () => Response.json({ ok: true, emails: [], connected: true });
    assert.equal((await requestGmailDashboard("slow@example.test")).connected, true);
    globalThis.fetch = async () => Response.json({ ok: false, error: "Indisponible", detail: "service" }, { status: 502 });
    await assert.rejects(requestGmailDashboard("error@example.test"), { message: "Indisponible", detail: "service" });
    globalThis.fetch = () => { throw new Error("Network unavailable"); };
    await assert.rejects(requestGmailDashboard("network@example.test"), /Network unavailable/);
    globalThis.fetch = async () => Response.json({ ok: true, emails: [], connected: true });
    assert.equal((await requestGmailDashboard("network@example.test")).connected, true);
    console.log("9 vérifications : déduplication, isolation, timeout et nouvelles tentatives réussies.");
  } finally { globalThis.fetch = original; }
}
void main().catch(e => { console.error(e); process.exitCode = 1; });
