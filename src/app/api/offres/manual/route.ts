import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord, saveUserRecord } from "@/lib/candidature-server";
import type { DetectedOffer } from "@/lib/data";

export const dynamic = "force-dynamic";

export const POST = securedRoute(async (req, { user }) => {
  let offer: DetectedOffer;
  try { offer = (await req.json()).offer as DetectedOffer; }
  catch { return NextResponse.json({ ok: false, error: "Offre invalide." }, { status: 400 }); }
  if (!offer?.id?.startsWith("manual-") || !offer.title || !offer.company || !offer.text || offer.text.length > 30_000 || !offer.url) return NextResponse.json({ ok: false, error: "Offre incomplète." }, { status: 400 });
  const offerUrl = offer.url;
  try {
    const url = new URL(offerUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
  } catch { return NextResponse.json({ ok: false, error: "Lien HTTPS public requis." }, { status: 400 }); }
  try {
    const record = await loadUserRecord(user);
    if (record.data.offers.some(o => o.id === offer.id || o.url?.replace(/\/$/, "") === offerUrl.replace(/\/$/, ""))) return NextResponse.json({ ok: false, error: "Cette offre est déjà enregistrée." }, { status: 409 });
    const safe: DetectedOffer = { ...offer, id: `manual-${crypto.randomUUID()}`, title: offer.title.slice(0, 200), company: offer.company.slice(0, 120), location: (offer.location || "").slice(0, 120), text: offer.text.slice(0, 30_000), source: "Ajout manuel" };
    await saveUserRecord(user, { ...record, data: { ...record.data, offers: [safe, ...record.data.offers] } });
    return NextResponse.json({ ok: true, offer: safe });
  } catch { return NextResponse.json({ ok: false, error: "Sauvegarde distante indisponible. Offre non confirmée." }, { status: 503 }); }
});
