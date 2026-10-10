import { securedRoute } from "@/lib/auth-server";
import { NextRequest, NextResponse } from "next/server";
import { loadCatalogStats, computeCatalogStats, loadCatalogIndex, saveCatalogIndex } from "@/lib/permanent-offer-server";

export const dynamic = "force-dynamic";

/** GET /api/catalog/stats — Statistiques du catalogue */
export const GET = securedRoute(async (req, auth) => {
  const stats = await loadCatalogStats();
  
  if (!stats) {
    // Calculer à la volée si pas de cache
    const index = await loadCatalogIndex();
    const computed = await computeCatalogStats(index);
    return NextResponse.json({ ok: true, stats: computed });
  }

  return NextResponse.json({ ok: true, stats });
});

/** POST /api/catalog/stats — Force le recalcul des statistiques */
export const POST = securedRoute(async (req, auth) => {
  const index = await loadCatalogIndex();
  const stats = await computeCatalogStats(index);
  
  // Sauvegarder en cache
  const { saveCatalogStats } = await import("@/lib/permanent-offer-server");
  await saveCatalogStats(stats);
  
  return NextResponse.json({ ok: true, stats, message: "Statistiques recalculées" });
});