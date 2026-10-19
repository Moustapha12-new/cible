import "server-only";
import { loadUserRecord, saveUserRecord } from "./candidature-server";
import type { VerifiedUser } from "./auth-server";
import type { DetectedOffer, UserData } from "./data";
import { careerFingerprint } from "./career-evaluation";
import { evaluateCareer } from "./career-evaluation-pipeline";

export async function evaluateAndSaveCareer(user: VerifiedUser, offer: DetectedOffer, data: UserData) {
  const result = await evaluateCareer(offer, data);
  if (!result.cached) {
    const latest = await loadUserRecord(user);
    const latestOffer = latest.data.offers.find(o => o.id === offer.id) || offer;
    if (careerFingerprint(latestOffer, latest.data) !== result.report.fingerprint) throw new Error("Le CV maître ou l'offre a changé pendant l'analyse. Relance avec la nouvelle version.");
    const reports = { ...latest.data.careerReports, [offer.id]: result.report };
    latest.data.careerReports = Object.fromEntries(Object.entries(reports).sort((a, b) => b[1].createdAt.localeCompare(a[1].createdAt)).slice(0, 80));
    latest.data.careerRequirementCache = result.requirementCache;
    if (!latest.data.offers.some(o => o.id === offer.id)) latest.data.offers.push(offer);
    await saveUserRecord(user, latest);
  }
  return result.report;
}
