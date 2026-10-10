import { verifiedUser, SESSION_COOKIE, OAUTH_COOKIE, cookieOptions } from "@/lib/auth-server";
import { NextRequest, NextResponse } from "next/server";
import {
  consumeOauthState,
  saveOauthConnection,
  getOauthConnection,
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

  let owner;
  try { owner = await verifiedUser(req.cookies.get(SESSION_COOKIE)?.value || ""); } catch { return NextResponse.redirect(new URL(fail, origin)); }
  if (!owner || req.cookies.get(OAUTH_COOKIE)?.value !== state || oauthError || !code || !state) {
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
  if (!ctx || ctx.email.toLowerCase() !== owner.email) {
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

  if (!tok.refresh_token) return NextResponse.redirect(new URL("/app/alertes-gmail?error=refresh", origin));
  let gmailEmail = "";
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
    /* Google inaccessible : ne pas annoncer un compte Gmail incorrect. */
  }
  if (!gmailEmail) return NextResponse.redirect(new URL("/app/alertes-gmail?error=profile", origin));

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
    // Vérifier que la sauvegarde a vraiment fonctionné en relisant
    const saved = await getOauthConnection(ctx.email);
    if (!saved || !saved.accessToken || !saved.refreshToken) {
      return NextResponse.redirect(new URL("/app/alertes-gmail?error=storage", origin));
    }
  } catch {
    return NextResponse.redirect(new URL("/app/alertes-gmail?error=storage", origin));
  }
  const response = NextResponse.redirect(new URL(`/app/alertes-gmail?connected=${encodeURIComponent(ctx.email)}`, origin));
  response.cookies.set(OAUTH_COOKIE, "", cookieOptions(0));
  return response;
}
