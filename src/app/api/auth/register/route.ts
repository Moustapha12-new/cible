import { NextRequest, NextResponse } from "next/server";
import { allowRequest, authClient, sameOrigin } from "@/lib/auth-server";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Origine refusée." }, { status: 403 });
  try {
    const { email, name, password } = await req.json();
    if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || typeof name !== "string" || name.trim().length < 2 || name.length > 100 || typeof password !== "string" || password.length < 12 || password.length > 256) return NextResponse.json({ ok: false, error: "Indique un nom, une adresse valide et un mot de passe d’au moins 12 caractères." }, { status: 400 });
    if (!allowRequest(`register:${email.trim().toLowerCase()}`, 3)) return NextResponse.json({ ok: false, error: "Trop de demandes. Réessaie dans une minute." }, { status: 429 });
    const { error } = await authClient().auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { name: name.trim() }, emailRedirectTo: `${new URL(req.url).origin}/connexion` } });
    if (error) return NextResponse.json({ ok: false, error: "Inscription indisponible. Vérifie tes informations ou réessaie plus tard." }, { status: 400 });
    return NextResponse.json({ ok: true, confirmationRequired: true });
  } catch { return NextResponse.json({ ok: false, error: "Inscription indisponible." }, { status: 503 }); }
}
