"use client";

import { useRef, type CSSProperties } from "react";
import { useLang } from "@/lib/i18n";

const TESTIMONIALS = [
  { key: "1", initials: "LM", bg: "#0b6b4f" },
  { key: "2", initials: "KB", bg: "#c97a26" },
  { key: "3", initials: "SR", bg: "#3f5ec7" },
  { key: "4", initials: "TD", bg: "#17150f" },
];

export default function Testimonials() {
  const { t, lang } = useLang();
  const rowRef = useRef<HTMLDivElement>(null);

  const scrollByCard = (dir: 1 | -1) => {
    const el = rowRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(".t-card");
    const w = card ? card.offsetWidth + 18 : 380;
    el.scrollBy({ left: dir * w, behavior: "smooth" });
  };

  return (
    <section id="temoignages" className="section-pad">
      <div className="container-x">
        <header className="section-head" data-reveal>
          <span className="eyebrow">{t("testi.eyebrow")}</span>
          <h2 className="section-title text-balance">{t("testi.title")}</h2>
        </header>

        <div ref={rowRef} className="t-row no-scrollbar">
          {TESTIMONIALS.map((p, i) => (
            <article
              key={p.key}
              className="card t-card"
              data-reveal
              style={{ "--rd": i } as CSSProperties}
            >
              <span className="t-quote-mark" aria-hidden="true">
                &ldquo;
              </span>
              <div className="stars" aria-label="5 étoiles">
                ★★★★★
              </div>
              <p className="t-quote">{t(`t${p.key}.q`)}</p>
              <footer className="t-foot">
                <span
                  className="rc-avatar"
                  style={{ background: p.bg }}
                  aria-hidden="true"
                >
                  {p.initials}
                </span>
                <span>
                  <span className="t-name block">{t(`t${p.key}.name`)}</span>
                  <span className="t-role block">{t(`t${p.key}.role`)}</span>
                </span>
                <span className="t-chip">{t(`t${p.key}.chip`)}</span>
              </footer>
            </article>
          ))}
        </div>

        <div className="t-nav">
          <button
            type="button"
            className="t-btn"
            onClick={() => scrollByCard(-1)}
            aria-label={lang === "en" ? "Previous testimonials" : "Témoignages précédents"}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="t-btn"
            onClick={() => scrollByCard(1)}
            aria-label={lang === "en" ? "Next testimonials" : "Témoignages suivants"}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
