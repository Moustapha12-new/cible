import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord } from "@/lib/candidature-server";
import { getDocument } from "@/lib/document-storage";
import { computeSha256 } from "@/lib/pdf-generator";

export const dynamic = "force-dynamic";

export const GET = securedRoute(async (req, { user }) => {
  const offerId = new URL(req.url).searchParams.get("offerId");
  if (!offerId) return NextResponse.json({ ok: false, error: "Offre manquante." }, { status: 400 });
  try {
    const { data } = await loadUserRecord(user);
    const item = data.bulkCvQueue?.find(q => q.offerId === offerId && q.status === "ready");
    if (!item?.documentId || !item.versionId || !item.sha256) return NextResponse.json({ ok: false, error: "CV prêt introuvable." }, { status: 404 });
    const stored = await getDocument(user.id, item.documentId, item.versionId);
    const bytes = new Uint8Array(await stored.arrayBuffer());
    if (await computeSha256(bytes) !== item.sha256) throw new Error("Le PDF archivé ne correspond pas à son empreinte.");
    return new NextResponse(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="CV-cible.pdf"', "Cache-Control": "no-store", "X-Content-SHA256": item.sha256 } });
  } catch { return NextResponse.json({ ok: false, error: "PDF indisponible." }, { status: 503 }); }
});
