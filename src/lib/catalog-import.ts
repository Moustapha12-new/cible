import type { Application, DetectedOffer, UserData } from "./data";
import type { ProcessedEmail, RawOffer } from "./gmail-dashboard";

export type CatalogImportRecord = {
  id: string;
  title: string;
  company: string;
  location: string;
  domain: string;
  searchText: string;
  detectedAt?: string;
  publishedAt?: string;
  qualification?: UserData["offerQualifications"] extends Record<string, infer Q> | undefined ? Q : never;
  applicationId?: string;
  dossierId?: string;
  sources: { type: string; nativeId: string; url?: string; receivedAt?: string }[];
  original: DetectedOffer | RawOffer;
};

function bounded(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function validDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

export function localImportRecords(data: UserData): CatalogImportRecord[] {
  const applications = new Map<string, Application>();
  for (const app of data.applications || []) if (app.offerId) applications.set(app.offerId, app);
  return (data.offers || []).filter(o => o.id && o.title).map(offer => ({
    id: offer.id,
    title: bounded(offer.title, 1000),
    company: bounded(offer.company, 1000),
    location: bounded(offer.location, 1000),
    domain: "",
    searchText: [offer.title, offer.company, offer.location, offer.description, offer.text, ...(offer.missions || []), ...(offer.skills || []), ...(offer.keywords || [])].filter(Boolean).join(" ").slice(0, 100_000),
    qualification: data.offerQualifications?.[offer.id],
    applicationId: applications.get(offer.id)?.id,
    dossierId: data.dossiers?.[offer.id] ? offer.id : undefined,
    sources: [{ type: offer.source || "local", nativeId: offer.id, url: offer.url }],
    original: offer,
  }));
}

function gmailIdentity(offer: RawOffer): string {
  const url = (offer.applicationUrl || "").trim().toLowerCase();
  const key = url ? `u:${url}` : `t:${[(offer.title || "").trim().toLowerCase(), (offer.company || "").trim().toLowerCase(), (offer.location || "").trim().toLowerCase()].join("|")}`;
  return `gmail-${encodeURIComponent(key)}`;
}

export function gmailImportRecords(emails: ProcessedEmail[]): CatalogImportRecord[] {
  const records = new Map<string, CatalogImportRecord>();
  for (const email of emails) for (const offer of email.offers || []) {
    if (!offer.title) continue;
    const id = gmailIdentity(offer);
    const source = { type: offer.source || "gmail", nativeId: email.id, url: offer.applicationUrl || undefined, receivedAt: validDate(email.receivedAt) };
    const current = records.get(id);
    if (current) {
      if (!current.sources.some(s => s.nativeId === source.nativeId)) current.sources.push(source);
      continue;
    }
    records.set(id, {
      id,
      title: bounded(offer.title, 1000), company: bounded(offer.company, 1000), location: bounded(offer.location, 1000), domain: "",
      searchText: [offer.title, offer.company, offer.location, offer.description, offer.summary, ...(offer.missions || []), ...(offer.skills || []), ...(offer.keywords || [])].filter(Boolean).join(" ").slice(0, 100_000),
      detectedAt: validDate(email.receivedAt),
      sources: [source], original: offer,
    });
  }
  return [...records.values()];
}

export function validateImportBatch(records: unknown): records is CatalogImportRecord[] {
  return Array.isArray(records) && records.length > 0 && records.length <= 50 && records.every(r =>
    r && typeof r === "object" && typeof r.id === "string" && r.id.length > 0 && r.id.length <= 500 &&
    typeof r.title === "string" && r.title.length > 0 && r.title.length <= 1000 &&
    typeof r.company === "string" && r.company.length <= 1000 &&
    typeof r.searchText === "string" && r.searchText.length <= 100_000 &&
    Array.isArray(r.sources) && r.sources.length > 0 && r.original && typeof r.original === "object"
  );
}
