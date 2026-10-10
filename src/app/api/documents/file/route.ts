import { NextRequest, NextResponse } from "next/server";
import { allowRequest, sameOrigin, verifiedUser } from "@/lib/auth-server";
import { DOCUMENT_LIMIT } from "@/lib/pfe-documents";
import { documentFileError, documentObjectPath, getDocument, putDocument } from "@/lib/document-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function owner(req: NextRequest, writing: boolean) {
  if (writing && !sameOrigin(req)) return { error: NextResponse.json({ ok: false, error: "Origine refusée." }, { status: 403 }) };
  try {
    const user = await verifiedUser(req.cookies.get("cible-access")?.value || "");
    if (!user) return { error: NextResponse.json({ ok: false, error: "Connecte-toi pour accéder à tes documents." }, { status: 401 }) };
    if (!allowRequest(`${user.id}:/api/documents/file`, writing ? 20 : 120)) return { error: NextResponse.json({ ok: false, error: "Trop de demandes. Réessaie plus tard." }, { status: 429 }) };
    return { user };
  } catch { return { error: NextResponse.json({ ok: false, error: "Session indisponible. Réessaie." }, { status: 503 }) }; }
}
const safeName = (name: string) => name.replace(/[\r\n"\\/]/g, "_").slice(0, 130) || "document";

export async function POST(req: NextRequest) {
  const auth = await owner(req, true);
  if (auth.error) return auth.error;
  const url = new URL(req.url);
  const documentId = url.searchParams.get("documentId") || "";
  const versionId = url.searchParams.get("versionId") || "";
  try { documentObjectPath(auth.user!.id, documentId, versionId); }
  catch { return NextResponse.json({ ok: false, error: "Référence de fichier invalide." }, { status: 400 }); }
  const name = safeName(url.searchParams.get("name") || "");
  const mime = (req.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (Number(req.headers.get("content-length") || 0) > DOCUMENT_LIMIT) return NextResponse.json({ ok: false, error: "8 Mo maximum." }, { status: 413 });
  try {
    const reader = req.body?.getReader();
    if (!reader) return NextResponse.json({ ok: false, error: "Fichier absent." }, { status: 400 });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > DOCUMENT_LIMIT) { await reader.cancel(); return NextResponse.json({ ok: false, error: "8 Mo maximum." }, { status: 413 }); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const validation = documentFileError(name, mime, bytes);
    if (validation) return NextResponse.json({ ok: false, error: validation }, { status: 400 });
    await putDocument(auth.user!.id, documentId, versionId, bytes, mime);
    return NextResponse.json({ ok: true, documentId, versionId, size }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Stockage indisponible. Aucun document enregistré." }, { status: 503 }); }
}

export async function GET(req: NextRequest) {
  const auth = await owner(req, false);
  if (auth.error) return auth.error;
  const url = new URL(req.url);
  const documentId = url.searchParams.get("documentId") || "";
  const versionId = url.searchParams.get("versionId") || "";
  try { documentObjectPath(auth.user!.id, documentId, versionId); }
  catch { return NextResponse.json({ ok: false, error: "Référence de fichier invalide." }, { status: 400 }); }
  const name = safeName(url.searchParams.get("name") || "document");
  const inline = url.searchParams.get("preview") === "1";
  try {
    const stored = await getDocument(auth.user!.id, documentId, versionId);
    const type = stored.headers.get("content-type") || "application/octet-stream";
    const previewable = /^(application\/pdf|image\/(png|jpeg|webp)|text\/plain)$/.test(type);
    return new NextResponse(stored.body, { headers: { "Content-Type": type, "Content-Disposition": `${inline && previewable ? "inline" : "attachment"}; filename="${name}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Fichier indisponible." }, { status: 503 }); }
}
