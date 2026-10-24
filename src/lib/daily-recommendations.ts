import type { DetectedOffer, UserData } from "./data";
import { appliedOfferIds } from "./applied-offers";

export type DailyPick = { id: string; reason: string; present: string[]; missing: string[]; priority: boolean };
export type DailySelection = { date: string; signature: string; picks: DailyPick[]; usedAi: boolean };

const domains = [
  "électri", "electri", "énergie", "energie", "électrotech", "electrotech",
  "automat", "bureau d'études", "réseau", "reseau", "enr", "photovolta",
  "renouvelable", "audit énergétique", "performance énergétique", "dimensionnement",
];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function selectionSignature(offers: DetectedOffer[], cv: string): string {
  let hash = 2166136261;
  const text = `${cv}|${offers.map(o => `${o.id}:${o.title}:${o.text?.length || 0}`).join("|")}`;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

export function eligibleOffers(offers: DetectedOffer[], data: UserData): DetectedOffer[] {
  const applied = appliedOfferIds(data);
  const seen = new Set<string>();
  return offers.filter(o => {
    if (data.dismissedOfferIds?.includes(o.id)) return false;
    if (applied.has(o.id)) return false;
    if (data.offerQualifications?.[o.id]?.state === "rejected") return false;
    if (o.gmailStatus && ["ignorée", "expirée", "doublon"].includes(o.gmailStatus)) return false;
    if (o.deadline && /^\d{4}-\d{2}-\d{2}$/.test(o.deadline) && Date.parse(`${o.deadline}T23:59:59Z`) < Date.now()) return false;
    const content = norm(`${o.title} ${o.description || ""} ${o.contract || ""}`);
    const title = norm(o.title);
    if (/\b(cdi|cdd|alternance|apprentissage|senior)\b/.test(title)) return false;
    if (/\b(3|4|5|12|24)\s*mois\b/.test(norm(o.duration || ""))) return false;
    if (!domains.some(d => content.includes(norm(d)))) return false;
    const key = norm(o.url || `${o.title}|${o.company}|${o.location}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function shortlist(offers: DetectedOffer[], cv: string, limit = 28): DetectedOffer[] {
  const cvText = norm(cv);
  return [...offers].map(o => {
    const text = norm(`${o.title} ${o.description || o.text || ""}`);
    const domainCount = domains.filter(d => text.includes(norm(d))).length;
    const supported = (o.skills || []).filter(s => s.length > 2 && cvText.includes(norm(s))).length;
    const completeness = Number(Boolean(o.company && o.company !== "Entreprise non précisée")) + Number(Boolean(o.text?.length > 100));
    return { o, score: domainCount * 2 + supported * 3 + completeness };
  }).sort((a, b) => b.score - a.score || a.o.id.localeCompare(b.o.id)).slice(0, limit).map(x => x.o);
}

export function fallbackSelection(offers: DetectedOffer[], cv: string, date: string, signature: string): DailySelection {
  const cvText = norm(cv);
  const picks = shortlist(offers, cv, 10).map((o, index) => {
    const present = (o.skills || []).filter(s => s.length > 2 && cvText.includes(norm(s))).slice(0, 3);
    const missing = (o.skills || []).filter(s => s.length > 2 && !cvText.includes(norm(s))).slice(0, 2);
    return { id: o.id, priority: Boolean(cv.trim()) && index < 4, present, missing,
      reason: present.length ? `${present.join(", ")} apparaissent dans ton CV ; vérifie leur niveau de pratique pour cette offre.` : "Domaine proche de ton parcours ; adéquation à vérifier dans l'annonce." };
  });
  return { date, signature, picks, usedAi: false };
}

export function validateAiSelection(raw: unknown, offers: DetectedOffer[], cv: string, date: string, signature: string): DailySelection {
  const fallback = fallbackSelection(offers, cv, date, signature);
  const rows = (raw as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(rows)) return fallback;
  const byId = new Map(offers.map(o => [o.id, o]));
  const cvText = norm(cv);
  const ranked = rows.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const r = item as { id?: string; score?: number; reasons?: string[]; present?: string[]; missing?: string[] };
    if (!r.id || !byId.has(r.id) || !Number.isFinite(r.score)) return [];
    const offer = byId.get(r.id)!;
    const present = (Array.isArray(r.present) ? r.present : []).filter(s => typeof s === "string" && s.length < 80 && cvText.includes(norm(s))).slice(0, 3);
    const missing = (Array.isArray(r.missing) ? r.missing : []).filter(s => typeof s === "string" && s.length < 80).slice(0, 3);
    const reason = present.length
      ? `${present.join(", ")} sont cités dans ton CV ; vérifie les missions et ton niveau de pratique.`
      : `Offre ${offer.title} à examiner : aucune compétence technique confirmée automatiquement.`;
    return [{ id: r.id, score: Math.max(0, Math.min(100, r.score!)), reason, present, missing }];
  }).sort((a, b) => b.score - a.score).slice(0, 10);
  if (!ranked.length) return fallback;
  return { date, signature, usedAi: true, picks: ranked.map((r, i) => ({ id: r.id, reason: r.reason, present: r.present, missing: r.missing, priority: i < 4 })) };
}
