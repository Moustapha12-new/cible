import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord, saveUserRecord } from "@/lib/candidature-server";
import { getDocument, documentObjectPath } from "@/lib/document-storage";
import { computeSha256 } from "@/lib/pdf-generator";
import { offerSnapshot, type Application, type DetectedOffer, type UserData } from "@/lib/data";
import { cvToText } from "@/lib/cv";

export const dynamic = "force-dynamic";
type Body = { offer: DetectedOffer; documentId: string; versionId: string; sha256: string; fileName: string; cvText?: string };

export const POST = securedRoute(async (req, { user }) => {
  let body: Body;
  try { body = await req.json() as Body; }
  catch { return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 }); }
  const { offer, documentId, versionId, sha256, fileName } = body;
  if (!offer || typeof offer.id !== "string" || !offer.id || typeof offer.title !== "string" || !offer.title ||
      typeof offer.company !== "string" || !offer.company || typeof fileName !== "string" || !/^[\w.-]{1,180}\.pdf$/.test(fileName) ||
      typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256)) {
    return NextResponse.json({ ok: false, error: "Offre ou CV invalide." }, { status: 400 });
  }
  try {
    const owner = user.id;
    documentObjectPath(owner, documentId, versionId);
    const stored = await getDocument(owner, documentId, versionId);
    const bytes = new Uint8Array(await stored.arrayBuffer());
    if (await computeSha256(bytes) !== sha256) throw new Error("Le PDF archivé ne correspond pas au PDF préparé.");
    const record = await loadUserRecord(user);
    const existing = record.data.applications.find(a => a.offerId === offer.id);
    if (existing?.sentDocumentVersions?.some(v => v.documentId === documentId && v.versionId === versionId && v.sha256 === sha256)) {
      return NextResponse.json({ ok: true, application: existing, alreadySaved: true }, { headers: { "Cache-Control": "no-store" } });
    }
    const prepared = record.data.bulkCvQueue?.find(q => q.offerId === offer.id && q.documentId === documentId && q.versionId === versionId && q.sha256 === sha256);
    const override = record.data.offerCvOverrides?.[offer.id];
    const personal = override?.documentId === documentId && override.versionId === versionId && override.sha256 === sha256 ? override : undefined;
    const now = new Date().toISOString();
    const application: Application = {
      ...(existing || {}), id: existing?.id || crypto.randomUUID(), offerId: offer.id,
      offerUrl: typeof offer.url === "string" && /^https?:\/\//.test(offer.url) ? offer.url.slice(0, 2000) : existing?.offerUrl,
      company: offer.company.slice(0, 200), role: offer.title.slice(0, 250),
      source: offer.source || "cible", status: existing?.status || "sent", daysAgo: 0, date: existing?.date || now,
      cvName: fileName, cvText: personal ? personal.text : prepared?.cv ? cvToText(prepared.cv) : typeof body.cvText === "string" ? body.cvText.slice(0, 100_000) : undefined,
      sentCvAdaptationId: personal ? undefined : prepared?.key,
      sentDocumentVersions: [
        ...(existing?.sentDocumentVersions || []), { documentId, versionId, sha256, fileName, sentAt: now, source: personal ? "personal" : "generated" },
      ],
      statusHistory: existing ? existing.statusHistory : [{ status: "sent", at: now }],
      offerSnapshot: offerSnapshot(offer),
    };
    const next: UserData = {
      ...record.data,
      offers: record.data.offers.some(o => o.id === offer.id) ? record.data.offers : [...record.data.offers, offer],
      applications: existing
        ? record.data.applications.map(a => a.id === existing.id ? application : a)
        : [...record.data.applications, application],
    };
    await saveUserRecord(user, { ...record, data: next });
    return NextResponse.json({ ok: true, application }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Enregistrement indisponible." }, { status: 503 });
  }
});
