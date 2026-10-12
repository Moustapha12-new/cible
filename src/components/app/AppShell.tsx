"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BriefcaseBusiness, FileUser, Send, Mail, Link2, Zap, LogOut, Menu, X,
  ChevronLeft, Settings, Bell, Search, CalendarClock, Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export const NAV_LABEL: Record<string, string> = {
  "/app/offres": "Mes offres",
  "/app/cv": "Mon CV",
  "/app/candidatures": "Mes candidatures",
  "/app": "Mes offres",
};

const NAV_ITEMS = [
  { href: "/app/offres", label: "Mes offres", icon: BriefcaseBusiness },
  { href: "/app/cv", label: "Mon CV", icon: FileUser },
  { href: "/app/candidatures", label: "Mes candidatures", icon: Send },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stats, setStats] = useState<{ offers: number; applications: number; cvs: number }>({ offers: 0, applications: 0, cvs: 0 });
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileMenuRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMobileMenuOpen(false); return; }
      if (event.key !== "Tab" || !mobileMenuRef.current) return;
      const focusable = [...mobileMenuRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!loading && !user) router.replace("/connexion?next=" + encodeURIComponent(pathname));
  }, [loading, user, router, pathname]);

  useEffect(() => {
    if (!user) return;
    const read = () => {
      const local = getLocalData(user.email);
      if (local) {
        setStats({
          offers: local.offers?.length || 0,
          applications: local.applications?.length || 0,
          cvs: local.cvs?.length || 0,
        });
      }
    };
    read();
    window.addEventListener("cible:data-changed", read);
    return () => window.removeEventListener("cible:data-changed", read);
  }, [user]);

  if (loading || !user) {
    return (
      <div className="app-loading">
        <div className="app-loading-content">
          <div className="app-loading-logo">cible<span className="text-primary">.</span></div>
          <p className="text-muted text-sm">Chargement de ton espace…</p>
        </div>
      </div>
    );
  }

  const firstName = user.name?.split(" ")[0] || "Utilisateur";

  const sidebar = (
    <aside className={`app-sidebar ${sidebarCollapsed ? "collapsed" : ""}`} aria-label="Navigation principale">
      <div className="sidebar-header">
        <Link href="/app/offres" className="sidebar-logo" aria-label="cible. — Accueil">
          cible<span style={{ color: "var(--primary)" }}>.</span>
        </Link>
        {!sidebarCollapsed && (
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(true)} aria-label="Réduire la barre latérale" aria-expanded={false}>
            <ChevronLeft size={17} />
          </button>
        )}
      </div>

      <nav className="sidebar-nav" aria-label="Menu principal">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-nav-item ${active ? "active" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
              aria-current={active ? "page" : undefined}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <item.icon size={19} strokeWidth={2} aria-hidden="true" className="nav-icon" />
              {!sidebarCollapsed && <span className="nav-label">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!sidebarCollapsed && (
        <>
          <div className="sidebar-divider" />
          <div className="sidebar-section">
            <p className="sidebar-section-title">Actions rapides</p>
            <Link href="/app/offres" className="sidebar-action" onClick={() => setMobileMenuOpen(false)}>
              <Mail size={17} strokeWidth={2} aria-hidden="true" />
              <span>Synchroniser Gmail</span>
            </Link>
            <Link href="/app/offres?ajouter=1" className="sidebar-action" onClick={() => setMobileMenuOpen(false)}>
              <Link2 size={17} strokeWidth={2} aria-hidden="true" />
              <span>Ajouter une offre</span>
            </Link>
            <Link href="/app/offres?rafale=1" className="sidebar-action" onClick={() => setMobileMenuOpen(false)}>
              <Zap size={17} strokeWidth={2} aria-hidden="true" />
              <span>Mode Rafale</span>
              <span className="rafale-badge">Nouveau</span>
            </Link>
          </div>
          <div className="sidebar-divider" />
          <div className="sidebar-stats" role="region" aria-label="Statistiques rapides">
            <div className="sidebar-stat"><b>{stats.offers}</b><span>offres totales</span></div>
            <div className="sidebar-stat"><b>{stats.applications}</b><span>candidatures</span></div>
            <div className="sidebar-stat"><b>{stats.cvs}</b><span>CV préparés</span></div>
          </div>
          <div className="sidebar-next">
            <p className="sidebar-next-title"><Sparkles size={14} /> Prochaine action</p>
            <p>Prépare tes CV pour les offres prioritaires du jour, puis envoie tes candidatures.</p>
            <Link href="/app/offres" onClick={() => setMobileMenuOpen(false)}>
              Commencer ma session →
            </Link>
          </div>
        </>
      )}

      <div className="sidebar-footer">
        {sidebarCollapsed ? (
          <button className="sidebar-expand" onClick={() => setSidebarCollapsed(false)} aria-label="Étendre la barre latérale">
            <ChevronLeft size={18} style={{ transform: "rotate(180deg)" }} />
          </button>
        ) : (
          <>
            <div className="sidebar-profile">
              <div className="user-avatar">{firstName.slice(0, 1).toUpperCase()}</div>
              <div className="user-details">
                <strong title={user.name}>{user.name}</strong>
                <small>Stage de 6 mois</small>
              </div>
              <Link href="/app/cv" aria-label="Paramètres" style={{ color: "var(--sidebar-text-dim)", display: "grid", placeItems: "center" }}>
                <Settings size={16} />
              </Link>
            </div>
            <button type="button" onClick={() => { logout(); router.push("/"); }} className="sidebar-logout">
              <LogOut size={15} strokeWidth={2} />
              <span>Déconnexion</span>
            </button>
          </>
        )}
      </div>
    </aside>
  );

  return (
    <div className="app-root">
      <a className="skip-link" href="#app-main-content">Aller au contenu principal</a>

      <div className={`app-sidebar-wrapper ${sidebarCollapsed ? "collapsed" : ""} ${mobileMenuOpen ? "open" : ""}`}>
        {sidebar}
      </div>

      {mobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          className="mobile-menu-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation principale"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div className="mobile-menu-panel" onClick={(e) => e.stopPropagation()}>
            <button className="mobile-menu-close" onClick={() => setMobileMenuOpen(false)} aria-label="Fermer le menu">
              <X size={20} />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Ouvrir le menu"
            aria-expanded={mobileMenuOpen}
          >
            <Menu size={20} />
          </button>

          <label className="topbar-search">
            <Search size={16} aria-hidden="true" />
            <input type="search" placeholder="Rechercher une offre, une entreprise, une compétence…" aria-label="Recherche globale" />
            <kbd className="topbar-kbd">Ctrl K</kbd>
          </label>

          <div className="topbar-spacer" />

          <span className="topbar-goal">
            <span className="goal-badge"><CalendarClock size={13} /> Stage de 6 mois</span>
          </span>
          <button type="button" className="topbar-icon-btn" aria-label="Notifications">
            <Bell size={17} />
            <span className="dot" />
          </button>
          <div className="user-avatar" style={{ width: 34, height: 34, fontSize: 13, background: "var(--primary)", color: "#fff", display: "grid", placeItems: "center", borderRadius: "50%", fontWeight: 600 }}>
            {firstName.slice(0, 1).toUpperCase()}
          </div>
        </header>

        <main id="app-main-content" className="app-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

function getLocalData(email: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`cible:data:v2:${email.toLowerCase()}`);
    if (raw) return JSON.parse(raw) as { offers?: unknown[]; applications?: unknown[]; cvs?: unknown[] };
    return null;
  } catch {
    return null;
  }
}

export function AppPageHead({
  kicker,
  eyebrow,
  title,
  subtitle,
  sub,
  actions,
}: {
  kicker?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        {(kicker || eyebrow) && <p className="kicker">{kicker || eyebrow}</p>}
        <h1>{title}</h1>
        {(subtitle || sub) && <p className="page-sub">{subtitle || sub}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </header>
  );
}
