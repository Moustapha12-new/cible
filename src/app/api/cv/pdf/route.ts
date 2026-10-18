import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { DEFAULT_CV_DESIGN, type CvData, type CvDesign } from "@/lib/cv";
import { applicationPdf } from "@/lib/cv-application-pdf";
import { documentFileError, putDocument } from "@/lib/document-storage";

export const dynamic = "force-dynamic";

export const POST = securedRoute(async (req, { user }) => {
  let body: { cv: CvData; design: CvDesign; offerId?: string; offerText?: string };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 }); }
  if (!body.cv?.basics || !Array.isArray(body.cv.sections)) {
    return NextResponse.json({ ok: false, error: "CV incomplet." }, { status: 400 });
  }
  try {
    const fileName = "CV-cible.pdf";
    const { pdfBytes, sha256 } = await applicationPdf(body.cv, body.design || DEFAULT_CV_DESIGN, body.offerText || "");
    const invalid = documentFileError(fileName, "application/pdf", pdfBytes);
    if (invalid) return NextResponse.json({ ok: false, error: invalid }, { status: 400 });
    const documentId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    await putDocument(user.id, documentId, versionId, pdfBytes, "application/pdf");
    return new NextResponse(Buffer.from(pdfBytes), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store", "X-Document-Id": documentId,
      "X-Version-Id": versionId, "X-Content-SHA256": sha256,
    } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "PDF indisponible." }, { status: 503 });
  }
});
