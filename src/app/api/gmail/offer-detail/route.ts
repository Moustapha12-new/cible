import { loadSnapshot } from "@/lib/gmail-snapshot";
import { securedRoute } from "@/lib/auth-server";
import { NextResponse } from "next/server";
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
export const GET = securedRoute(async (req, auth) => {
  const id = (new URL(req.url).searchParams.get("id") || "").trim();
  if (!/^[\w.-]{1,128}$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Identifiant d'e-mail invalide" }, { status: 400 });
  }
  const snapshot = await loadSnapshot(auth.user.email);
  if (!snapshot?.emails.some(email => email.id === id)) return NextResponse.json({ ok: false, error: "Offre inaccessible pour ce compte." }, { status: 403 });
  beginCheckpointCache();
  try {
    const cp = await loadCheckpoint(id);
    return NextResponse.json({
      ok: true,
      offers: canonicalizeOffers(cp?.offers ?? snapshot.emails.find(email => email.id === id)?.offers ?? []),
    });
  } finally {
    endCheckpointCache();
  }
});
