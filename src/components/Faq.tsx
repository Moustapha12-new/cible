"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n";

const QUESTIONS = ["q1", "q2", "q3", "q4", "q5", "q6"];

export default function Faq() {
  const { t } = useLang();
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="section-pad">
      <div className="container-x">
        <header className="section-head" data-reveal>
          <span className="eyebrow">{t("faq.eyebrow")}</span>
          <h2 className="section-title text-balance">{t("faq.title")}</h2>
        </header>

        <div data-reveal>
          {QUESTIONS.map((q, i) => {
            const open = openIdx === i;
            return (
              <div key={q} className="acc-item" data-open={open}>
                <h3>
                  <button
                    type="button"
                    className="acc-btn"
                    aria-expanded={open}
                    aria-controls={`faq-panel-${i}`}
                    id={`faq-btn-${i}`}
                    onClick={() => setOpenIdx(open ? null : i)}
                  >
                    <span className="acc-q text-balance">{t(`faq.${q}`)}</span>
                    <span className="acc-x" aria-hidden="true" />
                  </button>
                </h3>
                <div
                  id={`faq-panel-${i}`}
                  role="region"
                  aria-labelledby={`faq-btn-${i}`}
                  className="acc-panel"
                >
                  <div>
                    <p>{t(`faq.a${q.slice(1)}`)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
