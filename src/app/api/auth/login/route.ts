import { NextRequest, NextResponse } from "next/server";
import { allowRequest, authClient, cookieOptions, sameOrigin, SESSION_COOKIE, REFRESH_COOKIE } from "@/lib/auth-server";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Origine refusée." }, { status: 403 });
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || typeof body.password !== "string" || body.password.length > 256) return NextResponse.json({ ok: false, error: "Identifiants invalides." }, { status: 400 });
    if (!allowRequest(`login:${email}`, 8)) return NextResponse.json({ ok: false, error: "Trop de tentatives. Réessaie dans une minute." }, { status: 429 });
    const { data, error } = await authClient().auth.signInWithPassword({ email, password: body.password });
    if (error && ((error.status ?? 0) >= 500 || error.status === 429 || error.name === "AuthRetryableFetchError")) return NextResponse.json({ ok: false, error: "Le service de connexion est temporairement indisponible. Réessaie." }, { status: 503 });
    if (error || !data.session || !data.user.email_confirmed_at) return NextResponse.json({ ok: false, error: "Identifiants incorrects ou adresse non confirmée. Pour un ancien compte local, crée un compte sécurisé avec la même adresse et confirme l’e-mail reçu." }, { status: 401 });
    const response = NextResponse.json({ ok: true, user: { email: data.user.email!.toLowerCase(), name: String(data.user.user_metadata?.name || data.user.email).slice(0, 100) } }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE, data.session.access_token, cookieOptions(data.session.expires_in));
    response.cookies.set(REFRESH_COOKIE, data.session.refresh_token, cookieOptions(30 * 86400));
    return response;
  } catch { return NextResponse.json({ ok: false, error: "Connexion indisponible. Réessaie." }, { status: 503 }); }
}
