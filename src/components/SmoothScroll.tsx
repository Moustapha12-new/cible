"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { ScrollTrigger } from "@/lib/gsap";

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}

export default function SmoothScroll() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ── Lenis smooth scrolling ─────────────────────────────── */
    let lenis: Lenis | undefined;
    let rafId = 0;

    if (!reduced) {
      lenis = new Lenis({
        lerp: 0.11,
        wheelMultiplier: 1,
        touchMultiplier: 1.4,
      });
      window.__lenis = lenis;
      lenis.on("scroll", ScrollTrigger.update);
      const raf = (time: number) => {
        lenis!.raf(time);
        rafId = requestAnimationFrame(raf);
      };
      rafId = requestAnimationFrame(raf);
    }

    /* ── Anchor navigation ──────────────────────────────────── */
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const link = target?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!link) return;
      const hash = link.getAttribute("href");
      if (!hash || hash === "#") return;
      const el = document.querySelector(hash);
      if (!el) return;
      e.preventDefault();
      if (lenis && !reduced) {
        lenis.scrollTo(el as HTMLElement, { offset: -84, duration: 1.35 });
      } else {
        (el as HTMLElement).scrollIntoView();
      }
      history.replaceState(null, "", hash);
    };
    document.addEventListener("click", onClick);

    /* ── Generic reveal-on-view ([data-reveal]) ─────────────── */
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));

    /* ── Refresh triggers once everything is laid out ───────── */
    const t = window.setTimeout(() => ScrollTrigger.refresh(), 350);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(t);
      document.removeEventListener("click", onClick);
      io.disconnect();
      lenis?.destroy();
      window.__lenis = undefined;
    };
  }, []);

  return null;
}
