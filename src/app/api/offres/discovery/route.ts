import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { storeGet } from "@/lib/gmail-server";
import type { DiscoveredOffer } from "@/lib/discovery-offers";
import { discoveryToDetectedOffer } from "@/lib/discovery-view";
import { discoveryUrlKey } from "@/lib/discovery-identity";
import { loadSnapshot } from "@/lib/gmail-snapshot";

export const dynamic = "force-dynamic";

/** Verified public postings saved by the Discovery pilot; no Gmail read. */
export const GET = securedRoute(async (_req, { user }) => {
  const raw = await storeGet("discovery:offers:v1");
  if (!raw) return NextResponse.json({ ok: true, offers: [], count: 0 }, { headers: { "Cache-Control": "private, no-store" } });
  const document = JSON.parse(raw) as { offers?: DiscoveredOffer[]; generatedAt?: string };
  if (!Array.isArray(document.offers)) return NextResponse.json({ ok: false, error: "Registre Discovery illisible." }, { status: 503 });
  const offers = document.offers.filter(o => o.profileCompatible && o.applicationUrl && o.title && o.company).map(discoveryToDetectedOffer);
  let duplicateCount: number | null = null;
  try {
    const snapshot = await loadSnapshot(user.email);
    if (snapshot) {
      const gmailKeys = new Set(snapshot.emails.flatMap(email => (email.offers || []).flatMap(o => [o.applicationUrl, o.sourceUrl].map(discoveryUrlKey).filter((x): x is string => !!x))));
      duplicateCount = offers.filter(o => { const key = discoveryUrlKey(o.url); return key && gmailKeys.has(key); }).length;
    }
  } catch { /* Catalogue Gmail indisponible : doublons inconnus, jamais zéro inventé. */ }
  return NextResponse.json({ ok: true, offers, count: offers.length, gmailDuplicateCount: duplicateCount, newComparedToGmail: duplicateCount === null ? null : offers.length - duplicateCount, checkedAt: document.generatedAt }, { headers: { "Cache-Control": "private, no-store" } });
});
