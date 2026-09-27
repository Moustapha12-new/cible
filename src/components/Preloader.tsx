"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Préchargeur : compte 0 → 100, puis glisse vers le haut.
 * Diffuse l'événement `cible:ready` pour lancer l'entrée du hero.
 */
export default function Preloader() {
  const [count, setCount] = useState(0);
  const [done, setDone] = useState(false);
  const [hidden, setHidden] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const DURATION = reduced ? 120 : 1250;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(eased * 100));
      if (rootRef.current) {
        const bar = rootRef.current.querySelector<HTMLElement>(".pre-bar i");
        if (bar) bar.style.setProperty("--p", String(eased));
      }
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDone(true);
        (window as unknown as { __cibleReady?: boolean }).__cibleReady = true;
        window.dispatchEvent(new CustomEvent("cible:ready"));
      }
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!done) return;
    document.documentElement.classList.add("is-loaded");
    const t = window.setTimeout(() => setHidden(true), 1100);
    return () => window.clearTimeout(t);
  }, [done]);

  if (hidden) return null;

  return (
    <div
      ref={rootRef}
      className={`preloader${done ? " done" : ""}`}
      aria-hidden="true"
    >
      <div className="pre-inner">
        <div className="pre-word">
          cible<span style={{ color: "var(--emerald)" }}>.</span>
        </div>
        <div className="pre-count">{String(count).padStart(3, "0")} %</div>
        <div className="pre-bar">
          <i />
        </div>
      </div>
    </div>
  );
}
