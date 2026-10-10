"use client";
/* eslint-disable react/no-unescaped-entities */

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
import { getOrCreateData, saveData, type Application, type DetectedOffer, type UserData } from "@/lib/data";
import { addDocumentVersion, attachDocument, caseTimeline, classifyMail, detachMail, documentMime, matchGmailCandidate, setMailAssociation, updateDocument, validateDocumentFile, type DocumentCategory, type DocumentRecord, type GmailAssociation, type GmailCandidate } from "@/lib/pfe-documents";

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: "cv", label: "CV" }, { value: "lettre", label: "Lettre" }, { value: "portfolio", label: "Portfolio" },
  { value: "certificat", label: "Certificat / attestation" }, { value: "demande", label: "Demandé par l'entreprise" },
  { value: "reçu", label: "Reçu du recruteur" }, { value: "autre", label: "Autre pièce" },
];
const formatDate = (value: string) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString("fr-FR") : "Date non renseignée";
const fileUrl = (doc: DocumentRecord, versionId: string, name: string, preview = false) => `/api/documents/file?documentId=${encodeURIComponent(doc.id)}&versionId=${encodeURIComponent(versionId)}&name=${encodeURIComponent(name)}${preview ? "&preview=1" : ""}`;

export default function DocumentsExchanges({ data, onChange, user, caseKey, offer, application }: {
  data: UserData; onChange: (next: UserData) => void; user: { name: string; email: string }; caseKey: string; offer?: DetectedOffer; application?: Application;
}) {
  const [category, setCategory] = useState<DocumentCategory>("autre");
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState(offer?.company || application?.company || "");
  const [messages, setMessages] = useState<GmailCandidate[]>([]);
  const [searched, setSearched] = useState(false);
  const documents = (data.documents || []).filter(doc => doc.caseKeys.includes(caseKey));
  const links = (data.gmailAssociations || []).filter(item => item.caseKey === caseKey);
  const accepted = links.filter(item => item.state === "accepted");
  const trackedOffer: DetectedOffer = offer || { id: caseKey, title: application?.role || "", company: application?.company || "", location: "", salary: "", match: 0, keywords: [], text: "" };
  const timeline = caseTimeline(data, caseKey, application);
  function persist(transform: (latest: UserData) => UserData, confirmation = "Enregistré sur cet appareil.") {
    const latest = getOrCreateData(user.name, user.email);
    const next = transform(latest);
    saveData(user.email, next); onChange(next); setNotice(confirmation); setError("");
  }
  async function upload(file: File | undefined, record?: DocumentRecord) {
    if (!file || working) return;
    const validation = validateDocumentFile(file.name, file.type, file.size);
    if (validation) { setError(validation); return; }
    const documentId = record?.id || crypto.randomUUID();
    const versionId = crypto.randomUUID();
    setWorking(documentId); setError(""); setNotice("");
    try {
      const params = new URLSearchParams({ documentId, versionId, name: file.name });
      const mime = documentMime(file.name, file.type);
      const response = await fetch(`/api/documents/file?${params}`, { method: "POST", headers: { "Content-Type": mime }, body: file });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || "Import interrompu : aucun fichier enregistré.");
      const at = new Date().toISOString();
      const base: DocumentRecord = record || { id: documentId, title: file.name, category, caseKeys: [caseKey], versions: [], createdAt: at, updatedAt: at };
      persist(latest => addDocumentVersion(latest, latest.documents?.find(item => item.id === documentId) || base,
        { id: versionId, name: file.name, mime, size: file.size, createdAt: at }), "Fichier enregistré dans le stockage privé ; référence conservée sur cet appareil.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import impossible. Les anciens fichiers sont conservés."); }
    finally { setWorking(""); }
  }
  function onFile(event: ChangeEvent<HTMLInputElement>, record?: DocumentRecord) {
    const file = event.target.files?.[0]; event.target.value = "";
    void upload(file, record);
  }
  async function searchGmail() {
    if (search.trim().length < 3 || working) return;
    setWorking("gmail"); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/gmail/case-search?q=${encodeURIComponent(search.trim())}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || "Recherche Gmail indisponible.");
      setMessages(body.messages || []); setSearched(true);
      if (body.partial || body.limited) setNotice("Résultats partiels : affine la recherche si un message manque.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Gmail indisponible. Les associations existantes sont conservées."); }
    finally { setWorking(""); }
  }
  function decide(candidate: GmailCandidate, state: "accepted" | "rejected") {
    const link: GmailAssociation = { caseKey, gmailId: candidate.id, messageId: candidate.messageId, threadId: candidate.threadId, state,
      from: candidate.from, subject: candidate.subject, date: candidate.date, snippet: candidate.snippet, kind: classifyMail(candidate),
      attachments: candidate.attachments, gmailUrl: candidate.gmailUrl, decidedAt: new Date().toISOString() };
    persist(latest => setMailAssociation(latest, link), state === "accepted" ? "E-mail associé au dossier, sans modification dans Gmail." : "Suggestion refusée pour ce dossier.");
  }
  const linkedIds = new Set(links.map(item => item.gmailId));
  const otherCases = [
    ...data.offers.filter(item => item.id !== caseKey).map(item => ({ key: item.id, label: `${item.company} · ${item.title}` })),
    ...data.applications.filter(item => !item.offerId && item.id !== caseKey).map(item => ({ key: item.id, label: `${item.company} · ${item.role}` })),
  ];
  return <section className="glass-card p-5 sm:p-7 mt-7 space-y-7" id="documents-echanges" aria-label="Documents et échanges">
    <div><p className="eyebrow">Dossier vivant</p><h2 className="font-display text-2xl mt-2">Documents et échanges</h2><p className="text-sm text-text-dim mt-2">Fichiers privés dans Supabase ; classement et associations sauvegardés sur cet appareil. Les e-mails restent en lecture seule.</p></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{notice && <p role="status" className="text-sm text-mint">{notice}</p>}
    <div className="grid md:grid-cols-3 gap-3 text-sm">
      <div className="rounded-lg border border-line p-4"><b>CV maître</b><p className="text-text-dim mt-1">{data.originalCv?.name || (data.cvData ? "CV du Builder" : "À ajouter")}</p><Link className="text-mint underline" href="/app/cv">Voir mon CV</Link></div>
      <div className="rounded-lg border border-line p-4"><b>CV adapté approuvé</b><p className="text-text-dim mt-1">{offer && data.cvAdaptations?.[offer.id]?.find(item => item.status === "approved") ? "Version disponible pour cette offre" : "Aucune version approuvée"}</p>{offer && <Link className="text-mint underline" href={`/app/adaptation?offer=${encodeURIComponent(offer.id)}`}>Ouvrir l'atelier</Link>}</div>
      <div className="rounded-lg border border-line p-4"><b>CV réellement envoyé</b><p className="text-text-dim mt-1">{application?.cvText ? `Copie figée le ${formatDate(application.date || "")}` : "Aucun envoi confirmé"}</p>{application?.sentCvAdaptationId && <p className="text-xs text-muted">Version adaptée liée à cet envoi</p>}{application?.cvText && <details><summary className="cursor-pointer text-mint">Lire la copie envoyée</summary><pre className="whitespace-pre-wrap text-xs max-h-52 overflow-auto mt-2">{application.cvText}</pre></details>}</div>
    </div>
    <div className="border-t border-line pt-6"><div className="flex flex-wrap justify-between items-center gap-3"><h3 className="font-display text-xl">Bibliothèque du dossier</h3><span className="text-xs text-text-dim">PDF, DOCX, ODT, TXT, PNG, JPG, WEBP · 8 Mo maximum</span></div><div className="flex flex-wrap items-center gap-3 mt-4"><select aria-label="Catégorie du nouveau document" className="input" value={category} onChange={event => setCategory(event.target.value as DocumentCategory)}>{CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><label className="btn-primary cursor-pointer">{working && working !== "gmail" ? "Import en cours…" : "Importer un document"}<input className="sr-only" type="file" accept=".pdf,.docx,.odt,.txt,.png,.jpg,.jpeg,.webp" disabled={!!working} onChange={event => onFile(event)} /></label></div>
      {!documents.length && <p className="text-sm text-text-dim mt-5">Aucun fichier importé pour cette candidature. Le CV et la lettre rédigés dans Cible restent accessibles ci-dessus et dans ton dossier.</p>}
      <div className="space-y-3 mt-5">{documents.map(doc => { const latest = doc.versions.at(-1); return <article key={doc.id} className="rounded-xl border border-line p-4 space-y-3"><div className="flex flex-wrap justify-between gap-3"><div><input aria-label={`Nom de ${doc.title}`} className="input font-semibold" defaultValue={doc.title} key={`${doc.id}:${doc.title}`} onBlur={event => { const title = event.target.value.trim(); if (title && title !== doc.title) persist(latestData => updateDocument(latestData, doc.id, { title })); }} /><p className="text-xs text-muted mt-2">{doc.versions.length} version(s) · dernière le {latest ? formatDate(latest.createdAt) : "—"}</p></div><select aria-label={`Catégorie de ${doc.title}`} className="input" value={doc.category} onChange={event => persist(latestData => updateDocument(latestData, doc.id, { category: event.target.value as DocumentCategory }))}>{CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        {latest && <div className="flex flex-wrap gap-2 text-sm"><span className="text-text-dim">{latest.name} · {(latest.size / 1024).toFixed(0)} Ko</span>{/^(application\/pdf|text\/plain|image\/)/.test(latest.mime) && <a className="btn-line" href={fileUrl(doc, latest.id, latest.name, true)} target="_blank" rel="noopener noreferrer">Aperçu ↗</a>}<a className="btn-line" href={fileUrl(doc, latest.id, latest.name)}>Télécharger</a><label className="btn-line cursor-pointer">Nouvelle version<input className="sr-only" type="file" accept=".pdf,.docx,.odt,.txt,.png,.jpg,.jpeg,.webp" disabled={!!working} onChange={event => onFile(event, doc)} /></label></div>}
        <details><summary className="cursor-pointer text-sm text-mint">Historique des versions</summary><ul className="space-y-2 mt-3">{doc.versions.map((version, index) => <li key={version.id} className="text-sm flex flex-wrap gap-3 items-center"><span>v{index + 1} · {version.name} · {formatDate(version.createdAt)}{application?.sentDocumentVersions?.some(ref => ref.documentId === doc.id && ref.versionId === version.id) ? " · version déclarée envoyée" : ""}</span><a className="underline text-mint" href={fileUrl(doc, version.id, version.name)}>Télécharger</a></li>)}</ul></details>
        <div className="flex flex-wrap gap-3 items-center text-sm"><label>Associer aussi à <select aria-label={`Associer ${doc.title} à un autre dossier`} className="input ml-2" defaultValue="" onChange={event => { if (event.target.value) persist(latestData => attachDocument(latestData, doc.id, event.target.value, true)); event.target.value = ""; }}><option value="">Choisir…</option>{otherCases.filter(item => !doc.caseKeys.includes(item.key)).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><button type="button" className="text-muted underline" onClick={() => persist(latestData => attachDocument(latestData, doc.id, caseKey, false), "Association retirée de ce dossier ; le fichier et ses autres associations sont conservés.")}>Retirer de ce dossier</button></div>
      </article>; })}</div></div>
    <div className="border-t border-line pt-6 space-y-4"><h3 className="font-display text-xl">Échanges Gmail</h3><p className="text-sm text-text-dim">Recherche ponctuelle dans ta boîte connectée. Le seul nom de l'entreprise ne rattache jamais automatiquement un message.</p><div className="flex flex-wrap gap-2"><input aria-label="Rechercher des e-mails" className="input flex-1 min-w-52" value={search} onChange={event => setSearch(event.target.value)} placeholder="Entreprise, poste ou référence" /><button type="button" className="btn-line" onClick={searchGmail} disabled={working === "gmail" || search.trim().length < 3}>{working === "gmail" ? "Recherche…" : "Rechercher dans Gmail"}</button></div>
      {!accepted.length && <p className="text-sm text-text-dim">Aucun échange associé. Recherche des messages, puis confirme ceux qui concernent cette candidature.</p>}
      {accepted.map(mail => <article key={mail.gmailId} className="rounded-lg border border-mint/30 p-4 space-y-2"><div className="flex flex-wrap justify-between gap-2"><b className="text-sm">{mail.subject || "Sans objet"}</b><span className="text-xs text-muted">{formatDate(mail.date)} · {mail.kind}</span></div><p className="text-xs text-text-dim">{mail.from}</p><p className="text-sm text-text-dim">{mail.snippet}</p>{mail.attachments.length > 0 && <p className="text-xs">Pièces jointes : {mail.attachments.map(item => item.filename).join(", ")}</p>}<div className="flex flex-wrap gap-3 text-sm"><a className="text-mint underline" href={mail.gmailUrl} target="_blank" rel="noopener noreferrer">Lire dans Gmail ↗</a><button type="button" className="text-muted underline" onClick={() => persist(latest => detachMail(latest, caseKey, mail.gmailId), "Association retirée ; l'e-mail Gmail n'a pas été modifié.")}>Détacher</button></div><label className="text-xs">Nature de l'échange<select className="input block mt-1" value={mail.kind} onChange={event => persist(latest => setMailAssociation(latest, { ...mail, kind: event.target.value as GmailAssociation["kind"] }))}>{["à vérifier", "confirmation", "recruteur", "documents", "entretien", "refus", "réponse"].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-xs">Note personnelle<textarea className="input block w-full mt-1" defaultValue={mail.note || ""} key={`${mail.gmailId}:${mail.note || ""}`} onBlur={event => { if (event.target.value !== (mail.note || "")) persist(latest => setMailAssociation(latest, { ...mail, note: event.target.value })); }} /></label></article>)}
      {searched && !messages.length && <p className="text-sm text-text-dim">Aucun message trouvé. Essaie une référence de poste ou un autre terme ; rien n'a été associé automatiquement.</p>}
      {messages.filter(item => !linkedIds.has(item.id)).map(item => { const match = matchGmailCandidate(trackedOffer, application, item); return <article key={item.id} className="rounded-lg border border-line p-4 space-y-2"><div className="flex flex-wrap justify-between gap-2"><b className="text-sm">{item.subject || "Sans objet"}</b><span className="text-xs text-muted">{formatDate(item.date)} · {classifyMail(item)}</span></div><p className="text-xs text-text-dim">{item.from}</p><p className="text-sm text-text-dim">{item.snippet}</p><p className="text-xs text-muted">{match.level === "strong" ? "Indice précis" : match.level === "suggestion" ? "Suggestion à confirmer" : "Rattachement incertain"} · {match.reasons.join(" ; ")}</p>{item.attachments.length > 0 && <p className="text-xs">Pièces jointes : {item.attachments.map(file => file.filename).join(", ")}</p>}<details><summary className="cursor-pointer text-sm text-mint">Lire l'extrait disponible</summary><p className="whitespace-pre-wrap text-xs max-h-64 overflow-auto mt-2">{item.text || item.snippet}</p></details><div className="flex flex-wrap gap-3 text-sm"><button type="button" className="btn-line" onClick={() => decide(item, "accepted")}>{match.level === "insufficient" ? "Associer manuellement" : "Confirmer l'association"}</button><button type="button" className="text-muted underline" onClick={() => decide(item, "rejected")}>Écarter</button><a className="text-mint underline" href={item.gmailUrl} target="_blank" rel="noopener noreferrer">Gmail ↗</a></div></article>; })}
    </div>
    <div className="border-t border-line pt-6"><h3 className="font-display text-xl mb-3">Chronologie du dossier</h3>{!timeline.length && <p className="text-sm text-text-dim">La chronologie apparaîtra quand une candidature, un fichier ou un échange aura une date réelle.</p>}<ol className="space-y-3">{timeline.map(event => <li key={event.id} className="border-l-2 border-mint/40 pl-4"><time className="text-xs text-muted">{formatDate(event.at)}</time><p className="font-medium text-sm">{event.title}</p><p className="text-xs text-text-dim">{event.detail}</p></li>)}</ol></div>
  </section>;
}
