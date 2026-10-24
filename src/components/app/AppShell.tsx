"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import type { UserData } from "@/lib/data";
import { EMPTY_FILTERS, type OfferListFilters } from "@/lib/offres-filters";
import { MountainSidebarScene } from "./Scenery";
import {
  BriefcaseBusiness,
  FileText,
  Send,
  Mail,
  Link2,
  Zap,
  LogOut,
  Settings,
  Menu,
  X,
  Search,
  SlidersHorizontal,
  Bell,
  Calendar,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/app/offres", label: "Mes offres", icon: BriefcaseBusiness },
  { href: "/app/cv", label: "Mon CV", icon: FileText },
  { href: "/app/candidatures", label: "Mes candidatures", icon: Send },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // Compteurs réels uniquement : aucun chiffre de démonstration au repos.
  const [stats, setStats] = useState<{
    offers: number;
    applications: number;
    interviews: number;
  }>({ offers: 0, applications: 0, interviews: 0 });
  const catalogRevision = useRef(0);
  const [offerFilters, setOfferFilters] = useState<OfferListFilters>(EMPTY_FILTERS);
  useEffect(() => {
    const onFilters = (event: Event) => setOfferFilters((event as CustomEvent<OfferListFilters>).detail);
    const onStats = (event: Event) => { catalogRevision.current += 1; setStats((event as CustomEvent<typeof stats>).detail); };
    window.addEventListener("cible:offer-filters", onFilters);
    window.addEventListener("cible:catalog-stats", onStats);
    return () => {
      window.removeEventListener("cible:offer-filters", onFilters);
      window.removeEventListener("cible:catalog-stats", onStats);
    };
  }, []);
  const changeFilter = (key: string, value: string) => {
    /* Sur Mes offres, les filtres vivent dans la page : un événement local évite
       une transition de route (et son rendu complet) à chaque changement. */
    if (pathname === "/app/offres") {
      window.dispatchEvent(new CustomEvent("cible:offer-filter-request", { detail: { key, value } }));
      return;
    }
    const params = new URLSearchParams();
    if (value && value !== "all") params.set(key, value);
    router.push(`/app/offres?${params.toString()}`, { scroll: false });
  };

  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const globalSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        globalSearchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const container = mobileMenuRef.current;
    container?.querySelector<HTMLElement>("button, a")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !container) return;
      const focusable = [
        ...container.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])"
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", onKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [menuOpen]);

  // Fetch real user data stats when available, fallback to demo stats cleanly
  useEffect(() => {
    if (!user?.email) return;
    let active = true;
    const revision = catalogRevision.current;
    fetch("/api/user-data", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!active || revision !== catalogRevision.current || !json.ok || !json.record?.data) return;
        const data = json.record.data as UserData;
        // Un dossier vide reste affiché à zéro : jamais de valeurs de démo.
        setStats({
          offers: data.offers?.length ?? 0,
          applications: data.applications?.length ?? 0,
          interviews: (data.applications ?? []).filter((a) => a.status === "interview").length,
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.email]);

  const userName = user?.name || "Mon compte";
  const userSchool = user?.email || "";
  const userInitial = (userName[0] || "M").toUpperCase();

  const handleGlobalSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const val = globalSearchRef.current?.value.trim() || "";
    if (pathname === "/app/offres") {
      const params = new URLSearchParams(window.location.search);
      if (val) params.set("q", val); else params.delete("q");
      window.history.replaceState(null, "", `/app/offres?${params.toString()}`);
    } else router.push(`/app/offres?q=${encodeURIComponent(val)}`);
  };

  const sidebar = (
    <aside className="w-[240px] h-full flex flex-col bg-[#071124] text-slate-200 select-none border-r border-slate-800/60 overflow-y-auto no-scrollbar pt-4 pb-6 px-3.5">
      {/* Brand & Logo */}
      <div className="flex items-center justify-between px-2 mb-6">
        <Link href="/app/offres" className="flex items-center gap-1 group">
          <span className="font-extrabold text-[22px] tracking-tight text-white font-sans">
            cible<span className="text-blue-500">.</span>
          </span>
        </Link>

      </div>

      {/* Main Navigation */}
      <nav className="flex flex-col gap-1 mb-6" aria-label="Navigation principale">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/app/offres"
              ? pathname === "/app/offres" || pathname === "/app"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-[13px] transition-all duration-150 ${
                isActive
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30 font-semibold"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <item.icon size={17} strokeWidth={isActive ? 2.2 : 1.8} className={isActive ? "text-white" : "text-slate-400"} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Actions rapides */}
      <div className="mb-5">
        <h3 className="px-2 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400/90">
          Actions rapides
        </h3>
        <div className="flex flex-col gap-1">
          <Link
            href="/app/alertes-gmail"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Mail size={15} className="text-slate-400" />
            <span>Synchroniser Gmail</span>
          </Link>
          <Link
            href="/app/offres?ajouter=1"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Link2 size={15} className="text-slate-400" />
            <span>Ajouter une offre</span>
          </Link>
          <Link
            href="/app/offres?rafale=1"
            onClick={() => setMenuOpen(false)}
            className="flex items-center justify-between px-3 py-2 rounded-lg text-[12px] text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Zap size={15} className="text-amber-400" />
              <span>Mode Rafale</span>
            </div>
            <span className="text-[9px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-xs">
              Nouveau
            </span>
          </Link>
        </div>
      </div>

      {/* Statistiques */}
      <div className="mb-5">
        <h3 className="px-2 mb-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400/90">
          Statistiques
        </h3>
        <div className="flex flex-col gap-2 px-2 text-[12px]">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-white tracking-tight">
                {stats.offers}
              </span>
              <span className="text-[11px] text-slate-400">offres totales</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-white tracking-tight">
                {stats.applications}
              </span>
              <span className="text-[11px] text-slate-400">candidatures</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-white tracking-tight">
                {stats.interviews}
              </span>
              <span className="text-[11px] text-slate-400">entretiens</span>
            </div>
          </div>
        </div>
      </div>

      {/* Prochaine action */}
      <div className="mb-4 bg-gradient-to-b from-[#0f2042] to-[#0b1834] border border-blue-500/25 rounded-xl p-3 shadow-inner">
        <span className="text-[10px] uppercase font-bold tracking-wider text-blue-300 block mb-2">
          Prochaine action
        </span>
        <div className="flex items-start gap-2 mb-3">
          <div className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
            <Calendar size={13} />
          </div>
          <p className="text-[11px] text-slate-200 leading-snug font-medium">
            {stats.offers > 0
              ? `${stats.offers} offre${stats.offers > 1 ? "s" : ""} dans ton espace`
              : "Synchronise Gmail pour importer tes offres"}
          </p>
        </div>
        <Link
          href="/app/offres"
          onClick={() => setMenuOpen(false)}
          className="w-full block py-1.5 px-3 text-center bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-semibold transition-colors shadow-sm shadow-blue-600/30"
        >
          Commencer ma session
        </Link>
      </div>

      {/* Mountain graphic */}
      <div className="mt-auto">
        <MountainSidebarScene />
      </div>

      {/* User profile & footer */}
      <div className="pt-2 border-t border-slate-800/80">
        <div className="flex items-center gap-2.5 px-1 py-1.5">
          <div className="w-8 h-8 rounded-full bg-blue-900 border border-blue-500/40 text-blue-200 flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-white truncate leading-tight">
              {userName}
            </p>
            <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">
              {userSchool}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between px-1 mt-2 text-[11px] text-slate-400">
          <Link
            href="/app/cv/builder"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-1.5 hover:text-slate-200 transition-colors"
          >
            <Settings size={13} />
            <span>Paramètres</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              logout();
              router.push("/");
            }}
            className="flex items-center gap-1.5 hover:text-rose-300 transition-colors cursor-pointer"
          >
            <LogOut size={13} />
            <span>Déconnexion</span>
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="cible-app min-h-screen bg-[#f8fafc] text-slate-900 flex">
      {/* Skip to content link */}
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg shadow-lg"
        href="#app-main-content"
      >
        Aller au contenu principal
      </a>

      {/* Desktop sidebar */}
      <div className="hidden lg:block fixed inset-y-0 left-0 z-40">
        {sidebar}
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          ref={mobileMenuRef}
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMenuOpen(false)}
          />
          <div className="relative w-[260px] max-w-[85vw] h-full z-10 flex">
            {sidebar}
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 rounded-lg"
              aria-label="Fermer le menu"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Main app wrapper */}
      <div className="flex-1 lg:pl-[240px] flex flex-col min-w-0">
        {/* Top bar header */}
        <header className="sticky top-0 z-30 h-14 bg-white border-b border-slate-200/80 px-4 md:px-7 flex items-center justify-between gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          {/* Mobile menu burger */}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            aria-label="Ouvrir le menu"
          >
            <Menu size={20} />
          </button>

          {/* Global search form */}
          <form
            onSubmit={handleGlobalSearch}
            className="flex-1 max-w-xl relative flex items-center"
            role="search"
          >
            <Search
              size={15}
              className="absolute left-3 text-slate-400 pointer-events-none"
            />
            <input
              ref={globalSearchRef}
              type="search"
              name="q"
              placeholder="Rechercher une offre, une entreprise, une compétence, un lieu..."
              className="w-full pl-9 pr-16 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            <kbd className="absolute right-2.5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white border border-slate-200 rounded shadow-2xs pointer-events-none">
              Ctrl K
            </kbd>
          </form>

          <div className="hidden xl:flex items-center gap-2">
            <select aria-label="Filtrer les offres par contrat" value={pathname === "/app/offres" ? offerFilters.contracts.join(",") : ""} onChange={e => changeFilter("contracts", e.target.value)} className="max-w-40 border border-slate-200 rounded-lg bg-white p-2 text-xs">
              <option value="">Tous contrats</option><option value="stage-6">Stage de 6 mois</option><option value="alternance">Alternance</option><option value="autre">Autres contrats</option>
              {offerFilters.contracts.length > 1 && <option value={offerFilters.contracts.join(",")}>Plusieurs contrats</option>}
            </select>
            <select aria-label="Filtrer les offres par région" value={pathname === "/app/offres" ? offerFilters.region : "all"} onChange={e => changeFilter("region", e.target.value)} className="max-w-40 border border-slate-200 rounded-lg bg-white p-2 text-xs">
              <option value="all">Toutes les régions</option><option value="idf">Île-de-France</option><option value="ara">Auvergne-Rhône-Alpes</option><option value="paca">Provence-Alpes-Côte d’Azur</option><option value="ge">Grand Est</option>
            </select>
            <Link href="/app/offres#offer-filters" className="flex items-center gap-1.5 whitespace-nowrap px-2.5 py-2 text-xs font-medium text-blue-700 border border-slate-200 rounded-lg hover:bg-blue-50"><SlidersHorizontal size={13} />Filtres avancés</Link>
          </div>

          {/* Right utility icons */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto md:ml-0">
            <Link href="/app/candidatures" className="relative p-1.5 text-slate-500 hover:text-blue-700 rounded-md hover:bg-blue-50" aria-label={`Mes candidatures : ${stats.interviews} entretien(s)`}>
              <Bell size={17} />
              {stats.interviews > 0 && <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white" />}
            </Link>

            {/* User Avatar Circle */}
            <Link
              href="/app/cv/builder"
              className="w-8 h-8 rounded-full bg-[#0b1736] text-white flex items-center justify-center font-bold text-xs hover:ring-2 hover:ring-blue-500/40 transition-all"
              aria-label="Mon profil"
            >
              {userInitial}
            </Link>
          </div>
        </header>

        {/* Content body */}
        <main
          id="app-main-content"
          tabIndex={-1}
          className="flex-1 p-4 md:p-6 lg:p-7 max-w-[1720px] w-full mx-auto"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export const NAV_LABEL: Record<string, string> = {
  "/app/offres": "Mes offres",
  "/app/cv": "Mon CV",
  "/app/candidatures": "Mes candidatures",
  "/app": "Mes offres",
  "/app/alertes-gmail": "Synchroniser Gmail",
  "/app/dossier": "Dossier de candidature",
  "/app/matching": "Matching & Analyse",
  "/app/lettres": "Lettres de motivation",
  "/app/recruteurs": "Recruteurs",
};

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
    <div className="mb-6 max-w-3xl">
      <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600 mb-1">{eyebrow}</p>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight">
        {title}
      </h1>
      {sub && <p className="mt-1 text-slate-500 text-xs md:text-sm leading-relaxed">{sub}</p>}
    </div>
  );
}
