"use client";
import CloudBackup from "@/components/cv/CloudBackup";
import SkillEvidence from "@/components/cv/SkillEvidence";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cvDocumentHtml, parseCvText, DEFAULT_CV_DESIGN, type CvData } from "@/lib/cv";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, saveData, type UserData } from "@/lib/data";
import { AppPageHead, NAV_LABEL } from "@/components/app/AppShell";
import LoadingState from "@/components/alertes-gmail/LoadingState";
import { AI_LABEL } from "@/lib/ai-labels";

const uid = () => Math.random().toString(36).slice(2, 9);

export default function CvPage() {
  const { user } = useAuth();
  const [data, setData] = useState<UserData | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [aiBusy, setAiBusy] = useState(false);
  type AiResult = { score: number; strengths: string[]; improvements: string[] };
  const [ai, setAi] = useState<AiResult | null>(null);
  const [cvDraft, setCvDraft] = useState("");

  useEffect(() => {
    if (!user) return;
    const id = window.setTimeout(() => {
      const d = getOrCreateData(user.name, user.email);
      setData(d);
      setCvDraft(d.originalCv?.text ?? "");
    }, 0);
    return () => window.clearTimeout(id);
  }, [user]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  /* P2-9 : état de chargement visible au lieu d'un écran blanc. */
  if (!data) return <LoadingState />;

  const addVersion = (file: string) => {
    const next: UserData = {
      ...data,
      cvs: [
        ...data.cvs,
        {
          id: uid(),
          name: `Importé — ${file.replace(/\.[^.]+$/, "")}`,
          file,
          date: "à l'instant",
        },
      ],
    };
    setData(next);
    if (user) saveData(user.email, next);
    setToast(`« ${file} » ajouté — colle son texte dans « Mon CV original » pour un vrai score`);
  };

  const remove = (cv: { id: string; name: string }) => {
    if (!user) return;
    const next: UserData = { ...data!, cvs: data!.cvs.filter((x) => x.id !== cv.id) };
    setData(next);
    saveData(user.email, next);
    setToast(`« ${cv.name} » supprimé`);
  };

  const saveOriginal = (clear = false) => {
    if (!user || !data) return;
    const text = clear ? "" : cvDraft.trim();
    const next: UserData = {
      ...data,
      originalCv: text ? { name: "CV original", text } : undefined,
    };
    setData(next);
    if (clear) setCvDraft("");
    saveData(user.email, next);
    setToast(
      text
        ? `CV original enregistré (${text.length} caractères) — l'IA l'utilisera partout`
        : "CV original effacé"
    );
  };

  const runAi = async () => {
    if (!data || aiBusy) return;
    setAiBusy(true);
    setAi(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "cvScore",
          profile: data.profile,
          cvOriginal: data.originalCv?.text,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setAi(json.result as AiResult);
    } catch {
      setToast(AI_LABEL.unavailable);
    } finally {
      setAiBusy(false);
    }
  };

  const download = (cvName: string) => {
    const p = data.profile;
    const cv: CvData = data.cvData ?? (data.originalCv?.text ? parseCvText(data.originalCv.text) : {
      basics: { name: `${p.firstName} ${p.lastName}`, headline: p.title, contact: [p.city, p.email, p.phone].filter(Boolean).join("\n") }, summary: "", sections: [
        { key: "formation", title: "Formation", kind: "list", text: "", items: p.educations.map((e, i) => ({ id: String(i), title: e.degree, meta: `${e.school} · ${e.period}`, detail: "" })) },
        { key: "experience", title: "Expériences", kind: "list", text: "", items: p.experiences.map((e, i) => ({ id: String(i), title: e.title, meta: `${e.place} · ${e.period}`, detail: e.detail })) },
        { key: "skills", title: "Compétences", kind: "text", text: p.skills.join("\n"), items: [] },
      ],
    });
    const html = cvDocumentHtml(cv, data.cvDesign ?? DEFAULT_CV_DESIGN, cvName);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = cvName.replace(/\.pdf$/i, ".html");
    a.click();
    URL.revokeObjectURL(url);
    setToast("Téléchargement lancé");
  };

  const sorted = [...data.cvs].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  return (
    <>
      <AppPageHead
        eyebrow={NAV_LABEL["/app/cv"]}
        title="CV intelligent"
        sub="Évaluation interne : structure lisible et mots-clés justifiés. Ce score ne mesure pas un ATS de recruteur."
      />
      <details className="glass-card p-5 mb-6"><summary className="cursor-pointer font-semibold">Sauvegarde et preuves de mes compétences</summary><div className="mt-4"><CloudBackup /><SkillEvidence /></div></details>

      {/* CV original : source de vérité pour l'IA */}
      <section className="glass-card p-7 mb-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-1">
          <h2 className="font-display text-lg font-semibold mr-auto">Mon CV original</h2>
          {data.originalCv && (
            <span className="pill pill--ok">
              <span className="w-1.5 h-1.5 rounded-full bg-mint inline-block" />
              source de vérité de l&apos;IA
            </span>
          )}
        </div>
        <p className="text-[0.78rem] text-muted leading-relaxed max-w-3xl">
          Colle ici le texte de ton vrai CV (copie-le depuis ton PDF). C&apos;est{" "}
          <b>ce texte exact</b> que l&apos;IA utilise pour le Correspondance CV / offre, l&apos;Adaptation et les
          Lettres — pas un profil résumé. Sans lui, les analyses restent approximatives.
        </p>
        <textarea
          className="input mt-4"
          rows={9}
          value={cvDraft}
          onChange={(e) => setCvDraft(e.target.value)}
          placeholder={"Colle ton CV complet ici :\nTitre professionnel\nExpériences (entreprise, dates, missions, chiffres)\nFormations\nCompétences techniques et logiciels"}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <p className="mono-label">
            {cvDraft.trim().split(/\s+/).filter(Boolean).length} mots · {cvDraft.trim().length} caractères
            {data.originalCv ? " · enregistré" : " · brouillon"}
          </p>
          <div className="flex gap-2">
            {data.originalCv && (
              <button type="button" className="btn-line" onClick={() => saveOriginal(true)}>
                Effacer
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              onClick={() => saveOriginal(false)}
              disabled={cvDraft.trim().length < 80}
            >
              Enregistrer mon CV original
            </button>
          </div>
        </div>
      </section>

      {/* Zone d'upload */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Ajouter un CV"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) addVersion(f.name);
        }}
        className={`glass-card p-10 mb-8 text-center cursor-pointer transition-all duration-300 ${
          dragOver ? "border-mint bg-mint/5 scale-[1.01]" : ""
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) addVersion(f.name);
            e.target.value = "";
          }}
        />
        <p className="font-display text-lg font-semibold">Ajouter une version du CV</p>
        <p className="mt-2 text-[0.85rem] text-muted">
          PDF ou Word — pour l&apos;historique et les comparaisons. Pour que l&apos;IA lise vraiment
          ton CV, colle son texte dans « Mon CV original » ci-dessus.
        </p>
        <span className="btn-primary mt-5 inline-flex pointer-events-none">Parcourir mes fichiers</span>
      </div>

      {/* Versions */}
      <div className="flex items-baseline justify-between gap-4 mb-5">
        <h2 className="font-display text-xl font-semibold">
          Mes versions <span className="text-muted font-normal text-base">({data.cvs.length})</span>
        </h2>
        <Link href="/app/cv/nouveau" className="btn-line">＋ Créer avec l&apos;assistant</Link>
        <Link href="/app/cv/builder" className="btn-line">Créer mon CV · modèle gris Canva</Link>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-12">
        {sorted.map((cv, i) => (
          <article key={cv.id} className="glass-card p-6 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-medium truncate">{cv.name}</h3>
                <p className="mono-label mt-1">{cv.file} · {cv.date}</p>
              </div>
              {cv.score !== undefined ? (
                <>
                  <div
                    className={`score-pill shrink-0 ${i === 0 ? "border-mint/50" : ""}`}
                    title="Correspondance interne"
                  >
                    <b className={`tabular-nums ${i === 0 ? "text-mint" : ""}`}>{cv.score}</b>
                    <span className="text-muted text-[0.68rem]">/100</span>
                  </div>
                </>
              ) : (
                <span className="mono-label text-muted! shrink-0" title="Ajoute le texte du CV pour calculer un vrai score">
                  non évalué
                </span>
              )}
            </div>
            {cv.score !== undefined && (
              <div className="h-1 rounded-full bg-surface-2 mt-4 overflow-hidden" aria-hidden="true">
                <div
                  className={`h-full rounded-full ${i === 0 ? "bg-mint" : "bg-violet"}`}
                  style={{ width: `${cv.score}%`, transition: "width .9s cubic-bezier(.16,1,.3,1)" }}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-5 pt-1">
              <button type="button" onClick={() => download(cv.file)} className="btn-line">↓ Télécharger</button>
              <Link href="/app/matching" className="btn-line">◎ Calibrer sur une offre</Link>
              <button
                type="button"
                aria-label={`Supprimer ${cv.name}`}
                title="Supprimer cette version"
                onClick={() => remove(cv)}
                className="btn-line opacity-50 hover:opacity-100 hover:!text-red-400 ml-auto"
              >
                ✕ Supprimer
              </button>
            </div>
          </article>
        ))}
      </div>

      {/* Analyse IA */}
      <section className="glass-card p-7 mb-8 max-w-3xl">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mb-1">
          <h2 className="font-display text-lg font-semibold mr-auto">Analyse IA de mon profil</h2>
          <button type="button" onClick={runAi} disabled={aiBusy} className="btn-primary">
            {aiBusy ? (
              <>
                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                {AI_LABEL.analyzeBusy}
              </>
            ) : (
              AI_LABEL.analyzeCta
            )}
          </button>
        </div>
        <p className="text-[0.78rem] text-muted leading-relaxed">
          L&apos;IA lit ton profil et te donne un score de correspondance honnête, tes points forts et ce qui manque
          vraiment. Ton texte de CV est envoyé à l&apos;IA le temps de l&apos;analyse, rien n&apos;est stocké.
        </p>

        {ai && (
          <div className="mt-6 grid md:grid-cols-[auto_1fr] gap-6 items-start">
            <div className="score-pill border-mint/50! scale-110 origin-left mx-auto">
              <b className="text-mint text-xl tabular-nums">{ai.score}</b>
              <span className="text-muted text-[0.68rem]">/100</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <p className="mono-label mb-2">Points forts</p>
                <ul className="space-y-1.5 text-[0.85rem] text-text-dim leading-snug list-disc pl-4">
                  {ai.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
              <div>
                <p className="mono-label mb-2">À améliorer</p>
                <ul className="space-y-1.5 text-[0.85rem] text-text-dim leading-snug list-disc pl-4">
                  {ai.improvements.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Note transparence */}
      <section className="glass-card p-7 max-w-3xl">
        <p className="mono-label mb-3">Ce que fait vraiment cette page</p>
        <ul className="space-y-2 text-[0.88rem] text-text-dim leading-relaxed list-disc pl-5">
          <li>Tes fichiers restent dans ton navigateur (localStorage) — rien n&apos;est envoyé sur un serveur.</li>
          <li>Le score affiché reflète la structure du CV tel que les robots de tri le lisent.</li>
          <li>La meilleure version est automatiquement proposée au calibrage.</li>
        </ul>
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
