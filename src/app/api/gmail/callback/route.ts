import { NextRequest, NextResponse } from "next/server";
import {
  consumeOauthState,
  saveOauthConnection,
  storageReady,
  type GmailConnection,
} from "@/lib/gmail-server";

export const dynamic = "force-dynamic";

export const GET = authCallback;
export const POST = authCallback;

async function authCallback(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const fail = `/${encodeURIComponent("app/alertes-gmail?error=1")}`;

  if (oauthError || !code || !state) {
    return NextResponse.redirect(new URL(fail, origin));
  }

  if (!storageReady()) {
    return NextResponse.redirect(new URL("/app/alertes-gmail?error=storage", origin));
  }

  /* Vérifie que le state a bien été émis par nous pour ce compte. */
  let ctx: { email: string } | null = null;
  try {
    ctx = await consumeOauthState(state);
  } catch {
    return NextResponse.redirect(new URL("/app/alertes-gmail?error=storage", origin));
  }
  if (!ctx) {
    return NextResponse.redirect(new URL("/app/alertes-gmail?error=state", origin));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/app/alertes-gmail?error=config", origin));
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${origin}/api/gmail/callback`,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const tok = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!tokenRes.ok || !tok.access_token) {
    return NextResponse.redirect(new URL("/app/alertes-gmail?error=token", origin));
  }

  /* Compte Gmail réellement autorisé (profil Google), pas seulement le
     compte de l'app. */
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
    /* on reste sur le compte de l'app si le profil ne répond pas */
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
  /* Fiche OAuth CHIFFRÉE côté serveur (record complet), stockée dans le KV
     persistant partagé — jamais exposée au navigateur, jamais en /tmp. */
  try {
    await saveOauthConnection(ctx.email, connection);
  } catch {
    return NextResponse.redirect(new URL("/app/alertes-gmail?error=storage", origin));
  }

  return NextResponse.redirect(new URL(`/app/alertes-gmail?connected=${encodeURIComponent(ctx.email)}`, origin));
}