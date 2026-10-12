import { NextRequest, NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord, saveUserRecord } from "@/lib/candidature-server";
import type { AppStatus } from "@/lib/data";

export const dynamic = "force-dynamic";
const statuses: AppStatus[] = ["sent", "interview", "offer", "rejected"];

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return securedRoute(async (request, { user }) => {
    let body: { status?: AppStatus; notes?: string };
    try { body = await request.json() as typeof body; }
    catch { return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 }); }
    if ((body.status && !statuses.includes(body.status)) || (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 5000)) || (!body.status && body.notes === undefined)) return NextResponse.json({ ok: false, error: "Modification invalide." }, { status: 400 });
    try {
      const record = await loadUserRecord(user);
      const existing = record.data.applications.find(a => a.id === id);
      if (!existing) return NextResponse.json({ ok: false, error: "Candidature introuvable sur le serveur." }, { status: 404 });
      const application = { ...existing, status: body.status || existing.status, notes: body.notes !== undefined ? body.notes : existing.notes,
        statusHistory: body.status && body.status !== existing.status ? [...(existing.statusHistory || []), { status: body.status, at: new Date().toISOString() }] : existing.statusHistory };
      await saveUserRecord(user, { ...record, data: { ...record.data, applications: record.data.applications.map(a => a.id === id ? application : a) } });
      return NextResponse.json({ ok: true, application }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Enregistrement indisponible." }, { status: 503 });
    }
  })(req);
}
