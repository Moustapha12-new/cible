import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord, saveUserRecord } from "@/lib/candidature-server";
import { documentFileError, putDocument, getDocument } from "@/lib/document-storage";
import { computeSha256 } from "@/lib/pdf-generator";
import type { OfferCvFile } from "@/lib/data";

export const dynamic = "force-dynamic";
export const POST = securedRoute(async (req, { user }) => {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const offerId = form.get("offerId");
    if (!(file instanceof File) || typeof offerId !== "string" || !offerId.trim() || offerId.length > 500) return NextResponse.json({ ok: false, error: "Sélectionne une offre et un PDF." }, { status: 400 });
    if (!/\.pdf$/i.test(file.name) || file.size > 8_000_000) return NextResponse.json({ ok: false, error: "Choisis un PDF de 8 Mo maximum." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const invalid = documentFileError(file.name, "application/pdf", bytes);
    if (invalid) return NextResponse.json({ ok: false, error: invalid }, { status: 400 });
    const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await pdf.getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
    let text = "";
    try {
      if (document.numPages > 20) throw new Error("Choisis un CV de vingt pages maximum.");
      for (let i = 1; i <= document.numPages && text.length < 100_000; i++) {
        const content = await (await document.getPage(i)).getTextContent();
        text += content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("") + "\n";
      }
    } finally { document.cleanup(); }
    const safeName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-180).replace(/\.pdf$/i, ".pdf");
    const fileName = safeName === ".pdf" ? "CV-personnel.pdf" : safeName;
    const metadata: OfferCvFile = { offerId, fileName, documentId: crypto.randomUUID(), versionId: crypto.randomUUID(), sha256: await computeSha256(bytes), uploadedAt: new Date().toISOString(), text: text.slice(0, 100_000) };
    await putDocument(user.id, metadata.documentId, metadata.versionId, bytes, "application/pdf");
    const record = await loadUserRecord(user);
    await saveUserRecord(user, { ...record, data: { ...record.data, offerCvOverrides: { ...record.data.offerCvOverrides, [offerId]: metadata } } });
    return NextResponse.json({ ok: true, file: metadata }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Import impossible." }, { status: 503 });
  }
}, { bodyFormat: "multipart", maxBodyBytes: 8_100_000 });

export const GET = securedRoute(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const { data } = await loadUserRecord(user);
    const file = data.offerCvOverrides?.[url.searchParams.get("offerId") || ""];
    if (!url.searchParams.has("file")) return NextResponse.json({ ok: true, file: file || null }, { headers: { "Cache-Control": "no-store" } });
    if (!file) return NextResponse.json({ ok: false, error: "Aucun CV personnel pour cette offre." }, { status: 404 });
    const stored = await getDocument(user.id, file.documentId, file.versionId);
    const bytes = new Uint8Array(await stored.arrayBuffer());
    if (await computeSha256(bytes) !== file.sha256) throw new Error("Le fichier archivé a échoué au contrôle d'intégrité.");
    return new NextResponse(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${file.fileName}"`, "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ ok: false, error: "CV personnel indisponible." }, { status: 503 }); }
});

export const DELETE = securedRoute(async (req, { user }) => {
  try {
    const { offerId } = await req.json() as { offerId: string };
    const record = await loadUserRecord(user);
    const overrides = { ...record.data.offerCvOverrides };
    delete overrides[offerId];
    await saveUserRecord(user, { ...record, data: { ...record.data, offerCvOverrides: overrides } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ ok: false, error: "Modification impossible." }, { status: 503 }); }
});
