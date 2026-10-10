"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { resetData } from "@/lib/data";
import { BrandMark } from "@/components/Navbar";

const NAV = [
  {
    section: "Ma recherche de stage",
    items: [
      { href: "/app", label: "Tableau de bord", icon: "M3.5 3.5h7v7h-7zM13.5 3.5h7v4h-7zM13.5 11.5h7v9h-7zM3.5 14.5h7v6h-7z" },
      { href: "/app/alertes-gmail", label: "Mes offres Gmail", icon: "M3.5 5.5h17v13h-17zM4 7l8 6 8-6" },
      { href: "/app/offers", label: "Offres & qualification", icon: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm10.5 4-5.8-5.8" },
      { href: "/app/candidatures", label: "Candidatures", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2" },
    ],
  },
  {
    section: "Préparer ma candidature",
    items: [
      { href: "/app/matching", label: "Matching PFE", icon: "M4 12l5 5L20 6M4 5h7M4 20h7" },
      { href: "/app/adaptation", label: "Adapter mon CV", icon: "M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6" },
      { href: "/app/dossier", label: "Mission PFE", icon: "M4 7h16v14H4zM8 7V4h8v3M8 12h8M8 16h6" },
      { href: "/app/cv", label: "Mon profil & CV", icon: "M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6" },
      { href: "/app/lettres", label: "Mes lettres", icon: "M4 5h16v14H4zM7 9h10M7 13h10M7 17h6" },
    ],
  },
  {
    section: "Réseau",
    items: [
      { href: "/app/recruteurs", label: "Contacts recruteurs", icon: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3 2.7-5 6-5s6 2 6 5M16.5 4.6a3.2 3.2 0 0 1 0 5.8M18 15c2 .8 3.5 2.4 3.5 5" },
    ],
  },
];

/** P2-11 : libellés du menu — source unique pour eyebrows/titres de pages
    (les pages importent NAV_LABEL au lieu du jargon « Module 0X »). */
export const NAV_LABEL: Record<string, string> = { ...Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.href, i.label] as const))
) };

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const oldOverflow = document.body.style.overflow;
    const menuButton = menuButtonRef.current;
    document.body.style.overflow = "hidden";
    const container = mobileMenuRef.current;
    container?.querySelector<HTMLElement>("button, a")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); return; }
      if (event.key !== "Tab" || !container) return;
      const focusable = [...container.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", onKeyDown); menuButton?.focus(); };
  }, [menuOpen]);

  useEffect(() => {
    if (!loading && !user) router.replace("/connexion?next=" + encodeURIComponent(pathname));
  }, [loading, user, router, pathname]);

  if (loading || !user) {
    return (
      <div className="app-boot">
        <div className="flex flex-col items-center gap-5">
          <span className="app-boot-mark"><BrandMark size={40} /></span>
          <p className="mono-label">chargement de votre espace…</p>
        </div>
      </div>
    );
  }

  const firstName = user.name.split(" ")[0];
  const currentPageLabel = NAV_LABEL[pathname] || NAV.flatMap(group => group.items)
    .find(item => item.href !== "/app" && pathname.startsWith(item.href + "/"))?.label || "Dossier de candidature";

  const sidebar = (
    <aside className="app-side">
      <Link href="/" className="app-logo">
        <BrandMark />
        cible<span className="text-mint">.</span>
      </Link>

      <nav className="app-nav" aria-label="Navigation de l'application">
        {NAV.map((group) => (
          <div key={group.section} className="mb-6">
            <p className="mono-label text-[0.58rem]! mb-2.5 px-3">{group.section}</p>
            {group.items.map((item) => {
              const active =
                item.href === "/app"
                  ? pathname === "/app"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onClick={() => setMenuOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`app-nav-link ${active ? "is-active" : ""}`}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={item.icon} />
                  </svg>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto px-3 pb-2">
        <div className="glass-card p-4 rounded-xl!">
          <p className="text-[0.78rem] leading-relaxed text-text-dim">
            <strong className="text-text-main font-semibold">{firstName},</strong> ton
            espace <strong className="text-mint font-semibold">s&apos;adapte à toi</strong> :
            chaque CV, offre ou candidature l&apos;enrichit.
          </p>
        </div>
        <button type="button" onClick={() => { logout(); router.push("/"); }} className="app-logout">
          Se déconnecter
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Tout effacer et repartir d'un espace vide ?")) {
              resetData(user.name, user.email);
              window.location.reload();
            }
          }}
          className="app-logout opacity-60 hover:opacity-100"
        >
          Réinitialiser l&apos;espace
        </button>
      </div>
    </aside>
  );

  return (
    <div className="app-root">
      <a className="app-skip-link" href="#app-main-content">Aller au contenu principal</a>
      <div className="hidden lg:block">{sidebar}</div>

      {/* Menu mobile */}
      {menuOpen && <div ref={mobileMenuRef} id="app-mobile-navigation" className="app-mobile-menu lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation principale"><button className="app-mobile-backdrop" tabIndex={-1} onClick={() => setMenuOpen(false)} aria-label="Fermer la navigation" /><div className="app-mobile-panel"><button className="app-mobile-close" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu">✕</button>{sidebar}</div></div>}

      <div className="app-main">
        <header className="app-topbar">
          <button
            ref={menuButtonRef}
            type="button"
            className="burger lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menuOpen}
            aria-controls="app-mobile-navigation"
          >
            <span /><span />
          </button>
          <nav className="app-breadcrumb" aria-label="Fil d'Ariane"><Link href="/app">Mon espace</Link><span aria-hidden="true">/</span><span aria-current="page">{currentPageLabel}</span></nav>
          <span className="pill pill--ok ml-auto hidden sm:inline-flex">
            <span className="w-1.5 h-1.5 rounded-full bg-mint mr-1.5 inline-block" />
            objectif : mon prochain stage
          </span>
        </header>
        <main id="app-main-content" className="app-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}

/* Titre de page réutilisable */
export function AppPageHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-9 max-w-3xl">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 font-display text-[clamp(1.7rem,3.5vw,2.4rem)] font-semibold tracking-tight leading-tight">
        {title}
      </h1>
      {sub && <p className="mt-3 text-muted text-[0.95rem] leading-relaxed">{sub}</p>}
    </div>
  );
}
