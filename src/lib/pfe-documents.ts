import type { Application, DetectedOffer, UserData } from "./data";

export type DocumentCategory = "cv" | "lettre" | "portfolio" | "certificat" | "demande" | "reçu" | "autre";
export type DocumentVersion = { id: string; name: string; mime: string; size: number; createdAt: string };
export type DocumentRecord = { id: string; title: string; category: DocumentCategory; caseKeys: string[]; versions: DocumentVersion[]; createdAt: string; updatedAt: string };
export type GmailCandidate = { id: string; threadId?: string; messageId?: string; from: string; subject: string; date: string; snippet: string; text?: string; links: string[]; attachments: { filename: string; mimeType: string; size: number }[]; gmailUrl: string };
export type GmailAssociation = { caseKey: string; gmailId: string; messageId?: string; threadId?: string; state: "accepted" | "rejected"; from: string; subject: string; date: string; snippet: string; kind: MailKind; attachments: GmailCandidate["attachments"]; gmailUrl: string; note?: string; decidedAt: string };
export type MailKind = "confirmation" | "recruteur" | "documents" | "entretien" | "refus" | "réponse" | "à vérifier";
export type MatchDecision = { level: "strong" | "suggestion" | "insufficient"; reasons: string[] };

export const DOCUMENT_LIMIT = 8 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string[]> = {
  pdf: ["application/pdf"], docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"],
  odt: ["application/vnd.oasis.opendocument.text", "application/zip"], txt: ["text/plain"],
  png: ["image/png"], jpg: ["image/jpeg"], jpeg: ["image/jpeg"], webp: ["image/webp"],
};
export function documentMime(name: string, supplied = ""): string {
  if (supplied && supplied !== "application/octet-stream") return supplied;
  const extension = name.toLowerCase().split(".").pop() || "";
  return MIME_BY_EXTENSION[extension]?.[0] || "application/octet-stream";
}
export function validateDocumentFile(name: string, mime: string, size: number): string | null {
  const extension = name.toLowerCase().split(".").pop() || "";
  if (!MIME_BY_EXTENSION[extension]) return "Format non accepté. Utilise PDF, DOCX, ODT, TXT, PNG, JPG ou WEBP.";
  if (!Number.isFinite(size) || size <= 0 || size > DOCUMENT_LIMIT) return "Fichier vide ou trop volumineux (8 Mo maximum).";
  if (mime && !MIME_BY_EXTENSION[extension].includes(mime.toLowerCase())) return "Le type du fichier ne correspond pas à son extension.";
  return null;
}

export function addDocumentVersion(data: UserData, record: DocumentRecord, version: DocumentVersion): UserData {
  const existing = data.documents || [];
  const next = { ...record, versions: [...record.versions, version], updatedAt: version.createdAt };
  return { ...data, documents: existing.some(item => item.id === record.id)
    ? existing.map(item => item.id === record.id ? next : item) : [next, ...existing] };
}
export function updateDocument(data: UserData, documentId: string, patch: Partial<Pick<DocumentRecord, "title" | "category" | "caseKeys">>): UserData {
  return { ...data, documents: (data.documents || []).map(item => item.id === documentId ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item) };
}
export function attachDocument(data: UserData, documentId: string, caseKey: string, attach: boolean): UserData {
  return updateDocument(data, documentId, { caseKeys: [...new Set((data.documents || []).find(item => item.id === documentId)?.caseKeys.filter(key => key !== caseKey) || []), ...(attach ? [caseKey] : [])] });
}
const norm = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function offerReference(offer: DetectedOffer): string | null {
  const source = [offer.title, offer.text, offer.url].filter(Boolean).join(" ");
  const found = source.match(/(?:r[eé]f(?:[eé]rence)?|job\s*id|identifiant|offre\s*n[°o]?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,})/i);
  return found?.[1] || null;
}
export function classifyMail(candidate: GmailCandidate): MailKind {
  const text = norm(`${candidate.subject} ${candidate.snippet}`);
  if (/entretien|convocation|rendez vous/.test(text)) return "entretien";
  if (/piece jointe|documents? (?:complementaire|demande)|attestation|transmettre .*document/.test(text)) return "documents";
  if (/candidature (?:bien )?recue|accuse de reception|reception de votre candidature/.test(text)) return "confirmation";
  if (/malheureusement|candidature non retenue|ne donnons pas suite/.test(text)) return "refus";
  if (/suite a votre candidature|reponse a votre candidature/.test(text)) return "réponse";
  return "à vérifier";
}
export function matchGmailCandidate(offer: DetectedOffer, application: Application | undefined, candidate: GmailCandidate): MatchDecision {
  const hay = norm([candidate.subject, candidate.snippet, candidate.text || "", ...(candidate.links || [])].join(" "));
  const title = norm(offer.title);
  const company = norm(offer.company);
  const exactUrl = offer.url && candidate.links?.some(link => link.replace(/\/$/, "") === offer.url?.replace(/\/$/, ""));
  const ref = offerReference(offer);
  if (exactUrl) return { level: "strong", reasons: ["Lien exact de l'offre présent dans le message"] };
  if (ref && hay.includes(norm(ref))) return { level: "strong", reasons: [`Référence de poste ${ref} retrouvée`] };
  const titleHit = title.length >= 12 && hay.includes(title);
  const companyHit = company.length >= 4 && hay.includes(company);
  const candidatureContext = /candidature|postul|entretien|recrut|stage|pfe/.test(hay);
  if (titleHit && companyHit && candidatureContext) return { level: "suggestion", reasons: ["Poste, entreprise et contexte de candidature retrouvés"] };
  if (titleHit && candidatureContext) return { level: "suggestion", reasons: ["Intitulé du poste et contexte de candidature retrouvés"] };
  if (application?.id && hay.includes(norm(application.id))) return { level: "suggestion", reasons: ["Identifiant local de candidature retrouvé ; confirmation nécessaire"] };
  return { level: "insufficient", reasons: [companyHit ? "Le nom de l'entreprise seul ne permet pas un rattachement fiable" : "Aucun indice assez précis"] };
}
export function setMailAssociation(data: UserData, association: GmailAssociation): UserData {
  const rest = (data.gmailAssociations || []).filter(item => !(item.caseKey === association.caseKey && item.gmailId === association.gmailId));
  return { ...data, gmailAssociations: [association, ...rest] };
}
export function detachMail(data: UserData, caseKey: string, gmailId: string): UserData {
  return { ...data, gmailAssociations: (data.gmailAssociations || []).filter(item => !(item.caseKey === caseKey && item.gmailId === gmailId)) };
}
export function sentDocumentSnapshot(data: UserData, caseKey: string, cvText: string) {
  const approved = data.cvAdaptations?.[caseKey]?.find(version => version.status === "approved" && version.approvedText === cvText);
  return { sentCvAdaptationId: approved?.id,
    sentDocumentVersions: (data.documents || []).filter(item => item.caseKeys.includes(caseKey)).flatMap(item => item.versions.length
      ? [{ documentId: item.id, versionId: item.versions[item.versions.length - 1].id }] : []) };
}
export function caseTimeline(data: UserData, caseKey: string, application?: Application) {
  const events: { id: string; at: string; title: string; detail: string }[] = [];
  if (application?.date) events.push({ id: `application:${application.id}`, at: application.date, title: "Candidature envoyée", detail: application.role });
  for (const ref of application?.sentDocumentVersions || []) {
    const document = (data.documents || []).find(item => item.id === ref.documentId);
    const version = document?.versions.find(item => item.id === ref.versionId);
    if (application?.date && version) events.push({ id: `sent:${application.id}:${ref.documentId}:${ref.versionId}`, at: application.date, title: "Document déclaré envoyé", detail: `${document?.title} · v${document!.versions.indexOf(version) + 1}` });
  }
  for (const item of application?.statusHistory || []) if (item.at) events.push({ id: `status:${item.at}:${item.status}`, at: item.at, title: "Statut mis à jour", detail: item.status });
  for (const doc of data.documents || []) if (doc.caseKeys.includes(caseKey)) for (const version of doc.versions) if (version.createdAt) events.push({ id: `document:${doc.id}:${version.id}`, at: version.createdAt, title: "Document enregistré", detail: `${doc.title} · ${version.name}` });
  for (const mail of data.gmailAssociations || []) if (mail.caseKey === caseKey && mail.state === "accepted" && mail.date) events.push({ id: `gmail:${mail.gmailId}`, at: mail.date, title: "E-mail associé", detail: mail.subject });
  return [...new Map(events.map(event => [event.id, event])).values()].sort((a, b) => b.at.localeCompare(a.at));
}
