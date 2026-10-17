import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord, saveUserRecord } from "@/lib/candidature-server";
import type { DetectedOffer } from "@/lib/data";
import { prepareManualOffer, sameManualOfferUrl } from "@/lib/manual-offer";
import { isSafeOfferUrl } from "@/lib/scrape";

export const dynamic = "force-dynamic";

export const POST = securedRoute(async (req, { user }) => {
  let offer: DetectedOffer;
  try { offer = (await req.json()).offer as DetectedOffer; }
  catch { return NextResponse.json({ ok: false, error: "Offre invalide." }, { status: 400 }); }
  if (typeof offer?.id !== "string" || !offer.id.startsWith("manual-") || typeof offer.title !== "string" || !offer.title.trim() || typeof offer.company !== "string" || !offer.company.trim() || typeof offer.text !== "string" || offer.text.trim().length < 50 || offer.text.length > 30_000) return NextResponse.json({ ok: false, error: "Offre incomplète : titre, entreprise et description requis." }, { status: 400 });
  /* L'URL est facultative (annonce collée sans lien) mais doit rester un lien
     HTTPS public lorsqu'elle est fournie. */
  const offerUrl = typeof offer.url === "string" && offer.url.trim() ? offer.url.trim() : undefined;
  if (offerUrl) {
    try {
      const url = new URL(offerUrl);
      if (url.protocol !== "https:" || !isSafeOfferUrl(offerUrl)) throw new Error();
    } catch { return NextResponse.json({ ok: false, error: "Le lien de l'annonce doit être une URL HTTPS publique." }, { status: 400 }); }
  } else {
    offer.url = undefined;
  }
  try {
    const record = await loadUserRecord(user);
    if (record.data.offers.some(o => o.id === offer.id || sameManualOfferUrl(o.url, offerUrl))) return NextResponse.json({ ok: false, error: "Cette offre est déjà enregistrée." }, { status: 409 });
    const safe = prepareManualOffer({ title: offer.title, company: offer.company, text: offer.text, url: offerUrl }, `manual-${crypto.randomUUID()}`, new Date().toISOString());
    await saveUserRecord(user, { ...record, data: { ...record.data, offers: [safe, ...record.data.offers] } });
    return NextResponse.json({ ok: true, offer: safe });
  } catch { return NextResponse.json({ ok: false, error: "Sauvegarde distante indisponible. Offre non confirmée." }, { status: 503 }); }
});
