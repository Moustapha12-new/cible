import { cvToText, parseCvText, type CvData } from "./cv";
import { offerSnapshot, type DetectedOffer, type UserData } from "./data";

export function hasCvTerm(text: string, term: string): boolean {
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const escaped = normalize(term.trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return !!escaped && new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(normalize(text));
}
export function addCvTerm(cv: CvData, term: string): CvData {
  if (hasCvTerm(cvToText(cv), term)) return cv;
  const section = cv.sections.find(s => /comp[eé]tences|skills/i.test(s.title));
  const added = section ? { ...section, ...(section.kind === "text"
    ? { text: [section.text, term].filter(Boolean).join(" · ") }
    : { items: [...section.items, { id: `skill-${term}`, title: term, detail: "" }] }) }
    : { key: "skills", title: "Compétences", kind: "text" as const, items: [], text: term };
  return { ...cv, sections: section ? cv.sections.map(s => s === section ? added : s) : [...cv.sections, added] };
}
export function confirmCvTerm(data: UserData, offer: DetectedOffer, raw: string): UserData {
  const term = raw.trim().replace(/\s+/g, " ").slice(0, 100);
  if (!term) return data;
  const base = data.cvData ?? parseCvText(data.originalCv?.text ?? "");
  if (!cvToText(base).trim()) throw new Error("Ajoute d’abord ton CV dans Mon profil & CV.");
  const cvData = addCvTerm(base, term);
  const old = data.dossiers?.[offer.id];
  const text = old?.cvText || cvToText(base);
  const targeted = hasCvTerm(text, term) ? text : cvToText(addCvTerm(parseCvText(text), term));
  return { ...data, cvPreservedData: data.cvPreservedData ?? base, cvData,
    profile: { ...data.profile, skillEvidence: [...(data.profile.skillEvidence || []).filter(e => !hasCvTerm(e.term, term)), { term, status: "declared", evidence: "Maîtrise confirmée par le candidat", autonomy: "unknown", sourceOffer: offer.id, updatedAt: new Date().toISOString() }], skills: data.profile.skills.some(s => hasCvTerm(s, term)) ? data.profile.skills : [...data.profile.skills, term] },
    offers: [offer, ...data.offers.filter(o => o.id !== offer.id)],
    dossiers: { ...data.dossiers, [offer.id]: { letterText: "", notes: "", ...old, cvText: old?.applicationId ? old.cvText : targeted, updatedAt: new Date().toISOString() } } };
}
export function appliedOfferIds(data: UserData): Set<string> {
  const applicationIds = new Set(data.applications.map(a => a.id));
  return new Set([...Object.entries(data.dossiers ?? {}).filter(([, d]) => d.applicationId && applicationIds.has(d.applicationId)).map(([id]) => id), ...data.applications.flatMap(a => a.offerId ? [a.offerId] : [])]);
}
export function markOfferApplied(data: UserData, offer: DetectedOffer): UserData {
  if (appliedOfferIds(data).has(offer.id)) return data;
  const doc = data.dossiers?.[offer.id];
  const applicationId = crypto.randomUUID();
  const cvText = doc?.cvText || (data.cvData ? cvToText(data.cvData) : data.originalCv?.text || "");
  return { ...data, offers: [offer, ...data.offers.filter(o => o.id !== offer.id)],
    applications: [{ id: applicationId, offerId: offer.id, company: offer.company, role: offer.title, status: "sent", daysAgo: 0, source: offer.source || "Alertes Gmail", date: new Date().toISOString(), cvText, letterText: doc?.letterText, notes: doc?.notes, offerSnapshot: offerSnapshot(offer) }, ...data.applications],
    dossiers: { ...data.dossiers, [offer.id]: { cvText, letterText: "", notes: "", ...doc, applicationId, updatedAt: new Date().toISOString() } } };
}
