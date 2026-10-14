import { securedRoute } from "@/lib/auth-server";
import { NextResponse } from "next/server";
import { askJson } from "@/lib/ai";

export const dynamic = "force-dynamic";

export const POST = securedRoute(async (req) => {
  let body: { cvText: string; offerText: string; offerId: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Requête invalide" }, { status: 400 });
  }

  const { cvText, offerText, offerId } = body;
  if (!cvText || !offerText || !offerId) {
    return NextResponse.json({ ok: false, error: "CV, offre ou ID manquant" }, { status: 400 });
  }

  try {
    const result = await askJson("adapt", {
      task: "adapt",
      cvOriginal: cvText,
      offerText,
      orientation: "electrical",
    });

    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    if (/Gemini .* HTTP 429/.test(msg)) {
      return NextResponse.json(
        { ok: false, code: "AI_QUOTA", error: "Le service IA a atteint sa limite de requêtes. Tu peux préparer ton CV manuellement et réessayer plus tard." },
        { status: 429, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
});