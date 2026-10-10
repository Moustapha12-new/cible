import { NextRequest, NextResponse } from "next/server";
import { authClient, sameOrigin } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Origine refusée." }, { status: 403 });
  try {
    const { email, name, password } = await req.json();
    if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || typeof name !== "string" || name.trim().length < 2 || name.length > 100 || typeof password !== "string" || password.length < 8 || password.length > 256) return NextResponse.json({ ok: false, error: "Indique un nom, une adresse valide et un mot de passe (8 caractères minimum)." }, { status: 400 });

    const { data, error } = await authClient().auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { name: name.trim() }, emailRedirectTo: `${new URL(req.url).origin}/connexion` } });
    if (error) {
      const msg = error.message || "Inscription impossible.";
      console.info(`[register] Supabase error for ${email}: ${msg}`);
      
      // Compte déjà existant → proposer de se connecter
      if (msg.includes("User already registered") || msg.includes("already registered")) {
        return NextResponse.json({ ok: false, error: "Ce compte existe déjà. <a href=\"/connexion\" class=\"underline\">Connecte-toi</a> ou demande un renvoi de confirmation.", status: 400, accountExists: true });
      }
      if (msg.includes("Password should be at least") || msg.includes("weak_password")) {
        return NextResponse.json({ ok: false, error: "Mot de passe trop faible. 8 caractères minimum." }, { status: 400 });
      }
      if (msg.includes("Invalid email") || msg.includes("invalid_email")) {
        return NextResponse.json({ ok: false, error: "Adresse e-mail invalide." }, { status: 400 });
      }
      // Supabase rate limit (envoi email, IP, etc.)
      if (msg.includes("rate limit") || msg.includes("too_many_requests")) {
        console.warn(`[register] Supabase rate limit hit for ${email}: ${msg}`);
        return NextResponse.json({ ok: false, error: "Trop d'inscriptions récentes. Réessaie dans 15 minutes." }, { status: 429, headers: { "Retry-After": "900" } });
      }
      if (msg.includes("signup disabled") || msg.includes("not allowed")) {
        return NextResponse.json({ ok: false, error: "Inscription désactivée temporairement." }, { status: 403 });
      }
      if (msg.includes("Email not confirmed") || msg.includes("email_confirm")) {
        return NextResponse.json({ ok: false, error: "Ce compte existe mais l'e-mail n'est pas confirmé. <a href=\"/connexion\" class=\"underline\">Connecte-toi</a> pour renvoyer le lien.", status: 400, accountExists: true });
      }
      // Generic fallback
      return NextResponse.json({ ok: false, error: `Inscription impossible : ${msg}` }, { status: 400 });
    }
    return NextResponse.json({ ok: true, confirmationRequired: true, user: data.user ? { email: data.user.email, id: data.user.id } : undefined });
  } catch (_e) {
    return NextResponse.json({ ok: false, error: "Inscription indisponible. Réessaie plus tard." }, { status: 503 });
  }
}
