"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText, UserRound, WandSparkles, Download, ExternalLink, CheckCircle2,
  Sparkles, ArrowLeftRight, History, BrainCircuit, PenLine, Eye, Copy,
  RefreshCw, ClipboardList, Layers, MapPin, Clock,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, saveData, type UserData } from "@/lib/data";
import type { CvData } from "@/lib/cv";
import { parseCvText, numbersSafe, DEFAULT_CV_DESIGN, type CvDesign } from "@/lib/cv";
import { offerLocation } from "@/lib/offer-location";
import CvPreview from "@/components/cv/CvPreview";

type Suggestion = {
  id: string;
  type: "headline" | "summary" | "skills" | "replace";
  label: string;
  original: string;
  proposed: string;
  reason: string;
  needsConfirmation?: boolean;
  confirmationMessage?: string;
};

function companyColor(company: string) {
  const colors = ["#E31837", "#155EEF", "#00A9CE", "#3DCD58", "#FFD100", "#6D28D9", "#0F766E", "#B45309"];
  let hash = 0;
  for (let i = 0; i < company.length; i++) hash = (hash * 31 + company.charCodeAt(i)) >>> 0;
  return colors[hash % colors.length];
}

export default function CvPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const offerId = searchParams.get("offer");

  const [data, setData] = useState<UserData | null>(null);
  const [cv, setCv] = useState<CvData | null>(null);
  const [referenceCv, setReferenceCv] = useState<CvData | null>(null);
  const [bulkChanges, setBulkChanges] = useState<string[]>([]);
  const [bulkReady, setBulkReady] = useState(false);
  const [design, setDesign] = useState<CvDesign>(DEFAULT_CV_DESIGN);
  const [toast, setToast] = useState<string | null>(null);
  const [compareView, setCompareView] = useState<"side" | "stacked">("side");

  const [cvDraft, setCvDraft] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [applying] = useState<string | null>(null);
  const [applyingFlow, setApplyingFlow] = useState<"idle" | "confirming" | "submitting">("idle");
  const [applicationCreated, setApplicationCreated] = useState(false);
  const [preparedPdf, setPreparedPdf] = useState<{ documentId: string; versionId: string; sha256: string; fileName: string } | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [adapted, setAdapted] = useState(false);

  useEffect(() => {
    if (!user) return;
    const id = window.setTimeout(() => {
      const d = getOrCreateData(user.name, user.email);
      setData(d);
      setDesign(d.cvDesign ?? DEFAULT_CV_DESIGN);
      setApplicationCreated(Boolean(offerId && d.applications.some(a => a.offerId === offerId && a.status === "sent")));
      const cvData = d.cvData ?? (d.originalCv?.text ? parseCvText(d.originalCv.text) : null);
      setCv(cvData);
      setReferenceCv(cvData);
      if (cvData) setCvDraft(d.originalCv?.text ?? "");
      if (offerId) {
        try {
          const raw = window.localStorage.getItem(`cible:prepared:v1:${user.email}:${offerId}`);
          if (raw) { setPreparedPdf(JSON.parse(raw)); setDownloaded(true); }
        } catch { /* Le PDF reste téléchargeable à nouveau. */ }
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [user, offerId]);

  useEffect(() => {
    if (!user || !offerId) return;
    let active = true;
    fetch("/api/cv/bulk", { cache: "no-store" }).then(r => r.json()).then(json => {
      if (!active || !json.ok) return;
      const item = (json.queue as NonNullable<UserData["bulkCvQueue"]>).find(q => q.offerId === offerId && q.status === "ready");
      if (!item?.cv || !item.documentId || !item.versionId || !item.sha256) return;
      setCv(item.cv);
      setBulkChanges(item.changes || []);
      setBulkReady(true);
      setAdapted(true);
      setPreparedPdf({ documentId: item.documentId, versionId: item.versionId, sha256: item.sha256, fileName: item.fileName || "CV-cible.pdf" });
      try { setDownloaded(localStorage.getItem(`cible:downloaded:v1:${user.email}:${offerId}`) === item.sha256); } catch { /* download required */ }
    }).catch(() => {});
    return () => { active = false; };
  }, [user, offerId]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetch("/api/cv/reference", { cache: "no-store" }).then(r => r.json()).then(json => {
      if (!active || !json.ok) return;
      const local = getOrCreateData(user.name, user.email);
      if (local.originalCv?.text && local.cvData) return;
      const next = { ...local, originalCv: local.originalCv || json.originalCv || undefined, cvData: local.cvData || json.cvData || undefined };
      if (next.originalCv !== local.originalCv || next.cvData !== local.cvData) {
        saveData(user.email, next);
        setData(next);
        if (next.originalCv?.text) setCvDraft(next.originalCv.text);
        if (next.cvData) setCv(next.cvData);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!data) {
    return (
      <>
        <div className="skeleton-card" style={{ width: 200, height: 30, marginBottom: 12 }} />
        <div className="cv-top-grid">{[0, 1, 2].map(i => <div key={i} className="skeleton-card" style={{ height: 150 }} />)}</div>
        <div className="skeleton-card" style={{ height: 420 }} />
      </>
    );
  }

  const offerData = data.offers.find(o => o.id === offerId);
  if (offerId && !offerData) {
    return (
      <div className="empty-box">
        <FileText size={30} />
        <strong>Offre introuvable</strong>
        <p>Cette offre nexiste plus dans tes données. Retourne à Mes offres pour en choisir une autre.</p>
        <Link href="/app/offres" className="btn-primary mt-3">← Retour à Mes offres</Link>
      </div>
    );
  }

  const persistCv = (next: CvData) => {
    setCv(next);
    setPreparedPdf(null);
    if (user && offerId) window.localStorage.removeItem(`cible:prepared:v1:${user.email}:${offerId}`);
    const nd: UserData = { ...data, cvData: next };
    setData(nd);
    saveData(user!.email, nd);
    void fetch("/api/cv/reference", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cvData: next }) })
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error); })
      .catch(() => setToast("CV conservé sur cet appareil ; sauvegarde serveur à réessayer."));
  };

  const saveOriginal = async (clear = false) => {
    if (!user || !data) return;
    const text = clear ? "" : cvDraft.trim();
    const structured = text ? parseCvText(text) : undefined;
    const next: UserData = { ...data, originalCv: text ? { name: "CV original", text } : undefined, cvData: structured };
    setData(next);
    setCv(structured || null);
    setReferenceCv(structured || null);
    if (clear) setCvDraft("");
    saveData(user.email, next);
    try {
      const response = await fetch("/api/cv/reference", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ originalCv: next.originalCv || null, cvData: structured || null }) });
      if (!response.ok) throw new Error("Sauvegarde serveur indisponible.");
      setToast(text ? `CV original enregistré (${text.length} caractères)` : "CV original effacé");
    } catch { setToast("CV conservé sur cet appareil ; sauvegarde serveur à réessayer."); }
  };

  const runAdaptation = async () => {
    if (!offerData || !data.originalCv?.text || aiBusy) return;
    setAiBusy(true); setToast(null); setSuggestions(null);
    try {
      const enqueue = await fetch("/api/cv/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "enqueue", offerIds: [offerData.id], offers: [offerData] }) });
      const queued = await enqueue.json();
      if (!queued.ok) throw new Error(queued.error || "Préparation indisponible.");
      const prepare = await fetch("/api/cv/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare", offerId: offerData.id }) });
      const prepared = await prepare.json();
      if (!prepared.ok || !prepared.item?.cv) throw new Error(prepared.error || "Adaptation indisponible.");
      const item = prepared.item as NonNullable<UserData["bulkCvQueue"]>[number];
      setCv(item.cv!);
      setBulkChanges(item.changes || []);
      setBulkReady(true);
      setAdapted(true);
      setPreparedPdf({ documentId: item.documentId!, versionId: item.versionId!, sha256: item.sha256!, fileName: item.fileName || "CV-cible.pdf" });
      setToast("CV adapté et PDF archivé. Vérifie le résultat, puis télécharge-le.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Adaptation indisponible.");
    } finally { setAiBusy(false); }
  };

  const applySuggestions = () => {
    if (!suggestions || !cv) return;
    const next: CvData = JSON.parse(JSON.stringify(cv));
    for (const s of suggestions) {
      if (!checked.has(s.id)) continue;
      if (s.type === "headline") {
        next.basics.headline = s.proposed;
      } else if (s.type === "summary") {
        next.summary = s.proposed;
      } else if (s.type === "replace") {
        if (!numbersSafe(s.original, s.proposed, data.originalCv?.text || "")) continue;
        let done = false;
        const replaceOnce = (value: string) => {
          if (done || !value.includes(s.original)) return value;
          done = true;
          return value.replace(s.original, s.proposed);
        };
        next.basics.headline = replaceOnce(next.basics.headline);
        next.summary = replaceOnce(next.summary);
        for (const section of next.sections) {
          section.text = replaceOnce(section.text);
          for (const item of section.items) {
            item.title = replaceOnce(item.title);
            item.detail = replaceOnce(item.detail);
            if (item.meta) item.meta = replaceOnce(item.meta);
          }
        }
      } else if (s.type === "skills") {
        const skillsSection = next.sections.find((sec: { key: string }) => sec.key === "skills");
        if (skillsSection) {
          if (s.id === "skills-add") {
            const terms = s.proposed.split(",").map(t => t.trim()).filter(Boolean);
            const existing = skillsSection.text.toLowerCase();
            const toAdd = terms.filter(t => !existing.includes(t.toLowerCase()));
            if (toAdd.length) {
              skillsSection.text = `${skillsSection.text.replace(/\s*$/, "")}${skillsSection.text.trim() ? ", " : ""}${toAdd.join(", ")}`;
            }
          } else if (s.id === "skills-reorder") {
            skillsSection.text = s.proposed;
          }
        }
      }
    }
    persistCv(next);
    setSuggestions(null);
    setAdapted(true);
    setToast("Suggestions appliquées — aperçu et PDF mis à jour");
  };

  const downloadPdf = async () => {
    if (!cv) return;
    try {
      const res = bulkReady && offerData
        ? await fetch(`/api/cv/bulk/document?offerId=${encodeURIComponent(offerData.id)}`)
        : await fetch("/api/cv/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cv, design, offerId: offerData?.id }) });
      if (!res.ok) throw new Error((await res.json()).error || "PDF indisponible.");
      const documentId = bulkReady ? preparedPdf?.documentId : res.headers.get("X-Document-Id");
      const versionId = bulkReady ? preparedPdf?.versionId : res.headers.get("X-Version-Id");
      const sha256 = bulkReady ? preparedPdf?.sha256 : res.headers.get("X-Content-SHA256");
      if (!documentId || !versionId || !sha256) throw new Error("Archivage du PDF non confirmé.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "CV-cible.pdf"; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setPreparedPdf({ documentId, versionId, sha256, fileName: "CV-cible.pdf" });
      setDownloaded(true);
      if (user && offerData) window.localStorage.setItem(`cible:prepared:v1:${user.email}:${offerData.id}`, JSON.stringify({ documentId, versionId, sha256, fileName: "CV-cible.pdf" }));
      if (user && offerData) window.localStorage.setItem(`cible:downloaded:v1:${user.email}:${offerData.id}`, sha256);
      setToast("PDF téléchargé et archivé. Tu peux maintenant postuler.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "PDF indisponible.");
    }
  };

  const handleApply = async () => {
    if (!offerData || !cv || applicationCreated) return;
    if (!preparedPdf || !downloaded) { setToast("Télécharge d'abord le PDF qui sera envoyé."); return; }
    setApplyingFlow("confirming");
    const confirmed = window.confirm(
      `Confirmer que tu as postulé à "${offerData.title}" chez ${offerData.company} ?\n\n` +
      `Cela va :\n` +
      `• Enregistrer la candidature avec le statut "Postulé"\n` +
      `• Sauvegarder une copie immuable du PDF exact utilisé\n` +
      `• Lier le CV à cette offre dans ton suivi`
    );
    if (!confirmed) { setApplyingFlow("idle"); return; }
    setApplyingFlow("submitting");
    try {
      const res = await fetch("/api/candidatures/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer: offerData, ...preparedPdf }) });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const nextData = { ...data, applications: [...data.applications.filter(a => a.offerId !== offerData.id), json.application] };
      setData(nextData);
      saveData(user!.email, nextData);
      window.localStorage.removeItem(`cible:prepared:v1:${user!.email}:${offerData.id}`);
      setApplicationCreated(true);
      setToast("Candidature enregistrée — retrouvée dans « Mes candidatures »");
      setApplyingFlow("idle");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
      setApplyingFlow("idle");
    }
  };

  /* ═══ Mode 1 : offre sélectionnée — flux d'adaptation ═══ */
  if (offerData) {
    const place = offerLocation(offerData.location);
    return (
      <div>
        <header className="page-head">
          <div>
            <p className="kicker"><WandSparkles size={13} /> Adapter mon CV</p>
            <h1>{offerData.title}</h1>
            <p className="page-sub">{offerData.company} · {place.city || offerData.location}</p>
          </div>
          <div className="page-head-actions">
            <Link href="/app/offres" className="btn-line">← Retour aux offres</Link>
          </div>
        </header>

        {toast && <p role="status" className="notice">{toast}</p>}

        {/* Offre sélectionnée */}
        <section className="card selected-offer-card" style={{ marginBottom: 22 }}>
          <div className="head">
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", minWidth: 0 }}>
              <div className="company-logo" style={{ background: companyColor(offerData.company), marginBottom: 0 }} aria-hidden="true">
                {offerData.company.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 15.5, color: "var(--text-primary)" }}>{offerData.title}</strong>
                <p className="priority-meta" style={{ marginTop: 4, marginBottom: 8 }}>
                  <MapPin size={12} /> {offerData.location || "Lieu à vérifier"}
                  <Clock size={12} style={{ marginLeft: 6 }} /> {offerData.duration || "Stage de 6 mois"}
                </p>
                <div className="skill-pills" style={{ marginBottom: 0 }}>
                  {(offerData.missions || []).slice(0, 3).map(m => <span key={m}>{m}</span>)}
                  {(offerData.skills || []).slice(0, 4).map(s => <span key={s}>{s}</span>)}
                </div>
              </div>
            </div>
            <Link href="/app/offres" className="btn-line btn-sm" style={{ flex: "none" }}>Changer doffre</Link>
          </div>
          {offerData.description && <p className="text-sm text-muted" style={{ marginTop: 6 }}>{offerData.description}</p>}
        </section>

        {!cv ? (
          <div className="empty-box">
            <FileText size={30} />
            <strong>Aucun CV de référence</strong>
            <p>Ajoute ton CV original dans « Mon CV » pour pouvoir ladapter à cette offre.</p>
            <Link href="/app/cv" className="btn-primary mt-3">Aller à Mon CV</Link>
          </div>
        ) : !suggestions && !adapted ? (
          <section className="card card-pad" style={{ textAlign: "center", padding: "48px 24px" }}>
            <Sparkles size={30} style={{ color: "var(--primary)", marginBottom: 12 }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Prêt à adapter ton CV ?</h2>
            <p className="text-sm text-muted" style={{ maxWidth: 520, margin: "0 auto 20px" }}>
              L&apos;IA analyse lannonce et sélectionne les meilleurs arguments de ton profil : titre orienté offre,
              projet pertinent mis en avant, compétences réorganisées, logiciels valorisés. Aucune invention.
            </p>
            <button className="btn-primary" style={{ fontSize: 15, padding: "12px 28px" }} onClick={runAdaptation} disabled={aiBusy || !data.originalCv?.text}>
              {aiBusy ? "Analyse en cours…" : "Adapter mon CV →"}
            </button>
            {!data.originalCv?.text && <p className="notice warn mt-3" style={{ display: "inline-block" }}>Ajoute dabord ton CV original (page Mon CV sans offre).</p>}
          </section>
        ) : suggestions ? (
          <div className="app-layout">
            <section className="card card-pad">
              <h2 className="card-title"><BrainCircuit size={17} /> Suggestions de lIA</h2>
              <p className="card-sub">Coche les suggestions à accepter. Tu peux modifier le texte avant dappliquer.</p>
              <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
                {suggestions.map(s => (
                  <div key={s.id} style={{ padding: 16, border: "1px solid var(--border-light)", borderRadius: 12, background: "var(--bg-primary)" }}>
                    <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={checked.has(s.id)}
                        onChange={e => {
                          const n = new Set(checked);
                          if (e.target.checked) {
                            if (s.needsConfirmation && !window.confirm(s.confirmationMessage!)) return;
                            n.add(s.id);
                          } else n.delete(s.id);
                          setChecked(n);
                        }}
                        disabled={applying === s.id}
                        style={{ marginTop: 3, accentColor: "var(--primary)" }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                          <strong style={{ fontSize: 13.5 }}>{s.label}</strong>
                          {s.needsConfirmation && <span className="priority-badge">Confirmation requise</span>}
                        </div>
                        <p className="text-sm text-muted" style={{ marginBottom: 10 }}>{s.reason}</p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Avant</span>
                            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4, whiteSpace: "pre-wrap" }}>{s.original || "(vide)"}</p>
                          </div>
                          <div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Proposé</span>
                            <textarea
                              className="input"
                              style={{ minHeight: 80, padding: "8px 12px", fontSize: 12.5, marginTop: 4 }}
                              value={s.proposed}
                              onChange={e => setSuggestions(prev => prev ? prev.map(x => x.id === s.id ? { ...x, proposed: e.target.value } : x) : prev)}
                              disabled={applying === s.id}
                            />
                          </div>
                        </div>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button className="btn-primary" onClick={applySuggestions} disabled={checked.size === 0 || !!applying}>
                  {applying ? "Application…" : `Appliquer ${checked.size} suggestion(s) ✓`}
                </button>
                <button className="btn-line" onClick={() => setSuggestions(null)}>Annuler</button>
              </div>
            </section>
            <aside className="rail">
              <div className="card rail-card ai-changes-card">
                <h2 className="card-title"><BrainCircuit size={17} /> Méthode dadaptation</h2>
                <p className="card-sub">L&apos;IA comprend lannonce, croise ton profil réel, puis positionne ton CV sur les missions qui comptent.</p>
                <ol className="steps-list">
                  <li className="done"><span className="step-num">1</span> Compréhension de lannonce</li>
                  <li className="done"><span className="step-num">2</span> Analyse de ton profil</li>
                  <li className="done"><span className="step-num">3</span> Rapprochement intelligent</li>
                  <li className="active"><span className="step-num">4</span> Positionnement et adaptation</li>
                </ol>
              </div>
              <div className="card rail-card">
                <h2><Eye size={15} style={{ color: "var(--primary)", verticalAlign: "-2px", marginRight: 6 }} />Aperçu</h2>
                <p>Le CV principal reste intact. Cette version adaptée est indépendante.</p>
              </div>
            </aside>
          </div>
        ) : (
          /* ═══ Avant / Après ═══ */
          <div>
            <div className="section-head">
              <div>
                <h2>Aperçu de l&apos;adaptation</h2>
                <p>Compare ton CV de référence avec la version adaptée à cette offre.</p>
              </div>
              <span className="status-pill offer"><CheckCircle2 size={12} /> Adaptation terminée</span>
            </div>

            <div className="compare-tabs" role="group" aria-label="Mode de comparaison">
              <button className={compareView === "side" ? "active" : ""} onClick={() => setCompareView("side")}>
                <ArrowLeftRight size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />Côte à côte
              </button>
              <button className={compareView === "stacked" ? "active" : ""} onClick={() => setCompareView("stacked")}>
                <Layers size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />Avant / Après
              </button>
            </div>

            <div className="app-layout">
              <section>
                <div className={compareView === "side" ? "compare-grid" : ""} style={{ display: compareView === "stacked" ? "grid" : undefined, gap: 16 }}>
                  {referenceCv && (
                    <div className="compare-pane">
                      <div className="compare-pane-head"><History size={13} /> Avant · CV de référence</div>
                      <div className="cv-scroll"><CvPreview cv={referenceCv} design={design} /></div>
                    </div>
                  )}
                  <div className="compare-pane after">
                    <div className="compare-pane-head"><Sparkles size={13} /> Après · CV adapté à l&apos;offre</div>
                    <div className="cv-scroll"><CvPreview cv={cv} design={design} /></div>
                  </div>
                </div>

                {bulkReady && (
                  <div className="card card-pad mt-4">
                    <h2 className="card-title"><CheckCircle2 size={16} /> Modifications retenues</h2>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      {bulkChanges.length ? bulkChanges.join(" · ") : "Aucune reformulation sûre proposée ; le CV principal est conservé pour cette offre."}
                    </p>
                  </div>
                )}

                <div className="card card-pad mt-4" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <button className="btn-primary" onClick={downloadPdf}><Download size={15} /> Télécharger le PDF</button>
                  {offerData.url && (
                    <a className="btn-line" href={offerData.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Ouvrir le site pour postuler</a>
                  )}
                  <button className="btn-line" onClick={handleApply} disabled={!preparedPdf || !downloaded || applyingFlow !== "idle" || applicationCreated}>
                    {applicationCreated ? "Candidature enregistrée ✓" : applyingFlow === "submitting" ? "Enregistrement…" : "J'ai postulé"}
                  </button>
                  {applicationCreated && <Link href="/app/candidatures" className="btn-line">Voir dans Mes candidatures →</Link>}
                  {!downloaded && <span className="text-sm text-muted" style={{ width: "100%" }}>Télécharge le PDF avant de confirmer ta candidature.</span>}
                </div>
              </section>

              <aside className="rail">
                <div className="card rail-card ai-changes-card">
                  <h2 className="card-title"><BrainCircuit size={17} /> Modifications apportées par lIA</h2>
                  <p className="card-sub">Uniquement des éléments prouvés dans ton profil.</p>
                  <ul className="changes-list">
                    {(bulkChanges.length ? bulkChanges : ["CV principal conservé — aucune modification risquée détectée."]).map((change, i) => (
                      <li key={i}><CheckCircle2 size={14} /><span>{change}</span></li>
                    ))}
                  </ul>
                  {!bulkReady && (
                    <button className="btn-line btn-block mt-3" onClick={runAdaptation} disabled={aiBusy}>
                      <RefreshCw size={14} /> {aiBusy ? "Analyse…" : "Relancer l'adaptation"}
                    </button>
                  )}
                </div>

                <div className="card rail-card">
                  <h2><ClipboardList size={15} style={{ color: "var(--primary)", verticalAlign: "-2px", marginRight: 6 }} />Offre analysée</h2>
                  <p>{offerData.summary || offerData.description || "Résumé non disponible pour cette offre."}</p>
                </div>
              </aside>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ═══ Mode 2 : gestion du CV principal ═══ */
  const wordCount = cvDraft.trim().split(/\s+/).filter(Boolean).length;
  const history = data.cvs;

  return (
    <div>
      <header className="page-head">
        <div>
          <p className="kicker"><WandSparkles size={13} /> Ta candidature</p>
          <h1>Mon CV</h1>
          <p className="page-sub">Garde un original fiable et prépare une version adaptée à chaque offre.</p>
        </div>
        <div className="page-head-actions">
          <Link href="/app/offres" className="btn-primary">Choisir une offre</Link>
        </div>
      </header>

      {toast && <p role="status" className="notice">{toast}</p>}

      {/* 3 cartes du haut */}
      <div className="cv-top-grid">
        <div className="card card-pad cv-main-card">
          <div className="company-logo" style={{ background: "var(--primary)", marginBottom: 0, width: 84, height: 112, borderRadius: 10, fontSize: 24 }} aria-hidden="true">
            <FileText size={30} />
          </div>
          <div className="cv-info">
            <strong>{data.originalCv?.name || "Aucun CV enregistré"}</strong>
            {data.originalCv && <span className="default-badge" style={{ margin: "4px 0" }}><CheckCircle2 size={11} /> par défaut</span>}
            <p>
              {data.originalCv
                ? `${data.originalCv.text.trim().split(/\s+/).length} mots · source de vérité pour l&apos;adaptation`
                : "Ajoute le texte de ton CV pour démarrer."}
            </p>
            <div className="cv-meta-row">
              {data.originalCv && <span>2 pages</span>}
              <span>Français</span>
              <span>PDF</span>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <span className="rail-icon"><UserRound size={17} /></span>
          <h2 className="card-title">Mon profil</h2>
          <strong style={{ fontSize: 14, color: "var(--text-primary)" }}>{data.profile.firstName} {data.profile.lastName}</strong>
          <p className="card-sub" style={{ marginTop: 4 }}>{data.profile.title || "Profil à compléter à partir de ton CV réel."}</p>
          <Link href="/app/offres" className="btn-line btn-sm mt-3">Voir et enrichir mon profil →</Link>
        </div>

        <div className="card card-pad">
          <span className="rail-icon"><WandSparkles size={17} /></span>
          <h2 className="card-title">Adapte ton CV en 4 étapes</h2>
          <ol className="steps-list">
            <li className={cv ? "done" : "active"}><span className="step-num">{cv ? "✓" : "1"}</span> Enregistre ton CV principal</li>
            <li><span className="step-num">2</span> Sélectionne une offre</li>
            <li><span className="step-num">3</span> Laisse lIA adapter</li>
            <li><span className="step-num">4</span> Compare, télécharge, postule</li>
          </ol>
          <Link href="/app/offres" className="btn-primary btn-block mt-3">Sélectionner une offre</Link>
        </div>
      </div>

      <div className="app-layout">
        <div>
          {/* CV original */}
          <section className="card card-pad" style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
              <h2 className="card-title" style={{ marginBottom: 0, marginRight: "auto" }}><PenLine size={17} /> Mon CV original</h2>
              {data.originalCv && <span className="status-pill offer"><CheckCircle2 size={12} /> source de vérité pour l&apos;adaptation</span>}
            </div>
            <p className="card-sub">
              Colle ici le texte de ton vrai CV (copie-le depuis ton PDF). C&apos;est <strong>ce texte exact</strong> que
              l&apos;adaptation utilise — pas un profil résumé. Sans lui, l&apos;adaptation ne peut pas fonctionner.
            </p>
            <textarea
              className="input mt-4"
              style={{ minHeight: 180, padding: "12px 14px", resize: "vertical" }}
              rows={9}
              value={cvDraft}
              onChange={e => setCvDraft(e.target.value)}
              placeholder={"Colle ton CV complet ici :\nTitre professionnel\nExpériences (entreprise, dates, missions, chiffres)\nFormations\nCompétences techniques et logiciels"}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {wordCount} mots · {cvDraft.trim().length} caractères
                {data.originalCv ? " · enregistré" : " · brouillon"}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                {data.originalCv && <button className="btn-line btn-sm" onClick={() => saveOriginal(true)}>Effacer</button>}
                <button className="btn-primary btn-sm" onClick={() => saveOriginal(false)} disabled={cvDraft.trim().length < 80}>
                  Enregistrer mon CV original
                </button>
              </div>
            </div>
          </section>

          {/* CV structuré */}
          {cv && (
            <section className="card card-pad" style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}><Eye size={17} /> Aperçu du CV structuré</h2>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Identique au PDF exporté</span>
              </div>
              <CvPreview cv={cv} design={design} />
              <div style={{ display: "flex", gap: 10, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border-light)" }}>
                <button className="btn-primary btn-sm" onClick={downloadPdf}><Download size={14} /> Télécharger le PDF</button>
              </div>
            </section>
          )}
        </div>

        <aside className="rail">
          {/* Mémoire professionnelle */}
          <div className="card rail-card">
            <span className="rail-icon"><BrainCircuit size={17} /></span>
            <h2>Ma mémoire professionnelle</h2>
            <p>
              L&apos;IA connaît ton profil à partir des informations fiables de ton CV : formation, expériences,
              projets et logiciels réellement pratiqués. Elle n&apos;invente rien.
            </p>
            {data.profile.skills.length > 0 ? (
              <div className="skill-tags">
                {data.profile.skills.slice(0, 8).map(s => <span key={s}>{s}</span>)}
              </div>
            ) : (
              <p className="notice warn" style={{ marginBottom: 0 }}>
                Aucune compétence enregistrée. Elles seront déduites de ton CV original — rien ne sera inventé.
              </p>
            )}
            <button className="btn-line btn-block mt-3" onClick={() => { setCvDraft(data.originalCv?.text ?? ""); document.querySelector<HTMLTextAreaElement>(".app-content textarea")?.focus(); }}>
              Enrichir depuis mon CV
            </button>
          </div>

          {/* Historique */}
          <div className="card rail-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}><History size={15} style={{ color: "var(--primary)", verticalAlign: "-2px", marginRight: 6 }} />Historique de mes CV</h2>
              {history.length > 0 && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{history.length}</span>}
            </div>
            {!history.length ? (
              <p style={{ marginBottom: 0 }}>Aucune version encore. Chaque adaptation pour une offre apparaîtra ici.</p>
            ) : (
              <table className="history-table">
                <thead>
                  <tr><th>Version</th><th>Offre liée</th><th>Date</th><th /></tr>
                </thead>
                <tbody>
                  {history.slice(0, 6).map(item => (
                    <tr key={item.id}>
                      <td><strong>{item.name}</strong></td>
                      <td>{item.file}</td>
                      <td>{item.date}</td>
                      <td style={{ textAlign: "right" }}>
                        <button className="queue-download" style={{ width: 28, height: 28 }} aria-label={`Télécharger ${item.name}`} onClick={downloadPdf}><Download size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {history.length > 6 && <Link href="/app/candidatures" className="btn-line btn-block mt-3">Voir tout lhistorique →</Link>}
          </div>

          {/* Aide */}
          <div className="card rail-card">
            <h2><Copy size={15} style={{ color: "var(--primary)", verticalAlign: "-2px", marginRight: 6 }} />Réutiliser un CV</h2>
            <p>Un CV déjà adapté pour une annonce et un profil identiques est réutilisé automatiquement — pas de nouvelle génération inutile.</p>
            <Link href="/app/offres" className="btn-line btn-block">Retour aux offres</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
