import type { DetectedOffer, UserData } from "./data";
import { termsFromOffer } from "./pfe-matching";
import { hasCvTerm } from "./cv-keywords";
import { cvToText } from "./cv";

/** Texte du CV maître, calculé une seule fois par dossier puis réutilisé pour
    toutes les offres (la sérialisation du CV structuré est coûteuse). */
export function cvMasterText(data: UserData): string {
  return data.originalCv?.text?.trim() || (data.cvData ? cvToText(data.cvData).trim() : "");
}

/** Textual coverage, not a probability of being recruited or proof of mastery. */
export function offerCvCoverage(offer: DetectedOffer, data: UserData, cachedCvText?: string) {
  const cv = typeof cachedCvText === "string" ? cachedCvText.trim() : cvMasterText(data);
  if (!cv) return { score: null, reason: "CV maître à importer", present: [], missing: [] };
  const terms = termsFromOffer(offer);
  if (!terms.length) return { score: null, reason: "Annonce à enrichir", present: [], missing: [] };
  const present: string[] = [];
  const missing: string[] = [];
  for (const term of terms) (hasCvTerm(cv, term) ? present : missing).push(term);
  return { score: Math.round(100 * present.length / terms.length), reason: `${present.length}/${terms.length} mots-clés cités dans le CV — niveau et éligibilité à vérifier`, present, missing };
}
