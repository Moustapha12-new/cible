import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-server";
export const dynamic = "force-dynamic";

/** 
 * Handle email confirmation. Supports two flows:
 * 1. Custom flow: token_hash + type=email (for customized Supabase email templates)
 * 2. Standard PKCE flow: token + type=signup (Supabase default email template)
 * 
 * Required Supabase configuration:
 * - Site URL: https://cible-mu.vercel.app
 * - Redirect URLs: https://cible-mu.vercel.app/connexion, https://cible-mu.vercel.app/api/auth/confirm
 * - Email template (Auth > Email Templates > Confirm signup): 
 *   {{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=email
 *   Or use default template with Site URL set correctly
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const fail = (msg = "expired") => NextResponse.redirect(new URL(`/connexion?confirmation=${msg}`, origin));

  // Custom flow: token_hash + type=email
  const tokenHash = url.searchParams.get("token_hash") || "";
  const type = url.searchParams.get("type") || "";
  
  // Standard PKCE flow: token + type=signup (Supabase default)
  const token = url.searchParams.get("token") || "";
  const pkceType = url.searchParams.get("type") === "signup" ? "signup" : "";

  try {
    const client = authClient();
    let data, error;

    if (tokenHash && type === "email") {
      // Custom flow: verify OTP with token_hash
      const result = await client.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
      data = result.data;
      error = result.error;
    } else if (token && pkceType === "signup") {
      // Standard PKCE flow: verify the token directly
      const result = await client.auth.verifyOtp({ token_hash: token, type: "signup" });
      data = result.data;
      error = result.error;
    } else {
      return fail("invalid_params");
    }

    if (error || !data.session || !data.user?.email_confirmed_at) {
      return fail("invalid_or_expired");
    }

    // Sign out the temporary session (we don't want to auto-login from email link)
    await client.auth.admin.signOut(data.session.access_token, "local");
    
    const response = NextResponse.redirect(new URL("/connexion?confirmation=ok", origin));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return fail("error");
  }
}
