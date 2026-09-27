"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";

/* Cinematic sticky hero - "Mostar" architecture adapted to Cible:
   a fixed-rig stage (100vh + 620px of scroll) where the story plays:
   act 1 the CV sheet splits in two, act 2 offer keywords glow gold,
   act 3 a constellation of skills forms, act 4 a golden door opens.
   Vanilla engine only: CSS custom properties written inside rAF. */

const NODES: [number, number][] = [
  [80, 120], [200, 60], [320, 110], [60, 240], [190, 200],
  [330, 250], [110, 330], [250, 340], [200, 20],
];
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4],
  [4, 5], [3, 6], [4, 7], [5, 7], [6, 7], [1, 8],
];

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const smoothstep = (e0: number, e1: number, v: number) => {
  const x = clamp((v - e0) / (e1 - e0));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const segIO = (s: number, a: number, b: number, c: number, d: number) => {
  const enter = smoothstep(a, b, s);
  const exit = smoothstep(c, d, s);
  return { enter, exit, active: enter * (1 - exit) };
};

export default function HeroCinema() {
  const { t } = useLang();
  const sectionRef = useRef<HTMLElement>(null);
  const linesRef = useRef<SVGGElement>(null);
  const nodesRef = useRef<SVGGElement>(null);

  useEffect(() => {
    /* Constellation SVG built client-side (no SSR mismatch). */
    const lG = linesRef.current;
    const nG = nodesRef.current;
    if (lG && nG) {
      EDGES.forEach(([a, b]) => {
        const [x1, y1] = NODES[a];
        const [x2, y2] = NODES[b];
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(x1));
        line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2));
        line.setAttribute("y2", String(y2));
        lG.appendChild(line);
      });
      NODES.forEach(([x, y]) => {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", String(x));
        c.setAttribute("cy", String(y));
        c.setAttribute("r", String(3 + Math.random() * 3));
        nG.appendChild(c);
      });
    }

    const el = sectionRef.current;
    if (!el) return;

    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let targetMX = 0;
    let targetMY = 0;
    let mx = 0;
    let my = 0;
    let initialized = false;
    let rafPending = false;
    let rafId = 0;

    const set = (k: string, v: string | number) => el.style.setProperty(k, String(v));

    /* Smoothed scroll distance (px), shared across frames. */
    let curS = 0;

    /* All choreography for one scroll distance s (px, 0..620).
       Compact timeline: the whole story plays in ~2/3 of a screenful. */
    const applyState = (s: number) => {
      const introExit = smoothstep(15, 200, s);
      const paper = segIO(s, 25, 100, 250, 330);
      const kw = segIO(s, 95, 165, 225, 280);
      const net = segIO(s, 255, 340, 505, 580);
      /* The door opens and STAYS open: the next section slides over it. */
      const doorE = smoothstep(455, 530, s);
      const goldMix = smoothstep(240, 350, s);
      const blurA = clamp(paper.active + net.active);
      const drift = Math.pow(paper.enter, 1.4);

      set("--c-mx", mx.toFixed(4));
      set("--c-my", my.toFixed(4));

      set("--c-title-y", `${(-190 * introExit).toFixed(1)}px`);
      set("--c-title-s", (1 - 0.07 * introExit).toFixed(4));
      set("--c-title-o", (1 - introExit).toFixed(4));
      set("--c-intro-y", `${(84 * introExit).toFixed(1)}px`);
      set("--c-intro-o", (1 - introExit).toFixed(4));
      set("--c-cue-o", (1 - introExit).toFixed(3));

      set("--c-pl-x", `calc(-50% + ${(-34 * drift).toFixed(2)}vw)`);
      set("--c-pr-x", `calc(-50% + ${(34 * drift).toFixed(2)}vw)`);
      set("--c-paper-y", `${(-(150 * drift) - 110 * net.enter).toFixed(1)}px`);
      set("--c-pl-r", `${(-8 * drift).toFixed(2)}deg`);
      set("--c-pr-r", `${(8 * drift).toFixed(2)}deg`);
      set("--c-paper-s", (1 + 0.3 * paper.enter).toFixed(4));
      set("--c-paper-o", (1 - net.enter * 0.95).toFixed(4));

      set("--c-kw", kw.active.toFixed(4));

      set("--c-const-o", Math.min(1, net.active + doorE * 0.15).toFixed(4));
      set("--c-const-s", (1.04 + net.enter * 0.08 + net.exit * 0.08).toFixed(4));

      set("--c-arch-o", doorE.toFixed(4));
      set("--c-arch-y", `${((1 - doorE) * 18).toFixed(1)}px`);
      set("--c-arch-s", (0.94 + 0.06 * doorE).toFixed(4));

      set("--c-shade", clamp(goldMix * 0.85 + blurA * 0.15).toFixed(4));
      set("--c-blur-px", `${(blurA * 10).toFixed(1)}px`);
      set("--c-bright", (1 - blurA * 0.07).toFixed(4));

      /* Act captions. */
      set("--c-cap-kw-o", (kw.active * (1 - net.enter)).toFixed(4));
      set("--c-cap-net-o", (net.active * (1 - doorE)).toFixed(4));
      set("--c-cap-arch-o", doorE.toFixed(4));
    };

    const tick = () => {
      rafPending = false;
      const rect = el.getBoundingClientRect();
      const dist = Math.max(el.offsetHeight - window.innerHeight, 1);
      const target = clamp(-rect.top / dist) * dist;
      if (!initialized || reduceMq.matches) {
        curS = target;
        initialized = true;
      } else {
        curS = lerp(curS, target, 0.14);
        if (Math.abs(curS - target) < 0.08) curS = target;
      }
      mx = lerp(mx, targetMX, 0.12);
      my = lerp(my, targetMY, 0.12);
      if (reduceMq.matches) {
        mx = 0;
        my = 0;
      }
      applyState(curS);
      const busyScroll = Math.abs(curS - target) > 0.08;
      const busyMouse =
        Math.abs(mx - targetMX) > 0.001 || Math.abs(my - targetMY) > 0.001;
      if ((busyScroll || busyMouse) && !reduceMq.matches) {
        rafId = requestAnimationFrame(tick);
        rafPending = true;
      }
    };

    const requestTick = () => {
      if (!rafPending) {
        rafPending = true;
        rafId = requestAnimationFrame(tick);
      }
    };
    const onPointer = (e: PointerEvent) => {
      targetMX = e.clientX / window.innerWidth - 0.5;
      targetMY = e.clientY / window.innerHeight - 0.5;
      requestTick();
    };
    const onResize = () => requestTick();

    window.addEventListener("scroll", requestTick, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });

    if (reduceMq.matches) {
      const rect = el.getBoundingClientRect();
      const dist = Math.max(el.offsetHeight - window.innerHeight, 1);
      applyState(clamp(-rect.top / dist) * dist);
    } else {
      requestTick();
    }
    const onMqChange = () => {
      initialized = false;
      requestTick();
    };
    reduceMq.addEventListener?.("change", onMqChange);

    return () => {
      cancelAnimationFrame(rafId);
      rafPending = false;
      window.removeEventListener("scroll", requestTick);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      reduceMq.removeEventListener?.("change", onMqChange);
    };
  }, []);

  return (
    <section ref={sectionRef} id="top" className="cinema" aria-label="Cible">
      <div className="cs-stage">
        <div className="cs-world">
          <div className="cs-sky" aria-hidden="true" />
          <div className="cs-halo" aria-hidden="true" />

          <div className="cs-paper cs-pl" aria-hidden="true">
            <div className="cs-paper-head">Camille Dubois</div>
            <div className="cs-paper-sub">Chef de projet digital</div>
            <div className="cs-paper-rule" />
            <div className="cs-paper-section">Experience</div>
            <div className="cs-line" style={{ width: "86%" }} />
            <div className="cs-line cs-hl" style={{ width: "68%" }} />
            <div className="cs-line" style={{ width: "78%" }} />
          </div>
          <div className="cs-paper cs-pr" aria-hidden="true">
            <div className="cs-paper-section">Competences</div>
            <div className="cs-line cs-hl" style={{ width: "72%" }} />
            <div className="cs-line" style={{ width: "58%" }} />
            <div className="cs-paper-rule" />
            <div className="cs-paper-section">Formation</div>
            <div className="cs-line" style={{ width: "80%" }} />
          </div>

          <div className="cs-const" aria-hidden="true">
            <svg viewBox="0 0 400 400">
              <g ref={linesRef} />
              <g ref={nodesRef} />
            </svg>
          </div>

          <div className="cs-arch" aria-hidden="true" />
          <div className="cs-shade" aria-hidden="true" />
        </div>

        <h1 className="cs-title">CIBLE</h1>

        <p className="cs-cap cs-cap-kw">{t("cine.cap.kw")}</p>
        <p className="cs-cap cs-cap-net">{t("cine.cap.net")}</p>
        <p className="cs-cap cs-cap-arch">{t("cine.cap.arch")}</p>

        <div className="cs-intro">
          <span className="cs-kicker">{t("cine.kicker")}</span>
          <p className="cs-sub">{t("cine.sub")}</p>
          <div className="cs-pills" aria-label="Cible highlights">
            <span>{t("cine.pill.cv")}</span>
            <span>{t("cine.pill.ats")}</span>
            <span>{t("cine.pill.letter")}</span>
          </div>
          <div className="cs-actions">
            <Link href="/inscription" className="btn-primary">
              {t("cine.cta.primary")}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M2 8h11M9 3.5 13.5 8 9 12.5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <a href="#demo" className="btn-ghost">
              {t("cine.cta.demo")}
            </a>
          </div>
        </div>

        <div className="cs-cue" aria-hidden="true">
          {t("cine.cue")}
          <span className="cs-cue-line" />
        </div>
      </div>
    </section>
  );
}
