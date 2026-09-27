"use client";

import { useEffect, useRef } from "react";

/* Decorative hero-only background: a CV sheet that splits in two with a
   3D book-like opening. Left half swings first, right follows (left ->
   middle cascade). Fades out before the second screen so text stays
   readable and the rest of the page is untouched. */

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const smoothstep = (e0: number, e1: number, v: number) => {
  const x = clamp((v - e0) / (e1 - e0));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function HeroPaperBg() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const l = leftRef.current;
    const r = rightRef.current;
    if (!wrap || !l || !r) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let targetFrac = 0;
    let curFrac = 0;
    let initialized = false;
    let rafPending = false;
    let rafId = 0;

    /* f in [0,1] over roughly one screenful of scroll. */
    const apply = (f: number) => {
      const enterL = smoothstep(0.04, 0.42, f);
      const enterR = smoothstep(0.16, 0.58, f);
      const exit = smoothstep(0.72, 1, f);
      const dL = Math.pow(enterL * (1 - exit), 1.2);
      const dR = Math.pow(enterR * (1 - exit), 1.2);
      const fade = 1 - smoothstep(0.66, 0.98, f);

      l.style.transform =
        `translate3d(${(-dL * 4.5).toFixed(2)}vw, ${(-dL * 34).toFixed(1)}px, 0) ` +
        `rotateZ(${(-dL * 6).toFixed(2)}deg) rotateY(${(-dL * 34).toFixed(2)}deg) ` +
        `scale(${(1 + dL * 0.08).toFixed(3)})`;
      r.style.transform =
        `translate3d(${(dR * 4.5).toFixed(2)}vw, ${(-dR * 30).toFixed(1)}px, 0) ` +
        `rotateZ(${(dR * 6).toFixed(2)}deg) rotateY(${(dR * 34).toFixed(2)}deg) ` +
        `scale(${(1 + dR * 0.08).toFixed(3)})`;
      wrap.style.opacity = (0.85 * fade).toFixed(3);
    };

    const tick = () => {
      rafPending = false;
      targetFrac = clamp(window.scrollY / (window.innerHeight * 0.92));
      if (!initialized || mq.matches) {
        curFrac = targetFrac;
        initialized = true;
      } else {
        curFrac = lerp(curFrac, targetFrac, 0.14);
        if (Math.abs(curFrac - targetFrac) < 0.002) curFrac = targetFrac;
      }
      apply(curFrac);
      if (Math.abs(curFrac - targetFrac) > 0.002 && !mq.matches) {
        rafPending = true;
        rafId = requestAnimationFrame(tick);
      }
    };
    const requestTick = () => {
      if (!rafPending) {
        rafPending = true;
        rafId = requestAnimationFrame(tick);
      }
    };
    const onResize = () => requestTick();

    window.addEventListener("scroll", requestTick, { passive: true });
    window.addEventListener("resize", onResize);

    if (mq.matches) {
      apply(0);
    } else {
      requestTick();
    }
    const onMqChange = () => {
      initialized = false;
      requestTick();
    };
    mq.addEventListener?.("change", onMqChange);

    return () => {
      cancelAnimationFrame(rafId);
      rafPending = false;
      window.removeEventListener("scroll", requestTick);
      window.removeEventListener("resize", onResize);
      mq.removeEventListener?.("change", onMqChange);
    };
  }, []);

  return (
    <div ref={wrapRef} className="paperbg" aria-hidden="true">
      <div ref={leftRef} className="paperbg-half paperbg-l">
        <div className="pb-head" />
        <div className="pb-line" style={{ width: "82%" }} />
        <div className="pb-line pb-hl" style={{ width: "64%" }} />
        <div className="pb-line" style={{ width: "74%" }} />
        <div className="pb-rule" />
        <div className="pb-line" style={{ width: "68%" }} />
      </div>
      <div ref={rightRef} className="paperbg-half paperbg-r">
        <div className="pb-line pb-hl" style={{ width: "70%" }} />
        <div className="pb-line" style={{ width: "56%" }} />
        <div className="pb-rule" />
        <div className="pb-line" style={{ width: "78%" }} />
        <div className="pb-line" style={{ width: "60%" }} />
      </div>
    </div>
  );
}
