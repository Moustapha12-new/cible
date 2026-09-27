import { NextRequest, NextResponse } from "next/server";
import {
  getAccessToken,
  gmailJson,
  getOauthConnection,
  pickGmailDisplayAddress,
  GMAIL_LABEL,
} from "@/lib/gmail-server";
import { humanizeGmailError } from "@/lib/gmail-dashboard";

export const dynamic = "force-dynamic";

/** Sans révéler aucun token : état de connexion + compte Gmail associé. */
export async function GET(req: NextRequest) {
  const email = (new URL(req.url).searchParams.get("email") || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ ok: false, error: "Compte utilisateur manquant" }, { status: 400 });
  }

  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (!configured) {
    return NextResponse.json({
      ok: true,
      connected: false,
      configured: false,
      reason: "Configuration Google OAuth manquante (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)",
      label: GMAIL_LABEL,
    });
  }

  try {
    const accessToken = await getAccessToken(email);
    const profile = await gmailJson<{ emailAddress?: string }>("users/me/profile", accessToken);
    let connInfo: { lastSync: string | null; labelId: string | null; gmailEmail?: string } = {
      lastSync: null,
      labelId: null,
    };
    try {
      const conn = await getOauthConnection(email);
      if (conn) {
        connInfo = { lastSync: conn.lastSync, labelId: conn.labelId, gmailEmail: conn.gmailEmail };
      }
    } catch {
      /* métadonnées non persistées → on continue sans les exposer */
    }
    return NextResponse.json({
      ok: true,
      connected: true,
      configured: true,
      gmailAccount: pickGmailDisplayAddress(profile.emailAddress, connInfo.gmailEmail, email),
      lastSync: connInfo.lastSync,
      labelId: connInfo.labelId,
      label: GMAIL_LABEL,
    });
  } catch (e) {
    const h = humanizeGmailError(e);
    return NextResponse.json({
      ok: true,
      connected: false,
      configured: true,
      reason: h.human,
      ...(h.detail ? { detail: h.detail } : {}),
      label: GMAIL_LABEL,
    });
  }
}