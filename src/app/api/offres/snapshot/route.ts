import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadSnapshot } from "@/lib/gmail-snapshot";

export const dynamic = "force-dynamic";

/** Offres déjà analysées et sauvegardées. Aucun appel à l'API Gmail. */
export const GET = securedRoute(async (_req, { user }) => {
  let snapshot;
  try { snapshot = await loadSnapshot(user.email); }
  catch (error) {
    console.error("Saved offers unavailable:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "Offres Gmail sauvegardées indisponibles." }, { status: 503 });
  }
  if (!snapshot) return NextResponse.json({ ok: true, offers: [], count: 0 });
  try {
    const seen = new Set<string>();
    const offers = snapshot.emails.flatMap(email => (email.offers || []).map(offer => {
      const withDate = offer as typeof offer & { receivedAt?: string };
      return { ...withDate, receivedAt: withDate.receivedAt || email.receivedAt };
    }))
      .filter(offer => { const key = offer.applicationUrl || `${offer.title}|${offer.company}|${offer.location}`; if (seen.has(key)) return false; seen.add(key); return true; });
    return NextResponse.json({ ok: true, offers, count: offers.length, totalInLabel: snapshot.totalInLabel ?? null, snapshotAt: snapshot.snapshotAt ?? null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Saved offers conversion failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "Conversion des offres sauvegardées impossible." }, { status: 503 });
  }
});
