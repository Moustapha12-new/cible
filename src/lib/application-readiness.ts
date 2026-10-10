import type { UserData, DetectedOffer, Application, Profile } from "./data";
import type { PfeAnalysis } from "./pfe-matching";
import type { CvAdaptation } from "./cv-adaptation";
import type { DocumentRecord } from "./pfe-documents";
import { pfeFingerprint, analyzePfeOffer } from "./pfe-matching";
import { hasApprovedCV, cvMasterText } from "./cv-adaptation";

export type ReadinessStatus = "ready" | "to_verify" | "missing" | "not_needed";

export type ReadinessItem = {
  id: string;
  category: "cv" | "letter" | "documents" | "matching" | "profile" | "link" | "eligibility";
  label: string;
  status: ReadinessStatus;
  message: string;
  action?: string;
  actionHref?: string;
  details?: string[];
};

export type ApplicationReadiness = {
  overall: "ready" | "incomplete" | "blocked";
  items: ReadinessItem[];
  missingCount: number;
  toVerifyCount: number;
  readyCount: number;
};

function isAnalysisFresh(analysis: PfeAnalysis, offer: DetectedOffer, data: UserData): boolean {
  return analysis.fingerprint === pfeFingerprint(offer, data);
}

function getApprovedCV(data: UserData, offerId: string): CvAdaptation | undefined {
  return data.cvAdaptations?.[offerId]?.find(v => v.status === "approved");
}

function getApprovedCVText(data: UserData, offerId: string): string | undefined {
  const cv = getApprovedCV(data, offerId);
  return cv?.approvedText;
}

function getDossierCV(data: UserData, offerId: string): string | undefined {
  return data.dossiers?.[offerId]?.cvText;
}

function getDossierLetter(data: UserData, offerId: string): string | undefined {
  return data.dossiers?.[offerId]?.letterText;
}

function getApplication(data: UserData, offerId: string): Application | undefined {
  return data.applications.find(a => a.offerId === offerId);
}

function getDocumentsForCase(data: UserData, caseKey: string): DocumentRecord[] {
  return (data.documents || []).filter(doc => doc.caseKeys.includes(caseKey));
}

function getLettersForOffer(data: UserData, offer: DetectedOffer): Array<{ id: string; content: string; date: string }> {
  return data.letters.filter(l => l.company === offer.company && l.role === offer.title);
}

function isUrlValid(url?: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function hasProfileEssentials(profile: Profile): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!profile.firstName?.trim()) missing.push("Prénom");
  if (!profile.lastName?.trim()) missing.push("Nom");
  if (!profile.email?.trim()) missing.push("Email");
  if (!profile.phone?.trim()) missing.push("Téléphone");
  if (!profile.city?.trim()) missing.push("Ville");
  return { ok: missing.length === 0, missing };
}

function letterRequiredOrOptional(offer: DetectedOffer): "required" | "optional" | "unknown" {
  const text = [offer.text, offer.description, offer.profile, ...(offer.missions || []), ...(offer.prerequisites || [])].join("\n").toLowerCase();
  if (/lettre de motivation|lettre motivation|cover letter|motivation letter/.test(text)) return "required";
  if (/lettre facultative|lettre optionnelle|lettre non requise|pas de lettre|sans lettre/.test(text)) return "optional";
  return "unknown";
}

export function evaluateApplicationReadiness(
  data: UserData,
  offerId: string
): ApplicationReadiness {
  const offer = data.offers.find(o => o.id === offerId);
  if (!offer) {
    return {
      overall: "blocked",
      items: [{
        id: "offer-missing",
        category: "cv",
        label: "Offre introuvable",
        status: "missing",
        message: "L'offre n'existe plus dans vos données.",
        action: "Retourner aux offres",
        actionHref: "/app/alertes-gmail"
      }],
      missingCount: 1,
      toVerifyCount: 0,
      readyCount: 0
    };
  }

  const application = getApplication(data, offerId);
  const dossier = data.dossiers?.[offerId];
  const analysis = data.pfeAnalyses?.[offerId];
  const approvedCV = getApprovedCV(data, offerId);
  const approvedCVText = getApprovedCVText(data, offerId);
  const dossierCVText = getDossierCV(data, offerId);
  const dossierLetterText = getDossierLetter(data, offerId);
  const letters = getLettersForOffer(data, offer);
  const documents = getDocumentsForCase(data, offerId);
  const cvMaster = cvMasterText(data);

  const items: ReadinessItem[] = [];
  let missingCount = 0;
  let toVerifyCount = 0;
  let readyCount = 0;

  const addItem = (item: ReadinessItem) => {
    items.push(item);
    if (item.status === "missing") missingCount++;
    else if (item.status === "to_verify") toVerifyCount++;
    else if (item.status === "ready") readyCount++;
  };

  // 1. CV Adapté et approuvé
  if (approvedCV && approvedCVText) {
    const analysisFresh = analysis && isAnalysisFresh(analysis, offer, data);
    if (analysisFresh) {
      addItem({
        id: "cv-approved",
        category: "cv",
        label: "CV adapté approuvé",
        status: "ready",
        message: `Version approuvée le ${new Date(approvedCV.updatedAt).toLocaleDateString("fr-FR")}`,
        action: "Voir l'atelier CV",
        actionHref: `/app/adaptation?offer=${encodeURIComponent(offerId)}`
      });
    } else {
      addItem({
        id: "cv-stale",
        category: "cv",
        label: "CV adapté (analyse périmée)",
        status: "to_verify",
        message: "Le CV est approuvé mais l'analyse de l'offre a changé. Vérifiez qu'il est encore pertinent.",
        action: "Actualiser l'analyse",
        actionHref: `/app/matching?offer=${encodeURIComponent(offerId)}`,
        details: ["L'empreinte de l'offre, du CV maître ou des preuves a changé"]
      });
    }
  } else if (approvedCV && !approvedCVText) {
    addItem({
      id: "cv-approved-no-text",
      category: "cv",
      label: "CV approuvé sans texte final",
      status: "to_verify",
      message: "Le CV est marqué approuvé mais le texte final n'est pas généré.",
      action: "Ouvrir l'atelier CV",
      actionHref: `/app/adaptation?offer=${encodeURIComponent(offerId)}`
    });
  } else if (dossierCVText && dossierCVText.trim().length > 100) {
    addItem({
      id: "cv-dossier-only",
      category: "cv",
      label: "CV de dossier (non approuvé)",
      status: "to_verify",
      message: "Un CV existe dans le dossier mais n'a pas été approuvé via l'atelier. Il sera utilisé tel quel.",
      action: "Approuver le CV",
      actionHref: `/app/adaptation?offer=${encodeURIComponent(offerId)}`
    });
  } else if (cvMaster && cvMaster.trim().length > 100) {
    addItem({
      id: "cv-master-only",
      category: "cv",
      label: "CV maître seulement",
      status: "to_verify",
      message: "Seul le CV maître est disponible. Le CV n'est pas adapté à cette offre.",
      action: "Créer un CV adapté",
      actionHref: `/app/adaptation?offer=${encodeURIComponent(offerId)}`
    });
  } else {
    addItem({
      id: "cv-missing",
      category: "cv",
      label: "CV manquant",
      status: "missing",
      message: "Aucun CV n'est disponible. Ajoutez votre CV maître puis créez une version adaptée.",
      action: "Ajouter mon CV",
      actionHref: "/app/cv"
    });
  }

  // 2. Lettre de motivation
  const letterRequirement = letterRequiredOrOptional(offer);
  const hasLetter = !!dossierLetterText?.trim() || letters.length > 0;

  if (letterRequirement === "required") {
    if (hasLetter) {
      addItem({
        id: "letter-ready",
        category: "letter",
        label: "Lettre de motivation",
        status: "ready",
        message: dossierLetterText ? "Lettre préparée dans le dossier" : `${letters.length} lettre(s) enregistrée(s)`,
        action: "Voir les lettres",
        actionHref: `/app/lettres`
      });
    } else {
      addItem({
        id: "letter-missing-required",
        category: "letter",
        label: "Lettre de motivation requise",
        status: "missing",
        message: "L'offre exige explicitement une lettre de motivation.",
        action: "Rédiger la lettre",
        actionHref: `/app/dossier?offer=${encodeURIComponent(offerId)}`,
        details: ["Générez un brouillon dans l'onglet Lettre du dossier ou dans la page Lettres"]
      });
    }
  } else if (letterRequirement === "optional") {
    if (hasLetter) {
      addItem({
        id: "letter-ready-optional",
        category: "letter",
        label: "Lettre de motivation (facultative)",
        status: "ready",
        message: "Lettre préparée — l'offre la mentionne comme facultative",
        action: "Voir les lettres",
        actionHref: `/app/lettres`
      });
    } else {
      addItem({
        id: "letter-optional-none",
        category: "letter",
        label: "Lettre facultative non fournie",
        status: "not_needed",
        message: "L'offre indique que la lettre est facultative. Vous pouvez en ajouter une si vous le souhaitez.",
        action: "Ajouter une lettre",
        actionHref: `/app/dossier?offer=${encodeURIComponent(offerId)}`
      });
    }
  } else {
    if (hasLetter) {
      addItem({
        id: "letter-ready-unknown",
        category: "letter",
        label: "Lettre de motivation",
        status: "ready",
        message: "Lettre préparée — l'offre ne précise pas si elle est requise",
        action: "Voir les lettres",
        actionHref: `/app/lettres`
      });
    } else {
      addItem({
        id: "letter-unknown-none",
        category: "letter",
        label: "Lettre non préparée",
        status: "to_verify",
        message: "L'offre ne mentionne pas la lettre. Vérifiez si elle est attendue avant d'envoyer.",
        action: "Vérifier l'annonce / Ajouter une lettre",
        actionHref: `/app/dossier?offer=${encodeURIComponent(offerId)}`
      });
    }
  }

  // 3. Documents complémentaires
  const requiredDocCategories = documents.filter(d => 
    ["certificat", "demande", "portfolio"].includes(d.category)
  );
  const hasRequiredDocs = requiredDocCategories.length > 0;
  const hasAnyDocs = documents.length > 0;

  if (hasRequiredDocs) {
    addItem({
      id: "docs-ready",
      category: "documents",
      label: "Documents complémentaires",
      status: "ready",
      message: `${requiredDocCategories.length} document(s) requis(s) disponible(s)`,
      action: "Voir les documents",
      actionHref: `/app/dossier?offer=${encodeURIComponent(offerId)}#documents-echanges`
    });
  } else if (hasAnyDocs) {
    addItem({
      id: "docs-optional",
      category: "documents",
      label: "Documents disponibles",
      status: "ready",
      message: `${documents.length} document(s) dans le dossier`,
      action: "Voir les documents",
      actionHref: `/app/dossier?offer=${encodeURIComponent(offerId)}#documents-echanges`
    });
  } else {
    const offerText = [offer.text, offer.description, offer.profile, ...(offer.missions || []), ...(offer.prerequisites || [])].join("\n").toLowerCase();
    const docsMentioned = /attestation|certificat|diplôme|portfolio|pièce jointe|document/.test(offerText);
    
    if (docsMentioned) {
      addItem({
        id: "docs-missing-mentioned",
        category: "documents",
        label: "Documents mentionnés dans l'offre",
        status: "to_verify",
        message: "L'offre fait référence à des pièces complémentaires. Vérifiez lesquelles sont exigées.",
        action: "Voir l'annonce / Ajouter documents",
        actionHref: `/app/dossier?offer=${encodeURIComponent(offerId)}#documents-echanges`,
        details: ["Relisez l'annonce pour identifier les documents demandés"]
      });
    } else {
      addItem({
        id: "docs-none",
        category: "documents",
        label: "Aucun document complémentaire",
        status: "not_needed",
        message: "L'offre ne mentionne pas de pièces complémentaires obligatoires.",
        action: "Ajouter si nécessaire",
        actionHref: `/app/dossier?offer=${encodeURIComponent(offerId)}#documents-echanges`
      });
    }
  }

  // 4. Matching / Analyse PFE
  if (analysis && isAnalysisFresh(analysis, offer, data)) {
    addItem({
      id: "matching-fresh",
      category: "matching",
      label: "Analyse PFE à jour",
      status: "ready",
      message: `Éligibilité : ${analysis.eligibility.status} · Pertinence : ${analysis.relevance.level}`,
      action: "Voir l'analyse",
      actionHref: `/app/matching?offer=${encodeURIComponent(offerId)}`
    });
  } else if (analysis && !isAnalysisFresh(analysis, offer, data)) {
    addItem({
      id: "matching-stale",
      category: "matching",
      label: "Analyse PFE périmée",
      status: "to_verify",
      message: "L'offre, votre CV ou vos preuves ont changé depuis l'analyse. Les résultats peuvent être obsolètes.",
      action: "Actualiser l'analyse",
      actionHref: `/app/matching?offer=${encodeURIComponent(offerId)}`,
      details: ["L'empreinte factuelle ne correspond plus"]
    });
  } else {
    addItem({
      id: "matching-missing",
      category: "matching",
      label: "Analyse PFE non faite",
      status: "missing",
      message: "Aucune analyse d'éligibilité et de pertinence n'a été réalisée pour cette offre.",
      action: "Analyser l'offre",
      actionHref: `/app/matching?offer=${encodeURIComponent(offerId)}`
    });
  }

  // 5. Profil / Coordonnées
  const profileCheck = hasProfileEssentials(data.profile);
  if (profileCheck.ok) {
    addItem({
      id: "profile-complete",
      category: "profile",
      label: "Profil complet",
      status: "ready",
      message: "Toutes les coordonnées essentielles sont renseignées",
      action: "Voir mon profil",
      actionHref: "/app/cv"
    });
  } else {
    addItem({
      id: "profile-incomplete",
      category: "profile",
      label: "Profil incomplet",
      status: "to_verify",
      message: `Coordonnées manquantes : ${profileCheck.missing.join(", ")}`,
      action: "Compléter mon profil",
      actionHref: "/app/cv",
      details: ["Ces informations sont souvent demandées dans les formulaires de candidature"]
    });
  }

  // 6. Lien de candidature
  const offerUrl = offer.url;
  if (isUrlValid(offerUrl)) {
    addItem({
      id: "link-valid",
      category: "link",
      label: "Lien de candidature",
      status: "ready",
      message: `URL disponible : ${offerUrl!.slice(0, 60)}${offerUrl!.length > 60 ? "…" : ""}`,
      action: "Ouvrir pour postuler",
      actionHref: offerUrl!
    });
  } else {
    addItem({
      id: "link-missing",
      category: "link",
      label: "Lien de candidature absent",
      status: "missing",
      message: "Aucun lien valide n'est enregistré pour cette offre.",
      action: "Renseigner le lien",
      actionHref: `/app/dossier?offer=${encodeURIComponent(offerId)}`,
      details: ["Ajoutez l'URL dans l'offre ou recherchez l'annonce sur le site de l'entreprise"]
    });
  }

  // 7. Éligibilité PFE
  if (analysis) {
    if (analysis.eligibility.status === "eligible") {
      addItem({
        id: "eligibility-ok",
        category: "eligibility",
        label: "Éligibilité PFE confirmée",
        status: "ready",
        message: "Stage ingénieur, 6 mois, février 2027, domaine ciblé identifiés",
        action: "Voir les détails",
        actionHref: `/app/matching?offer=${encodeURIComponent(offerId)}`
      });
    } else if (analysis.eligibility.status === "verify") {
      addItem({
        id: "eligibility-verify",
        category: "eligibility",
        label: "Éligibilité PFE à vérifier",
        status: "to_verify",
        message: analysis.eligibility.reasons.join(" ; "),
        action: "Voir l'analyse",
        actionHref: `/app/matching?offer=${encodeURIComponent(offerId)}`,
        details: analysis.eligibility.reasons
      });
    } else {
      addItem({
        id: "eligibility-excluded",
        category: "eligibility",
        label: "Éligibilité PFE incompatible",
        status: "missing",
        message: analysis.eligibility.reasons.join(" ; "),
        action: "Voir l'analyse",
        actionHref: `/app/matching?offer=${encodeURIComponent(offerId)}`,
        details: analysis.eligibility.reasons
      });
    }
  } else {
    addItem({
      id: "eligibility-unknown",
      category: "eligibility",
      label: "Éligibilité PFE inconnue",
      status: "to_verify",
      message: "Lancez l'analyse pour connaître la compatibilité PFE de cette offre.",
      action: "Analyser l'offre",
      actionHref: `/app/matching?offer=${encodeURIComponent(offerId)}`
    });
  }

  // Candidature déjà envoyée
  if (application) {
    const statusLabel = application.status === "sent" ? "Postulée" : 
                        application.status === "interview" ? "Entretien" :
                        application.status === "offer" ? "Offre reçue" : "Refusée";
    addItem({
      id: "already-sent",
      category: "cv",
      label: `Candidature ${statusLabel.toLowerCase()}`,
      status: "ready",
      message: `Envoyée le ${application.date ? new Date(application.date).toLocaleDateString("fr-FR") : "date inconnue"} — statut : ${statusLabel}`,
      action: "Voir le suivi",
      actionHref: `/app/candidatures?open=${application.id}`
    });
  }

  // Déterminer l'état global
  let overall: "ready" | "incomplete" | "blocked";
  if (missingCount > 0) {
    overall = "blocked";
  } else if (toVerifyCount > 0) {
    overall = "incomplete";
  } else {
    overall = "ready";
  }

  return { overall, items, missingCount, toVerifyCount, readyCount };
}

export function getApplicationChannel(offer: DetectedOffer): { 
  type: "url" | "email" | "unknown"; 
  value?: string; 
  label: string;
  actionText: string;
} {
  if (isUrlValid(offer.url)) {
    return {
      type: "url",
      value: offer.url,
      label: "Site de candidature",
      actionText: "Ouvrir pour postuler"
    };
  }
  // Pas d'email dans l'offre actuellement, mais on pourrait l'ajouter plus tard
  return {
    type: "unknown",
    label: "Canal inconnu",
    actionText: "Rechercher le lien"
  };
}