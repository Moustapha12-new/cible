import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServerConfig } from "./supabase-server";
import { withGmailAccount } from "./gmail-account";

export const SESSION_COOKIE = "cible-access";
export const REFRESH_COOKIE = "cible-refresh";
export const OAUTH_COOKIE = "cible-gmail-state";
export type VerifiedUser = { id: string; email: string; name: string };

// A new client per request: never share a user's session between requests.
export function authClient() {
  const config = supabaseServerConfig();
  if (!config) throw new Error("Authentification serveur non configurée.");
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(10_000)]) }) },
  });
}

// Dedicated client for quota RPC calls with longer timeout (30s) to prevent false quota errors on slow networks.
export function quotaClient() {
  const config = supabaseServerConfig();
  if (!config) throw new Error("Authentification serveur non configurée.");
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(30_000)]) }) },
  });
}

export async function verifiedUser(token?: string): Promise<VerifiedUser | null> {
  const access = token ?? (await cookies()).get(SESSION_COOKIE)?.value;
  if (!access) return null;
  const { data, error } = await authClient().auth.getUser(access);
  if (error && ((error.status ?? 0) >= 500 || error.status === 429 || error.name === "AuthRetryableFetchError")) throw new Error("Vérification de session indisponible.");
  const user = data.user;
  if (error || !user?.email || !user.email_confirmed_at || user.is_anonymous) return null;
  return { id: user.id, email: user.email.trim().toLowerCase(), name: String(user.user_metadata?.name || user.email).slice(0, 100) };
}

export function sameOrigin(req: NextRequest): boolean {
  return req.headers.get("origin") === new URL(req.url).origin && req.headers.get("sec-fetch-site") !== "cross-site";
}

export function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

// Supplemental per-instance throttling; the deployment also needs a shared quota.
const buckets = new Map<string, { count: number; until: number }>();
export function allowRequest(key: string, limit: number, now = Date.now()): boolean {
  for (const [k, value] of buckets) if (value.until <= now) buckets.delete(k);
  const value = buckets.get(key);
  if (value && value.until > now) {
    if (value.count >= limit) {
      console.warn(`[rate-limit] Local limit exceeded for ${key} (count=${value.count}/${limit})`);
      return false;
    }
    value.count++;
    return true;
  }
  if (buckets.size >= 10_000) {
    console.error(`[rate-limit] Bucket map size limit reached (${buckets.size})`);
    return false;
  }
  buckets.set(key, { count: 1, until: now + 60_000 });
  return true;
}

/** Run in the handler, before touching storage, OAuth, scraping or Gemini. */
export async function authorizeApi(req: NextRequest): Promise<{ user: VerifiedUser; response?: never } | { user?: never; response: NextResponse }> {
  const fail = (status: number, error: string) => ({ response: NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } }) });
  if (req.headers.get("sec-fetch-site") === "cross-site" || (!['GET', 'HEAD'].includes(req.method) && !sameOrigin(req))) return fail(403, "Origine de la requête refusée.");
  let user: VerifiedUser | null;
  try { user = await verifiedUser(req.cookies.get(SESSION_COOKIE)?.value || ""); }
  catch { return fail(503, "Vérification de la connexion indisponible. Réessaie."); }
  if (!user) return fail(401, "Connecte-toi avec ton compte vérifié.");
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (!['GET', 'HEAD'].includes(req.method)) {
    if (Number(req.headers.get("content-length") || 0) > 2_000_000) return fail(413, "Requête trop volumineuse.");
    try {
      const raw = await req.clone().text();
      if (raw.length > 2_000_000) return fail(413, "Requête trop volumineuse.");
      body = raw ? JSON.parse(raw) : {};
      if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "Requête invalide.");
    } catch { return fail(400, "Requête invalide."); }
  }
  const owners = [url.searchParams.get("email"), body.email].filter(v => v !== null && v !== undefined);
  if (owners.some(email => typeof email !== "string" || email.trim().toLowerCase() !== user.email)) return fail(403, "Ce compte ne t’appartient pas.");
  if (!allowRequest(`${user.id}:${url.pathname}`, req.method === "GET" || url.pathname === "/api/catalog/import" ? 120 : 12)) return fail(429, "Trop de demandes. Réessaie dans une minute.");
  if (["/api/ai", "/api/scrape", "/api/jobs", "/api/gmail/sync", "/api/gmail/enrich", "/api/gmail/deep-recheck"].includes(url.pathname) || (url.pathname === "/api/user-data" && req.method === "POST")) {
    try {
      const { consumeQuota } = await import("./security-quota");
      if (!await consumeQuota(user.id, url.pathname)) return fail(429, "Trop de demandes. Réessaie dans une minute.");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("Protection des quotas indisponible")) {
        console.error("[quota] Client or network failure before RPC result", {
          category: error instanceof Error && /configur|clé serveur|URL serveur/i.test(error.message) ? "configuration" : "network_or_runtime",
        });
      }
      return fail(503, "Protection des quotas indisponible. Réessaie plus tard.");
    }
  }
  return { user };
}

export function securedRoute(handler: (req: NextRequest, auth: { user: VerifiedUser }) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const auth = await authorizeApi(req);
    if (auth.response) return auth.response;
    try { return await withGmailAccount(auth.user.email, () => handler(req, { user: auth.user })); }
    catch { return NextResponse.json({ ok: false, error: "Opération interrompue. Vérifie le stockage serveur puis réessaie ; les données enregistrées sont conservées." }, { status: 503 }); }
  };
}
