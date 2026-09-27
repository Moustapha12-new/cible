"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import HeroPaperBg from "./HeroPaperBg";

const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

const AVATARS = [
  { init: "LM", bg: "#0b6b4f" },
  { init: "KB", bg: "#c97a26" },
  { init: "SR", bg: "#3f5ec7" },
  { init: "TD", bg: "#17150f" },
];

const css = (o: Record<string, string | number>) => o as React.CSSProperties;

function ArrowRight() {
  return (
    <svg className="arrow-cta" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="6.4" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.8 4.9v4.2L9.4 7 5.8 4.9Z" fill="currentColor" />
    </svg>
  );
}

export default function Hero() {
  const { t } = useLang();
  const ref = useRef<HTMLElement>(null);

  /* L'entrée démarre quand le préchargeur a fini (ou par sécurité) */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if ((window as unknown as { __cibleReady?: boolean }).__cibleReady) {
      requestAnimationFrame(() => el.classList.add("is-in"));
      return;
    }
    const onReady = () => requestAnimationFrame(() => el.classList.add("is-in"));
    window.addEventListener("cible:ready", onReady, { once: true });
    const fallback = window.setTimeout(() => el.classList.add("is-in"), 2600);
    return () => {
      window.removeEventListener("cible:ready", onReady);
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <section ref={ref} id="top" className="hero">
      {/* Fonds décoratifs */}
      <div className="hero-canvas">
        <HeroScene />
      </div>
      <div className="bg-grid absolute inset-0 z-[1]" aria-hidden="true" />
      <div className="aurora aurora--sage w-[520px] h-[520px] -left-40 top-[-120px] z-[1]" aria-hidden="true" />
      <div className="aurora aurora--sand w-[420px] h-[420px] -right-32 bottom-[-80px] z-[1]" aria-hidden="true" />
      <HeroPaperBg />

      {/* Badges flottants */}
      <div className="float-chip" style={css({ left: "6%", top: "24%", "--rot": "-2deg", "--fdel": ".6s" })} data-fade>
        <span className="fc-gauge" aria-hidden="true">
          <svg viewBox="0 0 44 44">
            <circle className="fc-gauge-track" cx="22" cy="22" r="18" />
            <circle className="fc-gauge-ring" cx="22" cy="22" r="18" />
          </svg>
          <b style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontSize: ".72rem", fontWeight: 650 }}>
            94
          </b>
        </span>
        <span>
          <span className="fc-num">94 %</span>
          <span className="fc-label block">{t("hero.badge.scoreLabel")}</span>
        </span>
      </div>

      <div className="float-chip" style={css({ right: "5.5%", top: "19%", "--rot": "2deg", "--fdel": "1.2s" })} data-fade>
        <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true" style={{ color: "var(--emerald-strong)" }}>
          <path d="M3 21l7-7 4.5 4.5L25 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M17 8h8v8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>
          <span className="fc-up block">{t("hero.badge.interviews")}</span>
          <span className="fc-label">{t("hero.badge.interviewsSub")}</span>
        </span>
      </div>

      <div className="float-chip" style={css({ right: "11%", bottom: "23%", "--rot": "-1.5deg", "--fdel": "1.8s" })} data-fade>
        <span className="fc-check" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="m2.5 8 3.4 3.4L12.5 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span>
          <span className="fc-num">{t("hero.badge.letter")}</span>
          <span className="fc-label block">{t("hero.badge.letterSub")}</span>
        </span>
      </div>

      {/* Contenu */}
      <div className="container-x hero-content">
        <span className="chip chip--mint" data-fade style={css({ "--fd": 0 })}>
          {t("hero.eyebrow")}
        </span>

        <h1 className="hero-title">
          <span className="line-mask">
            <span className="line-in" style={css({ "--rd": 0 })}>{t("hero.title.a")}</span>
          </span>
          <span className="line-mask">
            <span className="line-in" style={css({ "--rd": 1 })}>{t("hero.title.b")}</span>
          </span>
          <span className="line-mask">
            <span className="line-in serif-i grad-text" style={css({ "--rd": 2 })}>
              {t("hero.title.c")}
            </span>
          </span>
        </h1>

        <p className="hero-sub text-balance" data-fade style={css({ "--fd": 2 })}>
          {t("hero.sub")}
        </p>

        <div className="hero-actions" data-fade style={css({ "--fd": 3 })}>
          <Link href="/inscription" className="btn-primary">
            {t("hero.cta.primary")}
            <ArrowRight />
          </Link>
          <a href="#demo" className="btn-ghost">
            <PlayIcon />
            {t("hero.cta.secondary")}
          </a>
        </div>

        <div className="hero-trust" data-fade style={css({ "--fd": 4 })}>
          <div className="avatar-stack" aria-hidden="true">
            {AVATARS.map((a) => (
              <span key={a.init} className="avatar" style={{ background: a.bg }}>
                {a.init}
              </span>
            ))}
          </div>
          <span>{t("hero.trust")}</span>
        </div>
      </div>

      <div className="scroll-cue" data-fade style={css({ "--fd": 5 })} aria-hidden="true">
        {t("hero.scroll")}
        <span className="cue-line" />
      </div>
    </section>
  );
}
