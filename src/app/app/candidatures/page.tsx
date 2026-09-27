"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  getOrCreateData,
  saveData,
  STATUS_META,
  type AppStatus,
  type Application,
  type DetectedOffer,
  type UserData,
} from "@/lib/data";
import { AppPageHead } from "@/components/app/AppShell";
import { cvToText } from "@/lib/cv";

const uid = () => Math.random().toString(36).slice(2, 9);

const BOARD: { status: AppStatus; label: string; icon: string }[] = [
  { status: "sent", label: "Postulé", icon: "📤" },
  { status: "interview", label: "Entretien", icon: "🤝" },
  { status: "offer", label: "Accepté", icon: "🎉" },
  { status: "rejected", label: "Refusé", icon: "✖" },
];

export default function CandidaturesPage() {
  const { user } = useAuth();
  const [data, setData] = useState<UserData | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [preview, setPreview] = useState<DetectedOffer | null>(null);
  const [addMode, setAddMode] = useState<"link" | "text">("link");
  const [linkUrl, setLinkUrl] = useState("");
  const [scrapeBusy, setScrapeBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [findBusy, setFindBusy] = useState(false);
  const [found, setFound] = useState<DetectedOffer[]>([]);
  const [findError, setFindError] = useState<string | null>(null);
  const [kitId, setKitId] = useState<string | null>(null);
  const [kitBusy, setKitBusy] = useState(false);
  const [kitLetter, setKitLetter] = useState<string | null>(null);
  const [cvSource, setCvSource] = useState<string>("builder");
  const [openId, setOpenId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    const id = window.setTimeout(() => setData(getOrCreateData(user.name, user.email)), 0);
    return () => window.clearTimeout(id);
  }, [user]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!data || !user) return null;

  const persist = (next: UserData) => {
    setData(next);
    saveData(user.email, next);
  };

  const toggleAutopilot = () => persist({ ...data, autopilot: !data.autopilot });

  /* Versions de CV disponibles pour piocher celui qu'on va envoyer. */
  const cvBuilderText = data.cvData ? cvToText(data.cvData) : "";
  const cvOriginalText = data.originalCv?.text ?? "";
  const cvOptions = [
    ...(cvBuilderText.trim()
      ? [{ id: "builder", name: "Mon CV (édition Builder)", text: cvBuilderText }]
      : []),
    ...(cvOriginalText.trim()
      ? [{ id: "original", name: data.originalCv?.name || "CV original", text: cvOriginalText }]
      : []),
  ];
  const selectedCv = cvOptions.find((c) => c.id === cvSource) ?? cvOptions[0];

  const relDate = (a: Application) => {
    if (a.date) {
      // eslint-disable-next-line react-hooks/purity -- affichage "il y a N j" : volontairement recalculé au render
      const d = Math.floor((Date.now() - new Date(a.date).getTime()) / 86400000);
      return d <= 0 ? "aujourd'hui" : `il y a ${d} j`;
    }
    return a.daysAgo === 0 ? "aujourd'hui" : `il y a ${a.daysAgo} j`;
  };

  const setStatus = (app: Application, status: AppStatus) => {
    persist({
      ...data,
      applications: data.applications.map((a) =>
        a.id === app.id ? { ...a, status, date: new Date().toISOString() } : a
      ),
    });
    setToast(`${app.company} → ${STATUS_META[status].label}`);
  };

  const saveNote = (app: Application) => {
    const t = (noteDraft[app.id] ?? "").trim();
    persist({
      ...data,
      applications: data.applications.map((a) =>
        a.id === app.id ? { ...a, notes: t || undefined } : a
      ),
    });
    setToast(t ? "Note enregistrée" : "Note effacée");
  };

  const analyzePasted = async (sourceText?: string, sourceUrl?: string) => {
    const t = (sourceText ?? pasteText).trim();
    if (t.length < 40 || aiBusy) return;
    setAiBusy(true);
    setPreview(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "offer",
          profile: data.profile,
          cvOriginal: data.originalCv?.text,
          offerText: t,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const r = json.result as Omit<DetectedOffer, "id" | "text">;      setPreview({
        id: uid(),
        company: r.company || "Non précisée",
        title: r.title,
        location: r.location,
        salary: r.salary,
        match: Math.max(0, Math.min(100, Math.round(r.match))),
        keywords: (r.keywords ?? []).slice(0, 6),
        summary: r.summary,
        level: r.level,
        text: t,
        url: sourceUrl,
        source: sourceUrl ? "Lien importé" : undefined,
      });
    } catch {
      setToast("L'IA n'a pas réussi à analyser cette offre — vérifie le texte collé");
    } finally {
      setAiBusy(false);
    }
  };

  /* Import d'une annonce publique depuis son URL (LinkedIn, WTTJ, HelloWork…). */
  const importFromLink = async () => {
    const u = linkUrl.trim();
    if (!/^https?:\/\//i.test(u) || scrapeBusy || aiBusy) return;
    setScrapeBusy(true);
    setLinkError(null);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      await analyzePasted(json.text as string, u);
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Import impossible depuis ce lien");
    } finally {
      setScrapeBusy(false);
    }
  };

  const addPreview = () => {
    if (!preview) return;
    persist({ ...data, offers: [preview, ...data.offers] });
    setToast(`Offre « ${preview.company} » ajoutée — match ${preview.match}%`);
    setPreview(null);
    setPasteText("");
    setShowAdd(false);
  };

  /* Cherche de VRAIES offres puis les fait classer par Gemini selon TON CV. */
  const findForMe = async () => {
    if (findBusy) return;
    setFindBusy(true);
    setFindError(null);
    setFound([]);
    try {
      const p = data.profile;
      const q = p.skills.slice(0, 3).join(" ") || p.title || "alternance";
      const l = (p.city || "Paris").replace(/\s*\d+ᵉ$/, "").trim();
      const jobsRes = await fetch(`/api/jobs?q=${encodeURIComponent(q)}&l=${encodeURIComponent(l)}`);
      const jobsJson = await jobsRes.json();
      type RawJob = { id: string; title: string; company: string; location: string; source: string; url: string; date?: string };
      const raw: RawJob[] = (jobsJson.offers ?? []).slice(0, 14);
      if (raw.length === 0) throw new Error("aucune offre trouvée");

      const rankRes = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "rank",
          profile: data.profile,
          cvOriginal: data.originalCv?.text,
          jobs: raw.map((j) => ({ id: j.id, title: j.title, company: j.company, location: j.location })),
        }),
      });
      const rankJson = await rankRes.json();
      if (!rankJson.ok) throw new Error(rankJson.error);
      const ranked = new Map<string, { match: number; reason: string }>();
      for (const r of rankJson.result.ranked ?? []) ranked.set(r.id, r);

      setFound(
        raw
          .map((j) => ({
            id: j.id,
            title: j.title,
            company: j.company,
            location: j.location,
            salary: "",
            match: ranked.get(j.id)?.match ?? 50,
            keywords: [],
            text: "",
            summary: undefined,
            url: j.url,
            source: j.source,
            reason: ranked.get(j.id)?.reason,
          }))
          .sort((a, b) => b.match - a.match)
      );
    } catch (e) {
      setFindError(e instanceof Error ? e.message : "Recherche impossible pour l'instant");
    } finally {
      setFindBusy(false);
    }
  };

  const followFound = (o: DetectedOffer) => {
    persist({ ...data, offers: [o, ...data.offers] });
    setFound((list) => list.filter((x) => x.id !== o.id));
    setToast(`« ${o.title.slice(0, 40)} » suivie — match ${o.match}%`);
  };

  /* Kit de candidature : choix du CV + lettre IA + ouverture de l'offre + suivi. */
  const openKit = async (o: DetectedOffer) => {
    setKitId(kitId === o.id ? null : o.id);
    setKitLetter(null);
    setCvSource(cvOptions[0]?.id ?? "builder");
  };

  const genKitLetter = async (o: DetectedOffer) => {
    if (!o || kitBusy) return;
    setKitBusy(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "letter",
          profile: data.profile,
          cvOriginal: data.originalCv?.text,
          offerText: o.text || `${o.title} chez ${o.company} (${o.location})`,
          company: o.company,
          role: o.title,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const r = json.result as { subject?: string; body?: string };
      setKitLetter([r.subject, "", r.body].filter(Boolean).join("\n"));
    } catch {
      setToast("IA indisponible — réessaie dans un instant");
    } finally {
      setKitBusy(false);
    }
  };

  const copyText = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setToast("Copié dans le presse-papiers");
    } catch {
      /* clipboard indisponible */
    }
  };

  /* Clôture du kit : la candidature part dans « Postulé » avec TOUT son contexte
     (quel CV a été envoyé, le texte du CV et la lettre) pour relire à tout moment. */
  const markSent = (o: DetectedOffer) => {
    persist({
      ...data,
      applications: [
        {
          id: uid(),
          company: o.company,
          role: o.title,
          status: "sent",
          daysAgo: 0,
          source: o.source ? `Offre ${o.source}` : "Candidature directe",
          cvName: selectedCv?.name,
          cvText: selectedCv?.text ?? "",
          letterText: kitLetter ?? undefined,
          date: new Date().toISOString(),
        },
        ...data.applications,
      ],
    });
    setToast(`« ${o.company} » ajoutée au suivi — statut : ${STATUS_META.sent.label}`);
    setKitId(null);
    setKitLetter(null);
  };

  return (
    <>
      <AppPageHead
        eyebrow="Module 04"
        title="Candidatures & pilotage auto"
        sub="Le kit prépare ton CV + ta lettre. Une fois postulé, chaque candidature part dans le tableau de suivi : Postulé → Entretien → Accepté / Refusé, avec son CV et sa lettre archivés."
      />

      {/* Ajouter une offre par copier-coller */}
      <section className="glass-card p-6 mb-8">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 text-left"
          onClick={() => setShowAdd((v) => !v)}
          aria-expanded={showAdd}
        >
          <span>
            <span className="font-display text-lg font-semibold block">＋ Ajouter une offre</span>
            <span className="text-[0.78rem] text-muted mt-0.5 block">
              Depuis un lien (LinkedIn, WTTJ, HelloWork…) ou en collant le texte : Gemini la résume,
              extrait les compétences et le niveau attendu, et calcule ton match avec ton CV original.
            </span>
          </span>
          <span className={`mono-label shrink-0 transition-transform duration-300 ${showAdd ? "rotate-180" : ""}`}>▼</span>
        </button>

        {showAdd && (
          <div className="mt-5 border-t border-line pt-5">
            {/* Onglets Lien / Texte */}
            <div className="flex gap-2 mb-4" role="tablist" aria-label="Mode d'ajout d'offre">
              {(["link", "text"] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  type="button"
                  aria-selected={addMode === m}
                  onClick={() => setAddMode(m)}
                  className={`rounded-full border px-4 py-1.5 text-[0.8rem] transition-all duration-300 ${
                    addMode === m
                      ? "border-mint/60 bg-mint/8 text-mint"
                      : "border-line text-muted hover:text-text-dim"
                  }`}
                >
                  {m === "link" ? "🔗 Depuis un lien" : "📝 Coller le texte"}
                </button>
              ))}
            </div>

            {addMode === "link" ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="input flex-1 min-w-[16rem]"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://www.linkedin.com/jobs/view/…"
                    inputMode="url"
                    onKeyDown={(e) => { if (e.key === "Enter") importFromLink(); }}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={importFromLink}
                    disabled={scrapeBusy || !/^https?:\/\//i.test(linkUrl.trim())}
                  >
                    {scrapeBusy ? (
                      <>
                        <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        Lecture du lien…
                      </>
                    ) : (
                      "✨ Importer & analyser"
                    )}
                  </button>
                </div>
                <p className={`mt-2 text-[0.72rem] leading-relaxed ${linkError ? "text-amber" : "text-muted"}`}>
                  {linkError ??
                    "Gemini lit la page publique puis la traite comme une offre collée : résumé, compétences, niveau attendu, % match."}
                </p>
              </>
            ) : (
              <>
                <textarea
                  className="input"
                  rows={7}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Colle ici l'annonce complète (intitulé, missions, profil recherché, salaire…)…"
                />
                <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                  <p className="text-[0.72rem] text-muted">
                    {pasteText.trim().split(/\s+/).filter(Boolean).length} mots · comparé à ton CV par Gemini
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => analyzePasted()}
                    disabled={aiBusy || pasteText.trim().length < 40}
                  >
                    {aiBusy ? (
                      <>
                        <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        Gemini analyse…
                      </>
                    ) : (
                      "✨ Analyser avec l’IA"
                    )}
                  </button>
                </div>
              </>
            )}

            {preview && (
              <div className="mt-6">
                <p className="mono-label mb-3">Aperçu — vérifie puis ajoute</p>
                <article className="border border-line rounded-xl p-6 bg-surface/60">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="mono-label">{preview.company}</p>
                    <span className="score-pill">
                      <b className={`tabular-nums ${preview.match >= 85 ? "text-mint" : ""}`}>{preview.match}</b>
                      <span className="text-muted text-[0.68rem]">% match</span>
                    </span>
                  </div>
                  <h3 className="font-display font-semibold leading-snug">{preview.title}</h3>
                  <p className="mt-1 text-[0.75rem] text-muted">
                    {[preview.location, preview.salary].filter(Boolean).join(" · ")}
                  </p>
                  {preview.summary && (
                    <p className="mt-3 text-[0.82rem] text-text-dim leading-relaxed">
                      {preview.summary}
                    </p>
                  )}
                  {preview.level && (
                    <p className="mt-2 text-[0.78rem] text-text-dim">
                      🎯 Profil attendu : <b>{preview.level}</b>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 my-4">
                    {preview.keywords.map((k) => (
                      <span key={k} className="chip chip--mint">{k}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={addPreview} className="btn-primary">Ajouter à mes offres</button>
                    <Link href="/app/lettres" className="btn-line">Préparer la lettre →</Link>
                  </div>
                </article>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Bandeau autopilot */}
      <div className="glass-card p-6 mb-8 flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            role="switch"
            aria-checked={data.autopilot}
            aria-label="Pilotage automatique"
            onClick={toggleAutopilot}
            className={`switch ${data.autopilot ? "on" : ""}`}
          >
            <i />
          </button>
          <div>
            <p className="font-medium text-[0.95rem]">Pilotage automatique</p>
            <p className="text-[0.78rem] text-muted mt-0.5">
              {data.autopilot
                ? "Détection, envoi J+0, relance J+7 — tout est programmé."
                : "En pause : aucune action envoyée sans ta validation."}
            </p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={findForMe} disabled={findBusy} className="btn-line">
            {findBusy ? (
              <>
                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                Gemini compare…
              </>
            ) : (
              "◎ Trouver des offres pour moi"
            )}
          </button>
          <button type="button" onClick={() => setShowAdd((v) => !v)} className="btn-line">
            ＋ Ajouter une offre
          </button>
          <Link href="/app/matching" className="btn-primary">Analyser une offre</Link>
        </div>
      </div>

      {/* Offres réelles classées par Gemini selon TON CV */}
      {(findBusy || found.length > 0 || findError) && (
        <section className="mb-10">
          <div className="flex items-baseline justify-between gap-4 mb-1">
            <h2 className="font-display text-xl font-semibold">Offres trouvées pour toi</h2>
            <span className="mono-label">
              réelles · classées par Gemini selon ton CV ·{" "}
              <Link href="/app/offers" className="text-mint hover:text-mint-strong">recherche manuelle</Link>
            </span>
          </div>
          <p className="text-[0.78rem] text-muted mb-5">
            Chaque offre existe sur le site source — « Suivre » l&apos;ajoute à tes offres, puis le kit de
            candidature choisit ton CV, prépare ta lettre et l&apos;enregistre dans le tableau de suivi.
          </p>
          {findError && (
            <div className="glass-card p-6 text-[0.85rem] text-muted">{findError}</div>
          )}
          {findBusy && (
            <div className="grid md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="glass-card p-6 animate-pulse">
                  <div className="h-3 w-24 bg-line rounded-full" />
                  <div className="h-4 w-3/4 bg-line rounded-full mt-4" />
                  <div className="h-3 w-1/2 bg-line rounded-full mt-3" />
                </div>
              ))}
            </div>
          )}
          {!findBusy && found.length > 0 && (
            <div className="grid md:grid-cols-2 gap-4">
              {[...found].sort((a, b) => b.match - a.match).map((o) => (
                <article key={o.id} className="glass-card p-6 flex flex-col">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="mono-label">{[o.source, o.company].filter(Boolean).join(" · ")}</p>
                    <span className="score-pill">
                      <b className={`tabular-nums ${o.match >= 80 ? "text-mint" : ""}`}>{o.match}</b>
                      <span className="text-muted text-[0.68rem]">% match</span>
                    </span>
                  </div>
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="group">
                    <h3 className="font-display font-semibold leading-snug group-hover:text-mint transition-colors">{o.title}</h3>
                  </a>
                  <p className="mt-1 text-[0.75rem] text-muted">{o.location}</p>
                  {o.reason && <p className="mt-2 text-[0.8rem] text-text-dim leading-relaxed italic">« {o.reason} »</p>}
                  <div className="mt-auto pt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => followFound(o)} className="btn-primary text-[0.8rem]! px-4! h-9!">+ Suivre</button>
                    <a href={o.url} target="_blank" rel="noopener noreferrer" className="btn-line text-[0.8rem]! px-4! h-9! inline-flex items-center">Voir ↗</a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Offres détectées */}
      <section className="mb-10">
        <h2 className="font-display text-xl font-semibold mb-5">
          Offres détectées{" "}
          <span className="text-muted font-normal text-base">({data.offers.length})</span>
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {[...data.offers].sort((a, b) => b.match - a.match).map((o) => (
            <article key={o.id} className="glass-card p-6 flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="mono-label">{o.company}</p>
                <span className="score-pill">
                  <b className={`tabular-nums ${o.match >= 85 ? "text-mint" : ""}`}>{o.match}</b>
                  <span className="text-muted text-[0.68rem]">% match</span>
                </span>
              </div>
              <h3 className="font-display font-semibold leading-snug">
                {o.url ? (
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="hover:text-mint transition-colors">{o.title} ↗</a>
                ) : (
                  o.title
                )}
              </h3>
              <p className="mt-1 text-[0.75rem] text-muted">
                {[[o.location, o.salary].filter(Boolean).join(" · "), o.source && `via ${o.source}`].filter(Boolean).join(" — ")}
              </p>
              <p className="mt-3 text-[0.82rem] text-text-dim leading-relaxed">{o.summary ?? o.text}</p>
              {o.level && (
                <p className="mt-2 text-[0.75rem] text-muted">
                  🎯 {o.level}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 my-4">
                {o.keywords.map((k) => (
                  <span key={k} className="chip chip--mint">{k}</span>
                ))}
              </div>

              {kitId === o.id ? (
                <div className="border-t border-line pt-4 mt-auto space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="mono-label">Kit : CV + Lettre</p>
                    <button type="button" className="btn-line opacity-60 hover:opacity-100" onClick={() => setKitId(null)}>Fermer</button>
                  </div>

                  {/* 1 · Le CV qu'on va vraiment envoyer */}
                  <div className="space-y-2">
                    <p className="text-[0.72rem] text-muted font-medium">1 · Quel CV envoyer ?</p>
                    {cvOptions.length === 0 ? (
                      <p className="text-[0.78rem] text-amber">
                        Aucun CV trouvé — colle ton CV dans{" "}
                        <Link href="/app/cv" className="underline">CV intelligent</Link> pour activer le kit.
                      </p>
                    ) : (
                      <>
                        {cvOptions.length > 1 && (
                          <select
                            className="input"
                            value={selectedCv?.id ?? ""}
                            onChange={(e) => setCvSource(e.target.value)}
                          >
                            {cvOptions.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        )}
                        <p className="text-[0.72rem] text-muted">
                          {selectedCv?.name} sera enregistrée avec ta candidature — tu sauras toujours quel CV tu as envoyé.
                        </p>
                        <details className="text-[0.78rem]">
                          <summary className="text-mint cursor-pointer hover:text-mint-strong">Voir le texte du CV →</summary>
                          <textarea className="input mt-2 text-[0.78rem]" rows={7} readOnly value={selectedCv?.text ?? ""} />
                          <button type="button" className="btn-line mt-1" onClick={() => selectedCv && copyText(selectedCv.text)}>Copier le CV</button>
                        </details>
                      </>
                    )}
                  </div>

                  {/* 2 · La lettre */}
                  <div className="space-y-2">
                    <p className="text-[0.72rem] text-muted font-medium">2 · Lettre de motivation</p>
                    {!kitLetter ? (
                      <button type="button" onClick={() => genKitLetter(o)} disabled={kitBusy} className="btn-primary text-[0.85rem]!">
                        {kitBusy ? (
                          <>
                            <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            Gemini rédige…
                          </>
                        ) : (
                          "✨ Générer ma lettre"
                        )}
                      </button>
                    ) : (
                      <>
                        <textarea
                          className="input text-[0.82rem]"
                          rows={8}
                          value={kitLetter}
                          onChange={(e) => setKitLetter(e.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="btn-line" onClick={() => copyText(kitLetter)}>Copier la lettre</button>
                          {o.url && (
                            <a href={o.url} target="_blank" rel="noopener noreferrer" className="btn-primary">
                              Ouvrir l&apos;offre ↗
                            </a>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 3 · L'envoi part au suivi */}
                  <button
                    type="button"
                    onClick={() => markSent(o)}
                    className="btn-primary w-full"
                    disabled={cvOptions.length === 0}
                  >
                    ✓ J&apos;ai postulé — ajouter au suivi
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => openKit(o)} className="btn-primary mt-auto self-start">
                  📦 CV + Lettre
                </button>
              )}
            </article>
          ))}
        </div>
        {data.offers.length === 0 && (
          <div className="glass-card p-8 text-center">
            <p className="text-[0.85rem] text-muted max-w-md mx-auto leading-relaxed">
              Aucune offre suivie pour l&apos;instant. Cherche parmi des offres réelles publiées en ce
              moment, puis prépare ton CV + ta lettre depuis le kit de candidature.
            </p>
            <Link href="/app/offers" className="btn-primary mt-5 inline-flex">Chercher des offres réelles →</Link>
          </div>
        )}
      </section>

      {/* Tableau de suivi : chaque colonne = une étape, chaque carte = une candidature
          avec son CV, sa lettre et ses notes archivés. */}
      <section>
        <div className="flex items-baseline justify-between gap-4 mb-5">
          <h2 className="font-display text-xl font-semibold">
            Tableau de suivi{" "}
            <span className="text-muted font-normal text-base">({data.applications.length} candidature{data.applications.length === 1 ? "" : "s"})</span>
          </h2>
          <span className="mono-label hidden md:block">CV + lettre archivés avec chaque candidature</span>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {BOARD.map((col) => {
            const items = [...data.applications]
              .filter((a) => a.status === col.status)
              .sort((a, b) => {
                const da = a.date ? Date.parse(a.date) : Date.now() - a.daysAgo * 86400000;
                const db = b.date ? Date.parse(b.date) : Date.now() - b.daysAgo * 86400000;
                return db - da;
              });
            return (
              <section key={col.status} className="glass-card p-4 flex flex-col min-h-[10rem]">
                <header className="flex items-center justify-between mb-3">
                  <h3 className="font-medium flex items-center gap-2">{col.icon} {col.label}</h3>
                  <span className="mono-label">{items.length}</span>
                </header>
                <div className="space-y-3">
                  {items.map((a) => (
                    <article key={a.id} className="rounded-xl border border-line bg-surface/60 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[0.9rem] font-medium leading-snug">{a.company}</p>
                          <p className="text-[0.72rem] text-muted truncate">{a.role}</p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Retirer ${a.company}`}
                          onClick={() =>
                            persist({
                              ...data,
                              applications: data.applications.filter((x) => x.id !== a.id),
                            })
                          }
                          className="btn-line px-1.5! opacity-40 hover:opacity-100"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-[0.7rem] text-muted">{relDate(a)} · {a.source}</p>

                      <div className="flex flex-wrap gap-1.5">
                        {a.cvName && (
                          <button
                            type="button"
                            onClick={() => setOpenId(openId === a.id ? null : a.id)}
                            className="chip chip--mint cursor-pointer"
                            title="Voir le CV envoyé"
                          >
                            📄 {a.cvName}
                          </button>
                        )}
                        {a.letterText && <span className="chip chip--muted">✉ Lettre</span>}
                        {a.notes && <span className="chip chip--amber">📝 note</span>}
                      </div>

                      {openId === a.id && (
                        <div className="space-y-2 border-t border-line pt-2">
                          {a.cvText && (
                            <details className="text-[0.75rem]">
                              <summary className="text-mint cursor-pointer">CV envoyé — aperçu</summary>
                              <textarea className="input mt-1 text-[0.72rem]" rows={5} readOnly value={a.cvText} onFocus={(e) => e.currentTarget.select()} />
                            </details>
                          )}
                          {a.letterText && (
                            <details className="text-[0.75rem]">
                              <summary className="text-mint cursor-pointer">Lettre envoyée — aperçu</summary>
                              <textarea className="input mt-1 text-[0.72rem]" rows={5} readOnly value={a.letterText} onFocus={(e) => e.currentTarget.select()} />
                            </details>
                          )}
                          <input
                            className="input text-[0.78rem]"
                            placeholder="Note : relance, date d'entretien, contact…"
                            value={noteDraft[a.id] ?? a.notes ?? ""}
                            onChange={(e) => setNoteDraft({ ...noteDraft, [a.id]: e.target.value })}
                            onBlur={() => saveNote(a)}
                          />
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {a.status === "sent" && (
                          <>
                            <button type="button" className="pill-btn pill-btn--ok" onClick={() => setStatus(a, "interview")}>🤝 Réponse</button>
                            <button type="button" className="pill-btn" onClick={() => setStatus(a, "rejected")}>✖ Refus</button>
                          </>
                        )}
                        {a.status === "interview" && (
                          <>
                            <button type="button" className="pill-btn pill-btn--ok" onClick={() => setStatus(a, "offer")}>🎉 Accepté</button>
                            <button type="button" className="pill-btn" onClick={() => setStatus(a, "rejected")}>✖ Refus</button>
                          </>
                        )}
                        {(a.status === "offer" || a.status === "rejected") && (
                          <button type="button" className="pill-btn" onClick={() => setStatus(a, "interview")}>↩ → Entretien</button>
                        )}
                      </div>
                    </article>
                  ))}
                  {items.length === 0 && (
                    <p className="text-[0.72rem] text-muted text-center py-6 border border-dashed border-line rounded-lg">vide</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {toast && (
        <div className="toast" role="status">
          <span className="w-2 h-2 rounded-full bg-mint inline-block" />
          {toast}
        </div>
      )}
    </>
  );
}
