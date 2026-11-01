import { securedRoute } from "@/lib/auth-server";
import { NextResponse } from "next/server";
import { loadSnapshot } from "@/lib/gmail-snapshot";
import { enrichmentTotals, enrichCatalogueBatch } from "@/lib/gmail-enrich-queue";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const POST = securedRoute(async (req, auth) => {
  try {
    const email = auth.user.email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ ok: false, error: "Compte utilisateur invalide" }, { status: 400 });
    return NextResponse.json({ ok: true, ...await enrichCatalogueBatch(email) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Enrichissement indisponible" }, { status: 502 });
  }
});

export const GET = securedRoute(async (_req, auth) => {
  const snapshot = await loadSnapshot(auth.user.email);
  return NextResponse.json({ ok: true, ready: !!snapshot,
    ...(snapshot ? enrichmentTotals(snapshot.emails) : { pending: 0 }) },
    { headers: { "Cache-Control": "private, no-store" } });
});
