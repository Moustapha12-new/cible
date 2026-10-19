import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST, GET } from "../app/api/cv/custom/route";
import { emptyData, type UserData } from "./data";

async function main() {
  process.env.SUPABASE_URL = "https://custom-cv-fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture";
  const nativeFetch = globalThis.fetch;
  let data: UserData = emptyData("Test", "test@example.test"), version = 0;
  let stored = new Uint8Array();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "custom-cv-fixture.invalid", "Aucun accès externe");
    if (url.pathname.endsWith("/auth/v1/user")) return Response.json({ id: "11111111-1111-4111-8111-111111111111", email: "test@example.test", email_confirmed_at: "2026-01-01", user_metadata: {} });
    if (url.pathname.includes("/storage/v1/object/")) {
      if (init?.method === "POST") { stored = new Uint8Array(init.body as Buffer); return Response.json({ ok: true }); }
      return new Response(stored);
    }
    if (url.pathname.endsWith("/rpc/cible_save_user_data")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.p_version, version);
      data = body.p_data; return Response.json(++version);
    }
    if (url.pathname.endsWith("/cible_user_data")) return Response.json({ data, version });
    throw new Error(`Requête inattendue : ${url.pathname}`);
  };
  try {
    // Contenu non extractible, comme un PDF scanné : l'archivage ne doit pas lancer PDF.js.
    const original = new TextEncoder().encode("%PDF-1.7\n% fichier personnel conservé exactement, sans analyse\n%%EOF");
    const form = new FormData();
    form.set("offerId", "offre-test"); form.set("file", new File([original], "mon-cv.pdf", { type: "application/pdf" }));
    const headers = { origin: "https://cible.test", cookie: "cible-access=test" };
    const response = await POST(new NextRequest("https://cible.test/api/cv/custom", { method: "POST", headers, body: form }));
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual(stored, original, "Stockage des octets exacts");
    assert.equal(data.offerCvOverrides?.["offre-test"].fileName, "mon-cv.pdf");
    assert.equal(data.offerCvOverrides?.["offre-test"].text, undefined, "Aucune extraction obligatoire");
    const download = await GET(new NextRequest("https://cible.test/api/cv/custom?offerId=offre-test&file=1", { headers }));
    assert.equal(download.status, 200);
    assert.deepEqual(new Uint8Array(await download.arrayBuffer()), original, "Restitution identique après relecture du dossier");
    stored[10] ^= 1;
    assert.equal((await GET(new NextRequest("https://cible.test/api/cv/custom?offerId=offre-test&file=1", { headers }))).status, 503, "Altération détectée");
    console.log("CV personnel : upload sans PDF.js, stockage, relecture exacte et intégrité vérifiés (transport simulé).");
  } finally { globalThis.fetch = nativeFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
