"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useLang } from "@/lib/i18n";

const css = (o: Record<string, string | number>) => o as CSSProperties;

const ATS_ITEMS = [
  { fr: "Mots-clés de l'offre présents", en: "Offer keywords present" },
  { fr: "Titre du poste aligné", en: "Job title aligned" },
  { fr: "Compétences techniques explicites", en: "Explicit technical skills" },
  { fr: "Format lisible par les robots", en: "Machine-readable format" },
  { fr: "Résultats chiffrés mis en avant", en: "Quantified results highlighted" },
  { fr: "Sections dans le bon ordre", en: "Sections in the right order" },
];

const KW_ADDED = ["React", "Agile", "SEO", "E-commerce", "KPI", "Roadmap"];
const KW_BASE = ["Gestion de projet", "Communication", "Excel"];

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M11 2 4 5v5c0 4.6 3 8.4 7 10 4-1.6 7-5.4 7-10V5l-7-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m7.8 10.8 2.3 2.3 4.1-4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DemoSection() {
  const { t, lang } = useLang();
  const [mode, setMode] = useState<"before" | "after">("before");
  const [typedLen, setTypedLen] = useState(0);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [displayVal, setDisplayVal] = useState(47);

  const shellRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(47);
  const rafRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const userTouched = useRef(false);
  const startedRef = useRef(false);

  const jdText = t("demo.jd.text");
  const atsItems = ATS_ITEMS.map((i) => (lang === "en" ? i.en : i.fr));

  /* ── Animation du chiffre du score ── */
  const tweenTo = useCallback((target: number) => {
    cancelAnimationFrame(rafRef.current);
    const from = valueRef.current;
    const start = performance.now();
    const dur = 950;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (target - from) * eased);
      valueRef.current = v;
      setDisplayVal(v);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const switchTo = useCallback(
    (next: "before" | "after") => {
      userTouched.current = true;
      setMode(next);
      tweenTo(next === "after" ? 94 : 47);
    },
    [tweenTo]
  );

  /* ── Séquence auto : offre tapée → analyse → bascule « après » ── */
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let typeTimer = 0;
    const schedule = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      timersRef.current.push(id);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || startedRef.current) return;
        startedRef.current = true;
        io.disconnect();

        if (reduced) {
          setTypedLen(jdText.length);
          setAnalysisDone(true);
          return;
        }

        /* Frappe de l'offre */
        let i = 0;
        const step = () => {
          i += 2;
          setTypedLen(Math.min(i, jdText.length));
          if (i < jdText.length) {
            typeTimer = window.setTimeout(step, 14);
            timersRef.current.push(typeTimer);
          } else {
            setAnalysisDone(true);
            /* Puis révélation du résultat calibré */
            schedule(() => {
              if (!userTouched.current) {
                setMode("after");
                tweenTo(94);
              }
            }, 1600);
          }
        };
        schedule(step, 700);
      },
      { threshold: 0.45 }
    );
    io.observe(shell);

    return () => {
      io.disconnect();
      window.clearTimeout(typeTimer);
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
      cancelAnimationFrame(rafRef.current);
    };
  }, [jdText, tweenTo]);

  return (
    <section id="demo" className="section-pad">
      <div className="container-x">
        <header className="section-head" data-reveal>
          <span className="eyebrow">{t("demo.eyebrow")}</span>
          <h2 className="section-title text-balance">{t("demo.title")}</h2>
          <p className="section-sub">{t("demo.sub")}</p>
        </header>

        <div
          ref={shellRef}
          className={`demo-shell ${mode === "before" ? "mode-before" : "mode-after"}`}
          data-reveal
        >
          {/* Offre collée */}
          <div className="jd-box">
            <span className="jd-tag mono-label">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <rect x="1.5" y="1.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" />
                <path d="M4 6h4M4 8h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              {t("demo.jd.label")}
            </span>
            <p className="jd-text">
              {jdText.slice(0, typedLen)}
              {!analysisDone && <span className="jd-caret" aria-hidden="true" />}
            </p>
            {analysisDone && (
              <div className="jd-result">
                <ShieldIcon />
                {t("demo.analyzed")}
              </div>
            )}
          </div>

          {/* Barre de contrôle */}
          <div className="demo-head">
            <div className="seg" role="tablist" aria-label={t("demo.title")}>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "before"}
                className={`seg-btn seg-before${mode === "before" ? " active" : ""}`}
                onClick={() => switchTo("before")}
              >
                {t("demo.seg.before")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "after"}
                className={`seg-btn${mode === "after" ? " active" : ""}`}
                onClick={() => switchTo("after")}
              >
                {t("demo.seg.after")}
              </button>
            </div>
          </div>

          <div className="demo-grid">
            {/* Pile de CV */}
            <div className="cv-stack">
              <article
                className={`cv-paper${mode === "after" ? " is-hidden" : ""}`}
                aria-hidden={mode === "after"}
              >
                <p className="doc-name">Camille Durand</p>
                <p className="doc-role">Cheffe de projet digital</p>

                <p className="doc-sec-label">Expérience</p>
                <p className="doc-text">
                  Suivi de projets web et reporting hebdomadaire pour
                  différents clients.{" "}
                  <mark className="del">
                    Participation à des réunions et rédaction de comptes rendus
                    divers.
                  </mark>{" "}
                  Bonne capacité d&apos;adaptation.
                </p>

                <p className="doc-sec-label">Compétences</p>
                <div className="doc-skills kw-cloud" style={{ marginTop: 0 }}>
                  {KW_BASE.map((k) => (
                    <span key={k} className="kw-chip">
                      {k}
                    </span>
                  ))}
                </div>
              </article>

              <article
                className={`cv-paper${mode === "before" ? " is-hidden" : ""}`}
                aria-hidden={mode === "before"}
              >
                <p className="doc-name">Camille Durand</p>
                <p className="doc-role">
                  Cheffe de projet digital ·{" "}
                  <span style={{ color: "var(--emerald-strong)" }}>Chef de projet e-commerce</span>
                </p>

                <p className="doc-sec-label">Expérience</p>
                <p className="doc-text">
                  Pilotage de la refonte d&apos;une plateforme{" "}
                  <mark className="add">e-commerce</mark> en méthodologie{" "}
                  <mark className="add">Agile</mark> : coordination{" "}
                  <mark className="add">cross-team</mark>, roadmap trimestrielle
                  et <mark className="add">reporting KPI</mark> mensuel au comité
                  (+18 % de conversion).{" "}
                  <span style={{ color: "var(--emerald-strong)", fontWeight: 550 }}>
                    Chaque ajout provient de votre CV d&apos;origine.
                  </span>
                </p>

                <p className="doc-sec-label">Compétences</p>
                <div className="doc-skills kw-cloud" style={{ marginTop: 0 }}>
                  {[...KW_BASE, ...KW_ADDED].map((k, idx) => (
                    <span
                      key={`${k}-${idx}`}
                      className={`kw-chip${idx >= KW_BASE.length ? " is-added" : ""}`}
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </article>
            </div>

            {/* Modules latéraux */}
            <aside className="demo-side">
              <div className="demo-module gauge-module-wrap">
                <p className="module-title" style={{ marginBottom: ".9rem" }}>
                  {t("demo.gauge.label")}
                </p>
                <div className="gauge-module">
                  <div className="gauge-wrap" style={css({ "--v": displayVal / 100 })}>
                    <svg viewBox="0 0 104 104" aria-hidden="true">
                      <circle className="gauge-track" cx="52" cy="52" r="42" />
                      <circle className="gauge-ring" cx="52" cy="52" r="42" />
                    </svg>
                    <div className="gauge-center">
                      <span className="gauge-num">{displayVal} %</span>
                    </div>
                  </div>
                  <p className="gauge-caption">
                    <b>{mode === "before" ? t("demo.gauge.before") : t("demo.gauge.after")}</b>
                    {mode === "before"
                      ? lang === "en"
                        ? "Too generic for this offer — likely filtered."
                        : "Trop générique pour cette offre — probablement filtré."
                      : lang === "en"
                        ? "Aligned keywords, quantified results: interview range."
                        : "Mots-clés alignés, résultats chiffrés : zone d'entretien."}
                  </p>
                </div>
              </div>

              <div className="demo-module">
                <p className="module-title" style={{ marginBottom: ".5rem" }}>
                  {t("demo.ats.title")}
                </p>
                <ul>
                  {atsItems.map((label, i) => {
                    const done = mode === "after" || i < 2;
                    return (
                      <li key={label} className={`ats-item ${done ? "done" : "pending"}`}>
                        <span
                          className="ats-tick"
                          style={{ transitionDelay: mode === "after" ? `${i * 130}ms` : "0ms" }}
                          aria-hidden="true"
                        >
                          <svg viewBox="0 0 11 11">
                            <path d="m1.5 6 2.7 2.7L9.5 3" />
                          </svg>
                        </span>
                        {label}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <a href="#cta" className="btn-primary" style={{ justifyContent: "center" }}>
                {t("demo.download")}
              </a>
            </aside>
          </div>

          <p className="trace-note">
            <ShieldIcon />
            {t("demo.traceability")}
          </p>
        </div>
      </div>
    </section>
  );
}
