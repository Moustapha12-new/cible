import type { DetectedOffer, UserData } from "./data";
import { analyzePfeOffer } from "./pfe-matching";
import { hasCvTerm } from "./cv-keywords";
import { cvToText } from "./cv";

/** Textual coverage, not a probability of being recruited or proof of mastery. */
export function offerCvCoverage(offer: DetectedOffer, data: UserData) {
  const cv = data.originalCv?.text?.trim() || (data.cvData ? cvToText(data.cvData).trim() : "");
  if (!cv) return { score: null, reason: "CV maître à importer", present: [], missing: [] };
  const terms = analyzePfeOffer(offer, data).requirements.map(r => r.term);
  if (!terms.length) return { score: null, reason: "Annonce à enrichir", present: [], missing: [] };
  const present = terms.filter(term => hasCvTerm(cv, term));
  const missing = terms.filter(term => !hasCvTerm(cv, term));
  return { score: Math.round(100 * present.length / terms.length), reason: `${present.length}/${terms.length} mots-clés cités dans le CV — niveau et éligibilité à vérifier`, present, missing };
}
