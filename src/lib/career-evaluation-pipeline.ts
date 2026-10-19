import { askJson, type Body, type Task } from "./ai";
import type { DetectedOffer, UserData } from "./data";
import { CAREER_TARGET, careerCvEvidence, careerKey, careerOfferText, currentCareerReport, validateCareerReport, validateCareerRequirements } from "./career-evaluation";

type Model = (task: Task, body: Body) => Promise<unknown>;
/** Deux passes indépendantes. La première ne reçoit jamais le CV. Injectable pour tests sans appels payants. */
export async function evaluateCareer(offer: DetectedOffer, data: UserData, model: Model = (task, body) => askJson(task, body, { temperature: 0.1 })) {
  const cached = currentCareerReport(offer, data);
  if (cached) return { report: cached, requirementCache: data.careerRequirementCache || {}, cached: true };
  const cv = careerCvEvidence(data), offerText = careerOfferText(offer);
  if (cv.length < 100) throw new Error("Importe ton CV maître avant de demander une évaluation.");
  if (offerText.length < 150) throw new Error("L'annonce est trop incomplète : ajoute sa description avant l'analyse.");
  const key = careerKey(offerText);
  const prior = data.careerRequirementCache?.[key];
  const requirements = prior
    ? validateCareerRequirements({ requirements: prior.requirements }, offerText)
    : validateCareerRequirements(await model("careerRequirements", { offerText }), offerText);
  const raw = await model("careerEvaluation", { offerText, cvOriginal: cv, careerContext: JSON.stringify({ target: CAREER_TARGET, requirements }) });
  const report = validateCareerReport(raw, offer, data, requirements);
  // Cache borné : pas de croissance indéfinie dans le dossier Supabase.
  const requirementCache = Object.fromEntries(Object.entries({ ...data.careerRequirementCache, [key]: { requirements, createdAt: report.createdAt } })
    .sort((a, b) => b[1].createdAt.localeCompare(a[1].createdAt)).slice(0, 60));
  return { report, requirementCache, cached: false };
}

