"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { ScrollTrigger } from "@/lib/gsap";
import { useLang } from "@/lib/i18n";

const STEPS = [
  { n: "01", t: "how.s1.t", d: "how.s1.d" },
  { n: "02", t: "how.s2.t", d: "how.s2.d" },
  { n: "03", t: "how.s3.t", d: "how.s3.d" },
  { n: "04", t: "how.s4.t", d: "how.s4.d" },
  { n: "05", t: "how.s5.t", d: "how.s5.d" },
];

export default function HowItWorks() {
  const { t } = useLang();
  const sectionRef = useRef<HTMLElement>(null);
  const railFillRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const section = sectionRef.current;
    const list = listRef.current;
    const fill = railFillRef.current;
    if (!section || !list || !fill) return;

    if (reduced) {
      fill.style.transform = "scaleY(1)";
      list.querySelectorAll(".step").forEach((s) => s.classList.add("is-active"));
      return;
    }

    /* Rail qui se remplit au fil du scroll */
    const st = ScrollTrigger.create({
      trigger: list,
      start: "top 68%",
      end: "bottom 58%",
      scrub: 0.4,
      onUpdate: (self) => {
        fill.style.setProperty("--p", String(self.progress));
      },
    });

    /* Activation pas à pas */
    const triggers = Array.from(list.querySelectorAll(".step")).map((step) =>
      ScrollTrigger.create({
        trigger: step,
        start: "top 62%",
        end: "bottom 30%",
        onEnter: () => step.classList.add("is-active"),
        onLeaveBack: () => step.classList.remove("is-active"),
      })
    );

    return () => {
      st.kill();
      triggers.forEach((tr) => tr.kill());
    };
  }, []);

  return (
    <section id="methode" className="section-pad" ref={sectionRef}>
      <div className="container-x">
        <div className="how-grid">
          <div className="how-sticky">
            <div className="rail" aria-hidden="true">
              <div ref={railFillRef} className="rail-fill" />
            </div>
            <div data-reveal>
              <span className="eyebrow">{t("how.eyebrow")}</span>
              <h2 className="section-title text-balance">{t("how.title")}</h2>
              <p className="section-sub">{t("how.sub")}</p>
            </div>
          </div>

          <div ref={listRef}>
            {STEPS.map((s, i) => (
              <article
                key={s.n}
                className={`card step${i === 0 ? " is-active" : ""}`}
                data-reveal
                style={{ "--rd": i } as CSSProperties}
              >
                <div className="step-inner">
                  <span className="step-num" aria-hidden="true">
                    {s.n}
                  </span>
                  <div>
                    <h3>{t(s.t)}</h3>
                    <p>{t(s.d)}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
