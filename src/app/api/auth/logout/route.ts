import { NextRequest, NextResponse } from "next/server";
import { authClient, cookieOptions, sameOrigin, SESSION_COOKIE, REFRESH_COOKIE, OAUTH_COOKIE } from "@/lib/auth-server";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try { await authClient().auth.admin.signOut(token, "local"); } catch { /* Cookies are cleared even if the provider is unavailable. */ }
  }
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  response.cookies.set(REFRESH_COOKIE, "", cookieOptions(0));
  response.cookies.set(OAUTH_COOKIE, "", cookieOptions(0));
  return response;
}
