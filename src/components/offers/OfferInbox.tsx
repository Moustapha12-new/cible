"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserData, DetectedOffer } from "@/lib/data";
import type { PfeAnalysis } from "@/lib/pfe-matching";
import type { OfferQualification, QualificationState, QualificationFilters } from "@/lib/offer-qualification";
import {
  getAllQualifications,
  getStateInfo,
  filterAndSortOffers,
  getAvailableDomains,
  getAvailableLocations,
  STATE_ORDER,
  bulkUpdateQualification,
  undoLastDecision,
  addToHistory,
  STATE_LABELS,
  getFreshAnalysis,
} from "@/lib/offer-qualification";
import { offerLocation } from "@/lib/offer-location";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const STATE_ORDER_DISPLAY: QualificationState[] = [
  "new", "to_examine", "interesting", "to_verify", "shortlisted", "rejected", "applied"
];

interface OfferInboxProps {
  data: UserData;
  onQualify: (offerId: string, state: QualificationState, note?: string) => void;
  onBulkQualify: (offerIds: string[], state: QualificationState) => void;
  onOpenDetail: (offerId: string) => void;
  onAddToShortlist: (offerId: string, priority: number, justification: string) => void;
  onOpenMatching: (offerId: string) => void;
  onOpenMissionPFE: (offerId: string) => void;
  onOpenReadyToApply: (offerId: string) => void;
  onAddToComparator: (offerId: string) => void;
  selectedForCompare: string[];
  onUndo: (offerId: string) => void;
  onNavigate: (href: string) => void;
}

export default function OfferInbox({
  data,
  onQualify,
  onBulkQualify,
  onOpenDetail,
  onAddToShortlist,
  onOpenMatching,
  onOpenMissionPFE,
  onOpenReadyToApply,
  onAddToComparator,
  selectedForCompare,
  onUndo,
  onNavigate,
}: OfferInboxProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<QualificationFilters>({
    states: undefined,
    search: "",
    domains: [],
    locations: [],
    hasMissingInfo: false,
    eligibility: "unknown",
    relevance: "unknown",
    sortBy: "relevance",
    sortDir: "desc",
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "cards">("cards");
  const [activeStateFilter, setActiveStateFilter] = useState<QualificationState | "all">("all");
  const [showFilters, setShowFilters] = useState(false);
  const lastActionRef = useRef<{ offerIds: string[]; prevState: QualificationState } | null>(null);
  const inboxRef = useRef<HTMLDivElement>(null);

  const qualifications = useMemo(() => getAllQualifications(data), [data.offers, data.pfeAnalyses, data.offerQualifications, data.applications]);
  const offersWithQual = useMemo(() => {
    return (data.offers || []).map(offer => ({
      offer,
      qualification: qualifications[offer.id],
      analysis: getFreshAnalysis(data, offer),
    }));
  }, [data.offers, qualifications]);

  const filteredOffers = useMemo(() => filterAndSortOffers(data, filters), [data, filters]);
  const stateCounts = useMemo(() => {
    const counts: Record<QualificationState, number> = {
      new: 0, to_examine: 0, interesting: 0, to_verify: 0,
      shortlisted: 0, rejected: 0, applied: 0,
    };
    for (const { qualification } of offersWithQual) {
      counts[qualification.state]++;
    }
    return counts;
  }, [offersWithQual]);

  const availableDomains = useMemo(() => getAvailableDomains(data), [data]);
  const availableLocations = useMemo(() => getAvailableLocations(data), [data]);

  const totalRemaining = filteredOffers.filter(o => 
    !["rejected", "applied"].includes(o.qualification.state)
  ).length;

  const handleSelectAll = () => {
    if (selectedIds.size === filteredOffers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOffers.map(o => o.offer.id)));
    }
  };

  const handleSelect = (offerId: string) => {
    const next = new Set(selectedIds);
    if (next.has(offerId)) next.delete(offerId);
    else next.add(offerId);
    setSelectedIds(next);
  };

  const handleBulkAction = (state: QualificationState) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    lastActionRef.current = { offerIds: ids, prevState: qualifications[ids[0]]?.state || "new" };
    onBulkQualify(ids, state);
    setSelectedIds(new Set());
  };

  const handleUndo = () => {
    if (!lastActionRef.current) return;
    for (const id of lastActionRef.current.offerIds) {
      onUndo(id);
    }
    lastActionRef.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    
    const focusedIndex = filteredOffers.findIndex(o => o.offer.id === (document.activeElement as HTMLElement)?.getAttribute("data-offer-id"));
    
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredOffers.length - 1) {
          const nextId = filteredOffers[focusedIndex + 1]?.offer.id;
          nextId && (document.querySelector(`[data-offer-id="${nextId}"]`) as HTMLElement)?.focus();
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (focusedIndex > 0) {
          const prevId = filteredOffers[focusedIndex - 1]?.offer.id;
          prevId && (document.querySelector(`[data-offer-id="${prevId}"]`) as HTMLElement)?.focus();
        }
        break;
      case "Enter":
        if (focusedIndex >= 0) onOpenDetail(filteredOffers[focusedIndex].offer.id);
        break;
      case "1": case "2": case "3": case "4": case "5": case "6": case "7": {
        const states: QualificationState[] = ["new", "to_examine", "interesting", "to_verify", "shortlisted", "rejected", "applied"];
        const idx = parseInt(e.key) - 1;
        if (states[idx] && selectedIds.size > 0) handleBulkAction(states[idx]);
        break;
      }
      case "s":
        if (selectedIds.size === 1) {
          const id = Array.from(selectedIds)[0];
          const qual = qualifications[id];
          if (qual?.state === "shortlisted") return;
          onAddToShortlist(id, 1, "");
        }
        break;
      case "m":
        if (selectedIds.size === 1) onOpenMatching(Array.from(selectedIds)[0]);
        break;
      case "d":
        if (selectedIds.size === 1) onOpenMissionPFE(Array.from(selectedIds)[0]);
        break;
      case "p":
        if (selectedIds.size === 1) onOpenReadyToApply(Array.from(selectedIds)[0]);
        break;
      case "c":
        if (selectedIds.size > 0) Array.from(selectedIds).forEach(onAddToComparator);
        break;
      case "Escape":
        setSelectedIds(new Set());
        break;
      case "z":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleUndo();
        }
        break;
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => handleKeyDown(e as any);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredOffers, selectedIds, qualifications]);

  const getEligibilityBadge = (analysis: PfeAnalysis | null) => {
    if (!analysis) return null;
    const config = {
      eligible: { label: "Éligible", cls: "pill pill--ok" },
      verify: { label: "À vérifier", cls: "pill pill--wait" },
      excluded: { label: "Incompatible", cls: "pill" },
    }[analysis.eligibility.status];
    return <span className={config.cls}>{config.label}</span>;
  };

  const getRelevanceBadge = (analysis: PfeAnalysis | null) => {
    if (!analysis) return null;
    const config = {
      forte: { label: "Forte", cls: "pill pill--ok" },
      "à examiner": { label: "À examiner", cls: "pill pill--wait" },
      faible: { label: "Faible", cls: "pill" },
    }[analysis.relevance.level];
    return <span className={config.cls}>{config.label}</span>;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try { return format(new Date(dateStr), "dd MMM yyyy", { locale: fr }); } catch { return dateStr.slice(0, 10); }
  };

  return (
    <div ref={inboxRef} className="offers-inbox" tabIndex={0}>
      <style jsx>{`
        .offers-inbox { outline: none; }
        .offers-inbox:focus-visible { outline: 2px solid var(--emerald); outline-offset: 2px; border-radius: 4px; }
        .offer-row:focus-visible { outline: 2px solid var(--emerald); outline-offset: -2px; border-radius: 8px; }
        .state-tab.active { background: var(--emerald); color: white; }
        .state-tab.active .count { background: rgba(255,255,255,0.3); }
      `}</style>

      {/* Header avec compteurs d'états */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0" role="tablist" aria-label="Filtrer par état de qualification">
          <button
            role="tab"
            aria-selected={activeStateFilter === "all"}
            className={`state-tab btn-line btn-sm px-3 ${activeStateFilter === "all" ? "active" : ""}`}
            onClick={() => { setActiveStateFilter("all"); setFilters(f => ({ ...f, states: undefined })); }}
          >
            Toutes <span className="count chip chip--muted text-[0.65rem] ml-1">{offersWithQual.length}</span>
          </button>
          {STATE_ORDER_DISPLAY.map(state => {
            const info = getStateInfo(state);
            const count = stateCounts[state];
            if (count === 0 && state !== "new") return null;
            return (
              <button
                key={state}
                role="tab"
                aria-selected={activeStateFilter === state}
                className={`state-tab btn-line btn-sm px-3 ${activeStateFilter === state ? "active" : ""} flex items-center gap-1.5`}
                style={{ borderColor: info.colors.border.replace("border-", ""), color: info.colors.text.replace("text-", "") }}
                onClick={() => { setActiveStateFilter(state); setFilters(f => ({ ...f, states: [state] })); }}
              >
                <span>{info.icon}</span>
                <span>{info.label}</span>
                <span className="count chip chip--muted text-[0.65rem]">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="mono-label text-sm">
            {totalRemaining} offre{totalRemaining > 1 ? "s" : ""} à traiter
          </span>
          <button
            className="btn-line btn-sm"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
          >
            Filtres {showFilters ? "▲" : "▼"}
          </button>
          <div className="flex gap-1.5">
            <button className="btn-line btn-sm p-2" onClick={() => setViewMode("list")} aria-label="Vue liste" aria-pressed={viewMode === "list"}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 5h18M3 12h18M3 19h18"/></svg>
            </button>
            <button className="btn-line btn-sm p-2" onClick={() => setViewMode("cards")} aria-label="Vue cartes" aria-pressed={viewMode === "cards"}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="9" rx="1"/><rect x="3" y="15" width="7" height="9" rx="1"/><rect x="14" y="15" width="7" height="9" rx="1"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Barre de recherche et filtres avancés */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
          <input
            type="search"
            className="input pl-9"
            placeholder="Poste, entreprise, ville, compétence…"
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            aria-label="Rechercher dans les offres"
          />
        </div>
        {showFilters && (
          <>
            <select className="input w-auto min-w-[140px]" value={filters.eligibility} onChange={e => setFilters(f => ({ ...f, eligibility: e.target.value as any }))}>
              <option value="unknown">Éligibilité PFE</option>
              <option value="eligible">Éligible</option>
              <option value="verify">À vérifier</option>
              <option value="excluded">Incompatible</option>
            </select>
            <select className="input w-auto min-w-[140px]" value={filters.relevance} onChange={e => setFilters(f => ({ ...f, relevance: e.target.value as any }))}>
              <option value="unknown">Pertinence</option>
              <option value="forte">Forte</option>
              <option value="à examiner">À examiner</option>
              <option value="faible">Faible</option>
            </select>
            <select className="input w-auto min-w-[140px]" value={filters.sortBy} onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value as any }))}>
              <option value="relevance">Pertinence</option>
              <option value="freshness">Fraîcheur</option>
              <option value="state">État</option>
              <option value="priority">Priorité</option>
            </select>
            <label className="input w-auto min-w-[140px] flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={filters.hasMissingInfo} onChange={e => setFilters(f => ({ ...f, hasMissingInfo: e.target.checked }))} />
              Infos manquantes
            </label>
          </>
        )}
      </div>

      {/* Filtres avancés dépliants */}
      {showFilters && (
        <details className="glass-card p-4 mb-4 border border-line">
          <summary className="font-semibold cursor-pointer flex items-center gap-2">Filtres avancés</summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mono-label block mb-1.5">Domaines techniques</label>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {availableDomains.map(domain => (
                  <label key={domain} className="chip cursor-pointer">
                    <input type="checkbox" checked={(filters.domains || []).includes(domain)} onChange={e => setFilters(f => ({ ...f, domains: e.target.checked ? [...(f.domains || []), domain] : (f.domains || []).filter(d => d !== domain) }))} />
                    {domain}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="mono-label block mb-1.5">Localisations</label>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {availableLocations.slice(0, 20).map(loc => (
                  <label key={loc} className="chip cursor-pointer">
                    <input type="checkbox" checked={(filters.locations || []).includes(loc)} onChange={e => setFilters(f => ({ ...f, locations: e.target.checked ? [...(f.locations || []), loc] : (f.locations || []).filter(l => l !== loc) }))} />
                    {loc}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </details>
      )}

      {/* Actions en lot */}
      {selectedIds.size > 0 && (
        <div className="glass-card p-3 mb-4 border border-line border-amber-300 bg-amber-50" data-testid="bulk-actions-bar">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">{selectedIds.size} offre{selectedIds.size > 1 ? "s" : ""} sélectionnée{selectedIds.size > 1 ? "s" : ""}</span>
            <div className="flex flex-wrap gap-1.5">
              {STATE_ORDER_DISPLAY.map(state => (
                <button
                  key={state}
                  type="button"
                  className="btn-line btn-sm text-[0.7rem]"
                  onClick={() => handleBulkAction(state)}
                >
                  {getStateInfo(state).label}
                </button>
              ))}
              <button type="button" className="btn-line btn-sm text-[0.7rem]" onClick={() => { if (selectedIds.size === 1) onAddToShortlist(Array.from(selectedIds)[0], 1, ""); }}>Shortlist</button>
              <button type="button" className="btn-line btn-sm text-[0.7rem]" onClick={() => Array.from(selectedIds).forEach(onAddToComparator)}>Comparer</button>
              <button type="button" className="btn-ghost btn-sm text-[0.7rem]" onClick={() => setSelectedIds(new Set())}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Barre d'annulation */}
      {lastActionRef.current && (
        <div className="glass-card p-3 mb-4 border border-line border-emerald-300 bg-emerald-50 flex items-center justify-between" data-testid="undo-bar">
          <span className="text-sm">Dernière action : {lastActionRef.current.offerIds.length} offre{lastActionRef.current.offerIds.length > 1 ? "s" : ""} → {getStateInfo(lastActionRef.current.prevState).label}</span>
          <button type="button" className="btn-line btn-sm" onClick={handleUndo}>Annuler</button>
        </div>
      )}

      {/* Liste des offres */}
      <div className={viewMode === "list" ? "space-y-2" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"}>
        {filteredOffers.length === 0 ? (
          <div className="glass-card p-12 text-center col-span-full">
            <p className="text-text-dim">Aucune offre ne correspond aux filtres actuels.</p>
            <button className="btn-line mt-3" onClick={() => setFilters(f => ({ ...f, search: "", states: undefined, domains: [], locations: [], hasMissingInfo: false, eligibility: "unknown", relevance: "unknown" }))}>
              Réinitialiser les filtres
            </button>
          </div>
        ) : (
          filteredOffers.map(({ offer, qualification, analysis }) => {
            const info = getStateInfo(qualification.state);
            const place = offerLocation(offer.location);
            const isSelected = selectedIds.has(offer.id);
            
            return (
              <article
                key={offer.id}
                className={`offer-row glass-card p-4 relative transition-colors ${isSelected ? "ring-2 ring-emerald-500 bg-emerald-50" : ""} ${viewMode === "list" ? "flex items-start gap-4" : "flex flex-col"}`}
                data-offer-id={offer.id}
                tabIndex={0}
                onClick={e => {
                  const target = e.target as Element;
                  if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement || target.closest("button, a")) return;
                  onOpenDetail(offer.id);
                }}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDetail(offer.id); }}}
              >
                <div className="flex items-start justify-between gap-3 w-full">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-2xl" aria-hidden="true">
                      {info.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start gap-2">
                        <h4 className="font-display text-base font-semibold truncate flex-1">{offer.title || "Sans titre"}</h4>
                        <span className={`whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${info.colors.bg} ${info.colors.border} ${info.colors.text}`}>
                          {info.label}
                        </span>
                      </div>
                      <p className="text-sm text-text-dim mt-0.5 truncate">
                        {offer.company} · {place.city || place.region || offer.location || "Lieu non précisé"}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2 text-[0.7rem]">
                        {offer.contract && <span className="chip chip--mint">{offer.contract}</span>}
                        {offer.duration && <span className="chip">{offer.duration}</span>}
                        {offer.startDate && <span className="chip chip--amber">Début ~ {formatDate(offer.startDate)}</span>}
                        {qualification.priority > 0 && <span className="chip chip--violet">Priorité {qualification.priority}</span>}
                        {qualification.infoToVerify.length > 0 && <span className="chip chip--amber">⚠ {qualification.infoToVerify.length} à vérifier</span>}
                      </div>
                      {viewMode !== "list" && analysis && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {getEligibilityBadge(analysis)}
                          {getRelevanceBadge(analysis)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={e => { e.stopPropagation(); handleSelect(offer.id); }}
                      className="mt-1"
                      aria-label={`Sélectionner ${offer.title}`}
                    />
                    <div className="flex flex-wrap gap-1">
                      <button className="btn-line btn-sm" onClick={e => { e.stopPropagation(); onOpenDetail(offer.id); }}>Détail</button>
                      <button className="btn-line btn-sm" onClick={e => { e.stopPropagation(); onOpenMatching(offer.id); }}>Matching</button>
                      <button className="btn-line btn-sm" onClick={e => { e.stopPropagation(); onOpenMissionPFE(offer.id); }}>Mission PFE</button>
                      <button className="btn-primary btn-sm" onClick={e => { e.stopPropagation(); onOpenReadyToApply(offer.id); }}>Prêt à postuler</button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Pagination simplifiée - pour l'instant tout afficher */}
      {filteredOffers.length > 50 && (
        <p className="text-sm text-muted text-center mt-4">
          Affichage des {Math.min(filteredOffers.length, 50)} premières offres sur {filteredOffers.length}. Affinez vos filtres.
        </p>
      )}
    </div>
  );
}