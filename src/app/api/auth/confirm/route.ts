import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-server";
export const dynamic = "force-dynamic";
/** Email template must point here with TokenHash, rather than expose JWTs in a URL fragment. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const hash = url.searchParams.get("token_hash") || "";
  const fail = () => NextResponse.redirect(new URL("/connexion?confirmation=expired", url.origin));
  if (!/^[a-zA-Z0-9_-]{20,200}$/.test(hash) || url.searchParams.get("type") !== "email") return fail();
  try {
    const client = authClient();
    const { data, error } = await client.auth.verifyOtp({ token_hash: hash, type: "email" });
    if (error || !data.session || !data.user?.email_confirmed_at) return fail();
    // Confirm the email without signing the visiting browser into an account
    // from a forwarded link. Login remains an explicit same-origin POST.
    await client.auth.admin.signOut(data.session.access_token, "local");
    const response = NextResponse.redirect(new URL("/connexion?confirmation=ok", url.origin));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch { return fail(); }
}
