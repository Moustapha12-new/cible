/* Public SmartRecruiters postings: active listings and their own detail pages.
   No search-result excerpt is accepted as an offer. */

export type DiscoveredOffer = {
  id: string;
  source: "smartrecruiters";
  sourceCompany: string;
  sourceId: string;
  title: string;
  company: string;
  location: string;
  contract: "stage";
  durationMonths: number | null;
  durationEvidence: string | null;
  startEvidence: string | null;
  technicalEvidence: string[];
  description: string;
  applicationUrl: string;
  sourceUrl: string;
  sourceCheckedAt: string;
  sixMonthsConfirmed: boolean;
  profileCompatible: boolean;
  startFit?: "compatible" | "incompatible" | "unknown";
  degreeEvidence?: string | null;
  degreeFit?: "compatible" | "other_specialty" | "unknown";
};

import { qualifyDiscoveryText } from "./discovery-qualification";

export type DiscoveryFailure = { company: string; stage: "listing" | "detail" | "validation"; id?: string; reason: string };
export type DiscoveryResult = { examined: number; detailChecked: number; offers: DiscoveredOffer[]; failures: DiscoveryFailure[] };

type Listing = { id?: string; name?: string; ref?: string; location?: { country?: string } };
type Detail = {
  id?: string; name?: string; company?: { name?: string }; location?: { city?: string; country?: string; fullLocation?: string };
  jobAd?: { sections?: { companyDescription?: { text?: string }; jobDescription?: { text?: string }; qualifications?: { text?: string }; additionalInformation?: { text?: string } } };
  postingUrl?: string; applyUrl?: string;
  active?: boolean;
};

const clean = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;|&#xa0;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
const technical = [
  /g[ée]nie [ée]lectrique/i, /[ée]lectrotechni/i, /[ée]tudes? [ée]lectriques?/i,
  /\bHTA\b|\bBT\b|haute tension|basse tension/i, /\bCFO\b|\bCFA\b/i,
  /dimensionnement/i, /[ée]nergie|[ée]nerg[ée]tique/i, /photovolta[iï]que|solaire/i,
  /stockage|batterie/i, /automatismes?|automatisation industrielle/i,
  /[ée]olien|renouvelables/i,
];
const jobTitle = /\b(stage|stagiaire|internship|intern)\b/i;
const contraryContract = /\b(alternance|apprentissage|cdi|cdd)\b/i;
const offDomainTitle = /g[ée]otechni|ouvrage d.art|cours d.eau|structure m[ée]tallique|eurocode|urbanisme|am[ée]nagement urbain|relation commerciale|informatique|tests?\s*-\s*application|technicien|pilotage des activit[ée]s techniques|consultant|biodiversit[ée]|carbone des sols/i;
const focusTitle = /[ée]lectri|[ée]lectrotechni|r[ée]seaux? [ée]lectriques?|[ée]nerg|carbone|photovolta|solaire|[ée]olien|contr[ôo]le.commande|automat|g[ée]nie climatique|thermique|b[âa]timent durable/i;

export function validatePosting(companySlug: string, listing: Listing, detail: Detail, checkedAt: string): DiscoveredOffer | null {
  if (!/^[-\w]{2,100}$/.test(companySlug) || !/^[-\w]{5,100}$/.test(listing.id || "") || listing.id !== detail.id) return null;
  const title = clean(detail.name || "");
  const sections = detail.jobAd?.sections;
  const description = [sections?.jobDescription?.text, sections?.qualifications?.text, sections?.additionalInformation?.text]
    .filter((x): x is string => !!x).map(clean).join("\n\n");
  if (!jobTitle.test(title) || contraryContract.test(title) || detail.active !== true || description.length < 120) return null;
  const content = `${title}\n${description}`;
  const technicalEvidence = technical.flatMap(pattern => {
    const match = content.match(pattern);
    return match ? [match[0]] : [];
  });
  if (!technicalEvidence.length || offDomainTitle.test(title) || !focusTitle.test(title)) return null;
  const durationRange = content.match(/([1-9]|1[0-2])\s*(?:[àa]|-|jusqu['’]?à)\s*([1-9]|1[0-2])\s*mois\b/i);
  const durationMatch = content.match(/(?:dur[ée]e\s*(?:du\s*)?stage\s*[:\-]?\s*|stage\s*(?:de|d['’]une dur[ée]e de)\s*|\b)([1-9]|1[0-2])\s*mois\b/i);
  const durationMonths = durationRange ? null : durationMatch ? Number(durationMatch[1]) : null;
  const qualification = qualifyDiscoveryText(description, title);
  const sourceUrl = `https://jobs.smartrecruiters.com/${encodeURIComponent(companySlug)}/${encodeURIComponent(listing.id!)}`;
  const suppliedUrl = detail.applyUrl || detail.postingUrl;
  let applicationUrl = sourceUrl;
  if (suppliedUrl) {
    try {
      const parsed = new URL(suppliedUrl);
      if (parsed.protocol === "https:" && /(^|\.)smartrecruiters\.com$/i.test(parsed.hostname)) applicationUrl = parsed.href;
    } catch { /* keep verified posting URL */ }
  }
  return {
    id: `web:smartrecruiters:${companySlug.toLowerCase()}:${listing.id}`,
    source: "smartrecruiters", sourceCompany: companySlug, sourceId: listing.id!,
    title, company: clean(detail.company?.name || companySlug),
    location: clean(detail.location?.fullLocation || detail.location?.city || ""),
    contract: "stage", durationMonths, durationEvidence: durationRange?.[0] || durationMatch?.[0] || null,
    startEvidence: qualification.startEvidence, technicalEvidence: qualification.technicalSkills, description,
    applicationUrl, sourceUrl, sourceCheckedAt: checkedAt,
    sixMonthsConfirmed: durationMonths === 6,
    profileCompatible: technicalEvidence.length > 0 && (durationMonths === 6 || durationMonths === null) && qualification.startFit !== "incompatible" && qualification.degreeFit !== "other_specialty",
    startFit: qualification.startFit, degreeEvidence: qualification.degreeEvidence, degreeFit: qualification.degreeFit,
  };
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export async function discoverSmartRecruiters(slugs: string[], fetcher: Fetcher = fetch, maxDetails = 60): Promise<DiscoveryResult> {
  const failures: DiscoveryFailure[] = [];
  const offers: DiscoveredOffer[] = [];
  let examined = 0, detailChecked = 0;
  for (const company of [...new Set(slugs)]) {
    if (!/^[-\w]{2,100}$/.test(company)) continue;
    const allListings: Listing[] = [];
    for (const query of ["", "électrique", "énergie", "photovoltaïque"]) {
      try {
        const url = `https://api.smartrecruiters.com/v1/companies/${company}/postings?limit=100&offset=0&country=fr${query ? `&q=${encodeURIComponent(query)}` : ""}`;
        const response = await fetcher(url, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json() as { content?: Listing[]; totalFound?: number };
        const page = Array.isArray(body.content) ? body.content : [];
        allListings.push(...page);
        examined += page.length;
        if ((body.totalFound || 0) > page.length) failures.push({ company, stage: "listing", reason: `recherche « ${query || "toutes"} » : ${body.totalFound! - page.length} annonces au-delà du premier lot` });
      } catch (error) { failures.push({ company, stage: "listing", reason: `recherche « ${query || "toutes"} » : ${error instanceof Error ? error.message : "erreur inconnue"}` }); }
    }
    const listings = [...new Map(allListings.filter(x => x.id).map(x => [x.id, x])).values()];
    const candidates = listings.filter(x => x.id && x.name && jobTitle.test(x.name) && !contraryContract.test(x.name) && !offDomainTitle.test(x.name))
      .sort((a, b) => Number(focusTitle.test(b.name || "")) - Number(focusTitle.test(a.name || "")));
    for (const listing of candidates.slice(0, 12)) {
      if (detailChecked >= maxDetails) { failures.push({ company, stage: "detail", reason: "budget de fiches atteint" }); break; }
      detailChecked++;
      try {
        const response = await fetcher(`https://api.smartrecruiters.com/v1/companies/${company}/postings/${listing.id}`, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const detail = await response.json() as Detail;
        const offer = validatePosting(company, listing, detail, new Date().toISOString());
        if (offer) offers.push(offer);
        else failures.push({ company, stage: "validation", id: listing.id, reason: "stage technique ou fiche complète non confirmé" });
      } catch (error) { failures.push({ company, stage: "detail", id: listing.id, reason: error instanceof Error ? error.message : "erreur inconnue" }); }
    }
  }
  return { examined, detailChecked, offers: [...new Map(offers.map(o => [o.id, o])).values()], failures };
}

