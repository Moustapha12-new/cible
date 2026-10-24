import { mergeUserData } from "@/lib/data";
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
    const current = await loadUserRecord(auth.user);
    if (current.version !== body.version) {
      return NextResponse.json({ ok: false, error: "Le dossier a changé ailleurs. Recharge avant de réessayer." }, { status: 409 });
    }
    // A general backup is not a deletion or status-update command.
    // Keep the server's archived applications; recover entries present only locally.
    const protectedData = mergeUserData(current.data, body.data);
    await saveUserRecord(auth.user, { data: {
      ...body.data,
      applications: [
        ...current.data.applications,
        ...protectedData.applications.filter(app => !current.data.applications.some(saved => saved.id === app.id || (saved.offerId && saved.offerId === app.offerId))),
      ],
      offers: protectedData.offers,
      dossiers: protectedData.dossiers,
      documents: protectedData.documents,
    }, version: current.version });
    return NextResponse.json({ ok: true, version: body.version + 1 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    /* Conflit de version (écriture concurrente) : contrat 409 documenté —
       le client recharge puis réessaie ; aucune donnée n'est perdue. */
    if (error instanceof Error && error.message.startsWith("Le dossier a changé")) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ ok: false, error: "Sauvegarde indisponible. Aucune donnée locale supprimée." }, { status: 503 });
  }
});
