import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord, saveUserRecord } from "@/lib/candidature-server";
import { askJson } from "@/lib/ai";
import { applyGroundedChanges } from "@/lib/cv-auto-adapt";
import { cvDocumentHtml } from "@/lib/cv";
import { generatePdfAndHash } from "@/lib/pdf-generator";
import { putDocument } from "@/lib/document-storage";
import type { DetectedOffer, UserData } from "@/lib/data";
import { bulkFingerprint, planBulkQueue } from "@/lib/bulk-cv-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type QueueItem = NonNullable<UserData["bulkCvQueue"]>[number];

export const GET = securedRoute(async (_req, { user }) => {
  try {
    const record = await loadUserRecord(user);
    return NextResponse.json({ ok: true, queue: record.data.bulkCvQueue || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ ok: false, error: "File indisponible." }, { status: 503 }); }
});

export const POST = securedRoute(async (req, { user }) => {
  let body: { action?: string; offerIds?: string[]; offers?: DetectedOffer[]; offerId?: string };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 }); }
  try {
    const record = await loadUserRecord(user);
    const data = record.data;
    if (body.action === "enqueue") {
      const incoming = (body.offers || []).filter(o => o?.id && typeof o.text === "string" && o.text.length <= 30_000);
      let next: UserData;
      try { next = planBulkQueue(data, body.offerIds || [], incoming); }
      catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Sélection invalide." }, { status: 400 }); }
      await saveUserRecord(user, { data: next, version: record.version });
      return NextResponse.json({ ok: true, queue: next.bulkCvQueue });
    }
    if (body.action === "cancel") {
      const queue = (data.bulkCvQueue || []).filter(item => item.offerId !== body.offerId || item.status === "running" || item.status === "ready");
      await saveUserRecord(user, { data: { ...data, bulkCvQueue: queue }, version: record.version });
      return NextResponse.json({ ok: true, queue });
    }
    if (body.action !== "prepare" || !body.offerId) return NextResponse.json({ ok: false, error: "Action invalide." }, { status: 400 });
    const offer = data.offers.find(o => o.id === body.offerId);
    const item = data.bulkCvQueue?.find(q => q.offerId === body.offerId);
    if (!offer || !item || !data.originalCv?.text || !data.cvData) return NextResponse.json({ ok: false, error: "Dossier incomplet." }, { status: 400 });
    if (item.key !== bulkFingerprint(offer, data)) return NextResponse.json({ ok: false, error: "Le CV ou l'offre a changé. Relance la préparation." }, { status: 409 });
    if (item.status === "ready") return NextResponse.json({ ok: true, item });
    if (item.status === "running" && Date.now() - Date.parse(item.updatedAt) < 5 * 60_000) return NextResponse.json({ ok: false, error: "Préparation déjà en cours." }, { status: 409 });
    const running: QueueItem = { ...item, status: "running", updatedAt: new Date().toISOString(), error: undefined };
    await saveUserRecord(user, { data: { ...data, bulkCvQueue: data.bulkCvQueue!.map(q => q.offerId === item.offerId ? running : q) }, version: record.version });
    try {
      const result = await askJson("adapt", { task: "adapt", cvOriginal: data.originalCv.text, offerText: `${offer.title} — ${offer.company}. ${offer.text.slice(0, 18_000)}`, orientation: "electrical" }) as { changes?: { original?: string; rewritten?: string; section?: string; method?: string }[] };
      const adapted = applyGroundedChanges(data.cvData, data.originalCv.text, result);
      const html = cvDocumentHtml(adapted.cv, data.cvDesign || { template: "professional", accent: "#246753", fontSize: 9.5 }, "CV cible", false);
      const { pdfBytes, sha256 } = await generatePdfAndHash(html, "CV-cible.pdf");
      const documentId = crypto.randomUUID(), versionId = crypto.randomUUID();
      await putDocument(user.id, documentId, versionId, pdfBytes, "application/pdf");
      const latest = await loadUserRecord(user);
      const ready: QueueItem = { ...running, status: "ready", updatedAt: new Date().toISOString(), documentId, versionId, sha256, fileName: "CV-cible.pdf", cv: adapted.cv, changes: adapted.changes };
      await saveUserRecord(user, { data: { ...latest.data, bulkCvQueue: (latest.data.bulkCvQueue || []).map(q => q.offerId === item.offerId ? ready : q) }, version: latest.version });
      return NextResponse.json({ ok: true, item: ready });
    } catch (error) {
      const latest = await loadUserRecord(user);
      const failed: QueueItem = { ...running, status: "failed", updatedAt: new Date().toISOString(), error: error instanceof Error && /429/.test(error.message) ? "Quota IA atteint. Réessaie plus tard." : "Préparation impossible. Réessaie." };
      await saveUserRecord(user, { data: { ...latest.data, bulkCvQueue: (latest.data.bulkCvQueue || []).map(q => q.offerId === item.offerId ? failed : q) }, version: latest.version });
      return NextResponse.json({ ok: false, error: failed.error, item: failed }, { status: 503 });
    }
  } catch { return NextResponse.json({ ok: false, error: "Sauvegarde de la file indisponible." }, { status: 503 }); }
});
