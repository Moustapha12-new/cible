import { NextRequest, NextResponse } from "next/server";
import {
  beginCheckpointCache,
  endCheckpointCache,
  loadCheckpoint,
  canonicalizeOffers,
} from "@/lib/gmail-core";

export const dynamic = "force-dynamic";

/** GET /api/gmail/offer-detail?id=<emailId> — P0-5 : régénère les offres
    COMPLÈTES (snippet HTML + sourceUrl inclus) d'un e-mail depuis son
    checkpoint, à la demande — le dashboard sert un payload allégé. */
export async function GET(req: NextRequest) {
  const id = (new URL(req.url).searchParams.get("id") || "").trim();
  if (!/^[\w.-]{1,128}$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Identifiant d'e-mail invalide" }, { status: 400 });
  }
  beginCheckpointCache();
  try {
    const cp = await loadCheckpoint(id);
    return NextResponse.json({
      ok: true,
      offers: cp ? canonicalizeOffers(cp.offers ?? []) : [],
    });
  } finally {
    endCheckpointCache();
  }
}
