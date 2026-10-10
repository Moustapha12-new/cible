import { NextRequest, NextResponse } from "next/server";
import { verifiedUser, SESSION_COOKIE, REFRESH_COOKIE, authClient, cookieOptions, sameOrigin } from "@/lib/auth-server";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const user = await verifiedUser(req.cookies.get(SESSION_COOKIE)?.value || "");
    return NextResponse.json({ ok: true, user }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Vérification de la connexion indisponible." }, { status: 503 });
  }
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh) return NextResponse.json({ ok: true, user: null });
  try {
    const { data, error } = await authClient().auth.refreshSession({ refresh_token: refresh });
    if (error || !data.session) return NextResponse.json({ ok: true, user: null });
    const user = await verifiedUser(data.session.access_token);
    if (!user) return NextResponse.json({ ok: true, user: null });
    const response = NextResponse.json({ ok: true, user }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE, data.session.access_token, cookieOptions(data.session.expires_in));
    response.cookies.set(REFRESH_COOKIE, data.session.refresh_token, cookieOptions(30 * 86400));
    return response;
  } catch { return NextResponse.json({ ok: false, error: "Connexion indisponible." }, { status: 503 }); }
}
