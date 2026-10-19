import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord } from "@/lib/candidature-server";
import { evaluateAndSaveCareer } from "@/lib/career-evaluation-server";
import type { DetectedOffer } from "@/lib/data";
import { currentCareerReport } from "@/lib/career-evaluation";

export const dynamic = "force-dynamic";
export const GET = securedRoute(async (req, { user }) => {
  const { data } = await loadUserRecord(user);
  const offer = data.offers.find(o => o.id === new URL(req.url).searchParams.get("offerId"));
  return NextResponse.json({ ok: true, report: offer ? currentCareerReport(offer, data) : null }, { headers: { "Cache-Control": "no-store" } });
});
export const POST = securedRoute(async (req, { user }) => {
  try {
    const body = await req.json();
    if (typeof body.offerId !== "string") return NextResponse.json({ ok: false, error: "Sélectionne une offre." }, { status: 400 });
    const { data } = await loadUserRecord(user);
    let offer = data.offers.find(o => o.id === body.offerId);
    const s = body.offerSnapshot;
    if (!offer && s?.id === body.offerId && typeof s.title === "string" && typeof s.text === "string") {
      // Le client peut avoir une offre locale pas encore synchronisée ; uniquement des champs bornés.
      const field = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
      offer = { id: body.offerId, title: field(s.title, 200), company: field(s.company, 120), location: field(s.location, 180), text: field(s.text, 24000), salary: "", keywords: [], match: 0 } satisfies DetectedOffer;
    }
    if (!offer) return NextResponse.json({ ok: false, error: "Offre introuvable." }, { status: 404 });
    const report = await evaluateAndSaveCareer(user, offer, data);
    return NextResponse.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Évaluation indisponible." }, { status: 502 });
  }
});
