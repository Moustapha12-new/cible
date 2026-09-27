import { NextRequest, NextResponse } from "next/server";
import { deleteOauthConnection } from "@/lib/gmail-server";
import { deleteSnapshot } from "@/lib/gmail-snapshot";

export const dynamic = "force-dynamic";

/** Fallback historique (single-user) — le client envoie ?email= depuis P1-9. */
const DEFAULT_EMAIL = "moustaled.53@gmail.com";

/** DELETE /api/gmail/disconnect?email=<email> — supprime le token OAuth. */
export async function DELETE(req: NextRequest) {
  let email = "";
  try {
    email = (new URL(req.url).searchParams.get("email") || "").trim().toLowerCase();
  } catch {
    /* URL illisible → défaut */
  }
  if (!email) email = DEFAULT_EMAIL;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "E-mail invalide" }, { status: 400 });
  }
  try {
    await deleteOauthConnection(email);
    /* P0-4 : la déconnexion purge aussi le snapshot du payload. */
    await deleteSnapshot(email);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Déconnexion impossible" }, { status: 500 });
  }
}
