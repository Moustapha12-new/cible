import { securedRoute } from "@/lib/auth-server";
import { getOffer } from "@/lib/permanent-offer-server";
import type { PermanentOffer } from "@/lib/permanent-offer";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function offerId(req: NextRequest): string {
  return decodeURIComponent(req.nextUrl.pathname.split("/").pop() || "");
}

export const GET = securedRoute(async (req) => {
  const raw = await getOffer(offerId(req));
  if (!raw) return NextResponse.json({ ok: false, error: "Offre introuvable" }, { status: 404 });
  try {
    const offer = JSON.parse(raw) as PermanentOffer;
    if (!offer || offer.id !== offerId(req)) throw new Error("Identité incohérente");
    return NextResponse.json({ ok: true, offer });
  } catch {
    return NextResponse.json({ ok: false, error: "Offre du catalogue illisible" }, { status: 500 });
  }
});

const unavailable = securedRoute(async () => NextResponse.json({
  ok: false,
  error: "Modification du catalogue suspendue jusqu'à validation du stockage et de l'index.",
}, { status: 503 }));

export const PATCH = unavailable;
export const DELETE = unavailable;
export const POST = unavailable;
