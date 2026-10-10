import { securedRoute } from "@/lib/auth-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST /api/catalog/migrate — Lance la migration vers le catalogue permanent */
export const POST = securedRoute(async () => {
  return NextResponse.json({ ok: false, error: "Migration suspendue : inventaire et sauvegarde serveur requis avant toute écriture." }, { status: 503 });
});

/** GET /api/catalog/migrate — Statut de la dernière migration */
export const GET = securedRoute(async () => {
  return NextResponse.json({ 
    ok: false,
    message: "Migration suspendue jusqu'à inventaire et sauvegarde vérifiés."
  });
});
