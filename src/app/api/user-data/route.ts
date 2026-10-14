import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord, saveUserRecord } from "@/lib/candidature-server";

export const dynamic = "force-dynamic";

export const GET = securedRoute(async (_req, auth) => {
  try {
    const record = await loadUserRecord(auth.user);
    return NextResponse.json({ ok: true, record }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Sauvegarde serveur indisponible. Les données de cet appareil sont conservées." }, { status: 503 });
  }
});

export const POST = securedRoute(async (req, auth) => {
  const body = await req.json();
  if (!Number.isInteger(body.version) || body.version < 0 || !body.data?.profile || !Array.isArray(body.data.applications) || !Array.isArray(body.data.offers) || !Array.isArray(body.data.cvs)) {
    return NextResponse.json({ ok: false, error: "Dossier invalide." }, { status: 400 });
  }
  try {
    await saveUserRecord(auth.user, { data: body.data, version: body.version });
    return NextResponse.json({ ok: true, version: body.version + 1 }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Sauvegarde indisponible. Aucune donnée locale supprimée." }, { status: 503 });
  }
});
