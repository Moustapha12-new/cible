import { NextRequest, NextResponse } from "next/server";
import {
  consumeOauthState,
  saveOauthConnection,
  storageReady,
  type GmailConnection,
} from "@/lib/gmail-server";
import { exchangeCode } from "@/lib/gmail-oauth";

export const dynamic = "force-dynamic";

export const GET = authCallback;
export const POST = authCallback;

/** Callback OAuth — alias /api/gmail/auth/callback (redirect_uri configurable). */
async function authCallback(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const fail = "/app/alertes-gmail?error=1";

  if (oauthError || !code || !state) {
    return NextResponse.redirect(new URL(fail, origin));
  }
  if (!storageReady()) {
    return NextResponse.redirect(new URL("/app/alertes-gmail?error=storage", origin));
  }

  let ctx: { email: string } | null = null;
  try {
    ctx = await consumeOauthState(state);
  } catch {
    return NextResponse.redirect(new URL("/app/alertes-gmail?error=storage", origin));
  }
  if (!ctx) {
    return NextResponse.redirect(new URL("/app/alertes-gmail?error=state", origin));
  }

  let tok: { access_token?: string; refresh_token?: string; expires_in?: number };
  try {
    tok = await exchangeCode(origin, code);
  } catch {
    return NextResponse.redirect(new URL("/app/alertes-gmail?error=token", origin));
  }
  if (!tok.access_token) {
    return NextResponse.redirect(new URL("/app/alertes-gmail?error=token", origin));
  }

  let gmailEmail = ctx.email;
  try {
    const prof = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
      cache: "no-store",
    });
    if (prof.ok) {
      const p = (await prof.json()) as { emailAddress?: string };
      if (p.emailAddress) gmailEmail = p.emailAddress;
    }
  } catch {
    /* profil KO → on garde l'email du state */
  }

  const connection: GmailConnection = {
    v: 1,
    userId: ctx.email,
    gmailEmail,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
    labelId: null,
    labelName: null,
    lastSync: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  try {
    await saveOauthConnection(ctx.email, connection);
  } catch {
    return NextResponse.redirect(new URL("/app/alertes-gmail?error=storage", origin));
  }
  return NextResponse.redirect(
    new URL(`/app/alertes-gmail?connected=${encodeURIComponent(ctx.email)}`, origin)
  );
}
