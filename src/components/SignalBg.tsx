"use client";

import { useEffect, useRef } from "react";

/* Décor narratif piloté par le scroll — 4 actes :
   1 (4–34 %)  la feuille de CV se fend en deux
   2 (16–42 %) les mots-clés s'illuminent doré
   3 (36–70 %) feuilles effacées, constellation au centre
   4 (66 %→fin) arche de lumière, ambiance dorée jusqu'en bas
   100 % vanilla : custom properties CSS écrites en rAF. */

const NODES: [number, number][] = [
  [80, 120], [200, 60], [320, 110], [60, 240], [190, 200],
  [330, 250], [110, 330], [250, 340], [200, 20],
];
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4],
  [4, 5], [3, 6], [4, 7], [5, 7], [6, 7], [1, 8],
];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smoothstep = (e0: number, e1: number, v: number) => {
  const x = clamp((v - e0) / (e1 - e0));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (f: number, a: number, b: number, c: number, d: number) => {
  const enter = smoothstep(a, b, f);
  const exit = smoothstep(c, d, f);
  return { enter, exit, active: enter * (1 - exit) };
};

export default function SignalBg() {
  const linesRef = useRef<SVGGElement>(null);
  const nodesRef = useRef<SVGGElement>(null);

  useEffect(() => {
    /* Constellation construite côté client (pas de mismatch SSR). */
    const lG = linesRef.current;
    const nG = nodesRef.current;
    if (!lG || !nG) return;

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

    const root = document.documentElement;
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");

    const set = (k: string, v: string | number) => root.style.setProperty(k, String(v));

    /* Écrit toutes les custom properties pour une fraction f du scroll. */
    const applyState = (f: number) => {
      const paper = seg(f, 0.04, 0.14, 0.26, 0.34);
      const kw = seg(f, 0.16, 0.26, 0.34, 0.42);
      const net = seg(f, 0.36, 0.46, 0.62, 0.7);
      const door = seg(f, 0.66, 0.78, 0.94, 1.0);
      const blurActive = clamp(paper.active + net.active);
      const goldMix = smoothstep(0.36, 0.46, f);
      const drift = Math.pow(paper.enter, 1.4);

      set("--sb-void-scale", 1 + f * 0.25);
      set("--sb-void-brightness", 1 - blurActive * 0.12);
      set("--sb-blur-px", `${blurActive * 8}px`);
      set("--sb-orbit-y", `${8 + f * 30}vh`);
      set("--sb-orbit-scale", 0.8 + f * 0.4);
      set("--sb-shade-r", Math.round(lerp(250, 236, goldMix)));
      set("--sb-shade-g", Math.round(lerp(246, 216, goldMix)));
      set("--sb-shade-b", Math.round(lerp(238, 178, goldMix)));
      set("--sb-shade-alpha", 0.14 + blurActive * 0.42);

      set("--sb-paper-left-x", `calc(-50% + ${-drift * 40}vw)`);
      set("--sb-paper-left-y", `${-drift * 120 - net.enter * 90}px`);
      set("--sb-paper-left-rot", `${-drift * 7}deg`);
      set("--sb-paper-left-scale", 1 + paper.enter * 0.28);
      set("--sb-paper-right-x", `calc(-50% + ${drift * 40}vw)`);
      set("--sb-paper-right-y", `${-drift * 120 - net.enter * 90}px`);
      set("--sb-paper-right-rot", `${drift * 7}deg`);
      set("--sb-paper-right-scale", 1 + paper.enter * 0.28);
      set("--sb-paper-opacity", 1 - net.enter * 0.92);

      set("--sb-kw-opacity", kw.active);

      set("--sb-const-opacity", net.active + door.active * 0.15);
      set("--sb-const-scale", 1.05 + net.enter * 0.1 + net.exit * 0.1);

      set("--sb-arch-opacity", door.active);
      set("--sb-arch-y", `${16 - door.enter * 16}px`);
      set("--sb-arch-scale", 0.92 + door.enter * 0.08);
    };

    /* reduced-motion : état final statique (réseau + arche ouverte,
       ambiance dorée), aucun suivi de scroll. */
    const applyFinalStatic = () => {
      set("--sb-void-scale", 1.22);
      set("--sb-void-brightness", 1);
      set("--sb-blur-px", "0px");
      set("--sb-orbit-y", "36vh");
      set("--sb-orbit-scale", 1.18);
      set("--sb-shade-r", 238);
      set("--sb-shade-g", 218);
      set("--sb-shade-b", 182);
      set("--sb-shade-alpha", 0.3);
      set("--sb-paper-opacity", 0);
      set("--sb-kw-opacity", 1);
      set("--sb-const-opacity", 0.55);
      set("--sb-const-scale", 1.08);
      set("--sb-arch-opacity", 0.95);
      set("--sb-arch-y", "0px");
      set("--sb-arch-scale", 1);
    };

    let targetFrac = 0;
    let smoothFrac = 0;
    let initialized = false;
    let rafId = 0;
    let rafPending = false;
    let docHeight = 1;

    const measure = () => {
      docHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    };
    const tick = () => {
      rafPending = false;
      targetFrac = clamp(window.scrollY / docHeight);
      if (!initialized) {
        smoothFrac = targetFrac;
        initialized = true;
      } else {
        smoothFrac = lerp(smoothFrac, targetFrac, 0.14);
      }
      applyState(smoothFrac);
      if (Math.abs(smoothFrac - targetFrac) > 0.0008) {
        rafPending = true;
        rafId = requestAnimationFrame(tick);
      }
    };
    const queueTick = () => {
      if (reduceMq.matches) return;
      if (!rafPending) {
        rafPending = true;
        rafId = requestAnimationFrame(tick);
      }
    };
    const onResize = () => {
      measure();
      queueTick();
    };

    /* La hauteur du document change (accordéons, chargements,
       navigation client Next) → on remesure en continu mais sans coût. */
    const ro = new ResizeObserver(() => {
      measure();
      queueTick();
    });
    ro.observe(document.body);

    window.addEventListener("scroll", queueTick, { passive: true });
    window.addEventListener("resize", onResize);

    if (reduceMq.matches) {
      applyFinalStatic();
    } else {
      queueTick();
    }

    /* Bascule live si l'utilisateur change sa préférence système. */
    const onMqChange = () => {
      initialized = false;
      if (reduceMq.matches) {
        applyFinalStatic();
      } else {
        measure();
        queueTick();
      }
    };
    reduceMq.addEventListener?.("change", onMqChange);

    return () => {
      cancelAnimationFrame(rafId);
      rafPending = false;
      ro.disconnect();
      window.removeEventListener("scroll", queueTick);
      window.removeEventListener("resize", onResize);
      reduceMq.removeEventListener?.("change", onMqChange);
    };
  }, []);

  return (
    <div className="signal-bg" aria-hidden="true">
      <div className="layer void-bg" />
      <div className="layer orbit" />
      <div className="layer shade" />
      <div className="paper-half paper-left layer">
        <div className="paper-head">Camille Dubois</div>
        <div className="paper-sub">Chef de projet digital</div>
        <div className="paper-rule" />
        <div className="paper-section">Expérience</div>
        <div className="paper-line" style={{ width: "88%" }} />
        <div className="paper-line hl" style={{ width: "70%" }} />
        <div className="paper-line" style={{ width: "80%" }} />
      </div>
      <div className="paper-half paper-right layer">
        <div className="paper-section">Compétences</div>
        <div className="paper-line hl" style={{ width: "75%" }} />
        <div className="paper-line" style={{ width: "60%" }} />
        <div className="paper-rule" />
        <div className="paper-section">Formation</div>
        <div className="paper-line" style={{ width: "82%" }} />
      </div>
      <div className="arch layer" />
      <div className="constellation-wrap layer">
        <svg viewBox="0 0 400 400">
          <g ref={linesRef} />
          <g ref={nodesRef} />
        </svg>
      </div>
    </div>
  );
}
