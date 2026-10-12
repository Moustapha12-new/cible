"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Bookmark, Download, ExternalLink, Plus, Search, Sparkles, Zap,
  MapPin, Clock, CheckCircle2, Wand2, Filter, ListFilter,
  Link2 as LinkIcon, AlertCircle, RefreshCw, FileText, Target, Send, Mail,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, saveData, type DetectedOffer, type UserData } from "@/lib/data";
import { loadGmailStore } from "@/lib/gmail-client";
import { offerToDetectedOffer } from "@/lib/gmail-bridge";
import {
  eligibleOffers, shortlist, fallbackSelection, validateAiSelection,
  selectionSignature, type DailySelection,
} from "@/lib/daily-recommendations";

const today = () => new Date().toLocaleDateString("en-CA");
const cacheKey = (email: string) => `cible:selection:v1:${email.toLowerCase()}`;
const pageLoadedAt = Date.now();
const textOf = (o: DetectedOffer) => [o.title, o.company, o.location, o.description, o.text, ...(o.skills || [])].join(" ").toLowerCase();

/** Couleur déterministe du logo entreprise (mêmes règles que la maquette : logo coloré carré). */
function companyColor(company: string) {
  const colors = [
    "#E31837", "#155EEF", "#00A9CE", "#3DCD58", "#FFD100", "#6D28D9",
    "#0F766E", "#B45309", "#BE185D", "#1E40AF", "#047857", "#7C2D12",
  ];
  let hash = 0;
  for (let i = 0; i < company.length; i++) hash = (hash * 31 + company.charCodeAt(i)) >>> 0;
  return colors[hash % colors.length];
}

export default function OffresPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [data, setData] = useState<UserData | null>(null);
  const [selection, setSelection] = useState<DailySelection | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "todo" | "applied" | "favorites" | "expired">("all");
  const [visible, setVisible] = useState(30);
  const [addOpen, setAddOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState<"info" | "warn" | "err">("info");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<NonNullable<UserData["bulkCvQueue"]>>([]);
  const [queueBusy, setQueueBusy] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; lastSync?: string | null; gmailAccount?: string } | null>(null);
  const [view, setView] = useState<"list" | "cards">("list");
  const processing = useRef(false);

  const processQueue = useCallback(async (items: NonNullable<UserData["bulkCvQueue"]>) => {
    if (processing.current) return;
    processing.current = true;
    setQueueBusy(true);
    try {
      for (const item of items.filter(q => q.status === "pending" || q.status === "failed" || (q.status === "running" && Date.now() - Date.parse(q.updatedAt) > 5 * 60_000))) {
        const response = await fetch("/api/cv/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare", offerId: item.offerId }) });
        const json = await response.json();
        if (json.item) setQueue(current => current.map(q => q.offerId === item.offerId ? json.item : q));
        if (!response.ok && /quota/i.test(json.error || "")) { setNotice(json.error); setNoticeKind("warn"); break; }
      }
    } finally { processing.current = false; setQueueBusy(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { if (searchParams.get("ajouter")) setAddOpen(true); }, 0);
    if (searchParams.get("rafale")) document.getElementById("offer-list")?.scrollIntoView({ behavior: "smooth" });
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/gmail/status", { cache: "no-store" }).then(r => r.json()).then(json => { if (json.ok) setGmailStatus(json); }).catch(() => {});
    const timer = window.setTimeout(() => { try { setFavorites(new Set(JSON.parse(localStorage.getItem(`cible:favorites:${user.email}`) || "[]"))); } catch { /* vide */ } }, 0);
    fetch("/api/cv/bulk", { cache: "no-store" }).then(r => r.json()).then(json => {
      if (!json.ok) return;
      setQueue(json.queue);
      if (json.queue.some((q: NonNullable<UserData["bulkCvQueue"]>[number]) => q.status === "pending" || (q.status === "running" && Date.now() - Date.parse(q.updatedAt) > 5 * 60_000))) void processQueue(json.queue);
    }).catch(() => {});
    return () => window.clearTimeout(timer);
  }, [user, processQueue]);

  useEffect(() => {
    if (!user) return;
    const local = getOrCreateData(user.name, user.email);
    const gmail = loadGmailStore(user.email);
    const keys = new Set(local.offers.map(o => o.id));
    const additions = gmail.offers.filter(o => o.status !== "doublon").map(o => offerToDetectedOffer(o)).filter(o => !keys.has(o.id));
    const merged = additions.length ? { ...local, offers: [...local.offers, ...additions] } : local;
    const timer = window.setTimeout(() => setData(merged), 0);
    fetch("/api/user-data", { cache: "no-store" }).then(r => r.json()).then(json => {
      if (!json.ok || !json.record?.data) return;
      const remote = json.record.data as UserData;
      setData(current => current ? {
        ...current,
        applications: remote.applications,
        originalCv: current.originalCv || remote.originalCv,
        cvData: current.cvData || remote.cvData,
        offers: [...current.offers, ...remote.offers.filter(o => !current.offers.some(existing => existing.id === o.id))],
      } : current);
    }).catch(() => {});
    return () => window.clearTimeout(timer);
  }, [user]);

  const cvText = data?.originalCv?.text || "";
  const pool = useMemo(() => data ? eligibleOffers(data.offers, data) : [], [data]);
  const signature = useMemo(() => selectionSignature(pool, cvText), [pool, cvText]);

  useEffect(() => {
    if (!user || !data) return;
    let cancelled = false;
    const date = today();
    const cached = (() => { try { return JSON.parse(localStorage.getItem(cacheKey(user.email)) || "null") as DailySelection | null; } catch { return null; } })();
    if (cached?.date === date && cached.signature === signature) {
      const timer = window.setTimeout(() => setSelection(cached), 0);
      return () => window.clearTimeout(timer);
    }
    const candidates = shortlist(pool, cvText);
    const fallback = fallbackSelection(pool, cvText, date, signature);
    const timer = window.setTimeout(() => setSelection(fallback), 0);
    if (!cvText.trim() || !candidates.length) {
      localStorage.setItem(cacheKey(user.email), JSON.stringify(fallback));
      return () => window.clearTimeout(timer);
    }
    (async () => {
      try {
        const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          task: "rank-gmail", cvOriginal: cvText,
          jobs: candidates.map(o => ({ id: o.id, title: o.title, company: o.company, location: o.location, text: (o.text || "").slice(0, 900) })),
        }) });
        if (!response.ok) throw new Error("IA indisponible");
        const json = await response.json();
        const result = validateAiSelection(json.result, candidates, cvText, date, signature);
        if (!cancelled) { setSelection(result); localStorage.setItem(cacheKey(user.email), JSON.stringify(result)); }
      } catch {
        if (!cancelled) localStorage.setItem(cacheKey(user.email), JSON.stringify(fallback));
      }
    })();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [user, data, pool, cvText, signature]);

  const addOffer = async () => {
    if (!user || !data || addBusy) return;
    setAddBusy(true);
    setNotice(""); setNoticeKind("info");
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password ||
          /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(parsed.hostname)) {
        throw new Error("Colle une adresse HTTPS publique.");
      }
      let content = pastedText.trim();
      if (!content) {
        const response = await fetch("/api/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: parsed.href }) });
        const json = await response.json();
        if (!json.ok) throw new Error("Cette page ne peut pas être lue. Colle le texte de l'annonce ci-dessous.");
        content = json.text;
      }
      if (content.length < 30) throw new Error("La description est trop courte. Colle le texte de l'annonce.");
      let details: Partial<DetectedOffer> = {};
      try {
        const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "offer", offerText: content, cvOriginal: data.originalCv?.text || "CV non fourni" }) });
        if (res.ok) details = (await res.json()).result || {};
      } catch { /* L'offre reste ajoutable sans IA. */ }
      if (data.offers.some(o => o.url?.replace(/\/$/, "") === parsed.href.replace(/\/$/, ""))) throw new Error("Cette offre est déjà enregistrée.");
      const offer: DetectedOffer = {
        id: `manual-${crypto.randomUUID()}`, title: details.title || parsed.hostname,
        company: details.company || "Entreprise à préciser", location: details.location || "",
        salary: details.salary || "", match: 0, keywords: details.keywords || [],
        text: content.slice(0, 30_000), description: content.slice(0, 2_000),
        summary: details.summary, url: parsed.href, source: "Ajout manuel", skills: details.keywords || [],
      };
      const savedResponse = await fetch("/api/offres/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer }) });
      const saved = await savedResponse.json();
      if (!savedResponse.ok || !saved.ok) throw new Error(saved.error || "Sauvegarde impossible.");
      const persistedOffer = saved.offer as DetectedOffer;
      const local = getOrCreateData(user.name, user.email);
      const nextLocal = { ...local, offers: [persistedOffer, ...local.offers] };
      saveData(user.email, nextLocal);
      setData({ ...data, offers: [persistedOffer, ...data.offers] });
      setAddOpen(false); setUrl(""); setPastedText("");
      setNotice("Offre ajoutée. Tu peux adapter ton CV."); setNoticeKind("info");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ajout impossible.");
      setNoticeKind("err"); setAddOpen(true);
    } finally { setAddBusy(false); }
  };

  const enqueue = async () => {
    if (!data || !selected.size || queueBusy) return;
    setQueueBusy(true); setNotice(""); setNoticeKind("info");
    try {
      const offerIds = [...selected];
      const response = await fetch("/api/cv/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "enqueue", offerIds, offers: data.offers.filter(o => selected.has(o.id)) }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "File indisponible.");
      setQueue(json.queue); setSelected(new Set());
      void processQueue(json.queue.filter((q: NonNullable<UserData["bulkCvQueue"]>[number]) => offerIds.includes(q.offerId)));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Préparation impossible.");
      setNoticeKind("err");
    } finally { setQueueBusy(false); }
  };

  const toggleFavorite = (id: string) => {
    if (!user) return;
    const next = new Set(favorites);
    if (next.has(id)) next.delete(id); else next.add(id);
    setFavorites(next);
    localStorage.setItem(`cible:favorites:${user.email}`, JSON.stringify([...next]));
  };

  const downloadReady = async (offerId: string) => {
    const response = await fetch(`/api/cv/bulk/document?offerId=${encodeURIComponent(offerId)}`);
    if (!response.ok) { setNotice("Téléchargement indisponible. Réessaie."); setNoticeKind("err"); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "CV-cible.pdf"; link.click();
    const sha = response.headers.get("X-Content-SHA256");
    if (sha && user) localStorage.setItem(`cible:downloaded:v1:${user.email}:${offerId}`, sha);
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  if (!data) {
    return (
      <>
        <div className="page-head">
          <div>
            <div className="skeleton-card" style={{ width: 280, height: 32, marginBottom: 10 }} />
            <div className="skeleton-card" style={{ width: 420, height: 16 }} />
          </div>
        </div>
        <div className="stats-row">
          {[0, 1, 2, 3].map(i => <div key={i} className="skeleton-card" style={{ height: 74 }} />)}
        </div>
        <div className="priority-grid">
          {[0, 1, 2, 3].map(i => <div key={i} className="skeleton-card" style={{ height: 260 }} />)}
        </div>
      </>
    );
  }

  const map = new Map(data.offers.map(o => [o.id, o]));
  const recommended = (selection?.picks || []).flatMap(p => { const offer = map.get(p.id); return offer ? [{ offer, pick: p }] : []; });
  const applied = new Set(data.applications.map(a => a.offerId).filter(Boolean));
  const priorities = recommended.slice(0, 4);

  const all = data.offers.filter(o => {
    const expired = !!o.deadline && Date.parse(o.deadline) < pageLoadedAt;
    const matches = filter === "all" ||
      (filter === "new" && o.gmailStatus === "nouvelle" && !applied.has(o.id)) ||
      (filter === "todo" && !applied.has(o.id) && !expired) ||
      (filter === "applied" && applied.has(o.id)) ||
      (filter === "favorites" && favorites.has(o.id)) ||
      (filter === "expired" && expired);
    return matches && (!query || textOf(o).includes(query.toLowerCase()));
  });

  const counts = {
    all: data.offers.length,
    new: data.offers.filter(o => o.gmailStatus === "nouvelle" && !applied.has(o.id)).length,
    todo: data.offers.filter(o => !applied.has(o.id) && !(o.deadline && Date.parse(o.deadline) < pageLoadedAt)).length,
    applied: applied.size,
    favorites: favorites.size,
    expired: data.offers.filter(o => !!o.deadline && Date.parse(o.deadline) < pageLoadedAt).length,
  };

  const selectOffer = (offer: DetectedOffer) => {
    if (!user) return;
    const local = getOrCreateData(user.name, user.email);
    if (!local.offers.some(o => o.id === offer.id)) saveData(user.email, { ...local, offers: [...local.offers, offer] });
  };

  const readyCount = queue.filter(q => q.status === "ready").length;

  return (
    <div>
      {/* En-tête */}
      <header className="page-head">
        <div>
          <p className="kicker"><Sparkles size={13} /> Tes opportunités</p>
          <h1>Bonjour {data.profile.firstName || user?.name.split(" ")[0]} 👋</h1>
          <p className="page-sub">Voici les meilleures opportunités du jour, sélectionnées selon ton profil et tes preuves techniques.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn-line" onClick={() => { if (user) localStorage.removeItem(cacheKey(user.email)); setSelection(null); setData({ ...data }); }}>
            <RefreshCw size={15} /> Actualiser
          </button>
          <button className="btn-primary" onClick={() => setAddOpen(v => !v)}>
            <Plus size={16} /> Ajouter une offre
          </button>
        </div>
      </header>

      {/* Bandeau Gmail */}
      <div className="gmail-strip" id="sync">
        <span className={`gmail-dot ${gmailStatus?.connected ? "" : "off"}`} aria-hidden="true" />
        <span><strong style={{ color: "var(--text-primary)" }}>Gmail</strong> {gmailStatus ? (gmailStatus.connected ? `connecté${gmailStatus.gmailAccount ? ` · ${gmailStatus.gmailAccount}` : ""}` : "non connecté") : "vérification…"}</span>
        <span className="sep" aria-hidden="true">·</span>
        <span>Dernière synchronisation : {gmailStatus?.lastSync ? new Date(gmailStatus.lastSync).toLocaleString("fr-FR") : "jamais"}</span>
        <span className="sep" aria-hidden="true">·</span>
        <span>{counts.all} offres enregistrées</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Link href="/app/offres" className="btn-line btn-sm"><Mail size={14} /> Synchroniser</Link>
        </div>
      </div>

      {notice && <p role="status" className={`notice ${noticeKind === "warn" ? "warn" : noticeKind === "err" ? "err" : ""}`}>{notice}</p>}

      {/* Ajout manuel */}
      {addOpen && (
        <section className="card add-offer-card">
          <div className="section-head" style={{ marginBottom: 14 }}>
            <div>
              <h2><LinkIcon size={16} style={{ color: "var(--primary)", verticalAlign: "-2px", marginRight: 6 }} />Ajouter une offre</h2>
              <p>Colle le lien de lannonce. Si le site bloque la lecture, ajoute son texte.</p>
            </div>
          </div>
          <div className="row">
            <label>
              <span className="label">Lien de l&apos;offre</span>
              <input className="input" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
            </label>
            <button className="btn-primary" disabled={addBusy || !url} onClick={addOffer}>
              {addBusy ? "Analyse en cours…" : "Analyser l'offre"}
            </button>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            <span className="label">Texte de lannonce (facultatif)</span>
            <textarea className="input" style={{ minHeight: 90, padding: "10px 14px", resize: "vertical" }} value={pastedText} onChange={e => setPastedText(e.target.value)} placeholder="Colle la description si la page ne peut pas être lue" />
          </label>
          <p className="add-offer-hint">L&apos;offre devient immédiatement compatible avec le classement, l&apos;adaptation CV et le suivi.</p>
        </section>
      )}

      {/* Statistiques réelles */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-icon blue"><Target size={19} /></span>
          <div className="stat-body"><b>{counts.all}</b><span>Offres suivies</span></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon violet"><Sparkles size={19} /></span>
          <div className="stat-body"><b>{priorities.length}</b><span>Priorités du jour</span></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon green"><FileText size={19} /></span>
          <div className="stat-body"><b>{readyCount}</b><span>CV prêts</span></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon amber"><Send size={19} /></span>
          <div className="stat-body"><b>{counts.applied}</b><span>Candidatures</span></div>
        </div>
      </div>

      {/* Mode Rafale + Assistant IA */}
      <div className="hero-grid">
        <div className="rafale-hero">
          <span className="hero-icon"><Zap size={19} /></span>
          <h2>Mode Rafale</h2>
          <p>Sélectionne plusieurs offres dans la liste ci-dessous, puis prépare un CV distinct et ciblé pour chacune en une seule fois. Chaque adaptation reste indépendante, et tu gardes le contrôle de l&apos;envoi.</p>
          <Link href="#offer-list" className="btn-line btn-block" style={{ background: "rgba(255,255,255,0.14)", borderColor: "rgba(255,255,255,0.28)", color: "#fff", marginTop: 14, position: "relative", zIndex: 1 }}>Sélectionner des offres →</Link>
        </div>
        <div className="card assistant-card">
          <h2 className="card-title"><Wand2 size={17} /> Assistant IA</h2>
          <p className="card-sub">Ton CV adapté à chaque offre, sans jamais inventer de compétence.</p>
          <ul>
            <li><CheckCircle2 size={15} /> Analyse automatique des offres selon ton vrai CV</li>
            <li><CheckCircle2 size={15} /> Adaptation intelligente, sans inventer de compétences</li>
            <li><CheckCircle2 size={15} /> Préparation en série (Mode Rafale) et suivi des candidatures</li>
          </ul>
          <Link href="#offer-list" className="btn-line btn-block">Voir toutes mes offres →</Link>
        </div>
      </div>

      <div className="workspace-grid">
        <div>
          {/* 10 meilleures offres */}
          <section style={{ marginBottom: 34 }}>
            <div className="section-head">
              <div>
                <h2>Mes 10 meilleures offres du jour</h2>
                <p>{recommended.length} offre{recommended.length > 1 ? "s" : ""} pertinente{recommended.length > 1 ? "s" : ""} · {priorities.length} priorité{priorities.length > 1 ? "s" : ""}</p>
              </div>
              {priorities.length > 0 && <span className="priority-badge">{priorities.length} priorités</span>}
            </div>

            {!cvText && <p className="notice warn">Ajoute ton CV principal dans « Mon CV » pour personnaliser les recommandations selon ton vrai profil.</p>}
            {!recommended.length ? (
              <div className="empty-box">
                <Search size={30} />
                <strong>Aucune recommandation pour linstant</strong>
                <p>Consulte toutes les offres ci-dessous, ou synchronise Gmail pour en récupérer de nouvelles.</p>
              </div>
            ) : (
              <>
                <div className="priority-grid">
                  {priorities.map(({ offer, pick }, index) => (
                    <article key={offer.id} className="priority-card">
                      <div className="priority-top">
                        <span className="priority-rank">{index + 1}</span>
                        {pick.priority && <span className="priority-badge">Priorité</span>}
                        <button aria-label={favorites.has(offer.id) ? "Retirer des favoris" : "Ajouter aux favoris"} onClick={() => toggleFavorite(offer.id)} className={`fav-btn ${favorites.has(offer.id) ? "is-favorite" : ""}`}>
                          <Bookmark size={15} fill={favorites.has(offer.id) ? "currentColor" : "none"} />
                        </button>
                      </div>
                      <div className="company-logo" style={{ background: companyColor(offer.company) }} aria-hidden="true">
                        {offer.company.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="priority-company">{offer.company}</span>
                      <h3>{offer.title}</h3>
                      <p className="priority-meta">
                        <MapPin size={12} /> {offer.location || "Lieu à vérifier"}
                        {offer.duration && <><Clock size={12} style={{ marginLeft: 6 }} /> {offer.duration}</>}
                      </p>
                      <div className="skill-pills">{(offer.skills?.length ? offer.skills : offer.keywords).slice(0, 3).map(skill => <span key={skill}>{skill}</span>)}</div>
                      <p className="priority-reason">{pick.reason}</p>
                      <span className="match-pill"><CheckCircle2 size={14} /> {pick.priority ? "Très bon match" : "Bon match"}</span>
                      <div className="card-actions">
                        <Link className="btn-primary btn-sm" onClick={() => selectOffer(offer)} href={`/app/cv?offer=${encodeURIComponent(offer.id)}`}>Adapter mon CV</Link>
                        {offer.url && <a className="btn-line btn-sm" href={offer.url} target="_blank" rel="noopener noreferrer">Voir l&apos;offre</a>}
                      </div>
                    </article>
                  ))}
                </div>
                {recommended.length > 4 && (
                  <div className="card card-pad" style={{ marginTop: 14 }}>
                    <strong style={{ fontSize: 13.5, color: "var(--text-primary)" }}>Autres recommandations du jour</strong>
                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      {recommended.slice(4).map(({ offer, pick }) => (
                        <Link key={offer.id} onClick={() => selectOffer(offer)} href={`/app/cv?offer=${encodeURIComponent(offer.id)}`} style={{ display: "flex", gap: 10, alignItems: "baseline", textDecoration: "none", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{offer.company} · {offer.title}</span>
                          <small style={{ fontSize: 12, color: "var(--text-muted)" }}>{pick.reason}</small>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Toutes les offres */}
          <section id="offer-list">
            <div className="section-head">
              <div>
                <h2>Toutes mes offres Gmail</h2>
                <p>{counts.all} offres enregistrées · {all.length} affichée{all.length > 1 ? "s" : ""}</p>
              </div>
            </div>

            <div className="list-toolbar">
              <label className="topbar-search" style={{ maxWidth: 360 }}>
                <Search size={16} aria-hidden="true" />
                <input type="search" aria-label="Rechercher les offres" value={query} onChange={e => { setQuery(e.target.value); setVisible(30); }} placeholder="Entreprise, intitulé, compétence, lieu…" />
              </label>
              <div className="view-toggle" role="group" aria-label="Mode d'affichage">
                <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>Vue liste</button>
                <button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}>Vue cartes</button>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--text-muted)" }}>Trier : plus récentes</span>
            </div>

            <div className="filter-tabs" role="group" aria-label="Filtrer les offres">
              {([
                ["all", "Toutes", counts.all],
                ["new", "Nouvelles", counts.new],
                ["todo", "À traiter", counts.todo],
                ["applied", "Déjà postulées", counts.applied],
                ["favorites", "Favoris", counts.favorites],
                ["expired", "Expirées", counts.expired],
              ] as const).map(([id, label, n]) => (
                <button key={id} className={`filter-tab ${filter === id ? "active" : ""}`} onClick={() => { setFilter(id); setVisible(30); }}>
                  {label}<span className="count">({n})</span>
                </button>
              ))}
            </div>

            {view === "list" ? (
              <div className="offer-list">
                <div className="offer-row-head" aria-hidden="true">
                  <span>Sélection</span>
                  <span />
                  <span>Offre</span>
                  <span>Lieu / date</span>
                  <span>Domaine</span>
                  <span style={{ textAlign: "right" }}>Actions</span>
                </div>
                {all.slice(0, visible).map(o => (
                  <article key={o.id} className="offer-row">
                    <label className="offer-check">
                      <input type="checkbox" checked={selected.has(o.id)} onChange={e => { const next = new Set(selected); if (e.target.checked) next.add(o.id); else next.delete(o.id); setSelected(next); }} aria-label={`Sélectionner ${o.title} chez ${o.company}`} />
                    </label>
                    <div className="company-logo sm" style={{ background: companyColor(o.company) }} aria-hidden="true">{o.company.slice(0, 2).toUpperCase()}</div>
                    <div className="offer-row-main">
                      <div>
                        <strong>{o.company}</strong>
                        <h3>{o.title}</h3>
                        <div className="skill-pills">{(o.skills?.length ? o.skills : o.keywords).slice(0, 3).map(skill => <span key={skill}>{skill}</span>)}</div>
                      </div>
                    </div>
                    <div className="offer-row-meta">{o.location || "Lieu à vérifier"}<small>{o.receivedAt ? `Reçue le ${new Date(o.receivedAt).toLocaleDateString("fr-FR")}` : o.deadline ? `Échéance ${o.deadline}` : o.source || "Offre enregistrée"}</small></div>
                    <div className="offer-row-date">{applied.has(o.id) ? "Postulée" : o.source || "Offre"}<small>{o.contract || o.duration || "Stage de 6 mois"}</small></div>
                    <div className="offer-row-actions">
                      <Link className="btn-primary btn-sm" onClick={() => selectOffer(o)} href={`/app/cv?offer=${encodeURIComponent(o.id)}`}>Adapter mon CV</Link>
                      {o.url && <a className="btn-line btn-sm" href={o.url} target="_blank" rel="noopener noreferrer" aria-label={`Voir l'offre ${o.title}`}><ExternalLink size={14} /></a>}
                      <button className={`fav-btn ${favorites.has(o.id) ? "is-favorite" : ""}`} onClick={() => toggleFavorite(o.id)} aria-label="Favori"><Bookmark size={14} fill={favorites.has(o.id) ? "currentColor" : "none"} /></button>
                    </div>
                  </article>
                ))}
                {!all.length && (
                  <div className="empty-box" style={{ border: "none" }}>
                    <Filter size={28} />
                    <strong>Aucune offre dans ce filtre</strong>
                    <p>Change donglet ou synchronise Gmail pour récupérer de nouvelles alertes.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="priority-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                {all.slice(0, visible).map(o => (
                  <article key={o.id} className="priority-card">
                    <div className="priority-top">
                      <button className={`fav-btn ${favorites.has(o.id) ? "is-favorite" : ""}`} onClick={() => toggleFavorite(o.id)} aria-label="Favori" style={{ marginLeft: "auto" }}>
                        <Bookmark size={15} fill={favorites.has(o.id) ? "currentColor" : "none"} />
                      </button>
                    </div>
                    <div className="company-logo" style={{ background: companyColor(o.company) }} aria-hidden="true">{o.company.slice(0, 2).toUpperCase()}</div>
                    <span className="priority-company">{o.company}</span>
                    <h3>{o.title}</h3>
                    <p className="priority-meta"><MapPin size={12} /> {o.location || "Lieu à vérifier"}</p>
                    <div className="skill-pills">{(o.skills?.length ? o.skills : o.keywords).slice(0, 3).map(skill => <span key={skill}>{skill}</span>)}</div>
                    <div className="card-actions" style={{ marginTop: 12 }}>
                      <Link className="btn-primary btn-sm" onClick={() => selectOffer(o)} href={`/app/cv?offer=${encodeURIComponent(o.id)}`}>Adapter mon CV</Link>
                      {o.url && <a className="btn-line btn-sm" href={o.url} target="_blank" rel="noopener noreferrer">Voir l&apos;offre</a>}
                    </div>
                  </article>
                ))}
                {!all.length && <div className="empty-box" style={{ gridColumn: "1 / -1" }}>Aucune offre dans ce filtre.</div>}
              </div>
            )}

            {all.length > visible && (
              <button className="btn-line btn-block mt-4" onClick={() => setVisible(v => v + 30)}>Afficher 30 offres de plus</button>
            )}
          </section>
        </div>

        {/* Rail droit */}
        <aside className="rail">
          <div className="card rail-card rafale-rail">
            <span className="rail-icon"><Zap size={18} /></span>
            <h2>Mode Rafale</h2>
            <p>Coche plusieurs offres dans la liste, puis prépare un CV distinct pour chacune.</p>
            <strong>{selected.size} offre{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""}</strong>
            <button className="btn-primary btn-block" disabled={!selected.size || queueBusy} onClick={enqueue}>
              Préparer {selected.size || "mes"} CV{selected.size > 1 ? "s" : ""}
            </button>
          </div>

          <div className="card rail-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <h2 style={{ margin: 0 }}>File de préparation</h2>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{queue.length}</span>
            </div>
            {!queue.length && <p style={{ marginBottom: 0 }}>Aucun CV en préparation. Lance le Mode Rafale pour commencer.</p>}
            {queue.map(item => {
              const offer = data.offers.find(o => o.id === item.offerId);
              const progress = item.status === "pending" ? 8 : item.status === "running" ? 55 : item.status === "ready" ? 100 : 100;
              return (
                <div className="queue-item" key={item.offerId}>
                  <div>
                    <strong>{offer?.company || "Offre enregistrée"}</strong>
                    <small>{offer?.title || item.offerId}</small>
                    <span className={`queue-status ${item.status}`}>
                      {item.status === "pending" ? "En attente" : item.status === "running" ? "En cours" : item.status === "ready" ? "CV prêt" : "Échec"}
                    </span>
                    <div className="queue-progress"><i style={{ width: `${progress}%` }} /></div>
                    {item.status === "ready" && (
                      <Link className="btn-line btn-sm mt-2" style={{ marginTop: 8 }} onClick={() => { if (offer) selectOffer(offer); }} href={`/app/cv?offer=${encodeURIComponent(item.offerId)}`}>Voir le CV →</Link>
                    )}
                  </div>
                  {item.status === "ready" ? (
                    <button className="queue-download" onClick={() => downloadReady(item.offerId)} aria-label={`Télécharger le CV pour ${offer?.company}`}><Download size={16} /></button>
                  ) : item.status === "failed" ? (
                    <button className="btn-line btn-sm" onClick={() => void processQueue([item])}>Réessayer</button>
                  ) : null}
                </div>
              );
            })}
            {queue.some(q => q.status === "pending" || q.status === "failed" || (q.status === "running" && pageLoadedAt - Date.parse(q.updatedAt) > 5 * 60_000)) && (
              <button className="btn-line btn-block mt-3" disabled={queueBusy} onClick={() => void processQueue(queue)}>Reprendre la file</button>
            )}
          </div>

          <div className="card rail-card">
            <span className="rail-icon"><ListFilter size={17} /></span>
            <h2>Filtres rapides</h2>
            <p style={{ marginBottom: 8 }}>Affine la liste selon tes besoins du moment.</p>
            <div className="filter-group">
              <label className="filter-option"><input type="checkbox" checked={filter === "todo"} onChange={() => setFilter(filter === "todo" ? "all" : "todo")} /> À traiter <span className="n">{counts.todo}</span></label>
              <label className="filter-option"><input type="checkbox" checked={filter === "new"} onChange={() => setFilter(filter === "new" ? "all" : "new")} /> Nouvelles <span className="n">{counts.new}</span></label>
              <label className="filter-option"><input type="checkbox" checked={filter === "favorites"} onChange={() => setFilter(filter === "favorites" ? "all" : "favorites")} /> Favoris <span className="n">{counts.favorites}</span></label>
              <label className="filter-option"><input type="checkbox" checked={filter === "expired"} onChange={() => setFilter(filter === "expired" ? "all" : "expired")} /> Expirées <span className="n">{counts.expired}</span></label>
            </div>
          </div>

          <div className="card rail-card">
            <h2 style={{ marginBottom: 4 }}>Mes candidatures</h2>
            <p>{data.applications.length} candidature{data.applications.length > 1 ? "s" : ""} enregistrée{data.applications.length > 1 ? "s" : ""}.</p>
            <Link href="/app/candidatures" className="btn-line btn-block">Voir le suivi →</Link>
          </div>
        </aside>
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar" role="status">
          <strong>{selected.size} offre{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""}</strong>
          <button onClick={() => setSelected(new Set())} className="btn-line btn-sm">Annuler</button>
          <button onClick={enqueue} disabled={queueBusy} className="btn-primary btn-sm"><Zap size={14} /> Préparer mes CV</button>
        </div>
      )}

      {queue.some(q => q.status === "ready") && (
        <p className="notice" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 55, boxShadow: "var(--shadow-lg)" }}>
          <AlertCircle size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />
          Télécharge ton CV, ouvre l&apos;offre, puis confirme l&apos;envoi depuis Mon CV.
        </p>
      )}
    </div>
  );
}
