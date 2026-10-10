"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import type { UserData, DetectedOffer, Application } from "@/lib/data";
import type { PfeAnalysis } from "@/lib/pfe-matching";
import type { OfferQualification } from "@/lib/offer-qualification";
import { getShortlistedOffers, reorderShortlist, updateQualification, getStateInfo } from "@/lib/offer-qualification";
import { getFreshAnalysis } from "@/lib/offer-qualification";
import { offerLocation } from "@/lib/offer-location";

interface ShortlistViewProps {
  data: UserData;
  onReorder: (offerIds: string[]) => void;
  onUpdatePriority: (offerId: string, priority: number) => void;
  onUpdateNote: (offerId: string, note: string) => void;
  onUpdateJustification: (offerId: string, justification: string) => void;
  onOpenDetail: (offerId: string) => void;
  onOpenMissionPFE: (offerId: string) => void;
  onOpenReadyToApply: (offerId: string) => void;
  onRemoveFromShortlist: (offerId: string) => void;
  onNavigate: (href: string) => void;
}

function ShortlistItem({ item, index, analysis, application, onReorder, onUpdatePriority, onUpdateNote, onUpdateJustification, onOpenDetail, onOpenMissionPFE, onOpenReadyToApply, onRemoveFromShortlist, onNavigate }: {
  item: { offer: DetectedOffer; qualification: OfferQualification };
  index: number;
  analysis: PfeAnalysis | null;
  application: Application | null;
  onReorder: (offerIds: string[]) => void;
  onUpdatePriority: (offerId: string, priority: number) => void;
  onUpdateNote: (offerId: string, note: string) => void;
  onUpdateJustification: (offerId: string, justification: string) => void;
  onOpenDetail: () => void;
  onOpenMissionPFE: () => void;
  onOpenReadyToApply: () => void;
  onRemoveFromShortlist: () => void;
  onNavigate: (href: string) => void;
}) {
  const { offer, qualification } = item;
  const place = offerLocation(offer.location);
  const [showDetails, setShowDetails] = useState(false);
  const [note, setNote] = useState(qualification.note);
  const [justification, setJustification] = useState(qualification.justification);
  const [priority, setPriority] = useState(qualification.priority);
  const [shortlistPriority, setShortlistPriority] = useState(qualification.shortlistPosition || index + 1);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", offer.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");
    if (sourceId === targetId) return;
    
    // This would need the full list to reorder properly
    // For now we just trigger a reorder notification
    onNavigate(`/app/offers?reorder=${sourceId},${targetId}`);
  };

  const handlePriorityChange = (newPriority: number) => {
    setPriority(newPriority);
    onUpdatePriority(offer.id, newPriority);
  };

  const handleShortlistPriorityChange = (newPos: number) => {
    setShortlistPriority(newPos);
    // The actual reorder is handled by the parent via onReorder
  };

  const handleNoteBlur = () => {
    onUpdateNote(offer.id, note);
  };

  const handleJustificationBlur = () => {
    onUpdateJustification(offer.id, justification);
  };

  return (
    <article
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={e => handleDrop(e, offer.id)}
      className="shortlist-item glass-card p-4 relative group transition-all"
      style={{ borderLeft: "4px solid var(--violet)" }}
    >
      <style jsx>{`
        .shortlist-item:hover { box-shadow: var(--shadow-md); }
        .shortlist-item.dragging { opacity: 0.5; }
        .drag-handle { cursor: grab; }
        .drag-handle:active { cursor: grabbing; }
      `}</style>

      {/* Drag handle */}
      <button
        className="drag-handle absolute top-3 right-3 p-1.5 rounded hover:bg-surface-2 text-muted"
        onMouseDown={e => e.stopPropagation()}
        aria-label="Réorganiser"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 5v14M15 5v14"/></svg>
      </button>

      {/* Badge de position */}
      <div className="absolute top-3 left-3 w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-display font-bold text-sm">
        {qualification.shortlistPosition || index + 1}
      </div>

      <div className="ml-12">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-xl">
              📋
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-display text-lg font-semibold truncate flex-1">{offer.title}</h4>
                <span className="chip chip--violet text-[0.65rem]">Shortlist #{qualification.shortlistPosition || index + 1}</span>
                {qualification.priority > 0 && <span className="chip chip--violet text-[0.65rem]">Prio {qualification.priority}</span>}
              </div>
              <p className="text-text-dim mt-0.5 truncate">{offer.company} · {place.city || place.region || offer.location || "—"}</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5 text-[0.7rem]">
                {offer.contract && <span className="chip chip--mint">{offer.contract}</span>}
                {offer.duration && <span className="chip">{offer.duration}</span>}
                {offer.startDate && <span className="chip chip--amber">{offer.startDate.slice(0, 10)}</span>}
                {analysis && (
                  <>
                    <span className={`chip ${analysis.eligibility.status === "eligible" ? "chip--mint" : analysis.eligibility.status === "verify" ? "chip--amber" : "chip--muted"}`}>
                      {analysis.eligibility.status === "eligible" ? "✓" : analysis.eligibility.status === "verify" ? "⚠" : "✕"} PFE
                    </span>
                    <span className={`chip ${analysis.relevance.level === "forte" ? "chip--mint" : analysis.relevance.level === "à examiner" ? "chip--amber" : "chip--muted"}`}>
                      {analysis.relevance.level === "forte" ? "★★★" : analysis.relevance.level === "à examiner" ? "★★" : "★"} Pert.
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {application && (
              <span className="pill pill--ok text-xs">Déjà candidate · {application.status}</span>
            )}
            <div className="flex flex-wrap gap-1">
              <button className="btn-line btn-sm" onClick={onOpenDetail}>Détail</button>
              <button className="btn-line btn-sm" onClick={onOpenMissionPFE}>Mission PFE</button>
              <button className="btn-primary btn-sm" onClick={onOpenReadyToApply}>Prêt à postuler</button>
              <button className="btn-ghost btn-sm text-red-600 hover:bg-red-50" onClick={onRemoveFromShortlist}>Retirer</button>
            </div>
          </div>
        </div>

        {/* Détails repliables */}
        <button
          className="text-sm text-mint hover:underline flex items-center gap-1"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? "▲ Masquer les détails" : "▼ Voir détails, notes, justification"}
        </button>

        {showDetails && (
          <div className="mt-4 space-y-4 pt-4 border-t border-line animate-slide-down">
            {/* Priorité personnelle */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mono-label block mb-1">Priorité (1-10)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="input w-full max-w-xs"
                  value={priority}
                  onChange={e => handlePriorityChange(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                />
              </div>
              <div>
                <label className="mono-label block mb-1">Position shortlist</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="input w-full max-w-xs"
                  value={shortlistPriority}
                  onChange={e => setShortlistPriority(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                />
              </div>
              <div className="flex items-end">
                <button className="btn-line btn-sm" onClick={() => {
                  // Trigger reorder based on shortlistPriority
                  onNavigate(`/app/offers?reorder-priority=${offer.id}:${shortlistPriority}`);
                }}>
                  Appliquer la position
                </button>
              </div>
            </div>

            {/* Note personnelle */}
            <div>
              <label className="mono-label block mb-1">Note personnelle</label>
              <textarea
                className="input w-full min-h-20"
                value={note}
                onChange={e => setNote(e.target.value)}
                onBlur={handleNoteBlur}
                placeholder="Vos impressions, contacts, relances prévues…"
              />
            </div>

            {/* Justification */}
            <div>
              <label className="mono-label block mb-1">Justification du choix</label>
              <textarea
                className="input w-full min-h-20"
                value={justification}
                onChange={e => setJustification(e.target.value)}
                onBlur={handleJustificationBlur}
                placeholder="Pourquoi cette offre est dans votre shortlist ?"
              />
            </div>

            {/* Informations à vérifier */}
            {qualification.infoToVerify.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="mono-label mb-2">⚠ Informations à vérifier</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-deep">
                  {qualification.infoToVerify.map((info, i) => <li key={i}>{info}</li>)}
                </ul>
              </div>
            )}

            {/* Points forts / Lacunes */}
            {analysis && (
              <div className="grid gap-3 sm:grid-cols-2">
                {analysis.strengths.length > 0 && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <p className="mono-label mb-2">✅ Points forts ({analysis.strengths.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.strengths.map((s, i) => <span key={i} className="chip chip--mint text-[0.7rem]">{s}</span>)}
                    </div>
                  </div>
                )}
                {analysis.gaps.length > 0 && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                    <p className="mono-label mb-2">❌ Lacunes obligatoires ({analysis.gaps.length})</p>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-red-700">
                      {analysis.gaps.map((g, i) => <li key={i}>{g}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Lien vers le dossier */}
            {offer.url && (
              <a href={offer.url} target="_blank" rel="noopener noreferrer" className="btn-line btn-sm inline-flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Voir l'annonce
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default function ShortlistView({
  data,
  onReorder,
  onUpdatePriority,
  onUpdateNote,
  onUpdateJustification,
  onOpenDetail,
  onOpenMissionPFE,
  onOpenReadyToApply,
  onRemoveFromShortlist,
  onNavigate,
}: ShortlistViewProps) {
  const shortlisted = useMemo(() => getShortlistedOffers(data), [data.offers, data.offerQualifications, data.pfeAnalyses, data.applications]);

  if (shortlisted.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <h3 className="font-display text-xl">Votre shortlist est vide</h3>
        <p className="text-sm text-muted mt-3">Ajoutez des offres depuis la boîte de réception ou le comparateur pour les retenir.</p>
        <p className="text-xs text-muted mt-2">Les offres retenues apparaissent ici avec leur priorité, vos notes et justification.</p>
      </div>
    );
  }

  return (
    <div className="shortlist-view space-y-4">
      <style jsx>{`
        .shortlist-view { max-width: 100%; }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Shortlist personnelle</h2>
          <p className="text-sm text-muted mt-1">{shortlisted.length} offre{shortlisted.length > 1 ? "s" : ""} retenue{shortlisted.length > 1 ? "s" : ""} — glissez-déposez pour réorganiser</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-line" onClick={() => onNavigate("/app/offers?view=inbox")}>← Boîte de réception</button>
          <button className="btn-primary" onClick={() => shortlisted.forEach(({ offer }) => onOpenReadyToApply(offer.id))}>Postuler à toutes</button>
        </div>
      </div>

      <div className="space-y-3" role="list" aria-label="Shortlist d'offres retenues">
        {shortlisted.map((item, index) => {
          const analysis = item.offer ? getFreshAnalysis(data, item.offer) : null;
          const application = data.applications.find(a => a.offerId === item.offer.id) || null;
          return (
            <ShortlistItem
              key={item.offer.id}
              item={item}
              index={index}
              analysis={analysis}
              application={application}
              onReorder={onReorder}
              onUpdatePriority={onUpdatePriority}
              onUpdateNote={onUpdateNote}
              onUpdateJustification={onUpdateJustification}
              onOpenDetail={() => onOpenDetail(item.offer.id)}
              onOpenMissionPFE={() => onOpenMissionPFE(item.offer.id)}
              onOpenReadyToApply={() => onOpenReadyToApply(item.offer.id)}
              onRemoveFromShortlist={() => onRemoveFromShortlist(item.offer.id)}
              onNavigate={onNavigate}
            />
          );
        })}
      </div>
    </div>
  );
}