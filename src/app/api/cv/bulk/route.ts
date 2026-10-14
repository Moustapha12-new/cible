import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord, saveUserRecord } from "@/lib/candidature-server";
import { askJson } from "@/lib/ai";
import { applyGroundedChanges } from "@/lib/cv-auto-adapt";
import { onePageCandidates } from "@/lib/cv-one-page";
import { cvDocumentHtml, normalizeCvData } from "@/lib/cv";
import { generatePdfAndHash } from "@/lib/pdf-generator";
import { putDocument } from "@/lib/document-storage";
import type { DetectedOffer, UserData } from "@/lib/data";
import { bulkFingerprint, planBulkQueue } from "@/lib/bulk-cv-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type QueueItem = NonNullable<UserData["bulkCvQueue"]>[number];

function preparationError(error: unknown, stage: string): string {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Aucune adaptation vérifiable")) return message;
  if (message.includes("dépasse une page A4")) return "Le CV adapté reste trop long pour une page A4 lisible, même après condensation automatique. Vérifie le contenu de cette version dans l’éditeur.";
  if (stage === "pdf") return "Le PDF n'a pas pu être généré. Vérifie le format du CV, puis réessaie.";
  if (stage === "storage") return /^Stockage|^Supabase refuse|^Cette version/.test(message) ? message : "Le PDF a été créé, mais son archivage privé a échoué. Réessaie plus tard.";
  if (stage === "save") return "Le PDF a été créé, mais le suivi n'a pas pu être enregistré. Réessaie sans modifier le CV.";
  return "L'adaptation du CV a échoué. Réessaie ou vérifie les compétences de ton CV original.";
}

export const GET = securedRoute(async (_req, { user }) => {
  try {
    const record = await loadUserRecord(user);
    const queue = (record.data.bulkCvQueue || []).filter(item => {
      const offer = record.data.offers.find(candidate => candidate.id === item.offerId);
      return item.status !== "ready" || !offer || item.key === bulkFingerprint(offer, record.data);
    });
    return NextResponse.json({ ok: true, queue }, { headers: { "Cache-Control": "no-store" } });
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
    let stage = "adaptation";
    try {
      let result: { changes?: { original?: string; rewritten?: string; section?: string; method?: string }[] } = { changes: [] };
      let method: "ai" | "grounded" = "ai";
      try {
        result = await askJson("adapt", { task: "adapt", cvOriginal: data.originalCv.text, offerText: `${offer.title} — ${offer.company}. ${offer.text.slice(0, 18_000)}`, keywords: [...new Set([...(offer.skills || []), ...(offer.keywords || [])])].slice(0, 15).map(term => ({ term })) }) as typeof result;
      } catch (error) {
        method = "grounded";
        console.warn("CV AI preparation unavailable; trying grounded adaptation", { quota: error instanceof Error && /429|quota|rate/i.test(error.message) });
      }
      if (!result.changes?.length) method = "grounded";
      const adapted = applyGroundedChanges(normalizeCvData(data.cvData), data.originalCv.text, result, [...(offer.skills || []), ...(offer.keywords || [])], `${offer.title}. ${offer.text}`);
      if (adapted.changes.length === 0) throw new Error("Aucune adaptation vérifiable à partir du CV original. Vérifie et complète les compétences de ton CV, puis réessaie.");
      if (method === "grounded") adapted.changes.unshift("Préparation locale basée sur le CV original ; service IA indisponible");
      stage = "pdf";
      const design = data.cvDesign || { template: "professional", accent: "#246753", fontSize: 9.5 };
      const variants = [{ cv: adapted.cv, change: "" }, ...onePageCandidates(adapted.cv, `${offer.title}. ${offer.text}`)];
      let rendered: Awaited<ReturnType<typeof generatePdfAndHash>> | undefined;
      let selected = adapted.cv;
      for (const variant of variants) {
        try {
          rendered = await generatePdfAndHash(cvDocumentHtml(variant.cv, design, "CV cible", false), "CV-cible.pdf");
          selected = variant.cv;
          if (variant.change) adapted.changes.push(variant.change);
          break;
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes("page A4")) throw error;
          if (variant === variants[variants.length - 1]) throw error;
        }
      }
      if (!rendered) throw new Error("Le CV dépasse une page A4 lisible.");
      const { pdfBytes, sha256 } = rendered;
      const documentId = crypto.randomUUID(), versionId = crypto.randomUUID();
      stage = "storage";
      await putDocument(user.id, documentId, versionId, pdfBytes, "application/pdf");
      stage = "save";
      const latest = await loadUserRecord(user);
      const ready: QueueItem = { ...running, status: "ready", updatedAt: new Date().toISOString(), documentId, versionId, sha256, fileName: "CV-cible.pdf", cv: selected, changes: adapted.changes, method };
      await saveUserRecord(user, { data: { ...latest.data, bulkCvQueue: (latest.data.bulkCvQueue || []).map(q => q.offerId === item.offerId ? ready : q) }, version: latest.version });
      return NextResponse.json({ ok: true, item: ready });
    } catch (error) {
      console.error("CV preparation failed", { stage, reason: error instanceof Error ? error.name : "unknown" });
      const latest = await loadUserRecord(user);
      const failed: QueueItem = { ...running, status: "failed", updatedAt: new Date().toISOString(), error: preparationError(error, stage) };
      await saveUserRecord(user, { data: { ...latest.data, bulkCvQueue: (latest.data.bulkCvQueue || []).map(q => q.offerId === item.offerId ? failed : q) }, version: latest.version });
      return NextResponse.json({ ok: false, error: failed.error, item: failed }, { status: 503 });
    }
  } catch { return NextResponse.json({ ok: false, error: "Sauvegarde de la file indisponible." }, { status: 503 }); }
});
