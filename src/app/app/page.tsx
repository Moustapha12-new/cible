"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, isEmptyData, STATUS_META, type UserData } from "@/lib/data";
import { AppPageHead } from "@/components/app/AppShell";

const BARS = [32, 46, 41, 63, 78, 96];

const QUICK = [
  { href: "/app/matching", label: "Analyser une offre", desc: "Score ATS en 3 secondes", color: "text-mint" },
  { href: "/app/adaptation", label: "Adapter mon CV", desc: "Mots-clés recalibrés", color: "text-violet" },
  { href: "/app/lettres", label: "Rédiger une lettre", desc: "Ton profil + l'offre", color: "text-amber" },
  { href: "/app/cv", label: "Gérer mes CV", desc: "Versions et scores", color: "text-mint" },
  { href: "/app/recruteurs", label: "Contacter un recruteur", desc: "5 contacts chauds", color: "text-violet" },
  { href: "/app/candidatures", label: "Suivre mes candidatures", desc: "Pipeline à jour", color: "text-amber" },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<UserData | null>(null);

  useEffect(() => {
    if (!user) return;
    const id = window.setTimeout(() => setData(getOrCreateData(user.name, user.email)), 0);
    return () => window.clearTimeout(id);
  }, [user]);

  const hour = new Date().getHours();
  const hello = hour >= 18 || hour < 5 ? "Bonsoir" : "Bonjour";
  const dateStr = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const firstName = user ? user.name.split(" ")[0] : "";

  const apps = data?.applications ?? [];
  const cvs = data?.cvs ?? [];
  const profile = data?.profile;
  const fresh = data ? isEmptyData(data) : false;
  const interviews = apps.filter((a) => a.status === "interview" || a.status === "offer").length;
  const replies = apps.filter((a) => a.status !== "sent").length;
  const topOffers = [...(data?.offers ?? [])].sort((a, b) => b.match - a.match).slice(0, 3);
  const pipeline = [...apps].sort((a, b) => a.daysAgo - b.daysAgo).slice(0, 5);

  const steps = [
    {
      done: (profile?.skills.length ?? 0) > 0 || (profile?.title ?? "") !== "",
      label: "Compléter mon profil",
      href: "/app/cv/nouveau",
      desc: "Formation, expériences, compétences — Cible en déduit tes mots-clés.",
    },
    { done: cvs.length > 0, label: "Créer mon premier CV", href: "/app/cv/nouveau", desc: "Construis-le pas à pas : il est noté et calibré automatiquement." },
    { done: false, label: "Chercher des offres réelles", href: "/app/offers", desc: "Recherche en direct sur LinkedIn, Indeed, WTTJ et plus." },
    { done: apps.length > 0, label: "Suivre ma première candidature", href: "/app/candidatures", desc: "Ajoute une offre : le pipeline prend le relais." },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <>
      <AppPageHead
        eyebrow={dateStr}
        title={fresh ? `${hello}, ${firstName}. Bienvenue.` : `${hello}, ${firstName}. Tout roule.`}
        sub={
          fresh
            ? "Ton espace est vide pour l'instant — c'est normal. Il s'adapte à toi au fil de tes actions : profil, CV, offres analysées, candidatures suivies."
            : "Ton pilotage automatique tourne : nouvelles offres détectées, candidatures envoyées, relances programmées. Voici la situation."
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {[
          { label: "Candidatures envoyées", value: apps.length, note: apps.length > 0 ? "+2 cette semaine" : "à toi de lancer la première" },
          { label: "Entretiens décrochés", value: interviews, note: interviews > 0 ? "continue comme ça" : "ça va venir" },
          { label: "Réponses reçues", value: replies, note: apps.length > 0 ? `${Math.round((replies / Math.max(apps.length, 1)) * 100)} % de réponse` : "—" },
          { label: "CV prêts", value: cvs.length, note: cvs.length > 0 ? `${cvs.length} version${cvs.length > 1 ? "s" : ""}` : "aucun pour l'instant" },
        ].map((s) => (
          <div key={s.label} className="glass-card p-6">
            <p className="mono-label text-[0.62rem]!">{s.label}</p>
            <p className="font-display text-4xl font-semibold mt-3 tabular-nums">{s.value}</p>
            <p className="mt-1.5 text-[0.75rem] text-muted">{s.note}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-4 mb-10">
        {/* Démarrage / activité */}
        <section className="glass-card p-7">
          {fresh ? (
            <>
              <div className="flex items-baseline justify-between gap-4 mb-6">
                <h2 className="font-display text-lg font-semibold">Par où commencer</h2>
                <span className="mono-label">{doneCount}/{steps.length} fait{doneCount > 1 ? "s" : ""}</span>
              </div>
              <div className="h-1 rounded-full bg-line overflow-hidden mb-2">
                <div
                  className="h-full rounded-full bg-mint transition-all duration-700"
                  style={{ width: `${(doneCount / steps.length) * 100}%` }}
                />
              </div>
              <ul>
                {steps.map((s, i) => (
                  <li key={i} className="border-t border-line first:border-t-0">
                    <Link href={s.href} className="flex items-start gap-3 py-3 group">
                      <span
                        className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border grid place-items-center text-[0.65rem] ${
                          s.done ? "bg-mint border-mint text-white" : "border-line-strong text-muted"
                        }`}
                        aria-hidden="true"
                      >
                        {s.done ? "✓" : i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-[0.9rem] font-medium ${s.done ? "text-muted line-through" : "group-hover:text-mint transition-colors"}`}>
                          {s.label}
                        </span>
                        <span className="block mt-0.5 text-[0.75rem] text-muted leading-relaxed">{s.desc}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-4 mb-6">
                <h2 className="font-display text-lg font-semibold">Activité du pilote</h2>
                <span className="mono-label">7 derniers jours</span>
              </div>
              <div className="bars h-28" aria-hidden="true">
                {BARS.map((h, i) => (
                  <i key={i} style={{ "--h": h } as React.CSSProperties} data-hot={i === BARS.length - 1 ? "" : undefined} />
                ))}
              </div>
              <p className="mt-4 text-[0.8rem] text-muted leading-relaxed">
                Les offres détectées ont doublé depuis que ton profil est complet.
                Le pic de vendredi correspond à la vague « rentrée » des recruteurs.
              </p>
            </>
          )}
        </section>

        {/* Pipeline */}
        <section className="glass-card p-7 flex flex-col">
          <div className="flex items-baseline justify-between gap-4 mb-5">
            <h2 className="font-display text-lg font-semibold">Pipeline</h2>
            <Link href="/app/candidatures" className="text-[0.78rem] text-mint hover:text-mint-strong transition-colors">
              Tout voir →
            </Link>
          </div>
          <ul className="-mx-2">
            {pipeline.map((a) => {
              const meta = STATUS_META[a.status];
              return (
                <li key={a.id} className="flex items-center gap-3 px-2 py-3 border-t border-line first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.88rem] font-medium truncate">{a.company}</p>
                    <p className="text-[0.72rem] text-muted truncate">{a.role}</p>
                  </div>
                  <span className={`pill ${meta.cls} shrink-0`}>{meta.label}</span>
                </li>
              );
            })}
            {pipeline.length === 0 && (
              <li className="py-8 text-center text-sm text-muted">Aucune candidature pour l&apos;instant.</li>
            )}
          </ul>
        </section>
      </div>

      {/* Offres détectées */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between gap-4 mb-5">
          <h2 className="font-display text-xl font-semibold">Offres détectées pour toi</h2>
          <Link href="/app/candidatures" className="text-[0.78rem] text-mint hover:text-mint-strong transition-colors">
            Voir les {data?.offers.length ?? 0} →
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {topOffers.map((o) => (
            <article key={o.id} className="glass-card p-6 flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-3">
                <p className="mono-label">{o.company}</p>
                <span className="score-pill"><b className="text-mint text-base tabular-nums">{o.match}</b><span className="text-muted text-[0.68rem]">% match</span></span>
              </div>
              <h3 className="font-display font-semibold leading-snug">{o.title}</h3>
              <p className="mt-1.5 text-[0.75rem] text-muted">{o.location} · {o.salary}</p>
              <div className="flex flex-wrap gap-1.5 mt-4 mb-5">
                {o.keywords.slice(0, 3).map((k) => (
                  <span key={k} className="chip chip--mint">{k}</span>
                ))}
              </div>
              <Link href="/app/adaptation" className="btn-line mt-auto self-start">Calibrer mon CV →</Link>
            </article>
          ))}
          {topOffers.length === 0 && (
            <div className="glass-card p-8 md:col-span-3 text-center">
              <p className="font-display text-lg font-semibold">Aucune offre analysée pour l&apos;instant</p>
              <p className="mt-2 text-[0.85rem] text-muted max-w-md mx-auto leading-relaxed">
                Cherche parmi des offres réelles publiées en ce moment, puis analyse-les pour connaître ton score.
              </p>
              <Link href="/app/offers" className="btn-line mt-5 inline-flex">Chercher des offres réelles →</Link>
            </div>
          )}
        </div>
      </section>

      {/* Actions rapides */}
      <section>
        <h2 className="font-display text-xl font-semibold mb-5">Actions rapides</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {QUICK.map((q) => (
            <Link key={q.href} href={q.href} className="glass-card p-6 group transition-transform duration-300 hover:-translate-y-1">
              <span className={`card-icon ${q.color}`}>→</span>
              <h3 className="mt-4 font-medium group-hover:text-mint transition-colors">{q.label}</h3>
              <p className="mt-1 text-[0.78rem] text-muted">{q.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
