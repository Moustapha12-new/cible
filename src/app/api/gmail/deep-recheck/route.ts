import { NextRequest, NextResponse } from "next/server";
import {
  buildDeepReport,
  deepStatus,
  initDeepRecheck,
  processNextBatch,
  processNextOffers,
  resetDeepRecheck,
  runDeepRecheck,
} from "@/lib/deep-recheck";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  email?: string;
  action?: "init" | "step" | "run" | "status" | "report" | "reset";
  timeBudgetMs?: number;
  offersPerStep?: number;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Requête invalide" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const action = body.action || "status";
  if (!email) {
    return NextResponse.json({ ok: false, error: "Compte utilisateur manquant" }, { status: 400 });
  }

  try {
    switch (action) {
      case "init": {
        const meta = await initDeepRecheck(email);
        return NextResponse.json(
          { ok: true, action, meta: { phase: meta.phase, totalEmails: meta.totalEmails, batches: meta.batches.length } },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
      case "step": {
        const status = await deepStatus(email);
        if (!status.meta) {
          return NextResponse.json({ ok: false, error: "Non initialisé — appelle action:init" }, { status: 409 });
        }
        if (status.meta.phase === "detect") {
          const r = await processNextBatch(email);
          return NextResponse.json(
            { ok: true, action, phase: r.meta.phase, detectPending: r.meta.batches.filter((b) => b.status === "pending").length },
            { headers: { "Cache-Control": "no-store" } }
          );
        }
        const r = await processNextOffers(email, { limit: body.offersPerStep ?? 3, concurrency: 2 });
        return NextResponse.json(
          { ok: true, action, phase: r.meta.phase, remaining: r.remaining, offersAnalyzed: r.meta.offersAnalyzed },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
      case "run": {
        const r = await runDeepRecheck(email, {
          timeBudgetMs: Math.min(body.timeBudgetMs ?? 200_000, 260_000),
          offersPerStep: body.offersPerStep ?? 3,
        });
        return NextResponse.json(
          {
            ok: true,
            action,
            phase: r.phase,
            detectPending: r.detectPending,
            offersTotal: r.offersTotal,
            offersAnalyzed: r.offersAnalyzed,
            remaining: r.remaining,
            report: r.report ?? null,
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
      case "status": {
        const s = await deepStatus(email);
        return NextResponse.json({ ok: true, action, ...s }, { headers: { "Cache-Control": "no-store" } });
      }
      case "report": {
        const report = await buildDeepReport(email);
        if (!report) {
          return NextResponse.json({ ok: false, error: "Aucun résultat — initialise d'abord" }, { status: 409 });
        }
        return NextResponse.json({ ok: true, action, report }, { headers: { "Cache-Control": "no-store" } });
      }
      case "reset": {
        await resetDeepRecheck(email);
        return NextResponse.json({ ok: true, action }, { headers: { "Cache-Control": "no-store" } });
      }
      default:
        return NextResponse.json({ ok: false, error: "Action inconnue" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur Deep Recheck";
    const status = /non connecté|expirée/i.test(msg) ? 401 : 502;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
