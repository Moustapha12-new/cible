import React, { useState } from "react";
import { Search, ChevronDown, SlidersHorizontal } from "lucide-react";
import { SOURCE_SITES, type OfferListFilters } from "@/lib/offres-filters";

interface FiltersSidebarProps {
  /** Filtres réels pilotés par la page (aucun état démo local). */
  filters: OfferListFilters;
  onFiltersChange: (filters: OfferListFilters) => void;
  onSearchChange: (search: string) => void;
  onReset: () => void;
  /** Compteurs réels du catalogue — absents = aucun compte affiché. */
  facetCounts?: {
    contracts: Record<string, number>;
    domains: Record<string, number>;
    sources?: Record<string, number>;
  };
}

export function FiltersSidebar({
  filters,
  onFiltersChange,
  onSearchChange,
  onReset,
  facetCounts,
}: FiltersSidebarProps) {
  const [companySearch, setCompanySearch] = useState("");
  const [showMoreDomains, setShowMoreDomains] = useState(false);

  const count = (group: "contracts" | "domains", id: string) =>
    facetCounts?.[group]?.[id];

  const toggleIn = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const toggleContract = (id: string) =>
    onFiltersChange({ ...filters, contracts: toggleIn(filters.contracts, id) });

  const toggleDomain = (id: string) =>
    onFiltersChange({ ...filters, domains: toggleIn(filters.domains, id) });

  const toggleSource = (id: string) =>
    onFiltersChange({ ...filters, sources: toggleIn(filters.sources, id) });

  const handleCompanyInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCompanySearch(val);
    onSearchChange(val);
  };

  const handleReset = () => {
    setCompanySearch("");
    onReset();
  };

  const contractOptions = [
    { id: "stage-6", label: "Stage de 6 mois" },
    { id: "alternance", label: "Alternance" },
    { id: "autre", label: "Autre" },
  ];

  const domainOptions = [
    { id: "genie-electrique", label: "Génie électrique" },
    { id: "energie-enr", label: "Énergie / ENR" },
    { id: "automatisation", label: "Automatisation" },
    { id: "bureau-etudes", label: "Bureau d'études" },
  ];

  const moreDomainOptions = [
    { id: "systemes-embarques", label: "Systèmes embarqués" },
    { id: "reseaux-distribution", label: "Distribution & Smart Grid" },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
          <SlidersHorizontal size={14} className="text-slate-600" />
          <span>Filtres</span>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
        >
          Réinitialiser
        </button>
      </div>

      {/* Company Search Input */}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
        <input
          type="search"
          value={companySearch}
          onChange={handleCompanyInput}
          placeholder="Rechercher une entreprise…"
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Group: Type de contrat */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold text-slate-700">Type de contrat</span>
        <div className="flex flex-col gap-1.5 text-xs">
          {contractOptions.map((option) => {
            const optionCount = count("contracts", option.id);
            return (
              <label
                key={option.id}
                className="flex items-center gap-2 cursor-pointer text-slate-700 hover:text-slate-900"
              >
                <input
                  type="checkbox"
                  checked={filters.contracts.includes(option.id)}
                  onChange={() => toggleContract(option.id)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                />
                <span className="flex-1">{option.label}</span>
                {optionCount !== undefined && (
                  <span className="text-[10px] text-slate-400 font-medium">({optionCount})</span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      {/* Group: Source de l'offre (site d'origine du lien) */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold text-slate-700">Source de l&apos;offre</span>
        <div className="flex flex-col gap-1.5 text-xs">
          {Object.entries(SOURCE_SITES).map(([id, site]) => {
            const optionCount = facetCounts?.sources?.[id];
            return (
              <label
                key={id}
                className="flex items-center gap-2 cursor-pointer text-slate-700 hover:text-slate-900"
              >
                <input
                  type="checkbox"
                  checked={filters.sources.includes(id)}
                  onChange={() => toggleSource(id)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                />
                <span className="flex-1">{site.label}</span>
                {optionCount !== undefined && (
                  <span className="text-[10px] text-slate-400 font-medium">({optionCount})</span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      {/* Group: Localisation */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold text-slate-700">Localisation</span>
        <div className="relative">
          <select
            value={filters.region}
            onChange={(e) => onFiltersChange({ ...filters, region: e.target.value })}
            className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">Toutes les régions</option>
            <option value="idf">Île-de-France (Paris, Nanterre...)</option>
            <option value="ara">Auvergne-Rhône-Alpes (Lyon, Grenoble...)</option>
            <option value="paca">Provence-Alpes-Côte d&apos;Azur</option>
            <option value="ge">Grand Est</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Group: Domaine */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold text-slate-700">Domaine</span>
        <div className="flex flex-col gap-1.5 text-xs">
          {domainOptions.map((option) => {
            const optionCount = count("domains", option.id);
            return (
              <label
                key={option.id}
                className="flex items-center gap-2 cursor-pointer text-slate-700 hover:text-slate-900"
              >
                <input
                  type="checkbox"
                  checked={filters.domains.includes(option.id)}
                  onChange={() => toggleDomain(option.id)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                />
                <span className="flex-1">{option.label}</span>
                {optionCount !== undefined && (
                  <span className="text-[10px] text-slate-400 font-medium">({optionCount})</span>
                )}
              </label>
            );
          })}

          {showMoreDomains &&
            moreDomainOptions.map((option) => {
              const optionCount = count("domains", option.id);
              return (
                <label
                  key={option.id}
                  className="flex items-center gap-2 cursor-pointer text-slate-700 hover:text-slate-900"
                >
                  <input
                    type="checkbox"
                    checked={filters.domains.includes(option.id)}
                    onChange={() => toggleDomain(option.id)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                  />
                  <span className="flex-1">{option.label}</span>
                  {optionCount !== undefined && (
                    <span className="text-[10px] text-slate-400 font-medium">({optionCount})</span>
                  )}
                </label>
              );
            })}

          <button
            type="button"
            onClick={() => setShowMoreDomains(!showMoreDomains)}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 text-left mt-0.5 cursor-pointer"
          >
            {showMoreDomains ? "Voir moins ▴" : "Voir plus ▾"}
          </button>
        </div>
      </div>

      {/* Group: Date de publication */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold text-slate-700">Date de publication</span>
        <div className="relative">
          <select
            value={filters.period}
            onChange={(e) => onFiltersChange({ ...filters, period: e.target.value })}
            className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">Toutes les périodes</option>
            <option value="24h">Dernières 24 heures</option>
            <option value="7d">7 derniers jours</option>
            <option value="30d">30 derniers jours</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
