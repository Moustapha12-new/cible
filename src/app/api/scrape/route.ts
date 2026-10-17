import { securedRoute } from "@/lib/auth-server";
import { NextResponse } from "next/server";
import { fetchOfferPage } from "@/lib/scrape";
import { prepareManualOffer } from "@/lib/manual-offer";

export const dynamic = "force-dynamic";

/* Récupère une fiche publique et prépare les champs déterministes.
   L'utilisateur confirme les champs avant la sauvegarde de l'offre. */
export const POST = securedRoute(async (req) => {
  let url = "";
  try {
    const b = (await req.json()) as { url?: string };
    url = (b.url ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "Requête invalide" }, { status: 400 });
  }
  if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 2000) {
    return NextResponse.json(
      { ok: false, error: "Lien invalide — colle une URL complète commençant par https://" },
      { status: 400 }
    );
  }

  const r = await fetchOfferPage(url);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.reason, outcome: r.outcome?.kind }, { status: 502 });
  }
  return NextResponse.json(
    { ok: true, url, text: r.text, draft: prepareManualOffer({ text: r.text, url }, "manual-preview", new Date().toISOString()), outcome: r.outcome?.kind },
    { headers: { "Cache-Control": "no-store" } }
  );
});
