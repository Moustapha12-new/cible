import { NextRequest, NextResponse } from "next/server";
import { allowRequest, authClient, sameOrigin } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Origine refusée." }, { status: 403 });
  try {
    const { email, name, password } = await req.json();
    if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || typeof name !== "string" || name.trim().length < 2 || name.length > 100 || typeof password !== "string" || password.length < 12 || password.length > 256) return NextResponse.json({ ok: false, error: "Indique un nom, une adresse valide et un mot de passe d'au moins 12 caracteres." }, { status: 400 });
    if (!allowRequest(`register:${email.trim().toLowerCase()}`, 3)) return NextResponse.json({ ok: false, error: "Trop de demandes. Reessaie dans une minute." }, { status: 429 });
    const { data, error } = await authClient().auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { name: name.trim() }, emailRedirectTo: `${new URL(req.url).origin}/connexion` } });
    if (error) {
      // Surface specific Supabase errors for debugging
      const msg = error.message || "Inscription impossible.";
      // Common Supabase auth errors
      if (msg.includes("User already registered") || msg.includes("already registered")) {
        return NextResponse.json({ ok: false, error: "Cette adresse e-mail est deja utilisee. Connecte-toi ou demande une reinitialisation." }, { status: 400 });
      }
      if (msg.includes("Password should be at least") || msg.includes("weak_password")) {
        return NextResponse.json({ ok: false, error: "Mot de passe trop faible. Utilise au moins 12 caracteres avec majuscules, minuscules, chiffres." }, { status: 400 });
      }
      if (msg.includes("Invalid email") || msg.includes("invalid_email")) {
        return NextResponse.json({ ok: false, error: "Adresse e-mail invalide." }, { status: 400 });
      }
      if (msg.includes("rate limit") || msg.includes("too_many_requests")) {
        return NextResponse.json({ ok: false, error: "Trop de tentatives. Reessaie dans quelques minutes." }, { status: 429 });
      }
      if (msg.includes("signup disabled") || msg.includes("not allowed")) {
        return NextResponse.json({ ok: false, error: "L'inscription est desactivee. Contacte l'administrateur." }, { status: 403 });
      }
      if (msg.includes("Email not confirmed") || msg.includes("email_confirm")) {
        return NextResponse.json({ ok: false, error: "Ce compte existe mais l'e-mail n'est pas confirme. Connecte-toi pour renvoyer le lien." }, { status: 400 });
      }
      // Generic fallback with actual error for debugging
      return NextResponse.json({ ok: false, error: `Inscription impossible : ${msg}` }, { status: 400 });
    }
    return NextResponse.json({ ok: true, confirmationRequired: true, user: data.user ? { email: data.user.email, id: data.user.id } : undefined });
  } catch (_e) {
    return NextResponse.json({ ok: false, error: "Inscription indisponible. Reessaie plus tard." }, { status: 503 });
  }
}
