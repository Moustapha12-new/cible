"use client";

import { useEffect, useRef, useState } from "react";
import { useLang, type Lang } from "@/lib/i18n";
import { Brand } from "./Brand";

const LINKS = [
  { href: "#fonctionnalites", key: "nav.features" },
  { href: "#methode", key: "nav.how" },
  { href: "#demo", key: "nav.demo" },
  { href: "#pilotage", key: "nav.tracking" },
  { href: "#temoignages", key: "nav.testimonials" },
  { href: "#faq", key: "nav.faq" },
];

export default function Nav() {
  const { lang, setLang, t } = useLang();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string>("");
  const progressRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  /* État scrollé + barre de progression */
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        setScrolled(y > 12);
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (progressRef.current) {
          progressRef.current.style.setProperty(
            "--sp",
            String(max > 0 ? Math.min(1, y / max) : 0)
          );
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  /* Lien actif selon la section visible */
  useEffect(() => {
    const ids = LINKS.map((l) => l.href.slice(1));
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!sections.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(`#${entry.target.id}`);
        }
      },
      { rootMargin: "-38% 0px -55% 0px" }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  /* Verrouille le scroll quand le menu mobile est ouvert */
  useEffect(() => {
    const lenis = (window as unknown as { __lenis?: { stop(): void; start(): void } })
      .__lenis;
    if (open) {
      lenis?.stop();
      document.body.style.overflow = "hidden";
    } else {
      lenis?.start();
      document.body.style.overflow = "";
    }
    return () => {
      lenis?.start();
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header
        ref={navRef}
        className={`site-nav${scrolled ? " is-scrolled" : ""}`}
      >
        <div className="container-x flex items-center justify-between h-full gap-4">
          <a href="#top" aria-label="Cible — accueil">
            <Brand />
          </a>

          <nav className="nav-pill hidden lg:flex items-center" aria-label="Navigation principale">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className={`nav-link${active === l.href ? " is-active" : ""}`}
              >
                {t(l.key)}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="lang-toggle" role="group" aria-label="Langue / Language">
              {(["fr", "en"] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  className={lang === l ? "active" : ""}
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <a href="/connexion" className="nav-link hidden sm:inline">
              {t("nav.login")}
            </a>
            <a href="/inscription" className="btn-primary btn-sm hidden sm:inline-flex">
              {t("nav.cta")}
            </a>
            <button
              type="button"
              className={`burger lg:hidden${open ? " open" : ""}`}
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? t("nav.close") : t("nav.menu")}
            >
              <span />
              <span />
            </button>
          </div>
        </div>
        <div ref={progressRef} className="nav-progress" aria-hidden="true" />
      </header>

      <div className={`mobile-menu${open ? " open" : ""}`} aria-hidden={!open}>
        <nav className="flex flex-col items-start" aria-label="Menu mobile">
          {LINKS.map((l, i) => (
            <a
              key={l.href}
              href={l.href}
              className="m-link"
              style={{ transitionDelay: `${i * 60}ms` }}
              onClick={() => setOpen(false)}
            >
              {t(l.key)}
            </a>
          ))}
          <a
            href="/connexion"
            className="m-link"
            style={{ transitionDelay: `${LINKS.length * 60}ms` }}
            onClick={() => setOpen(false)}
          >
            {t("nav.login")}
          </a>
          <a
            href="/inscription"
            className="btn-primary mt-8"
            style={{ transitionDelay: `${(LINKS.length + 1) * 60}ms` }}
            onClick={() => setOpen(false)}
          >
            {t("nav.cta")}
          </a>
        </nav>
      </div>
    </>
  );
}
