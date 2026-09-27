"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { useLang } from "@/lib/i18n";

const css = (o: Record<string, string | number>) => o as CSSProperties;

function IconUpload() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M11 14V3m0 0L6.5 7.5M11 3l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 15v2.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconScan() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M3 8V5a2 2 0 0 1 2-2h3M14 3h3a2 2 0 0 1 2 2v3M19 14v3a2 2 0 0 1-2 2h-3M8 19H5a2 2 0 0 1-2-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 11h8M9.5 8h3M9.5 14h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconPen() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="m13.5 4 4.5 4.5L7 19.5l-5 .5.5-5L13.5 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m11.5 6 4.5 4.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function IconShieldCheck() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M11 2 4 5v5c0 4.6 3 8.4 7 10 4-1.6 7-5.4 7-10V5l-7-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m7.8 10.8 2.3 2.3 4.1-4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconMail() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="2.5" y="4.5" width="17" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m4 7 7 5 7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconRoute() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="5.5" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="16.5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 5.5h6a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3H8a3 3 0 0 0-3 3v0a3 3 0 0 0 3 3h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

interface BentoCardProps {
  className?: string;
  icon: ReactNode;
  title: string;
  desc: string;
  rd: number;
  children: ReactNode;
}

/** Carte bento avec halo qui suit le pointeur */
function BentoCard({ className, icon, title, desc, rd, children }: BentoCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div
      ref={ref}
      className={`card card-spot bento-card ${className ?? ""}`}
      onMouseMove={onMove}
      data-reveal
      style={css({ "--rd": rd })}
    >
      <div className="bento-head">
        <span className="card-icon">{icon}</span>
        <h3>{title}</h3>
      </div>
      <p>{desc}</p>
      {children}
    </div>
  );
}

export default function Features() {
  const { t } = useLang();

  return (
    <section id="fonctionnalites" className="section-pad">
      <div className="container-x">
        <header className="section-head" data-reveal>
          <span className="eyebrow">{t("features.eyebrow")}</span>
          <h2 className="section-title text-balance">{t("features.title")}</h2>
          <p className="section-sub">{t("features.sub")}</p>
        </header>

        <div className="bento-grid">
          {/* Rangée 1 */}
          <BentoCard className="b-7" icon={<IconPen />} title={t("f3.t")} desc={t("f3.d")} rd={0}>
            <div className="mini-visual rewrite-demo" data-reveal style={css({ "--rd": 1 })}>
              <p>
                « Suivi de projets et reporting hebdomadaire,{" "}
                <mark className="del">j&apos;ai fait des trucs divers</mark>{" "}
                pour l&apos;équipe. »{" "}
                <span className="pop" style={css({ "--i": 0 })}>
                  →
                </span>{" "}
                <mark className="add pop" style={css({ "--i": 1 })}>
                  Pilotage de la refonte e-commerce : coordination cross-team,
                  reporting KPI au comité.
                </mark>
              </p>
            </div>
          </BentoCard>

          <BentoCard className="b-5" icon={<IconScan />} title={t("f2.t")} desc={t("f2.d")} rd={1}>
            <div className="mini-visual">
              <div className="jd-lines" aria-hidden="true">
                <i style={{ width: "92%" }} />
                <i style={{ width: "78%" }} />
                <i style={{ width: "85%" }} />
                <i style={{ width: "56%" }} />
              </div>
              <div className="kw-cloud">
                {["Agile", "KPI", "SEO", "Roadmap", "Cross-team", "React"].map((k, i) => (
                  <span key={k} className="kw-chip is-added pop" style={css({ "--i": i + 2 })}>
                    {k}
                  </span>
                ))}
              </div>
            </div>
          </BentoCard>

          {/* Rangée 2 */}
          <BentoCard className="b-4" icon={<IconUpload />} title={t("f1.t")} desc={t("f1.d")} rd={0}>
            <div className="mini-visual">
              <div className="drop-zone">
                <IconUpload />
                {t("features.import.dropzone")}
              </div>
              <div className="import-sources">
                {t("features.import.or")}
                <span className="src-pill">PDF</span>
                <span className="src-pill">LinkedIn</span>
              </div>
            </div>
          </BentoCard>

          <BentoCard className="b-4" icon={<IconShieldCheck />} title={t("f4.t")} desc={t("f4.d")} rd={1}>
            <div className="mini-visual score-row" data-reveal style={css({ "--rd": 1 })}>
              <span className="mini-ring" aria-hidden="true">
                <svg viewBox="0 0 76 76">
                  <circle className="mini-ring-track" cx="38" cy="38" r="30" />
                  <circle className="mini-ring-fill" cx="38" cy="38" r="30" />
                </svg>
                <b>94</b>
              </span>
              <ul className="ats-mini">
                <li>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="m2 7 3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Mots-clés présents
                </li>
                <li>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="m2 7 3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Format lisible robot
                </li>
                <li>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="m2 7 3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Résultats chiffrés
                </li>
              </ul>
            </div>
          </BentoCard>

          <BentoCard className="b-4" icon={<IconMail />} title={t("f5.t")} desc={t("f5.d")} rd={2}>
            <div className="mini-visual" data-reveal style={css({ "--rd": 1 })}>
              <p className="letter-snippet">{t("features.letter.snippet")}</p>
              <div className="letter-meta">
                <span>{t("hero.badge.letter")}</span>
                <span>12 s</span>
              </div>
            </div>
          </BentoCard>

          {/* Pleine largeur : pilotage */}
          <BentoCard className="b-12" icon={<IconRoute />} title={t("f6.t")} desc={t("f6.d")} rd={0}>
            <div className="kw-cloud" style={{ marginTop: 0 }}>
              {[t("f6.c1"), t("f6.c2"), t("f6.c3"), t("f6.c4")].map((s, i) => (
                <span key={s} className="kw-chip is-added pop" style={css({ "--i": i })}>
                  {s}
                </span>
              ))}
            </div>
          </BentoCard>
        </div>

        <div className="bonus-strip" data-reveal>
          <span className="mono-label">{t("bonus.label")}</span>
          <span className="chip">{t("bonus.interviews")}</span>
          <span className="chip">{t("bonus.salary")}</span>
          <span className="chip">{t("bonus.career")}</span>
          <span className="chip chip--mint">{t("bonus.beginner")}</span>
        </div>
      </div>
    </section>
  );
}
