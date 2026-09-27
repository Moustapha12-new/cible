"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { resetData } from "@/lib/data";
import { BrandMark } from "@/components/Navbar";

const NAV = [
  {
    section: "Pilotage",
    items: [
      { href: "/app", label: "Tableau de bord", icon: "M3.5 3.5h7v7h-7zM13.5 3.5h7v4h-7zM13.5 11.5h7v9h-7zM3.5 14.5h7v6h-7z" },
      { href: "/app/offers", label: "Offres réelles", icon: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm10.5 4-5.8-5.8" },
      { href: "/app/candidatures", label: "Candidatures", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2" },
      { href: "/app/alertes-gmail", label: "Alertes Gmail", icon: "M3.5 5.5h17v13h-17zM4 7l8 6 8-6" },
    ],
  },
  {
    section: "Optimisation",
    items: [
      { href: "/app/cv", label: "CV intelligent", icon: "M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6" },
      { href: "/app/matching", label: "Matching ATS", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-4-9 3 3 5-6" },
      { href: "/app/adaptation", label: "Adaptation IA", icon: "M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" },
      { href: "/app/lettres", label: "Lettres de motivation", icon: "M3.5 5.5h17v13h-17zM4 7l8 6 8-6" },
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
export const NAV_LABEL: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.href, i.label] as const))
);

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

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
                  onClick={() => setMenuOpen(false)}
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
      <div className="hidden lg:block">{sidebar}</div>

      {/* Menu mobile */}
      {menuOpen && <div className="fixed inset-0 z-[90] lg:hidden">{sidebar}</div>}

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="burger lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
          >
            <span /><span />
          </button>
          <p className="font-mono text-[0.72rem] text-muted truncate">
            espace de {user.email}
          </p>
          <span className="pill pill--ok ml-auto hidden sm:inline-flex">
            <span className="w-1.5 h-1.5 rounded-full bg-mint mr-1.5 inline-block" />
            pilotage actif
          </span>
        </header>
        <main className="app-content">{children}</main>
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
