import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { deleteOauthConnection } from "@/lib/gmail-server";
import { deleteSnapshot } from "@/lib/gmail-snapshot";

export const dynamic = "force-dynamic";

/** DELETE /api/gmail/disconnect?email=<email> — supprime le token OAuth. */
export const DELETE = securedRoute(async (req, auth) => {
  const email = auth.user.email;
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
});
