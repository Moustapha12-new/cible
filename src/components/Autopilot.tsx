"use client";

import { type CSSProperties } from "react";
import { useLang } from "@/lib/i18n";
import Counter from "./Counter";

const css = (o: Record<string, string | number>) => o as CSSProperties;

const BARS = [42, 58, 36, 64, 50, 72, 46, 80, 60, 88, 68, 96];

function SideIcon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const SIDE_LINKS: { key: string; icon: string; active?: boolean }[] = [
  { key: "dash.nav.overview", icon: "M2 8.5 7.5 2l5.5 6.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8.5Z", active: true },
  { key: "dash.nav.applications", icon: "M3 2h9v11H3zM5.5 5h4M5.5 7.5h4M5.5 10h2.5" },
  { key: "dash.nav.offers", icon: "M7.5 1.5l1.8 3.8 4 .5-3 2.8.8 4-3.6-2-3.6 2 .8-4-3-2.8 4-.5 1.8-3.8Z" },
  { key: "dash.nav.recruiters", icon: "M5.5 6.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM1.5 13c0-2.2 1.8-4 4-4s4 1.8 4 4M10 3a2 2 0 0 1 0 3.5M11 9.2c1.5.4 2.5 1.8 2.5 3.3" },
  { key: "dash.nav.letters", icon: "M2 3.5h11v8H2zM2 4.5l5.5 4L13 4.5" },
];

export default function AutoPilot() {
  const { t } = useLang();

  return (
    <section id="pilotage" className="section-pad">
      <div className="container-x">
        <header className="section-head" data-reveal>
          <span className="eyebrow">{t("auto.eyebrow")}</span>
          <h2 className="section-title text-balance">{t("auto.title")}</h2>
          <p className="section-sub">{t("auto.sub")}</p>
        </header>

        <div className="app-window" data-reveal>
          {/* Chrome */}
          <div className="win-chrome" aria-hidden="true">
            <span className="win-dot" style={{ background: "#e8b4a4" }} />
            <span className="win-dot" style={{ background: "#ecd9a8" }} />
            <span className="win-dot" style={{ background: "#b5d4bc" }} />
            <span className="win-url">app.cible.fr — tableau de bord</span>
            <span style={{ width: 44 }} />
          </div>

          <div className="app-body">
            {/* Barre latérale */}
            <nav className="side-nav no-scrollbar" aria-label="Navigation du tableau de bord">
              {SIDE_LINKS.map((l) => (
                <span key={l.key} className={`side-link${l.active ? " active" : ""}`}>
                  <SideIcon d={l.icon} />
                  {t(l.key)}
                </span>
              ))}
              <div className="side-user">
                <span
                  className="rc-avatar"
                  style={{ background: "#0b6b4f", width: 30, height: 30 }}
                  aria-hidden="true"
                >
                  CD
                </span>
                Camille D.
              </div>
            </nav>

            {/* Contenu principal */}
            <div className="main-col">
              <div>
                <p className="main-title">{t("dash.greeting")}</p>
                <p className="main-date">Semaine 34 · Paris</p>
              </div>

              <div className="stat-grid">
                <div className="stat-tile">
                  <b>
                    <Counter target={128} />
                  </b>
                  <span>{t("dash.stat.sent")}</span>
                  <em className="trend not-italic block" style={{ marginTop: 4 }}>
                    ▲ 12 %
                  </em>
                </div>
                <div className="stat-tile">
                  <b>
                    <Counter target={31} suffix=" %" />
                  </b>
                  <span>{t("dash.stat.replies")}</span>
                  <em className="trend not-italic block" style={{ marginTop: 4 }}>
                    ▲ 6 pts
                  </em>
                </div>
                <div className="stat-tile">
                  <b>
                    <Counter target={9} />
                  </b>
                  <span>{t("dash.stat.interviews")}</span>
                  <em className="trend not-italic block" style={{ marginTop: 4 }}>
                    ▲ 3
                  </em>
                </div>
                <div className="stat-tile">
                  <b>
                    <Counter target={46} suffix=" h" />
                  </b>
                  <span>{t("dash.stat.time")}</span>
                  <em className="trend not-italic block" style={{ marginTop: 4 }}>
                    ce mois-ci
                  </em>
                </div>
              </div>

              <div className="dash-cols">
                {/* Graphique + pipeline */}
                <div className="flex flex-col gap-3 min-w-0">
                  <div className="dash-panel" data-reveal>
                    <p className="module-title" style={{ marginBottom: ".8rem" }}>
                      {t("dash.chart.title")}
                    </p>
                    <div className="bars" aria-hidden="true">
                      {BARS.map((h, i) => (
                        <i key={i} style={css({ "--h": h, "--i": i })} />
                      ))}
                    </div>
                    <div className="chart-x" aria-hidden="true">
                      <span>S23</span>
                      <span>S26</span>
                      <span>S29</span>
                      <span>S32</span>
                      <span>S35</span>
                    </div>
                  </div>

                  <div className="dash-panel">
                    <p className="pipe-row" style={{ borderTop: 0, paddingTop: 0 }}>
                      <span>
                        <b>{t("dash.pipe.company1")}</b>
                        <small>{t("dash.pipe.role1")}</small>
                      </span>
                      <span className="pill pill--wait">
                        {t("dash.pill.interview")}
                      </span>
                    </p>
                    <p className="pipe-row">
                      <span>
                        <b>{t("dash.pipe.company2")}</b>
                        <small>{t("dash.pipe.role2")}</small>
                      </span>
                      <span className="pill pill--info">{t("dash.pill.sent")}</span>
                    </p>
                    <p className="pipe-row">
                      <span>
                        <b>{t("dash.pipe.company3")}</b>
                        <small>{t("dash.pipe.role3")}</small>
                      </span>
                      <span className="pill pill--ok">{t("dash.pill.offer")}</span>
                    </p>
                    <p className="pipe-row" style={{ paddingBottom: 0 }}>
                      <span>
                        <b>{t("dash.pipe.company4")}</b>
                        <small>{t("dash.pipe.role4")}</small>
                      </span>
                      <span className="pill pill--wait">{t("dash.pill.waiting")}</span>
                    </p>
                  </div>
                </div>

                {/* Recruteurs + lettre */}
                <div className="flex flex-col gap-3 min-w-0">
                  <div className="dash-panel">
                    <p className="module-title" style={{ marginBottom: ".4rem" }}>
                      {t("dash.recruiter.title")}
                    </p>
                    <div className="recruiter-row">
                      <span className="rc-avatar" style={{ background: "#c97a26" }} aria-hidden="true">
                        MR
                      </span>
                      <span>
                        <b style={{ fontSize: ".84rem", fontWeight: 600 }}>Marie R.</b>
                        <small style={{ display: "block", color: "var(--muted)", fontSize: ".72rem" }}>
                          Talent Acquisition · Maison Lemoine
                        </small>
                      </span>
                      <button type="button" className="rc-mail">
                        {t("dash.recruiter.btn")}
                      </button>
                    </div>
                    <div className="recruiter-row">
                      <span className="rc-avatar" style={{ background: "#3f5ec7" }} aria-hidden="true">
                        JL
                      </span>
                      <span>
                        <b style={{ fontSize: ".84rem", fontWeight: 600 }}>Jules L.</b>
                        <small style={{ display: "block", color: "var(--muted)", fontSize: ".72rem" }}>
                          CTO · Studio Vireo
                        </small>
                      </span>
                      <button type="button" className="rc-mail">
                        {t("dash.recruiter.btn")}
                      </button>
                    </div>
                  </div>

                  <div className="letter-mini">
                    <p className="mono-label" style={{ marginBottom: ".3rem" }}>
                      {t("dash.nav.letters")}
                    </p>
                    <p style={{ fontSize: ".86rem", fontWeight: 550 }}>{t("dash.letter.card")}</p>
                    <a href="#cta">
                      {t("dash.letter.cta")}
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="auto-trust" data-reveal>
          <svg width="17" height="17" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <path d="M11 2 4 5v5c0 4.6 3 8.4 7 10 4-1.6 7-5.4 7-10V5l-7-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="m7.8 10.8 2.3 2.3 4.1-4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("auto.trust")}
        </p>
      </div>
    </section>
  );
}
