import { PFE_TARGET, pfeEligibility } from "@/lib/pfe-target";
import { securedRoute } from "@/lib/auth-server";
import { NextResponse } from "next/server";
import {
  dedupeOffers,
  mapJobicy,
  mapRemotive,
  parseLinkedInHtml,
  type JobOffer,
} from "@/lib/jobs";

export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

async function safeFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(9000),
    headers: { "User-Agent": UA, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

async function fetchLinkedin(q: string, l: string): Promise<JobOffer[]> {
  const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(
    q
  )}&location=${encodeURIComponent(l)}&start=0`;
  const html = await (await safeFetch(url)).text();
  return parseLinkedInHtml(html);
}

async function fetchRemotive(q: string): Promise<JobOffer[]> {
  const data = await (
    await safeFetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=8`)
  ).json();
  return mapRemotive((data.jobs ?? []) as never);
}

async function fetchJobicy(q: string): Promise<JobOffer[]> {
  const tag = q.split(/\s+/)[0] || "";
  const data = await (
    await safeFetch(`https://jobicy.com/api/v2/remote-jobs?count=8&tag=${encodeURIComponent(tag)}`)
  ).json();
  return mapJobicy((data.jobs ?? []) as never);
}

export const GET = securedRoute(async (req) => {
  const q = req.nextUrl.searchParams.get("q")?.trim() || PFE_TARGET.query;
  const l = req.nextUrl.searchParams.get("l")?.trim() || "France";

  const [li, re, jb] = await Promise.allSettled([
    Promise.allSettled((q === PFE_TARGET.query ? [q, "stage ingénieur nucléaire électricité", "stage ingénieur énergies renouvelables", "stage ingénieur réseaux électriques automatisme"] : [q]).map(query => fetchLinkedin(query, l))).then(results => {
      if (results.every(r => r.status === "rejected")) throw new Error("LinkedIn indisponible");
      return results.flatMap(r => r.status === "fulfilled" ? r.value : []);
    }),
    fetchRemotive(q),
    fetchJobicy(q),
  ]);

  const errors: string[] = [];
  if (li.status === "rejected") errors.push("LinkedIn indisponible");
  if (re.status === "rejected") errors.push("Remotive indisponible");
  if (jb.status === "rejected") errors.push("Jobicy indisponible");

  /* LinkedIn d'abord : offres françaises localisées, les plus pertinentes */
  const offers = dedupeOffers([
    ...(li.status === "fulfilled" ? li.value : []),
    ...(re.status === "fulfilled" ? re.value : []),
    ...(jb.status === "fulfilled" ? jb.value : []),
  ]).map(o => ({ ...o, eligibility: pfeEligibility(o) })).filter(o => o.eligibility.status !== "excluded");

  return NextResponse.json(
    { q, l, target: PFE_TARGET, count: offers.length, offers, errors },
    { headers: { "Cache-Control": "no-store" } }
  );
});
