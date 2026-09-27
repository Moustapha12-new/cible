import { NextRequest, NextResponse } from "next/server";
import { storeGet } from "@/lib/gmail-server";

export const dynamic = "force-dynamic";

type ProgressSnap = {
  processed?: number;
  total?: number;
  running?: boolean;
  runId?: string;
  startedAt?: string;
  updatedAt?: string;
  endedAt?: string;
};

/** Progression légère du run en cours (P0-9) : 1 lecture de stockage —
    pensé pour un poll toutes les ~3 s pendant la synchronisation. */
export async function GET(req: NextRequest) {
  const email = (new URL(req.url).searchParams.get("email") || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ ok: false, error: "Compte utilisateur manquant" }, { status: 400 });
  }
  try {
    const raw = await storeGet(`gmail:progress:${email}`);
    if (!raw) return NextResponse.json({ ok: true, running: false });
    const p = JSON.parse(raw) as ProgressSnap;
    const updatedAt = p.updatedAt ?? p.startedAt ?? "";
    const age = updatedAt ? Date.now() - Date.parse(updatedAt) : Number.POSITIVE_INFINITY;
    /* Fraîcheur 120 s : un run écrivait au plus toutes les 30 s → au-delà,
       la clé est orpheline (run coupé) et on n'affiche plus « en cours ». */
    const running = p.running === true && age < 120_000;
    return NextResponse.json({
      ok: true,
      running,
      processed: Number.isFinite(Number(p.processed)) ? Math.max(0, Number(p.processed)) : 0,
      total: Number.isFinite(Number(p.total)) ? Math.max(0, Number(p.total)) : 0,
      runId: p.runId ?? null,
      startedAt: p.startedAt ?? null,
      updatedAt: updatedAt || null,
    });
  } catch {
    /* best-effort : jamais bloquant pour l'UI */
    return NextResponse.json({ ok: true, running: false });
  }
}
