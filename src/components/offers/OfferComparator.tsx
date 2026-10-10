"use client";

import { useMemo, useCallback } from "react";
import type { UserData, DetectedOffer } from "@/lib/data";
import type { PfeAnalysis } from "@/lib/pfe-matching";
import type { OfferQualification } from "@/lib/offer-qualification";
import { buildComparison, canCompare, type OfferComparison } from "@/lib/offer-comparison";
import { getFreshAnalysis, getStateInfo } from "@/lib/offer-qualification";
import { offerLocation } from "@/lib/offer-location";

interface OfferComparatorProps {
  offerIds: string[];
  data: UserData;
  onRemove: (offerId: string) => void;
  onReorder: (offerIds: string[]) => void;
  onOpenDetail: (offerId: string) => void;
  onOpenMissionPFE: (offerId: string) => void;
  onRetain: (offerId: string) => void;
  onNavigate: (href: string) => void;
  onClose: () => void;
}

function ComparisonHeader({ offer, qualification, analysis, onRemove, onOpenDetail, onOpenMissionPFE, onRetain, onNavigate, index, moveLeft, moveRight }: {
  offer: DetectedOffer;
  qualification: OfferQualification;
  analysis: PfeAnalysis | null;
  onRemove: () => void;
  onOpenDetail: () => void;
  onOpenMissionPFE: () => void;
  onRetain: () => void;
  onNavigate: (href: string) => void;
  index: number;
  moveLeft: () => void;
  moveRight: () => void;
}) {
  const info = getStateInfo(qualification.state);
  const place = offerLocation(offer.location);

  return (
    <th className="relative p-4 border-b-2 border-line bg-white/50">
      <button className="absolute top-2 right-2 p-1 rounded hover:bg-red-100 text-red-600" onClick={onRemove} aria-label="Retirer de la comparaison">✕</button>
      <div className="flex flex-col items-start gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{info.icon}</span>
          <span className={`whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${info.colors.bg} ${info.colors.border} ${info.colors.text}`}>
            {info.label}
          </span>
        </div>
        <h3 className="font-display text-lg font-semibold truncate max-w-xs">{offer.title}</h3>
        <p className="text-sm text-text-dim">{offer.company}</p>
        <p className="text-xs text-muted">{place.city || place.region || offer.location || "—"}</p>
      </div>
      
      <div className="flex flex-wrap gap-1.5 mb-3 text-[0.7rem]">
        {offer.contract && <span className="chip chip--mint">{offer.contract}</span>}
        {offer.duration && <span className="chip">{offer.duration}</span>}
        {offer.startDate && <span className="chip chip--amber">{offer.startDate.slice(0, 10)}</span>}
        {qualification.priority > 0 && <span className="chip chip--violet">Prio {qualification.priority}</span>}
      </div>

      {analysis && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className={`pill ${analysis.eligibility.status === "eligible" ? "pill--ok" : analysis.eligibility.status === "verify" ? "pill--wait" : "pill"}`}>
            {analysis.eligibility.status === "eligible" ? "Éligible" : analysis.eligibility.status === "verify" ? "À vérifier" : "Incompatible"}
          </span>
          <span className={`pill ${analysis.relevance.level === "forte" ? "pill--ok" : analysis.relevance.level === "à examiner" ? "pill--wait" : "pill"}`}>
            {analysis.relevance.level === "forte" ? "Forte" : analysis.relevance.level === "à examiner" ? "À examiner" : "Faible"}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button className="btn-line btn-sm" onClick={onOpenDetail}>Détail</button>
        <button className="btn-line btn-sm" onClick={onOpenMissionPFE}>Mission PFE</button>
        <button className="btn-primary btn-sm" onClick={onRetain}>Retenir</button>
      </div>

      {/* Priorité personnelle */}
      <div className="mt-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="mono-label">Priorité perso</span>
          <input type="number" min={1} max={10} className="input w-16" defaultValue={index + 1} onChange={e => onNavigate(`/app/offers?priority=${offer.id}:${e.target.value}`)} />
        </label>
      </div>

      {/* Déplacer */}
      <div className="flex gap-1 mt-2">
        <button className="btn-line btn-sm p-1.5" onClick={moveLeft} disabled={index === 0} aria-label="Déplacer à gauche">←</button>
        <button className="btn-line btn-sm p-1.5" onClick={moveRight} disabled={false} aria-label="Déplacer à droite">→</button>
      </div>
    </th>
  );
}

function ComparisonCell({ cell }: { cell: OfferComparison["cells"][0] }) {
  const isHighlighted = cell.hasDifference;
  
  return (
    <tr className={isHighlighted ? "bg-amber-50/50" : ""}>
      <th className="p-3 border-b border-line bg-white/50 font-medium text-left mono-label text-[0.65rem] sticky left-0 z-10">
        {cell.label}
      </th>
      {cell.values.map(({ offerId, value, highlight }) => (
        <td key={offerId} className={`p-3 border-b border-line ${highlight ? "bg-amber-100/50 font-medium" : ""}`}>
          <div className="whitespace-pre-wrap text-sm">{value}</div>
        </td>
      ))}
    </tr>
  );
}

export default function OfferComparator({
  offerIds,
  data,
  onRemove,
  onReorder,
  onOpenDetail,
  onOpenMissionPFE,
  onRetain,
  onNavigate,
  onClose,
}: OfferComparatorProps) {
  const offersDataMemo = useMemo(() => offerIds.map(id => {
    const offer = data.offers.find(o => o.id === id);
    const qualification = data.offerQualifications?.[id];
    const analysis = offer ? getFreshAnalysis(data, offer) : null;
    return { offer: offer!, qualification: qualification!, analysis };
  }).filter(d => d.offer), [offerIds, data]);

  const comparison = useMemo(() => buildComparison(data, offerIds), [data, offerIds]);

  const handleMoveLeft = useCallback((index: number) => {
    const newIds = [...offerIds];
    if (index > 0) {
      [newIds[index - 1], newIds[index]] = [newIds[index], newIds[index - 1]];
      onReorder(newIds);
    }
  }, [offerIds, onReorder]);

  const handleMoveRight = useCallback((index: number) => {
    const newIds = [...offerIds];
    if (index < newIds.length - 1) {
      [newIds[index], newIds[index + 1]] = [newIds[index + 1], newIds[index]];
      onReorder(newIds);
    }
  }, [offerIds, onReorder]);

  const validation = canCompare(offerIds);
  if (!validation.ok) {
    return (
      <div className="glass-card p-8 text-center">
        <h3 className="font-display text-xl">Comparateur d&apos;offres</h3>
        <p className="text-sm text-muted mt-3">{validation.error}</p>
        <button className="btn-primary mt-4" onClick={onClose}>Fermer</button>
      </div>
    );
  }

  return (
    <div className="offer-comparator space-y-6">
      <style jsx>{`
        .offer-comparator { max-width: 100%; }
        .comparison-table { overflow-x: auto; }
        .comparison-table table { min-width: max-content; }
        .comparison-table th { position: sticky; left: 0; z-index: 10; }
        .comparison-table th:first-child { z-index: 20; }
      `}</style>

      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Comparateur d&apos;opportunités</h2>
          <p className="text-sm text-muted mt-1">{offerIds.length} offres sélectionnées — mettez en évidence les différences significatives</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-line" onClick={onClose}>Fermer le comparateur</button>
        </div>
      </div>

      {/* Barre de progression si < 4 */}
      {offerIds.length < 4 && (
        <div className="glass-card p-3 border border-line">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium ${i < offerIds.length ? "bg-emerald-100 text-emerald-700" : "bg-surface-2 text-muted"}`}>
                  {i + 1}
                </div>
              ))}
            </div>
            <span className="text-sm text-text-dim">Ajoutez jusqu&apos;à 4 offres pour comparer</span>
          </div>
        </div>
      )}

      {/* En-têtes des offres */}
      <div className="comparison-table glass-card rounded-xl border border-line overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="w-48 p-4 border-b-2 border-line bg-white/50 mono-label text-[0.65rem]"></th>
              {offersDataMemo.map((d, i) => (
                <ComparisonHeader
                  key={d.offer.id}
                  offer={d.offer}
                  qualification={d.qualification}
                  analysis={d.analysis}
                  onRemove={() => onRemove(d.offer.id)}
                  onOpenDetail={() => onOpenDetail(d.offer.id)}
                  onOpenMissionPFE={() => onOpenMissionPFE(d.offer.id)}
                  onRetain={() => onRetain(d.offer.id)}
                  onNavigate={onNavigate}
                  index={i}
                  moveLeft={() => handleMoveLeft(i)}
                  moveRight={() => handleMoveRight(i)}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.cells.map(cell => (
              <ComparisonCell key={cell.field} cell={cell} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Légende */}
      <div className="glass-card p-4 border border-line flex flex-wrap items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></span>
          Différence significative mise en évidence
        </span>
        <span className="flex items-center gap-1.5">
          <span className="pill pill--ok text-xs">Éligible</span>
          <span className="pill pill--wait text-xs">À vérifier</span>
          <span className="pill text-xs">Incompatible</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="pill pill--ok text-xs">Forte</span>
          <span className="pill pill--wait text-xs">À examiner</span>
          <span className="pill text-xs">Faible</span>
        </span>
      </div>

      {/* Actions globales */}
      <div className="glass-card p-4 border border-line flex flex-wrap gap-3">
        <button className="btn-primary" onClick={() => offerIds.forEach(id => onRetain(id))}>Retenir toutes</button>
        <button className="btn-line" onClick={() => onNavigate(`/app/offers?compare=${offerIds.join(",")}`)}>Exporter la comparaison</button>
      </div>
    </div>
  );
}