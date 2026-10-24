import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord, saveUserRecord } from "@/lib/candidature-server";

export const POST = securedRoute(async (req, { user }) => {
  const { ids } = await req.json();
  if (!Array.isArray(ids) || !ids.length || ids.length > 5000 || ids.some(id => typeof id !== "string" || !id || id.length > 12000)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const record = await loadUserRecord(user);
      const dismissedOfferIds = [...new Set([...(record.data.dismissedOfferIds || []), ...ids as string[]])];
      await saveUserRecord(user, { ...record, data: { ...record.data, dismissedOfferIds } });
      return NextResponse.json({ ok: true, dismissedOfferIds });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("Le dossier a changé")) break;
    }
  }
  return NextResponse.json({ ok: false, error: "Suppression non enregistrée." }, { status: 503 });
});
