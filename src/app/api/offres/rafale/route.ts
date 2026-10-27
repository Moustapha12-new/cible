import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord, saveUserRecord } from "@/lib/candidature-server";
import type { DetectedOffer } from "@/lib/data";
import { isOfferDismissed } from "@/lib/offer-dismissal";

/** Enregistre la fiche exacte avant de l'ouvrir dans Mon CV. */
export const POST = securedRoute(async (req, { user }) => {
  let offer: DetectedOffer;
  try { offer = (await req.json()).offer as DetectedOffer; }
  catch { return NextResponse.json({ ok: false, error: "Offre invalide." }, { status: 400 }); }
  if (!offer || typeof offer.id !== "string" || !offer.id || offer.id.length > 12000 ||
      typeof offer.title !== "string" || !offer.title.trim() ||
      typeof offer.company !== "string" || !offer.company.trim() ||
      typeof offer.text !== "string" || offer.text.length > 30_000) {
    return NextResponse.json({ ok: false, error: "Fiche d'offre incomplète." }, { status: 400 });
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const record = await loadUserRecord(user);
      if (isOfferDismissed(offer, record.data.dismissedOfferIds)) return NextResponse.json({ ok: false, error: "Cette offre a été supprimée." }, { status: 409 });
      if (record.data.offers.some(row => row.id === offer.id)) return NextResponse.json({ ok: true });
      await saveUserRecord(user, { ...record, data: { ...record.data, offers: [offer, ...record.data.offers] } });
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("Le dossier a changé")) break;
    }
  }
  return NextResponse.json({ ok: false, error: "Enregistrement impossible. Réessaie." }, { status: 503 });
});
