"use client";

import { useEffect, useRef } from "react";

/** Compteur animé déclenché à l'entrée dans le viewport. */
export default function Counter({
  target,
  suffix,
  prefix,
  decimals = 0,
}: {
  target: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const render = (v: number) => {
      const formatted = new Intl.NumberFormat(
        document.documentElement.lang === "en" ? "en-US" : "fr-FR",
        { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
      ).format(v);
      el.textContent = `${prefix ?? ""}${formatted}${suffix ?? ""}`;
    };

    const run = () => {
      if (started.current) return;
      started.current = true;
      if (reduced) {
        render(target);
        return;
      }
      const start = performance.now();
      const dur = 1500;
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        render(target * eased);
        if (p < 1) requestAnimationFrame(tick);
        else render(target);
      };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target, suffix, prefix, decimals]);

  return (
    <span ref={ref}>
      {prefix}0{suffix}
    </span>
  );
}
