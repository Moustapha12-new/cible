import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord, saveUserRecord } from "@/lib/candidature-server";
import type { CvData } from "@/lib/cv";

export const dynamic = "force-dynamic";

export const GET = securedRoute(async (_req, { user }) => {
  try {
    const record = await loadUserRecord(user);
    return NextResponse.json({ ok: true, originalCv: record.data.originalCv || null, cvData: record.data.cvData || null }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ ok: false, error: "CV serveur indisponible." }, { status: 503 }); }
});

export const PUT = securedRoute(async (req, { user }) => {
  let body: { originalCv?: { name: string; text: string } | null; cvData?: CvData | null };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 }); }
  if (body.originalCv !== undefined && body.originalCv !== null &&
      (typeof body.originalCv.text !== "string" || body.originalCv.text.length > 100_000)) {
    return NextResponse.json({ ok: false, error: "CV original invalide." }, { status: 400 });
  }
  if (body.cvData !== undefined && body.cvData !== null && (!body.cvData.basics || !Array.isArray(body.cvData.sections))) {
    return NextResponse.json({ ok: false, error: "CV structuré invalide." }, { status: 400 });
  }
  try {
    const record = await loadUserRecord(user);
    const next = { ...record.data,
      ...(body.originalCv !== undefined ? { originalCv: body.originalCv || undefined } : {}),
      ...(body.cvData !== undefined ? { cvData: body.cvData || undefined } : {}),
    };
    await saveUserRecord(user, { data: next, version: record.version });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Sauvegarde indisponible." }, { status: 503 });
  }
});
