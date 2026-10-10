/* Helpers OAuth Gmail — construction URL + échange de code + refresh. */

export const GMAIL_OAUTH_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function buildAuthUrl(origin: string, email: string, state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID manquant");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/gmail/auth/callback`,
    response_type: "code",
    scope: GMAIL_OAUTH_SCOPE,
    access_type: "offline",
    prompt: "select_account consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

export async function exchangeCode(origin: string, code: string): Promise<TokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID/SECRET manquants");
  const redirectUri = `${origin}/api/gmail/auth/callback`;
  console.info(`[exchangeCode] Exchanging code with redirect_uri: ${redirectUri}`);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    console.error(`[exchangeCode] Token exchange failed: status=${res.status}, error=${json.error}, description=${json.error_description}`);
    throw new Error(`Échange de code OAuth échoué: ${json.error_description || json.error || "unknown error"}`);
  }
  if (!json.access_token) {
    console.error(`[exchangeCode] No access_token in response:`, json);
    throw new Error("Échange de code OAuth échoué: pas de token d'accès");
  }
  return json;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID/SECRET manquants");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.access_token) throw new Error("Refresh token échoué");
  return json;
}
