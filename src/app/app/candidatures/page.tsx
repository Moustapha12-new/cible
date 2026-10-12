"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Download, ExternalLink, FileText, PhoneCall, Search, Sparkles,
  Send, CheckCircle2, MapPin, Clock, CalendarClock, StickyNote,
  History, ShieldCheck, XCircle, MailCheck, ListChecks,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  getOrCreateData, saveData, type UserData, type Application, type AppStatus, STATUS_META,
} from "@/lib/data";

async function loadServer(): Promise<UserData | null> {
  try {
    const response = await fetch("/api/user-data", { cache: "no-store" });
    const json = await response.json();
    return response.ok && json.ok ? (json.record?.data as UserData || null) : null;
  } catch { return null; }
}

const STATUS_ICON: Record<AppStatus, typeof Send> = {
  sent: Send,
  interview: CalendarClock,
  offer: CheckCircle2,
  rejected: XCircle,
};

export default function CandidaturesPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [data, setData] = useState<UserData | null>(null);
  const [serverIds, setServerIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("open"));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | AppStatus>("all");
  const [notesDraft, setNotesDraft] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"info" | "warn" | "err">("info");
  const [interview, setInterview] = useState<{ questions?: { q: string; a: string }[]; risks?: { zone: string; answer: string }[] } | null>(null);
  const [interviewBusy, setInterviewBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const local = getOrCreateData(user.name, user.email);
      const remote = await loadServer();
      const ids = new Set(remote?.applications.map(a => a.id) || []);
      const merged: UserData = remote ? {
        ...remote,
        applications: [...remote.applications, ...local.applications.filter(a => !ids.has(a.id) && !remote.applications.some(r => r.offerId && r.offerId === a.offerId))],
        offers: [...remote.offers, ...local.offers.filter(o => !remote.offers.some(r => r.id === o.id))],
        originalCv: local.originalCv || remote.originalCv,
        cvData: local.cvData || remote.cvData,
      } : local;
      if (active) {
        setData(merged);
        setServerIds(ids);
        const chosen = merged.applications.find(a => a.id === searchParams.get("open")) || merged.applications[0];
        setSelectedId(chosen?.id || null);
        setNotesDraft(chosen?.notes || "");
      }
    })();
    return () => { active = false; };
  }, [user, searchParams]);

  if (!user || !data) {
    return (
      <>
        <div className="skeleton-card" style={{ width: 260, height: 30, marginBottom: 12 }} />
        <div className="stats-row">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton-card" style={{ height: 74 }} />)}</div>
        <div className="skeleton-card" style={{ height: 300 }} />
      </>
    );
  }

  const applications = data.applications
    .filter(a => (filter === "all" || a.status === filter) && `${a.company} ${a.role}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Date.parse(b.date || "") - Date.parse(a.date || ""));
  const selected = data.applications.find(a => a.id === selectedId);
  const selectedOffer = data.offers.find(o => o.id === selected?.offerId);
  const counts = {
    all: data.applications.length,
    sent: data.applications.filter(a => a.status === "sent").length,
    interview: data.applications.filter(a => a.status === "interview").length,
    offer: data.applications.filter(a => a.status === "offer").length,
    rejected: data.applications.filter(a => a.status === "rejected").length,
  };

  const changeStatus = async (app: Application, status: AppStatus) => {
    setMessage(""); setMessageKind("info");
    if (!serverIds.has(app.id)) { setMessage("Cette ancienne candidature existe seulement sur cet appareil. Son statut distant ne peut pas être confirmé."); setMessageKind("warn"); return; }
    try {
      const response = await fetch(`/api/candidatures/${app.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error || "Statut non enregistré.");
      const next = { ...data, applications: data.applications.map(a => a.id === app.id ? json.application : a) };
      setData(next); saveData(user.email, next);
      setMessage("Statut mis à jour.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Statut non enregistré.");
      setMessageKind("err");
    }
  };

  const saveNotes = async (app: Application) => {
    if (!serverIds.has(app.id)) { setMessage("Cette ancienne candidature existe seulement sur cet appareil. Sa note distante ne peut pas être confirmée."); setMessageKind("warn"); return; }
    try {
      const response = await fetch(`/api/candidatures/${app.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: notesDraft }) });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error || "Note non enregistrée.");
      const next = { ...data, applications: data.applications.map(a => a.id === app.id ? json.application : a) };
      setData(next); saveData(user.email, next);
      setMessage("Note enregistrée."); setMessageKind("info");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Note non enregistrée.");
      setMessageKind("err");
    }
  };

  const downloadCV = async (app: Application, versionId?: string) => {
    try {
      const response = await fetch(`/api/candidatures/${app.id}/document${versionId ? `?version=${encodeURIComponent(versionId)}` : ""}`);
      if (!response.ok) throw new Error("CV archivé indisponible.");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url; a.download = app.cvName || "CV-envoye.pdf"; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Téléchargement impossible.");
      setMessageKind("err");
    }
  };

  const prepareInterview = async (app: Application) => {
    const offer = data.offers.find(o => o.id === app.offerId);
    const offerText = offer?.text || offer?.description || "";
    if (!app.cvText || offerText.length < 30) { setMessage("Le texte de l'annonce ou du CV envoyé manque pour cette préparation."); setMessageKind("warn"); return; }
    setInterviewBusy(true); setInterview(null); setMessage(""); setMessageKind("info");
    try {
      const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "entretien", cvOriginal: app.cvText, offerText }) });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error || "Préparation indisponible.");
      setInterview(json.result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Préparation indisponible.");
      setMessageKind("err");
    } finally { setInterviewBusy(false); }
  };

  const choose = (app: Application) => { setSelectedId(app.id); setNotesDraft(app.notes || ""); setInterview(null); };

  return (
    <div>
      <header className="page-head">
        <div>
          <p className="kicker"><Sparkles size={13} /> Suivi personnel</p>
          <h1>Mes candidatures</h1>
          <p className="page-sub">Retrouve le CV exact envoyé, l&apos;annonce d&apos;origine, ton journal de suivi et ta préparation dentretien.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn-line" onClick={() => { searchRef.current?.focus(); setMessage("Recherche l'entreprise pour retrouver immédiatement son dossier."); setMessageKind("info"); }}>
            <PhoneCall size={15} /> Un recruteur mappelle
          </button>
        </div>
      </header>

      {message && <p role="status" className={`notice ${messageKind === "warn" ? "warn" : messageKind === "err" ? "err" : ""}`}>{message}</p>}

      {/* Indicateurs réels */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-icon blue"><Send size={18} /></span>
          <div className="stat-body"><b>{counts.all}</b><span>Candidatures envoyées</span></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon violet"><CalendarClock size={18} /></span>
          <div className="stat-body"><b>{counts.interview}</b><span>Entretiens</span></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon green"><CheckCircle2 size={18} /></span>
          <div className="stat-body"><b>{counts.offer}</b><span>Offres acceptées</span></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon red"><XCircle size={18} /></span>
          <div className="stat-body"><b>{counts.rejected}</b><span>Refus</span></div>
        </div>
      </div>

      <div className="app-layout">
        {/* Liste */}
        <section>
          <div className="list-toolbar">
            <label className="topbar-search" style={{ maxWidth: 380 }}>
              <Search size={16} aria-hidden="true" />
              <input ref={searchRef} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Entreprise ou intitulé du stage…" aria-label="Rechercher une candidature" />
            </label>
            <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--text-muted)" }}>Trier : plus récentes</span>
          </div>

          <div className="filter-tabs" role="group" aria-label="Filtrer les candidatures">
            {([
              ["all", "Toutes", counts.all],
              ["sent", "Postulées", counts.sent],
              ["interview", "Entretiens", counts.interview],
              ["offer", "Acceptées", counts.offer],
              ["rejected", "Refusées", counts.rejected],
            ] as const).map(([id, label, n]) => (
              <button key={id} className={`filter-tab ${filter === id ? "active" : ""}`} onClick={() => setFilter(id)}>
                {label}<span className="count">({n})</span>
              </button>
            ))}
          </div>

          <div className="app-list">
            {applications.map(app => (
              <button key={app.id} className={`app-row ${selected?.id === app.id ? "active" : ""}`} onClick={() => choose(app)}>
                <span className="company-avatar">{app.company.slice(0, 2).toUpperCase()}</span>
                <span className="app-row-title">
                  <strong>{app.company}</strong>
                  <span>{app.role}</span>
                  <small>{app.date ? new Date(app.date).toLocaleDateString("fr-FR") : "Date non renseignée"} · {app.source}</small>
                </span>
                <span className="app-row-date">{selectedOffer?.location || ""}</span>
                <span className={`status-pill ${app.status}`}>
                  {(() => { const Icon = STATUS_ICON[app.status]; return <Icon size={12} />; })()}
                  {STATUS_META[app.status].label}
                </span>
              </button>
            ))}
            {!applications.length && (
              <div className="empty-box">
                <Send size={26} />
                <strong>Aucune candidature dans cette liste</strong>
                <p>Prépare un CV depuis « Mes offres », puis confirme l&apos;envoi pour la retrouver ici.</p>
                <Link href="/app/offres" className="btn-primary btn-sm" style={{ marginTop: 14 }}>Découvrir mes offres</Link>
              </div>
            )}
          </div>
        </section>

        {/* Panneau détail */}
        <aside className="detail-col">
          {selected ? (
            <>
              <div className="card detail-card">
                <div className="detail-title">
                  <span className="company-avatar">{selected.company.slice(0, 2).toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}>
                    <strong>{selected.company}</strong>
                    <h2>{selected.role}</h2>
                  </div>
                </div>
                <div className="detail-meta">
                  <span><MapPin size={13} /> {selectedOffer?.location || "Lieu à vérifier"}</span>
                  <span><Clock size={13} /> {selected.date ? new Date(selected.date).toLocaleDateString("fr-FR") : "Date non renseignée"}</span>
                  <span><MailCheck size={13} /> {selected.source}</span>
                </div>
                <label className="label">Statut</label>
                <select className="input" value={selected.status} onChange={e => void changeStatus(selected, e.target.value as AppStatus)} disabled={!serverIds.has(selected.id)}>
                  {(Object.keys(STATUS_META) as AppStatus[]).map(status => <option key={status} value={status}>{STATUS_META[status].label}</option>)}
                </select>
                {selectedOffer?.summary && (
                  <div style={{ marginTop: 14 }}>
                    <h3><FileText size={15} /> Résumé de l&apos;offre originale</h3>
                    <p>{selectedOffer.summary}</p>
                  </div>
                )}
                {(selected.offerUrl || selectedOffer?.url) && (
                  <div className="detail-actions">
                    <a className="btn-line btn-sm" href={selected.offerUrl || selectedOffer?.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={14} /> Voir l&apos;offre originale
                    </a>
                  </div>
                )}
              </div>

              <div className="card detail-card">
                <h3><ShieldCheck size={15} /> Le CV exact envoyé</h3>
                <p style={{ marginBottom: 10 }}>{selected.cvName || "Nom du CV non enregistré"}</p>
                {serverIds.has(selected.id) && !!selected.sentDocumentVersions?.length ? (
                  <>
                    <div className="pdf-row">
                      <span className="pdf-icon"><FileText size={17} /></span>
                      <div className="pdf-info">
                        <strong>{selected.cvName || "CV-envoye.pdf"}</strong>
                        <small>Version envoyée · archivage vérifié (SHA-256)</small>
                      </div>
                    </div>
                    <div className="detail-actions">
                      <button className="btn-primary btn-sm" onClick={() => downloadCV(selected)}><Download size={14} /> Télécharger le PDF exact</button>
                    </div>
                  </>
                ) : (
                  <p className="text-muted text-sm">PDF archivé indisponible pour cette ancienne candidature.</p>
                )}
                {selected.sentDocumentVersions && selected.sentDocumentVersions.length > 1 && (
                  <div style={{ marginTop: 10 }}>
                    <h3><History size={14} /> Versions précédentes</h3>
                    <div className="detail-actions">
                      {selected.sentDocumentVersions.slice(0, -1).map((v, i) => (
                        <button key={v.versionId} className="btn-line btn-sm" onClick={() => downloadCV(selected, v.versionId)}>Version {i + 1}</button>
                      ))}
                    </div>
                  </div>
                )}
                {selected.cvText && (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer" }}>Voir le texte envoyé</summary>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 11.5, color: "var(--text-secondary)", maxHeight: 180, overflow: "auto", background: "var(--bg-primary)", padding: 10, borderRadius: 8, marginTop: 8 }}>{selected.cvText}</pre>
                  </details>
                )}
              </div>

              {selected.status === "interview" && (
                <div className="card detail-card">
                  <h3><CalendarClock size={15} /> Préparer mon entretien</h3>
                  <p>Questions et points techniques fondés sur lannonce sauvegardée et le CV réellement envoyé.</p>
                  <div className="detail-actions">
                    <button className="btn-primary btn-sm" disabled={interviewBusy} onClick={() => prepareInterview(selected)}>
                      {interviewBusy ? "Préparation en cours…" : "Préparer mon entretien"}
                    </button>
                  </div>
                  {interview?.questions?.map((q, i) => (
                    <details key={i} style={{ marginTop: 8 }}>
                      <summary style={{ fontSize: 12.5, color: "var(--text-primary)", cursor: "pointer" }}>{q.q}</summary>
                      <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 6 }}>{q.a}</p>
                    </details>
                  ))}
                </div>
              )}

              <div className="card detail-card">
                <h3><StickyNote size={15} /> Notes personnelles</h3>
                <textarea
                  className="input"
                  style={{ minHeight: 110, padding: "10px 14px", resize: "vertical" }}
                  value={notesDraft}
                  onChange={e => setNotesDraft(e.target.value)}
                  placeholder="Contact, échange, prochaine action…"
                  maxLength={5000}
                />
                <div className="detail-actions">
                  <button className="btn-line btn-sm" onClick={() => saveNotes(selected)} disabled={!serverIds.has(selected.id) || notesDraft === (selected.notes || "")}>
                    Enregistrer la note
                  </button>
                </div>
              </div>

              {!!selected.statusHistory?.length && (
                <div className="card detail-card">
                  <h3><ListChecks size={15} /> Journal de suivi</h3>
                  <ol className="timeline">
                    {selected.statusHistory.map((h, i) => (
                      <li key={i}>
                        <strong>{STATUS_META[h.status].label}</strong>
                        <span>{new Date(h.at).toLocaleDateString("fr-FR")}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          ) : (
            <div className="card detail-card empty-box" style={{ border: "1px dashed var(--border-medium)" }}>
              <Search size={24} />
              <strong>Sélectionne une candidature</strong>
              <p>Son dossier complet s&apos;affichera ici : offre, CV exact envoyé, notes et suivi.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
