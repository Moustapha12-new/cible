import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  MoreVertical,
  ShieldCheck,
  Zap,
  Star,
  CheckCircle2,
  Trash2,
  List,
  LayoutGrid,
  ChevronDown,
} from "lucide-react";
import { CompanyLogo } from "@/components/app/CompanyLogo";
import type { DemoTableOffer } from "@/lib/demo-data";

export type OffersTabCounts = {
  all: number;
  new: number;
  todo: number;
  applied: number;
  favorites: number;
  expired: number;
};

interface OffersTableProps {
  offers: DemoTableOffer[];
  totalOffersCount: number;
  /** Compteurs réels par onglet — absents = aucun compte affiché. */
  tabCounts?: OffersTabCounts;
  /** Le bouton « Supprimer » n'existe que pour la démonstration : aucune offre
      réelle n'est supprimable depuis cette page. */
  showDelete?: boolean;
  selectedIds: Set<string>;
  favorites: Set<string>;
  activeTab: "all" | "new" | "todo" | "applied" | "favorites" | "expired";
  onTabChange: (tab: "all" | "new" | "todo" | "applied" | "favorites" | "expired") => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onToggleFavorite: (id: string) => void;
  onSelectOffer: (id: string) => void;
  onBulkEnqueue: () => void;
  onBulkMarkApplied: () => void;
  onBulkDelete: () => void;
}

export function OffersTable({
  offers,
  totalOffersCount,
  tabCounts,
  showDelete = true,
  selectedIds,
  favorites,
  activeTab,
  onTabChange,
  onToggleSelect,
  onToggleSelectAll,
  onToggleFavorite,
  onSelectOffer,
  onBulkEnqueue,
  onBulkMarkApplied,
  onBulkDelete,
}: OffersTableProps) {
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  const [sortOrder, setSortOrder] = useState<"recent" | "match" | "company">("recent");

  const tabs = [
    { id: "all", label: tabCounts ? `Toutes mes offres (${tabCounts.all})` : `Toutes mes offres (${totalOffersCount})` },
    { id: "new", label: tabCounts ? `Nouvelles (${tabCounts.new})` : "Nouvelles" },
    { id: "todo", label: tabCounts ? `À traiter (${tabCounts.todo})` : "À traiter" },
    { id: "applied", label: tabCounts ? `Déjà postulées (${tabCounts.applied})` : "Déjà postulées" },
    { id: "favorites", label: tabCounts ? `En favoris (${tabCounts.favorites})` : "En favoris" },
    { id: "expired", label: tabCounts ? `Expirées (${tabCounts.expired})` : "Expirées" },
  ] as const;

  const allSelected = offers.length > 0 && offers.every((o) => selectedIds.has(o.id));

  /* Tri réel : récent (date ISO de réception), meilleur match (score existant,
     les offres sans score en dernier), entreprise A-Z. */
  const sortedOffers = useMemo(() => {
    const rows = [...offers];
    if (sortOrder === "company") {
      rows.sort((a, b) => a.company.localeCompare(b.company, "fr"));
    } else if (sortOrder === "match") {
      rows.sort((a, b) => (b.matchPercentage ?? -1) - (a.matchPercentage ?? -1));
    } else {
      rows.sort((a, b) => {
        const ta = a.receivedAt ? Date.parse(a.receivedAt) : 0;
        const tb = b.receivedAt ? Date.parse(b.receivedAt) : 0;
        return tb - ta;
      });
    }
    return rows;
  }, [offers, sortOrder]);

  return (
    <div className="flex flex-col bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden">
      {/* Tabs and View Switcher Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200/80 px-4 pt-3 pb-0 gap-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`pb-3 px-3 text-xs font-semibold whitespace-nowrap transition-colors relative ${
                  isActive
                    ? "text-blue-600 border-b-2 border-blue-600"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* View Toggle & Sort */}
        <div className="flex items-center gap-2 pb-2.5 ml-auto">
          {/* Segmented control: list / cards */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                viewMode === "list"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <List size={13} />
              <span>Vue liste</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                viewMode === "cards"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutGrid size={13} />
              <span>Vue cartes</span>
            </button>
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as "recent" | "match" | "company")}
              className="appearance-none bg-white border border-slate-200 rounded-lg pl-3 pr-7 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="recent">Trier : Plus récentes</option>
              <option value="match">Trier : Couverture du CV</option>
              <option value="company">Trier : Entreprise A-Z</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-2.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Table Body / Rows */}
      {offers.length === 0 ? (
        <div className="p-12 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
            <List size={22} />
          </div>
          <h4 className="text-sm font-bold text-slate-800 mb-1">Aucune offre trouvée</h4>
          <p className="text-xs text-slate-500 max-w-sm">
            Aucune offre ne correspond à ce filtre ou votre compte ne contient pas encore d&apos;offres.
          </p>
        </div>
      ) : viewMode === "list" ? (
        <div className="divide-y divide-slate-100">
          {sortedOffers.map((offer) => {
            const isSelected = selectedIds.has(offer.id);
            const isFav = favorites.has(offer.id);

            return (
              <div
                key={offer.id}
                className={`flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50/70 transition-colors ${
                  isSelected ? "bg-blue-50/30" : ""
                }`}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(offer.id)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 cursor-pointer shrink-0"
                  aria-label={`Sélectionner ${offer.title}`}
                />

                {/* Company: Logo + Name */}
                <div className="flex items-center gap-2.5 w-[140px] shrink-0">
                  <CompanyLogo company={offer.company} size="sm" />
                  <span className="text-xs font-bold text-slate-800 tracking-tight truncate">
                    {offer.company}
                  </span>
                </div>

                {/* Job Title & Tags */}
                <div className="flex-1 min-w-0 pr-3">
                  <h4 className="text-xs font-bold text-slate-900 truncate mb-1">
                    {offer.title}
                  </h4>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {offer.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] text-slate-600 bg-slate-100 hover:bg-slate-200/70 px-1.5 py-0.5 rounded transition-colors"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Date */}
                <div className="hidden sm:block text-right shrink-0 px-2 text-[11px] text-slate-400 font-medium w-[90px]">
                  {offer.date}
                </div>

                {/* Match Badge */}
                <div className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100/80">
                  <ShieldCheck size={13} className="text-emerald-600" />
                  <span title={offer.matchExplanation}>{offer.matchPercentage != null ? `${offer.matchPercentage}% CV` : offer.matchExplanation || "—"}</span>
                </div>

                {/* Row Actions */}
                <div className="flex items-center gap-1.5 shrink-0 pl-1">
                  <Link
                    href={`/app/cv?offer=${encodeURIComponent(offer.id)}&start=1`}
                    onClick={() => onSelectOffer(offer.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold rounded-lg shadow-xs transition-colors"
                  >
                    <span>Adapter mon CV</span>
                  </Link>

                  {offer.url && (
                    <a
                      href={offer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hidden md:flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium rounded-lg border border-slate-200 transition-colors"
                    >
                      <span>Voir l&apos;offre</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => onToggleFavorite(offer.id)}
                    className={`p-1.5 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-colors ${
                      isFav ? "text-amber-500 fill-amber-500" : "text-slate-400 hover:text-slate-600"
                    }`}
                    aria-label="Favori"
                  >
                    <Bookmark size={15} fill={isFav ? "currentColor" : "none"} />
                  </button>

                  {showDelete && (
                    <button
                      type="button"
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                      aria-label="Options"
                    >
                      <MoreVertical size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Card View */
        <div className="grid grid-cols-1 md:grid-cols-2 p-4 gap-3">
          {sortedOffers.map((offer) => (
            <div
              key={offer.id}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 transition-all flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CompanyLogo company={offer.company} size="sm" />
                  <span className="text-xs font-bold text-slate-800">{offer.company}</span>
                </div>
                <span className="text-xs font-bold text-emerald-600">
                  <span title={offer.matchExplanation}>{offer.matchPercentage != null ? `${offer.matchPercentage}% couverture CV` : offer.matchExplanation || "Analyse indisponible"}</span>
                </span>
              </div>
              <h4 className="text-xs font-bold text-slate-900">{offer.title}</h4>
              <p className="text-[11px] text-slate-500">{offer.location}</p>
              <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100">
                <span className="text-[10px] text-slate-400">{offer.date}</span>
                <Link
                  href={`/app/cv?offer=${encodeURIComponent(offer.id)}&start=1`}
                  className="px-2.5 py-1 bg-blue-600 text-white text-[11px] font-semibold rounded-lg"
                >
                  Adapter mon CV
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Multi-selection Action Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-4 py-3 gap-3 shadow-lg">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleSelectAll}
              className="w-4 h-4 rounded border-slate-300 text-blue-600"
            />
            <span>{selectedIds.size} offre(s) sélectionnée(s)</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBulkEnqueue}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
            >
              <Zap size={13} className="fill-white" />
              <span>Préparer tous les CV (Mode Rafale)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                selectedIds.forEach((id) => onToggleFavorite(id));
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg transition-colors"
            >
              <Star size={13} className="text-amber-500" />
              <span>Ajouter aux favoris</span>
            </button>

            <button
              type="button"
              onClick={onBulkMarkApplied}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg transition-colors"
            >
              <CheckCircle2 size={13} className="text-blue-600" />
              <span>Marquer comme postulé</span>
            </button>

            {showDelete && (
              <button
                type="button"
                onClick={onBulkDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-200 text-xs font-medium rounded-lg transition-colors"
              >
                <Trash2 size={13} />
                <span>Supprimer</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
