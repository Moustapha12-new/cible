import type { UserData, Application, DetectedOffer, AppStatus } from "./data";
import { offerSnapshot } from "./data";
import { sentDocumentSnapshot } from "./pfe-documents";
import { getApprovedCVText, cvMasterText } from "./cv-adaptation";
import type { DocumentRecord } from "./pfe-documents";

export type SubmissionChannel = "website" | "platform" | "email" | "other";

export type SubmissionData = {
  offerId: string;
  company: string;
  role: string;
  source: string;
  sentAt: string;
  channel: SubmissionChannel;
  urlUsed?: string;
  cvText: string;
  cvName: string;
  letterText?: string;
  notes?: string;
  confirmationRef?: string;
};

export type SubmissionInput = Omit<SubmissionData, "cvText" | "cvName" | "offerId" | "company" | "role" | "source">;

export type SubmissionResult = {
  ok: boolean;
  applicationId?: string;
  error?: string;
  data?: UserData;
};

function uid(): string {
  return crypto.randomUUID();
}

function findExistingApplication(data: UserData, offerId: string): Application | undefined {
  return data.applications.find(a => a.offerId === offerId);
}

function findDossierApplicationId(data: UserData, offerId: string): string | undefined {
  return data.dossiers?.[offerId]?.applicationId;
}

export function prepareSubmission(
  data: UserData,
  offerId: string,
  submission: SubmissionInput
): { ok: boolean; error?: string; submissionData?: SubmissionData } {
  const offer = data.offers.find(o => o.id === offerId);
  if (!offer) {
    return { ok: false, error: "Offre introuvable" };
  }

  const dossier = data.dossiers?.[offerId];
  const approvedCVText = getApprovedCVText(data, offerId);
  const cvTextToSend = approvedCVText || dossier?.cvText || cvMasterText(data);
  
  if (!cvTextToSend || cvTextToSend.trim().length < 100) {
    return { ok: false, error: "Aucun CV valide n'est disponible pour cette candidature" };
  }

  const cvName = approvedCVText ? `CV adapté — ${offer.company}` : `CV dossier — ${offer.company}`;

  const existingApp = findExistingApplication(data, offerId);
  const dossierAppId = findDossierApplicationId(data, offerId);

  if (existingApp && !dossierAppId) {
    return { ok: false, error: "Une candidature existe déjà pour cette offre mais n'est pas liée au dossier" };
  }

  const sentAt = submission.sentAt || new Date().toISOString();

  const fullSubmission: SubmissionData = {
    offerId,
    company: offer.company,
    role: offer.title,
    source: offer.source || "Dossier Cible",
    sentAt,
    channel: submission.channel,
    urlUsed: submission.urlUsed,
    cvText: cvTextToSend,
    cvName,
    letterText: dossier?.letterText,
    notes: dossier?.notes,
    confirmationRef: submission.confirmationRef,
  };

  return { ok: true, submissionData: fullSubmission };
}

export function confirmSubmission(
  data: UserData,
  submission: SubmissionData
): SubmissionResult {
  const offerId = submission.offerId;
  const offer = data.offers.find(o => o.id === offerId);
  
  if (!offer) {
    return { ok: false, error: "Offre introuvable lors de la confirmation" };
  }

  const dossier = data.dossiers?.[offerId];
  const existingApp = findExistingApplication(data, offerId);
  const dossierAppId = findDossierApplicationId(data, offerId);

  const sentSnapshot = sentDocumentSnapshot(data, offerId, submission.cvText);
  const applicationId = dossierAppId || existingApp?.id || uid();

  const newApplication: Application = {
    id: applicationId,
    offerId,
    company: submission.company,
    role: submission.role,
    source: submission.source,
    status: "sent",
    daysAgo: 0,
    date: submission.sentAt,
    cvName: submission.cvName,
    cvText: submission.cvText,
    letterText: submission.letterText,
    notes: submission.notes,
    sentCvAdaptationId: sentSnapshot.sentCvAdaptationId,
    sentDocumentVersions: sentSnapshot.sentDocumentVersions,
    statusHistory: [{ status: "sent", at: submission.sentAt }],
    offerSnapshot: offerSnapshot(offer),
  };

  let nextApplications: Application[];
  if (existingApp) {
    nextApplications = data.applications.map(a => 
      a.id === applicationId ? newApplication : a
    );
  } else {
    nextApplications = [newApplication, ...data.applications];
  }

  const nextDossiers: UserData["dossiers"] = {
    ...data.dossiers,
    [offerId]: {
      ...dossier,
      applicationId,
      cvText: submission.cvText,
      letterText: submission.letterText ?? dossier?.letterText ?? "",
      notes: submission.notes ?? dossier?.notes ?? "",
      updatedAt: new Date().toISOString(),
    }
  };

  const nextData: UserData = {
    ...data,
    applications: nextApplications,
    dossiers: nextDossiers,
  };

  return { ok: true, applicationId, data: nextData };
}

export function correctSubmission(
  data: UserData,
  applicationId: string,
  corrections: Partial<Pick<Application, "date" | "notes" | "cvText" | "letterText" | "cvName">>
): SubmissionResult {
  const appIndex = data.applications.findIndex(a => a.id === applicationId);
  if (appIndex === -1) {
    return { ok: false, error: "Candidature introuvable" };
  }

  const nextApplications = [...data.applications];
  nextApplications[appIndex] = {
    ...nextApplications[appIndex],
    ...corrections,
    statusHistory: [
      ...(nextApplications[appIndex].statusHistory || []),
      { status: nextApplications[appIndex].status, at: new Date().toISOString() }
    ],
  };

  return { ok: true, applicationId, data: { ...data, applications: nextApplications } };
}

export function cancelSubmission(
  data: UserData,
  offerId: string
): SubmissionResult {
  const appIndex = data.applications.findIndex(a => a.offerId === offerId);
  if (appIndex === -1) {
    return { ok: false, error: "Aucune candidature à annuler pour cette offre" };
  }

  const nextApplications = data.applications.filter(a => a.offerId !== offerId);
  const nextDossiers = { ...data.dossiers };
  if (nextDossiers[offerId]) {
    nextDossiers[offerId] = { ...nextDossiers[offerId], applicationId: undefined };
  }

  return { ok: true, data: { ...data, applications: nextApplications, dossiers: nextDossiers } };
}

export function getSubmissionPreview(data: UserData, offerId: string): {
  ok: boolean;
  preview?: {
    company: string;
    role: string;
    cvName: string;
    cvPreview: string;
    letterPreview?: string;
    documentsCount: number;
    channel: SubmissionChannel;
    urlUsed?: string;
    sentAt: string;
  };
  error?: string;
} {
  const offer = data.offers.find(o => o.id === offerId);
  if (!offer) return { ok: false, error: "Offre introuvable" };

  const dossier = data.dossiers?.[offerId];
  const approvedCVText = getApprovedCVText(data, offerId);
  const cvText = approvedCVText || dossier?.cvText || cvMasterText(data);
  const cvName = approvedCVText ? `CV adapté — ${offer.company}` : `CV dossier — ${offer.company}`;

  if (!cvText || cvText.trim().length < 100) {
    return { ok: false, error: "CV insuffisant pour prévisualiser l'envoi" };
  }

  const documents = (data.documents || []).filter(doc => doc.caseKeys.includes(offerId));

  return {
    ok: true,
    preview: {
      company: offer.company,
      role: offer.title,
      cvName,
      cvPreview: cvText.slice(0, 500) + (cvText.length > 500 ? "…" : ""),
      letterPreview: dossier?.letterText?.slice(0, 300),
      documentsCount: documents.length,
      channel: "website",
      urlUsed: offer.url,
      sentAt: new Date().toISOString(),
    }
  };
}