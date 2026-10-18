import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord, saveUserRecord } from "@/lib/candidature-server";
import { parseCvText } from "@/lib/cv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PDF_BYTES = 1_400_000;

/** Le PDF est traité en mémoire ; seul le texte extrait et sa version structurée
 * sont enregistrés comme CV maître du compte. Aucun appel IA n'est effectué. */
export const POST = securedRoute(async (req, { user }) => {
  let body: { pdf?: string; name?: string };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ ok: false, error: "Fichier invalide." }, { status: 400 }); }
  if (typeof body.pdf !== "string" || body.pdf.length > Math.ceil(MAX_PDF_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.pdf)) {
    return NextResponse.json({ ok: false, error: "PDF invalide ou trop volumineux (1,4 Mo maximum)." }, { status: 400 });
  }
  const bytes = Buffer.from(body.pdf, "base64");
  if (bytes.length < 100 || bytes.length > MAX_PDF_BYTES || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return NextResponse.json({ ok: false, error: "Le fichier choisi n'est pas un PDF valide." }, { status: 400 });
  }
  try {
    const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await pdf.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    if (document.numPages > 3) return NextResponse.json({ ok: false, error: "Choisis un CV de trois pages maximum." }, { status: 400 });
    const pages: string[] = [];
    for (let pageNo = 1; pageNo <= document.numPages; pageNo++) {
      const page = await document.getPage(pageNo);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str + (item.hasEOL ? "\n" : " ");
      }
      pages.push(text.trim());
    }
    const text = pages.join("\n\n").replace(/[^\S\n]+/g, " ").trim();
    if (text.length < 150 || (text.match(/�/g) || []).length > 3) {
      return NextResponse.json({ ok: false, error: "Le texte de ce PDF n'est pas lisible. Colle le texte de ton CV dans le champ prévu." }, { status: 422 });
    }
    if (text.length > 100_000) return NextResponse.json({ ok: false, error: "Le texte extrait dépasse la taille maximale acceptée pour le CV maître." }, { status: 413 });
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : "CV original.pdf";
    const cvData = parseCvText(text);
    try {
      const record = await loadUserRecord(user);
      await saveUserRecord(user, {
        data: { ...record.data, originalCv: { name, text, pages: document.numPages, sizeBytes: bytes.length, importedAt: new Date().toISOString() }, cvData },
        version: record.version,
      });
    } catch {
      return NextResponse.json({ ok: false, error: "Le texte du CV a été extrait, mais sa sauvegarde sur ton compte a échoué. Réessaie avant de télécharger." }, { status: 503 });
    }
    return NextResponse.json({ ok: true, text, cvData, pages: document.numPages, name }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("CV PDF extraction failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "Extraction du PDF impossible. Essaie un autre fichier ou colle son texte." }, { status: 422 });
  }
});
