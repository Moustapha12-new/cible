import { cookieOptions, OAUTH_COOKIE } from "@/lib/auth-server";
import { securedRoute } from "@/lib/auth-server";
import { NextResponse } from "next/server";
import { createOauthState, storageReady } from "@/lib/gmail-server";

export const dynamic = "force-dynamic";

const OAUTH_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/**
 * Démarre la connexion Google OAuth. Seul le scope gmail.readonly est demandé
 * (lecture potentielle de toute la boîte mail ; l’application limite ses
 * requêtes au libellé choisi, sans écriture/modification/suppression).
 * ?email=<adresse du compte cible> → c'est l'identifiant du « propriétaire ».
 */
export const GET = securedRoute(async (req, auth) => {
  const origin = new URL(req.url).origin;
  const email = auth.user.email;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, error: "Google OAuth non configuré côté serveur (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)" },
      { status: 500 }
    );
  }
  if (!email) {
    return NextResponse.json({ ok: false, error: "Compte utilisateur manquant" }, { status: 400 });
  }

  /* En production, la connexion OAuth exige le KV persistant : sans lui, on
     redirige vers l'app avec une erreur visible (jamais de crash /tmp). */
  if (!storageReady()) {
    return NextResponse.redirect(new URL("/app/alertes-gmail?error=storage", origin));
  }

  let state: string;
  try {
    state = await createOauthState(email);
  } catch {
    /* Store Blob suspendu / injouable : jamais de 500, renvoi vers l'app. */
    return NextResponse.redirect(new URL("/app/alertes-gmail?error=storage", origin));
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/gmail/callback`,
    response_type: "code",
    scope: OAUTH_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  response.cookies.set(OAUTH_COOKIE, state, cookieOptions(600));
  return response;
});