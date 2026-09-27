"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ScrollTrigger } from "@/lib/gsap";

const LINKS = [
  { href: "#features", label: "Fonctionnalités" },
  { href: "#methode", label: "Méthode" },
  { href: "#demo", label: "Démo" },
  { href: "#suivi", label: "Suivi" },
  { href: "#temoignages", label: "Témoignages" },
  { href: "#faq", label: "FAQ" },
];

export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bm-g" x1="0" y1="0" x2="28" y2="28">
          <stop offset="0" stopColor="#8ff5d5" />
          <stop offset="0.55" stopColor="#4fe3b2" />
          <stop offset="1" stopColor="#8f7bff" />
        </linearGradient>
      </defs>
      <circle cx="14" cy="14" r="11.5" stroke="url(#bm-g)" strokeWidth="2" />
      <circle cx="14" cy="14" r="4.2" fill="url(#bm-g)" />
    </svg>
  );
}

export default function Navbar() {
  const navRef = useRef<HTMLElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const nav = navRef.current;
    const bar = progressRef.current;
    if (!nav || !bar) return;

    const onScroll = () => {
      const y = window.scrollY;
      nav.classList.toggle("is-scrolled", y > 30);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty("--sp", String(max > 0 ? Math.min(y / max, 1) : 0));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const st = ScrollTrigger.create({ trigger: document.body, start: "top top" });

    return () => {
      window.removeEventListener("scroll", onScroll);
      st.kill();
    };
  }, []);

  useEffect(() => {
    if (open) {
      window.__lenis?.stop();
      document.body.style.overflow = "hidden";
    } else {
      window.__lenis?.start();
      document.body.style.overflow = "";
    }
  }, [open]);

  return (
    <>
      <header ref={navRef} className="site-nav">
        <div className="container-x flex items-center justify-between h-full">
          <a
            href="#top"
            className="flex items-center gap-2.5 font-display font-semibold text-lg tracking-tight"
            aria-label="Cible — retour en haut"
          >
            <BrandMark />
            cible<span className="text-mint">.</span>
          </a>

          <nav className="hidden lg:flex items-center gap-8" aria-label="Navigation principale">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="nav-link">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <a href="/connexion" className="nav-link hidden sm:inline">
              Se connecter
            </a>
            <Link
              href="/inscription"
              className="btn-primary hidden sm:inline-flex h-11! px-6! text-[0.9rem]!"
            >
              Essai gratuit
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8h10m0 0L9 4m4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <button
              className={`burger lg:hidden ${open ? "open" : ""}`}
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            >
              <span />
              <span />
            </button>
          </div>
        </div>
        <span ref={progressRef} className="nav-progress" aria-hidden="true" />
      </header>

      <div id="mobile-menu" className={`mobile-menu lg:hidden ${open ? "open" : ""}`}>
        {[{ href: "/inscription", label: "Essai gratuit" }, ...LINKS].map((l, i) => (
          <a
            key={l.href + i}
            href={l.href}
            className="m-link"
            style={{ transitionDelay: open ? `${0.08 + i * 0.055}s` : "0s" }}
            onClick={() => setOpen(false)}
          >
            {l.label}
          </a>
        ))}
        <p className="mono-label mt-10">cible.app — paris</p>
      </div>
    </>
  );
}
