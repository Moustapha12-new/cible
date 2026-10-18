import assert from "node:assert/strict";
import { readApiBody, ApiBodyError } from "./api-body";

async function main() {
  const bytes = new Uint8Array(2_500_000).fill(187);
  bytes.set(new TextEncoder().encode("%PDF-1.7\n"));
  const form = new FormData();
  form.set("offerId", "manual-mews-test");
  form.set("file", new File([bytes], "mon-cv.pdf", { type: "application/pdf" }));
  const request = new Request("http://localhost:3000/api/cv/custom", { method: "POST", body: form });
  assert.deepEqual(await readApiBody(request, { bodyFormat: "multipart", maxBodyBytes: 8_100_000 }), {});
  const received = await request.formData();
  assert.equal(received.get("offerId"), "manual-mews-test");
  const file = received.get("file") as File;
  assert.equal(file.name, "mon-cv.pdf");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes, "le contrôle d'accès ne consomme ni ne modifie le PDF");
  await assert.rejects(readApiBody(new Request("http://localhost/test", { method: "POST", body: form })), error => error instanceof ApiBodyError && error.status === 413, "la limite JSON reste à 2 Mo");
  await assert.rejects(readApiBody(new Request("http://localhost/test", { method: "POST", body: form }), { bodyFormat: "multipart", maxBodyBytes: 100 }), error => error instanceof ApiBodyError && error.status === 413, "la taille réelle est bornée même sans Content-Length");
  assert.deepEqual(await readApiBody(new Request("http://localhost/test", { method: "POST", body: JSON.stringify({ email: "person@example.invalid" }) })), { email: "person@example.invalid" });
  await assert.rejects(readApiBody(new Request("http://localhost/test", { method: "POST", body: "not-json" })), error => error instanceof ApiBodyError && error.status === 400);
  await assert.rejects(readApiBody(new Request("http://localhost/test", { method: "POST", body: "{}" }), { bodyFormat: "multipart" }), error => error instanceof ApiBodyError && error.status === 415);
  console.log("api-body: import multipart 2,5 Mo intact, corps relisible, limites et validation JSON vérifiés.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
