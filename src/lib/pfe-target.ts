export const PFE_TARGET = { contract: "stage", level: "ingénieur Bac+5", months: 6, start: "2027-02", location: "France", query: "stage PFE ingénieur énergie électricité", label: "Stage PFE ingénieur · 6 mois · février 2027 · énergie et électricité" } as const;
import { offerLocation } from "./offer-location";
type Candidate = { title?: string; contract?: string; description?: string; text?: string; duration?: string; profile?: string; startDate?: string; location?: string; prerequisites?: string[]; skills?: string[] };
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function pfeEligibility(offer: Candidate): { status: "eligible" | "verify" | "excluded"; reasons: string[] } {
  const heading = normalize(`${offer.title || ""} ${offer.contract || ""}`);
  const all = normalize([heading, offer.description, offer.text, offer.duration, offer.profile, ...(offer.prerequisites || []), ...(offer.skills || [])].filter(Boolean).join(" "));
  const excluded: string[] = [];
  const unknown: string[] = [];
  const location = normalize(offer.location || "");
  if (/belgique|belgium|suisse|switzerland|allemagne|germany|royaume.uni|united kingdom|espagne|spain|italie|italy|maroc|morocco|canada|dubai|arabie|saudi|luxembourg|tunisie|algerie|portugal|united states|usa\b/.test(location)) excluded.push("Localisation annoncée hors de France");
  else if (!/\bfrance\b/.test(location) && !offerLocation(offer.location).region) unknown.push("Localisation en France à confirmer");
  if (/alternance|apprentissage|\bcdi\b|\bcdd\b|\bvie\b/.test(heading)) excluded.push("Contrat différent d’un stage");
  else if (!/stage|stagiaire|internship|intern\b/.test(heading)) unknown.push("Contrat à vérifier");
  if (/technicien|technician|operateur|electricien/.test(heading) && !/ingenieur|engineer/.test(heading)) excluded.push("Poste hors niveau ingénieur");
  else if (!/ingenieur|engineer|bac\s*\+\s*5|master|\bm2\b/.test(all)) unknown.push("Niveau Bac+5 à vérifier");
  if (!/electri|energie|energy|energet|electrotech|nucleaire|photovolta|eolien|hydrogen|batterie|hydrauli|thermique|smart.?grid|automatis|electronique|power systems|power electronics|maintenance industrielle|\bgaz\b|petrol|biomasse|bioenergie|geotherm/.test(all)) unknown.push("Lien avec l’énergie ou l’électricité à vérifier");
  const months = [...all.matchAll(/\b(\d{1,2})\s*(?:mois|months?)\b/g)].map(m => Number(m[1]));
  if (/\bsix\s*(?:mois|months?)\b/.test(all)) months.push(6);
  if (months.length && !months.includes(6)) excluded.push("Durée annoncée différente de six mois");
  else if (!months.length) unknown.push("Durée de six mois à confirmer");
  const date = offer.startDate?.slice(0, 7) || /(?:fevrier|february|feb)\s*2027/.test(all) && "2027-02";
  if (date && ["2027-01", "2027-03"].includes(date)) unknown.push("Début proche de février 2027 : flexibilité à confirmer");
  else if (date && date !== PFE_TARGET.start) excluded.push("Début incompatible avec février 2027");
  else if (!date) {
    const nearby = /(?:janvier|mars)\s*2027/.test(all);
    const explicit = /(?:avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s*2027|(?:demarrage|debut|start)[^.!\n]{0,30}\b2026\b/.test(all);
    if (explicit || /asap|demarrage immediat|des que possible/.test(all)) excluded.push("Date annoncée incompatible avec février 2027");
    else unknown.push(nearby ? "Début proche de février 2027 : flexibilité à confirmer" : "Début en février 2027 à confirmer");
  }
  return { status: excluded.length ? "excluded" : unknown.length ? "verify" : "eligible", reasons: excluded.length ? excluded : unknown.length ? unknown : ["Stage ingénieur, six mois, février 2027 et domaine ciblé identifiés"] };
}
