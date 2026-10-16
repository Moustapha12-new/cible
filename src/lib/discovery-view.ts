import type { DetectedOffer } from "./data";
import type { DiscoveredOffer } from "./discovery-offers";

/** Même objet d'offre que Gmail et les offres manuelles : le CV reçoit la
 * description de la fiche ATS, pas un résumé inventé. */
export function discoveryToDetectedOffer(found: DiscoveredOffer): DetectedOffer {
  return {
    id: found.id,
    title: found.title,
    company: found.company,
    location: found.location,
    salary: "",
    match: 0,
    keywords: found.technicalEvidence,
    text: `${found.title} — ${found.company}\n${found.description}`,
    url: found.applicationUrl,
    source: "Discovery · SmartRecruiters",
    contract: "Stage",
    duration: found.durationMonths === null ? found.durationEvidence || "À confirmer" : `${found.durationMonths} mois`,
    description: found.description,
    receivedAt: found.sourceCheckedAt,
    enrichStatus: "ok",
    enrichLevel: "L2",
  };
}
