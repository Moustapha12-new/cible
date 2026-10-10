import { NextRequest, NextResponse } from "next/server";
import { authClient, cookieOptions, sameOrigin, SESSION_COOKIE, REFRESH_COOKIE } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Origine refusée." }, { status: 403 });
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || typeof body.password !== "string" || body.password.length > 256) return NextResponse.json({ ok: false, error: "Identifiants invalides." }, { status: 400 });
    
    const { data, error } = await authClient().auth.signInWithPassword({ email, password: body.password });
    if (error && ((error.status ?? 0) >= 500 || error.status === 429 || error.name === "AuthRetryableFetchError")) return NextResponse.json({ ok: false, error: "Service temporairement indisponible. Réessaie." }, { status: 503 });
    
    if (error || !data.session || !data.user.email_confirmed_at) {
      const msg = error?.message || "";
      if (msg.includes("Email not confirmed") || msg.includes("email_confirmed")) {
        return NextResponse.json({ ok: false, error: "E-mail non confirmé. Vérifie tes spams ou <a href=\"/connexion?resend=1\" class=\"underline\">renvoie le lien</a>.", status: 401, needsConfirmation: true });
      }
      if (msg.includes("Invalid login credentials") || msg.includes("invalid_credentials")) {
        return NextResponse.json({ ok: false, error: "Identifiants incorrects." }, { status: 401 });
      }
      return NextResponse.json({ ok: false, error: "Identifiants incorrects ou e-mail non confirmé." }, { status: 401 });
    }
    
    const response = NextResponse.json({ ok: true, user: { email: data.user.email!.toLowerCase(), name: String(data.user.user_metadata?.name || data.user.email).slice(0, 100) } }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE, data.session.access_token, cookieOptions(data.session.expires_in));
    response.cookies.set(REFRESH_COOKIE, data.session.refresh_token, cookieOptions(30 * 86400));
    return response;
  } catch { return NextResponse.json({ ok: false, error: "Connexion indisponible. Réessaie." }, { status: 503 }); }
}
