import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord, saveUserRecord } from "@/lib/candidature-server";
import { offerDismissalKeys } from "@/lib/offer-dismissal";
import type { DetectedOffer } from "@/lib/data";

export const POST = securedRoute(async (req, { user }) => {
  const { ids, offers } = await req.json() as { ids: string[]; offers?: Pick<DetectedOffer, "id" | "url" | "title" | "company" | "location">[] };
  if (!Array.isArray(ids) || !ids.length || ids.length > 5000 || ids.some(id => typeof id !== "string" || !id || id.length > 12000)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const record = await loadUserRecord(user);
      const submitted = Array.isArray(offers) ? offers.filter(offer => offer && ids.includes(offer.id) && typeof offer.title === "string" && typeof offer.company === "string" && (!offer.url || typeof offer.url === "string")) : [];
      const known = [...record.data.offers.filter(offer => ids.includes(offer.id)), ...submitted];
      const dismissedOfferIds = [...new Set([...(record.data.dismissedOfferIds || []), ...ids, ...known.flatMap(offerDismissalKeys)])];
      await saveUserRecord(user, { ...record, data: { ...record.data, dismissedOfferIds } });
      return NextResponse.json({ ok: true, dismissedOfferIds });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("Le dossier a changé")) break;
    }
  }
  return NextResponse.json({ ok: false, error: "Suppression non enregistrée." }, { status: 503 });
});
