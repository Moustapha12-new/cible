import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../app/api/offres/snapshot/route";
import { SESSION_COOKIE } from "./auth-server";
import { emptySummary, type DashboardPayload } from "./gmail-dashboard";

/* Récupération des offres serveur : le catalogue Gmail persisté doit revenir
   identique (ids préservés, doublons fusionnés, dates de réception héritées),
   même quand le navigateur est vierge. Aucune Supabase réelle : transport
   PostgREST/Storage simulé, comme dans preprod-user-data.test.ts. */

async function main() {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  try {
    process.env.SUPABASE_URL = "https://snapshot-fixture.invalid";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture";
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.KV_REST_API_URL;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.GMAIL_STORAGE_PROVIDER = "supabase";

    const users: Record<string, { id: string; email: string }> = {
      alice: { id: "11111111-1111-4111-8111-111111111111", email: "alice@example.test" },
    };
    const objects = new Map<string, string>();
    const snapshotPath =
      "/storage/v1/object/cible-gmail-storage/gmail/gmail:snapshot:alice@example.test";
    const offerA = {
      title: "Stage Électricité",
      company: "RTE",
      location: "Paris",
      applicationUrl: "https://rte.example/j/1",
      description: "Dimensionnement de postes et études de schémas unifilaires.",
    };
    const payload = {
      ok: true,
      labelFound: true,
      label: "Alertes emploi",
      totalInLabel: 3,
      connected: true,
      configured: true,
      snapshotAt: "2026-10-13T09:05:00.000Z",
      summary: emptySummary("2026-10-13T09:00:00.000Z"),
      emails: [
        { id: "m1", receivedAt: "2026-10-13T08:00:00.000Z", offers: [offerA] },
        {
          id: "m2",
          receivedAt: "2026-10-12T09:30:00.000Z",
          offers: [
            // Même URL de candidature : doublon absolu, fusionné côté serveur.
            { ...offerA, title: "Stage Électricité (relance)" },
            // Sans URL : le doublon se jouerait sur titre|entreprise|lieu.
            {
              title: "Stage Énergies Renouvelables",
              company: "Engie",
              location: "Lyon",
              description: "Audit énergétique et performance des bâtiments.",
            },
          ],
        },
      ],
    } as unknown as DashboardPayload;
    objects.set(snapshotPath, JSON.stringify(payload));

    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.hostname, "snapshot-fixture.invalid");
      if (url.pathname.endsWith("/auth/v1/user")) {
        const token = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") || "";
        const user = users[token];
        return user
          ? Response.json({ ...user, email_confirmed_at: "2026-01-01", user_metadata: {} })
          : Response.json({}, { status: 401 });
      }
      assert.ok(url.pathname.includes("/storage/v1/object/"), `stockage inattendu : ${url.pathname}`);
      if (init?.method === "POST") {
        objects.set(url.pathname, String(init.body));
        return Response.json({ ok: true });
      }
      const value = objects.get(url.pathname);
      return value !== undefined
        ? new Response(value)
        : Response.json({ message: "Object not found" }, { status: 400 });
    };

    const origin = "https://cible.test";
    const req = (token?: string) =>
      new NextRequest(`${origin}/api/offres/snapshot`, {
        method: "GET",
        headers: { origin, ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) },
      });

    // 1 — Sans session : refus explicite, aucune offre exposée.
    const denied = await GET(req());
    assert.equal(denied.status, 401);
    assert.equal((await denied.json()).ok, false);

    // 2 — Catalogue persisté restauré : ids/dates préservés, doublons fusionnés.
    const restored = await (await GET(req("alice"))).json();
    assert.equal(restored.ok, true);
    assert.equal(restored.count, 2, "le doublon (même URL de candidature) est fusionné");
    assert.equal(restored.offers.length, 2);
    assert.equal(restored.offers[0].title, "Stage Électricité", "la première occurrence conserve son intitulé");
    assert.equal(restored.offers[0].applicationUrl, "https://rte.example/j/1");
    assert.equal(restored.offers[0].receivedAt, "2026-10-13T08:00:00.000Z");
    assert.equal(restored.offers[1].title, "Stage Énergies Renouvelables");
    assert.equal(
      restored.offers[1].receivedAt,
      "2026-10-12T09:30:00.000Z",
      "une offre sans date propre hérite de la date de réception de l'e-mail"
    );
    assert.equal(restored.totalInLabel, 3);
    assert.ok(typeof restored.snapshotAt === "string");

    // 3 — Navigateur vierge, catalogue absent : état vide honnête, jamais démo.
    objects.delete(snapshotPath);
    const empty = await (await GET(req("alice"))).json();
    assert.deepEqual(empty, { ok: true, offers: [], count: 0 });

    // 4 — Catalogue illisible : erreur explicite, copie existante conservée.
    objects.set(snapshotPath, "{corrompu");
    const broken = await GET(req("alice"));
    assert.equal(broken.status, 503);
    assert.equal((await broken.json()).ok, false);

    console.log(
      "Offres serveur validées : 401 sans session, catalogue restauré (ids/dates préservés, doublons fusionnés), état vide honnête, catalogue corrompu → 503 sans effacement."
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of Object.keys(process.env)) if (!(name in originalEnv)) delete process.env[name];
    Object.assign(process.env, originalEnv);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
