"use client";

import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

function Counter({
  to,
  decimals = 0,
  prefix = "",
  suffix = "",
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current!;
    const render = (v: number) => {
      el.textContent =
        prefix + nf.format(Number(v.toFixed(decimals))) + suffix;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      render(to);
      return;
    }

    const obj = { v: 0 };
    const st = ScrollTrigger.create({
      trigger: el,
      start: "top 88%",
      once: true,
      onEnter: () => {
        gsap.to(obj, {
          v: to,
          duration: 1.9,
          ease: "power2.out",
          onUpdate: () => render(obj.v),
        });
      },
    });
    return () => st.kill();
  }, [to, decimals, prefix, suffix]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {nf.format(to)}
      {suffix}
    </span>
  );
}

const STATS = [
  {
    value: <Counter to={3.1} decimals={1} prefix="×" />,
    label: "entretiens obtenus en moyenne après optimisation",
  },
  {
    value: <Counter to={12} suffix=" h" />,
    label: "économisées chaque semaine sur vos candidatures",
  },
  {
    value: <Counter to={94} suffix=" %" />,
    label: "de score de matching moyen atteint par nos utilisateurs",
  },
  {
    value: <Counter to={38400} />,
    label: "candidats accompagnés — du premier job à la reconversion",
  },
];

export default function Stats() {
  return (
    <section aria-label="Chiffres clés" className="section-pad !pt-6">
      <div className="container-x">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-12 border-y border-line">
          {STATS.map((s, i) => (
            <div
              key={i}
              data-reveal
              style={{ ["--rd" as string]: i }}
              className={`px-2 sm:px-8 py-10 ${
                i > 0 ? "lg:border-l lg:border-line" : ""
              } ${i % 2 === 1 ? "border-l border-line lg:border-l" : ""}`}
            >
              <p className="font-display font-bold text-[clamp(2.4rem,5vw,3.7rem)] leading-none tracking-tight grad-text">
                {s.value}
              </p>
              <p className="mt-4 text-sm text-muted leading-relaxed max-w-[240px]">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
