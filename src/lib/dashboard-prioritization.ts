import type { UserData, DetectedOffer, Application, AppStatus } from "./data";
import type { PfeAnalysis } from "./pfe-matching";
import { pfeFingerprint, analyzePfeOffer } from "./pfe-matching";

export type ActionPriority = "critical" | "high" | "medium" | "low";
export type ActionCategory = "offer" | "dossier" | "cv" | "followup" | "deadline";

export type NextAction = {
  id: string;
  category: ActionCategory;
  priority: ActionPriority;
  title: string;
  description: string;
  href: string;
  offerId?: string;
  applicationId?: string;
  metadata: {
    company?: string;
    role?: string;
    deadline?: string;
    daysUntilDeadline?: number;
    eligibility?: "eligible" | "verify" | "excluded";
    relevance?: "forte" | "à examiner" | "faible";
    status?: AppStatus;
    analysisFresh?: boolean;
    cvApproved?: boolean;
  };
};

export type DashboardMetrics = {
  totalOffers: number;
  eligibleOffers: number;
  offersToAnalyze: number;
  draftsInProgress: number;
  applicationsSent: number;
  applicationsToFollowUp: number;
  interviews: number;
  offersReceived: number;
  cvApprovedCount: number;
  cvToValidate: number;
  upcomingDeadlines: number;
};

export type OpportunityScore = {
  offerId: string;
  score: number;
  eligibility: "eligible" | "verify" | "excluded";
  relevance: "forte" | "à examiner" | "faible";
  reasons: string[];
  infoToVerify: string[];
  deadline?: string;
  daysUntilDeadline?: number;
};

function daysUntil(dateStr: string): number | undefined {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return undefined;
  const now = new Date();
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((d0.getTime() - day0.getTime()) / 86_400_000);
}

function isAnalysisFresh(analysis: PfeAnalysis, offer: DetectedOffer, data: UserData): boolean {
  return analysis.fingerprint === pfeFingerprint(offer, data);
}

function hasApprovedCV(data: UserData, offerId: string): boolean {
  return !!data.cvAdaptations?.[offerId]?.find(v => v.status === "approved");
}

function getOfferDeadline(offer: DetectedOffer): string | undefined {
  if (offer.startDate) return offer.startDate.slice(0, 10);
  return undefined;
}

function computeOpportunityScore(offer: DetectedOffer, data: UserData): OpportunityScore {
  let analysis = data.pfeAnalyses?.[offer.id];
  if (!analysis || !isAnalysisFresh(analysis, offer, data)) {
    analysis = analyzePfeOffer(offer, data);
  }
  
  const deadline = getOfferDeadline(offer);
  const daysUntilDeadline = deadline ? daysUntil(deadline) : undefined;
  
  const reasons: string[] = [];
  const infoToVerify: string[] = [];
  
  if (analysis.eligibility.status === "eligible") {
    reasons.push("Compatible PFE (stage ingénieur, 6 mois, février 2027, domaine ciblé)");
  } else if (analysis.eligibility.status === "verify") {
    reasons.push("Éligibilité à vérifier");
    analysis.eligibility.reasons.forEach(r => infoToVerify.push(r));
  } else {
    reasons.push("Incompatible selon la fiche");
    analysis.eligibility.reasons.forEach(r => infoToVerify.push(r));
  }
  
  if (analysis.relevance.level === "forte") {
    reasons.push(`Pertinence forte : ${analysis.relevance.domains.join(", ")}`);
  } else if (analysis.relevance.level === "à examiner") {
    reasons.push("Pertinence à examiner");
    infoToVerify.push("Lien entre formation et domaine à documenter");
  } else {
    reasons.push("Lien technique limité");
    infoToVerify.push("Domaine technique à confirmer");
  }
  
  const validatedCount = analysis.requirements.filter(r => r.match === "prouvée" || r.match === "citée dans le CV").length;
  if (validatedCount > 0) {
    reasons.push(`${validatedCount} compétence(s) documentée(s)`);
  }
  
  if (analysis.gaps.length > 0) {
    infoToVerify.push(`${analysis.gaps.length} exigence(s) obligatoire(s) non documentée(s) : ${analysis.gaps.slice(0, 3).join(", ")}`);
  }
  
  if (analysis.unknowns.length > 0) {
    infoToVerify.push(...analysis.unknowns.slice(0, 2));
  }
  
  let score = 0;
  if (analysis.eligibility.status === "eligible") score += 40;
  else if (analysis.eligibility.status === "verify") score += 20;
  
  if (analysis.relevance.level === "forte") score += 30;
  else if (analysis.relevance.level === "à examiner") score += 15;
  
  score += Math.min(validatedCount * 5, 25);
  
  if (daysUntilDeadline !== null && daysUntilDeadline !== undefined) {
    if (daysUntilDeadline <= 7) score += 20;
    else if (daysUntilDeadline <= 14) score += 10;
    else if (daysUntilDeadline <= 30) score += 5;
  }
  
  if (hasApprovedCV(data, offer.id)) score += 10;
  
  return {
    offerId: offer.id,
    score,
    eligibility: analysis.eligibility.status,
    relevance: analysis.relevance.level,
    reasons,
    infoToVerify,
    deadline,
    daysUntilDeadline,
  };
}

function computeMetrics(data: UserData): DashboardMetrics {
  const offers = data.offers || [];
  const applications = data.applications || [];
  const dossiers = data.dossiers || {};
  
  let eligibleOffers = 0;
  let offersToAnalyze = 0;
  
  for (const offer of offers) {
    const analysis = data.pfeAnalyses?.[offer.id];
    if (analysis && isAnalysisFresh(analysis, offer, data)) {
      if (analysis.eligibility.status === "eligible") eligibleOffers++;
    } else {
      offersToAnalyze++;
    }
  }
  
  const draftsInProgress = offers.filter(o => dossiers[o.id] && !dossiers[o.id].applicationId).length;
  
  const sentApps = applications.filter(a => a.status === "sent");
  const applicationsToFollowUp = sentApps.filter(a => {
    if (!a.date) return false;
    return daysUntil(a.date) !== null && daysUntil(a.date)! <= -7;
  }).length;
  
  const interviews = applications.filter(a => a.status === "interview").length;
  const offersReceived = applications.filter(a => a.status === "offer").length;
  
  let cvApprovedCount = 0;
  let cvToValidate = 0;
  for (const offer of offers) {
    if (hasApprovedCV(data, offer.id)) cvApprovedCount++;
    else if (dossiers[offer.id] && !data.pfeAnalyses?.[offer.id]) cvToValidate++;
  }
  
  let upcomingDeadlines = 0;
  for (const offer of offers) {
    const deadline = getOfferDeadline(offer);
    const days = deadline ? daysUntil(deadline) : null;
    if (days !== null && days !== undefined && days >= 0 && days <= 14) upcomingDeadlines++;
  }
  
  return {
    totalOffers: offers.length,
    eligibleOffers,
    offersToAnalyze,
    draftsInProgress,
    applicationsSent: sentApps.length,
    applicationsToFollowUp,
    interviews,
    offersReceived,
    cvApprovedCount,
    cvToValidate,
    upcomingDeadlines,
  };
}

export function generateNextActions(data: UserData): NextAction[] {
  const actions: NextAction[] = [];
  const offers = data.offers || [];
  const applications = data.applications || [];
  const dossiers = data.dossiers || {};
  const hasCV = !!(data.originalCv?.text || data.cvData);
  
  if (!hasCV) {
    actions.push({
      id: "add-cv",
      category: "cv",
      priority: "critical",
      title: "Ajouter ton CV de référence",
      description: "Indispensable pour analyser les offres, adapter ton CV et préparer tes candidatures.",
      href: "/app/cv",
      metadata: {},
    });
  }
  
  const scoredOffers = offers.map(o => computeOpportunityScore(o, data)).sort((a, b) => b.score - a.score);
  
  for (const scored of scoredOffers.slice(0, 5)) {
    const offer = offers.find(o => o.id === scored.offerId);
    if (!offer) continue;
    
    const analysis = data.pfeAnalyses?.[offer.id];
    const isFresh = analysis && isAnalysisFresh(analysis, offer, data);
    const hasApproved = hasApprovedCV(data, offer.id);
    const hasDossier = !!dossiers[offer.id];
    
    if (!isFresh && !analysis) {
      actions.push({
        id: `analyze-${offer.id}`,
        category: "offer",
        priority: scored.eligibility === "eligible" ? "high" : "medium",
        title: `Analyser : ${offer.title} chez ${offer.company}`,
        description: scored.eligibility === "eligible" 
          ? "Offre compatible PFE non analysée. Lance l'analyse pour voir éligibilité, pertinence et preuves."
          : "Offre à qualifier. L'analyse révélera l'éligibilité PFE et les points à vérifier.",
        href: `/app/matching?offer=${encodeURIComponent(offer.id)}`,
        offerId: offer.id,
        metadata: {
          company: offer.company,
          role: offer.title,
          deadline: scored.deadline,
          daysUntilDeadline: scored.daysUntilDeadline,
          eligibility: scored.eligibility,
          relevance: scored.relevance,
          analysisFresh: false,
        },
      });
    } else if (isFresh && !hasApproved && hasDossier) {
      actions.push({
        id: `cv-${offer.id}`,
        category: "cv",
        priority: "high",
        title: `Valider le CV pour ${offer.company}`,
        description: "Analyse faite, preuves choisies. Adapte et approuve ton CV ciblé pour cette offre.",
        href: `/app/adaptation?offer=${encodeURIComponent(offer.id)}`,
        offerId: offer.id,
        metadata: {
          company: offer.company,
          role: offer.title,
          deadline: scored.deadline,
          daysUntilDeadline: scored.daysUntilDeadline,
          eligibility: scored.eligibility,
          relevance: scored.relevance,
          analysisFresh: true,
          cvApproved: false,
        },
      });
    } else if (isFresh && hasApproved && hasDossier && !dossiers[offer.id].applicationId) {
      actions.push({
        id: `send-${offer.id}`,
        category: "dossier",
        priority: scored.daysUntilDeadline !== undefined && scored.daysUntilDeadline <= 7 ? "critical" : "high",
        title: `Finaliser et envoyer : ${offer.company}`,
        description: "CV approuvé, dossier prêt. Confirme l'envoi pour figer les versions et ouvrir le suivi.",
        href: `/app/dossier?offer=${encodeURIComponent(offer.id)}`,
        offerId: offer.id,
        metadata: {
          company: offer.company,
          role: offer.title,
          deadline: scored.deadline,
          daysUntilDeadline: scored.daysUntilDeadline,
          eligibility: scored.eligibility,
          relevance: scored.relevance,
          analysisFresh: true,
          cvApproved: true,
        },
      });
    } else if (isFresh && hasApproved && !hasDossier) {
      actions.push({
        id: `dossier-${offer.id}`,
        category: "dossier",
        priority: "medium",
        title: `Créer le dossier : ${offer.company}`,
        description: "CV approuvé. Ouvre le dossier pour rédiger la lettre et préparer l'envoi.",
        href: `/app/dossier?offer=${encodeURIComponent(offer.id)}`,
        offerId: offer.id,
        metadata: {
          company: offer.company,
          role: offer.title,
          deadline: scored.deadline,
          daysUntilDeadline: scored.daysUntilDeadline,
          eligibility: scored.eligibility,
          relevance: scored.relevance,
          analysisFresh: true,
          cvApproved: true,
        },
      });
    }
  }
  
  const sentApps = applications.filter(a => a.status === "sent");
  for (const app of sentApps) {
    if (!app.date) continue;
    const days = daysUntil(app.date);
    if (days !== null && days !== undefined && days <= -7) {
      actions.push({
        id: `followup-${app.id}`,
        category: "followup",
        priority: days <= -14 ? "critical" : "high",
        title: `Relancer : ${app.company}`,
        description: `Candidature envoyée il y a ${Math.abs(days)} jours sans réponse. Prépare une relance.`,
        href: "/app/candidatures",
        applicationId: app.id,
        metadata: {
          company: app.company,
          role: app.role,
          status: app.status,
          daysUntilDeadline: days,
        },
      });
    }
  }
  
  for (const app of applications) {
    if (app.status === "interview" && app.notes?.includes("date")) {
      const interviewDateMatch = app.notes.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
      if (interviewDateMatch) {
        const days = daysUntil(interviewDateMatch[1].replace(/\//g, "-"));
        if (days !== null && days !== undefined && days >= 0 && days <= 3) {
          actions.push({
            id: `interview-${app.id}`,
            category: "deadline",
            priority: "critical",
            title: `Entretien imminent : ${app.company}`,
            description: `Entretien prévu dans ${days} jour(s). Prépare-toi.`,
            href: "/app/candidatures",
            applicationId: app.id,
            metadata: {
              company: app.company,
              role: app.role,
              status: app.status,
              daysUntilDeadline: days,
            },
          });
        }
      }
    }
  }
  
  for (const scored of scoredOffers) {
    if (scored.daysUntilDeadline !== undefined && scored.daysUntilDeadline !== null && scored.daysUntilDeadline >= 0 && scored.daysUntilDeadline <= 7) {
      const offer = offers.find(o => o.id === scored.offerId);
      if (!offer) continue;
      
      const alreadyHasDeadlineAction = actions.some(a => a.offerId === offer.id && a.category === "deadline");
      if (!alreadyHasDeadlineAction) {
        actions.push({
          id: `deadline-${offer.id}`,
          category: "deadline",
          priority: scored.daysUntilDeadline <= 2 ? "critical" : "high",
          title: `Échéance proche : ${offer.company}`,
          description: `L'offre indique un début autour de ${scored.deadline}. Agis dans les ${scored.daysUntilDeadline} jours.`,
          href: `/app/dossier?offer=${encodeURIComponent(offer.id)}`,
          offerId: offer.id,
          metadata: {
            company: offer.company,
            role: offer.title,
            deadline: scored.deadline,
            daysUntilDeadline: scored.daysUntilDeadline,
            eligibility: scored.eligibility,
            relevance: scored.relevance,
          },
        });
      }
    }
  }
  
  const priorityOrder: Record<ActionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return actions.slice(0, 5);
}

export function getTopOpportunities(data: UserData, limit = 5): OpportunityScore[] {
  const offers = data.offers || [];
  return offers.map(o => computeOpportunityScore(o, data)).sort((a, b) => b.score - a.score).slice(0, limit);
}

export function getApplicationsPipeline(data: UserData): {
  byStatus: Record<AppStatus, { applications: Application[]; offer?: DetectedOffer }>;
  followups: { application: Application; daysSinceSent: number }[];
  upcomingInterviews: { application: Application; daysUntil: number }[];
} {
  const applications = data.applications || [];
  const offers = data.offers || [];
  
  const byStatus: Record<AppStatus, { applications: Application[]; offer?: DetectedOffer }> = {
    sent: { applications: [] },
    interview: { applications: [] },
    offer: { applications: [] },
    rejected: { applications: [] },
  };
  
  for (const app of applications) {
    const offer = offers.find(o => o.id === app.offerId);
    byStatus[app.status].applications.push(app);
    if (offer) byStatus[app.status].offer = offer;
  }
  
  const followups: { application: Application; daysSinceSent: number }[] = [];
  for (const app of applications.filter(a => a.status === "sent")) {
    if (app.date) {
      const days = daysUntil(app.date);
      if (days !== null && days !== undefined && days < -7) {
        followups.push({ application: app, daysSinceSent: Math.abs(days) });
      }
    }
  }
  followups.sort((a, b) => b.daysSinceSent - a.daysSinceSent);
  
  const upcomingInterviews: { application: Application; daysUntil: number }[] = [];
  for (const app of applications.filter(a => a.status === "interview")) {
    if (app.notes) {
      const dateMatch = app.notes.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
      if (dateMatch) {
        const days = daysUntil(dateMatch[1].replace(/\//g, "-"));
        if (days !== null && days !== undefined && days >= 0 && days <= 14) {
          upcomingInterviews.push({ application: app, daysUntil: days });
        }
      }
    }
  }
  upcomingInterviews.sort((a, b) => a.daysUntil - b.daysUntil);
  
  return { byStatus, followups, upcomingInterviews };
}

export { computeMetrics, computeOpportunityScore, daysUntil };