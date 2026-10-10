import { securedRoute } from "@/lib/auth-server";
import { NextRequest, NextResponse } from "next/server";
import {
  loadCatalogIndex,
  listOffersFromIndex,
  searchOffersFullText,
  CatalogIndexEntry,
} from "@/lib/permanent-offer-server";

export const dynamic = "force-dynamic";

/** GET /api/catalog/search?q=<query>&page=1&pageSize=50&filters=... */
export const GET = securedRoute(async (req, auth) => {
  const url = new URL(req.url);
  const email = auth.user.email;

  // Paramètres de recherche
  const query = url.searchParams.get("q")?.trim() || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "50", 10)));

  // Filtres
  const filters: Record<string, string[] | undefined> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith("filter.")) {
      const filterKey = key.replace("filter.", "");
      filters[filterKey] = value.split(",").filter(Boolean);
    }
  }

  // Tri
  const sortBy = (url.searchParams.get("sortBy") as "createdAt" | "updatedAt" | "startDate" | "title" | "company" | "qualificationState" | "priority") || "updatedAt";
  const sortDir = (url.searchParams.get("sortDir") as "asc" | "desc") || "desc";

  // Mode recherche plein texte vs filtres
  if (query) {
    // Recherche plein texte simple
    const results = await searchOffersFullText(query, pageSize * page);
    const total = results.length;
    const start = (page - 1) * pageSize;
    const paginated = results.slice(start, start + pageSize);

    return NextResponse.json({
      ok: true,
      offers: paginated,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      facets: await computeFacets(results),
    });
  }

  // Recherche par filtres avec pagination indexée
  const result = await listOffersFromIndex({
    filters: {
      states: filters["states"],
      domains: filters["domains"],
      regions: filters["regions"],
      cities: filters["cities"],
      contractTypes: filters["contractTypes"],
      enrichStatus: filters["enrichStatus"],
      qualificationStates: filters["qualificationStates"],
      sourceTypes: filters["sourceTypes"],
      isArchived: filters["isArchived"]?.[0] === "true" ? true : filters["isArchived"]?.[0] === "false" ? false : undefined,
      hasApplication: filters["hasApplication"]?.[0] === "true",
      hasDossier: filters["hasDossier"]?.[0] === "true",
      searchQuery: filters["searchQuery"]?.[0],
      searchFields: filters["searchFields"],
      startDateFrom: filters["startDateFrom"]?.[0],
      startDateTo: filters["startDateTo"]?.[0],
    },
    sortBy,
    sortDir,
    page,
    pageSize,
  });

  // Facettes pour l'UI
  const allForFacets = await listOffersFromIndex({
    filters: {
      states: filters["states"],
      domains: filters["domains"],
      regions: filters["regions"],
      cities: filters["cities"],
      contractTypes: filters["contractTypes"],
      enrichStatus: filters["enrichStatus"],
      qualificationStates: filters["qualificationStates"],
      sourceTypes: filters["sourceTypes"],
      isArchived: filters["isArchived"]?.[0] === "true" ? true : filters["isArchived"]?.[0] === "false" ? false : undefined,
      hasApplication: filters["hasApplication"]?.[0] === "true",
      hasDossier: filters["hasDossier"]?.[0] === "true",
    },
    page: 1,
    pageSize: 10000, // Pour calculer les facettes sur tout le catalogue filtré
  });

  return NextResponse.json({
    ok: true,
    offers: result.entries,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: Math.ceil(result.total / pageSize),
    facets: await computeFacets(result.entries), // Facettes sur la page courante (approximation)
  });
});

async function computeFacets(entries: CatalogIndexEntry[]) {
  const domainCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  const cityCounts = new Map<string, number>();
  const contractCounts = new Map<string, number>();
  const enrichCounts = new Map<string, number>();
  const qualCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();

  for (const e of entries) {
    domainCounts.set(e.domainPrimary, (domainCounts.get(e.domainPrimary) || 0) + 1);
    if (e.region) regionCounts.set(e.region, (regionCounts.get(e.region) || 0) + 1);
    if (e.city) cityCounts.set(e.city, (cityCounts.get(e.city) || 0) + 1);
    if (e.contractType) contractCounts.set(e.contractType, (contractCounts.get(e.contractType) || 0) + 1);
    enrichCounts.set(e.enrichStatus, (enrichCounts.get(e.enrichStatus) || 0) + 1);
    qualCounts.set(e.qualificationState || "none", (qualCounts.get(e.qualificationState || "none") || 0) + 1);
    for (const src of e.sourceTypes) {
      sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
    }
  }

  return {
    domains: [...domainCounts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    regions: [...regionCounts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    cities: [...cityCounts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    contractTypes: [...contractCounts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    enrichStatus: [...enrichCounts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    qualificationStates: [...qualCounts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    sources: [...sourceCounts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
  };
}
