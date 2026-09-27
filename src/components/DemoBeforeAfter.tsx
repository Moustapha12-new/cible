"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import SectionHead from "./SectionHead";

type Mode = "before" | "after";

const OFFER_KW: { label: string; had: boolean }[] = [
  { label: "SEO", had: false },
  { label: "Google Analytics", had: false },
  { label: "Rédaction web", had: false },
  { label: "CRM", had: false },
  { label: "Reporting", had: false },
  { label: "Réseaux sociaux", had: true },
  { label: "Pack Office", had: true },
];

const ATS_ITEMS = [
  { t: "Format lisible par les robots", okBefore: false },
  { t: "Mots-clés métier présents", okBefore: false },
  { t: "Titres de sections standardisés", okBefore: true },
  { t: "Coordonnées complètes", okBefore: true },
];

const C = 2 * Math.PI * 54;

export default function DemoBeforeAfter() {
  const rootRef = useRef<HTMLElement>(null);
  const gaugeRef = useRef<SVGCircleElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<Mode>("before");
  const played = useRef(false);

  /* Auto-play the transformation when scrolled into view */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = window.setTimeout(() => setMode("after"), 0);
      return () => window.clearTimeout(id);
    }
    const st = ScrollTrigger.create({
      trigger: el,
      start: "top 68%",
      once: true,
      onEnter: () => {
        if (played.current) return;
        played.current = true;
        gsap.delayedCall(1.25, () => setMode("after"));
      },
    });
    return () => st.kill();
  }, []);

  /* Animate on every mode switch */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-swap]",
        { opacity: 0.15, y: 10 },
        { opacity: 1, y: 0, duration: 0.65, stagger: 0.06, ease: "power3.out" }
      );

      const target = mode === "after" ? 94 : 61;
      const numEl = scoreRef.current;
      if (numEl) {
        const obj = { v: parseInt(numEl.textContent || "61", 10) };
        gsap.to(obj, {
          v: target,
          duration: 1.05,
          ease: "power2.inOut",
          onUpdate: () => {
            numEl.textContent = `${Math.round(obj.v)}%`;
          },
        });
      }
      if (gaugeRef.current) {
        gsap.to(gaugeRef.current, {
          attr: { "stroke-dashoffset": C * (1 - target / 100) },
          duration: 1.05,
          ease: "power2.inOut",
        });
      }

      gsap.fromTo(
        ".kw-chip.is-added",
        { scale: 0.72, opacity: 0.35 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.45,
          stagger: 0.045,
          ease: "back.out(2.2)",
          clearProps: "transform,opacity",
        }
      );
    }, rootRef);

    return () => ctx.revert();
  }, [mode]);

  const isAfter = mode === "after";

  return (
    <section id="demo" ref={rootRef} className="section-pad relative">
      <div
        className="aurora"
        style={{
          width: 640,
          height: 640,
          left: "-220px",
          top: "12%",
          background: "rgba(143,123,255,0.09)",
        }}
        aria-hidden="true"
      />
      <div className="container-x relative">
        <SectionHead
          eyebrow="La preuve par l'exemple"
          title={
            <>
              Regardez ce que Cible fait{" "}
              <span className="grad-text">à un vrai CV.</span>
            </>
          }
          sub="Camille, 21 ans, cherche une alternance en marketing digital. Voici son CV avant et après calibrage sur une offre réelle — passez la souris, cliquez, comparez."
        />

        {/* Controls */}
        <div
          className="mt-14 flex flex-wrap items-center justify-between gap-4"
          data-reveal
        >
          <div className="seg" role="group" aria-label="Comparer le CV avant et après optimisation">
            <button
              type="button"
              className={`seg-btn seg-before ${!isAfter ? "active" : ""}`}
              aria-pressed={!isAfter}
              onClick={() => setMode("before")}
            >
              ← Avant
            </button>
            <button
              type="button"
              className={`seg-btn ${isAfter ? "active" : ""}`}
              aria-pressed={isAfter}
              onClick={() => setMode("after")}
            >
              Après →
            </button>
          </div>
          <span className="chip">
            offre analysée · chargé(e) marketing digital — L&apos;Oréal, alternance
          </span>
        </div>

        {/* Panel */}
        <div className="mt-6 grid lg:grid-cols-[1.18fr_0.82fr] gap-5 items-start">
          {/* ── CV paper ── */}
          <article className="cv-paper card-spot relative" data-reveal style={{ ["--rd" as string]: 1 }}>
            <header className="flex items-center gap-4 pb-5 border-b border-line">
              <span
                className="w-12 h-12 rounded-full grid place-items-center font-mono text-xs font-semibold text-[#06251a] shrink-0"
                style={{ background: "linear-gradient(135deg,#8ff5d5,#4fe3b2)" }}
                aria-hidden="true"
              >
                CD
              </span>
              <div>
                <p className="doc-name">Camille Dubois</p>
                <p className="doc-role">
                  Étudiante M1 marketing — en recherche d&apos;alternance
                </p>
              </div>
              <p className="ml-auto hidden sm:block font-mono text-[0.62rem] leading-relaxed text-muted text-right">
                camille.dubois@mail.fr
                <br />
                Paris 11ᵉ · 06 12 34 56 78
              </p>
            </header>

            <div data-swap>
              <p className="doc-sec-label mt-5">Profil</p>
              {isAfter ? (
                <p className="doc-text">
                  M1 Marketing, spécialisée <mark className="add">SEO &amp; contenu</mark>.
                  Créatrice d&apos;un blog à <mark className="add">8 000 lecteurs/mois</mark>,
                  je cherche une alternance pour mettre mes compétences de{" "}
                  <mark className="add">rédaction web</mark> et d&apos;
                  <mark className="add">analyse d&apos;audience</mark> au service d&apos;une marque.
                </p>
              ) : (
                <p className="doc-text">
                  À la recherche d&apos;une première expérience dans le marketing.
                  Motivée, sérieuse et curieuse.
                </p>
              )}
            </div>

            <div data-swap>
              <p className="doc-sec-label mt-5">Expériences</p>

              <div className="space-y-3.5">
                <div>
                  <p className="text-[0.88rem] font-semibold text-white">
                    Créatrice du blog « Camille à Paris »{" "}
                    <span className="font-normal text-muted">· 2023 → aujourd&apos;hui</span>
                  </p>
                  {isAfter ? (
                    <p className="doc-text mt-0.5">
                      Rédaction de <mark className="add">3 articles optimisés SEO par semaine</mark>,{" "}
                      <mark className="add">+240 % de trafic organique</mark> en un an,{" "}
                      suivi <mark className="add">Google Analytics</mark> et stratégie éditoriale.
                    </p>
                  ) : (
                    <p className="doc-text mt-0.5">
                      Partage de bons plans parisiens et de photos.
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[0.88rem] font-semibold text-white">
                    Trésorière du BDE — Lycée Voltaire{" "}
                    <span className="font-normal text-muted">· 2023–2024</span>
                  </p>
                  {isAfter ? (
                    <p className="doc-text mt-0.5">
                      Budget de 18 k€ suivi sur tableur, <mark className="add">reporting mensuel</mark>{" "}
                      au bureau et pilotage de <mark className="add">4 campagnes événementielles</mark>.
                    </p>
                  ) : (
                    <p className="doc-text mt-0.5">
                      Aide à la gestion du budget de l&apos;association.
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[0.88rem] font-semibold text-white">
                    Serveuse — Le Petit Bistrot{" "}
                    <span className="font-normal text-muted">· été 2023</span>
                  </p>
                  {isAfter ? (
                    <p className="doc-text mt-0.5">
                      <mark className="add">Relation client</mark> sur des services de 80 couverts,{" "}
                      <mark className="add">travail en équipe</mark> et gestion des priorités en salle.
                    </p>
                  ) : (
                    <p className="doc-text mt-0.5">
                      Service en salle et encaissement.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div data-swap>
              <p className="doc-sec-label mt-5">Compétences</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {OFFER_KW.map((k) => {
                  const added = isAfter && !k.had;
                  return (
                    <span key={k.label} className={`kw-chip ${added ? "is-added" : k.had ? "" : "opacity-60"}`}>
                      {added ? `${k.label} +` : k.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </article>

          {/* ── Analysis panel ── */}
          <aside className="flex flex-col gap-5">
            <div className="glass-card p-6 flex items-center gap-6" data-reveal style={{ ["--rd" as string]: 2 }}>
              <div className="relative w-[132px] h-[132px] shrink-0">
                <svg viewBox="0 0 132 132" width="132" height="132" role="img" aria-label={`Score de compatibilité : ${isAfter ? 94 : 61} pourcent`}>
                  <defs>
                    <linearGradient id="demo-g" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#ffc46b" />
                      <stop offset="0.55" stopColor="#4fe3b2" />
                      <stop offset="1" stopColor="#8f7bff" />
                    </linearGradient>
                  </defs>
                  <circle className="gauge-track" cx="66" cy="66" r="54" />
                  <circle
                    ref={gaugeRef}
                    className="gauge-ring"
                    cx="66" cy="66" r="54"
                    stroke="url(#demo-g)"
                    strokeDasharray={C}
                    transform="rotate(-90 66 66)"
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center">
                  <span ref={scoreRef} className="gauge-num grad-text">61%</span>
                </div>
              </div>
              <div>
                <p className="mono-label">Compatibilité offre</p>
                <p className="mt-2 text-sm leading-relaxed text-text-dim">
                  {isAfter ? (
                    <>Calibrage réussi : votre CV parle désormais la langue de cette offre.</>
                  ) : (
                    <>
                      Le CV original passe sous les filtres de{" "}
                      <strong className="text-amber font-semibold">9 offres sur 10</strong>.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="glass-card p-6" data-reveal style={{ ["--rd" as string]: 3 }}>
              <p className="mono-label mb-4">Contrôle ATS automatique</p>
              <ul>
                {ATS_ITEMS.map((item) => {
                  const done = isAfter || item.okBefore;
                  return (
                    <li key={item.t} className={`ats-item ${done ? "done" : "pending"}`}>
                      <span className="ats-tick">
                        <svg viewBox="0 0 12 12"><path d="M2 6.2 4.8 9 10 3.4" /></svg>
                      </span>
                      {item.t}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div
              className="rounded-xl border border-[rgba(79,227,178,0.3)] bg-[rgba(79,227,178,0.05)] p-5"
              data-reveal
              style={{ ["--rd" as string]: 4 }}
            >
              <p className="text-sm leading-relaxed text-text-dim flex gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--mint)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                  <path d="M12 3l7.5 3v5.5c0 4.5-3.2 7.8-7.5 9.5-4.3-1.7-7.5-5-7.5-9.5V6L12 3Z" />
                  <path d="M8.8 12l2.2 2.2 4.2-4.4" />
                </svg>
                <span>
                  <strong className="text-white font-semibold">Transparence totale.</strong>{" "}
                  Chaque mot vient du parcours réel de Camille — blog, BDE, job étudiant.
                  Rien n&apos;est inventé, tout est vérifiable ligne par ligne.
                </span>
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
