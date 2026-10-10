"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import type { UserData, DetectedOffer, Application } from "@/lib/data";
import type { PfeAnalysis, PFERequirement } from "@/lib/pfe-matching";
import type { OfferQualification, QualificationState } from "@/lib/offer-qualification";
import { getStateInfo, computeInfoToVerify, inferQualificationState, STATE_ORDER, getFreshAnalysis } from "@/lib/offer-qualification";
import { pfeEligibility } from "@/lib/pfe-target";
import { offerLocation } from "@/lib/offer-location";

interface OfferDetailPanelProps {
  offer: DetectedOffer | null;
  qualification: OfferQualification | null;
  analysis: PfeAnalysis | null;
  application: Application | null;
  data: UserData;
  onQualify: (offerId: string, state: QualificationState, note?: string) => void;
  onAddToShortlist: (offerId: string, priority: number, justification: string) => void;
  onOpenMatching: (offerId: string) => void;
  onOpenMissionPFE: (offerId: string) => void;
  onOpenReadyToApply: (offerId: string) => void;
  onAddNote: (offerId: string, note: string) => void;
  onSetPriority: (offerId: string, priority: number) => void;
  onAddToComparator: (offerId: string) => void;
  isInComparator: boolean;
  onNavigate: (href: string) => void;
  onDeepenWithGemini: (offerId: string) => void;
}

function EligibilityBadge({ status }: { status: "eligible" | "verify" | "excluded" | "unknown" }) {
  if (status === "unknown") return <span className="pill">Non analysé</span>;
  const config = {
    eligible: { label: "Éligible PFE", cls: "pill pill--ok" },
    verify: { label: "À vérifier", cls: "pill pill--wait" },
    excluded: { label: "Incompatible", cls: "pill" },
  }[status];
  return <span className={config.cls}>{config.label}</span>;
}

function RelevanceBadge({ level }: { level: "forte" | "à examiner" | "faible" | "unknown" }) {
  if (level === "unknown") return <span className="pill">Non analysé</span>;
  const config = {
    forte: { label: "Pertinence forte", cls: "pill pill--ok" },
    "à examiner": { label: "À examiner", cls: "pill pill--wait" },
    faible: { label: "Pertinence faible", cls: "pill" },
  }[level];
  return <span className={config.cls}>{config.label}</span>;
}

function PriorityChip({ priority }: { priority: number }) {
  if (priority <= 0) return null;
  return <span className="chip chip--violet">Priorité {priority}</span>;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  try { return new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); } catch { return dateStr.slice(0, 10); }
}

function Section({ title, icon, children, className = "" }: { title: string; icon?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`glass-card p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        {icon && <span className="text-xl">{icon}</span>}
        <h3 className="font-display text-lg font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function InfoRow({ label, value, copyable = false }: { label: string; value: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-2 border-t border-line/50">
      <span className="mono-label text-[0.65rem] sm:w-32 flex-shrink-0">{label}</span>
      <span className="text-sm text-text-dim truncate flex-1">{value || "—"}</span>
      {copyable && value && value !== "—" && (
        <button
          className="p-1.5 rounded-lg text-muted hover:text-emerald transition-colors"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          aria-label={copied ? "Copié" : "Copier"}
        >
          {copied ? "✓" : "📋"}
        </button>
      )}
    </div>
  );
}

export default function OfferDetailPanel({
  offer,
  qualification,
  analysis,
  application,
  data,
  onQualify,
  onAddToShortlist,
  onOpenMatching,
  onOpenMissionPFE,
  onOpenReadyToApply,
  onAddNote,
  onSetPriority,
  onAddToComparator,
  isInComparator,
  onNavigate,
  onDeepenWithGemini,
}: OfferDetailPanelProps) {
  const [showGeminiHint, setShowGeminiHint] = useState(false);
  const [note, setNote] = useState(qualification?.note || "");
  const [priority, setPriority] = useState(qualification?.priority || 0);
  const [justification, setJustification] = useState(qualification?.justification || "");
  const [shortlistPriority, setShortlistPriority] = useState(1);

  if (!offer) {
    return (
      <div className="glass-card p-12 text-center">
        <h3 className="font-display text-xl">Sélectionnez une offre</h3>
        <p className="text-sm text-muted mt-3">Cliquez sur une offre dans la liste pour voir ses détails et la qualifier.</p>
      </div>
    );
  }

  const info = qualification ? getStateInfo(qualification.state) : getStateInfo("new");
  const place = offerLocation(offer.location);
  const eligibility = analysis ? analysis.eligibility : pfeEligibility(offer);
  const relevance = analysis ? analysis.relevance : { level: "unknown" as const, reasons: [], domains: [] };
  const infoToVerify = qualification?.infoToVerify || computeInfoToVerify(offer, analysis);
  const strengths = analysis?.strengths || [];
  const gaps = analysis?.gaps || [];
  const unknowns = analysis?.unknowns || [];
  const requirements = analysis?.requirements || [];

  const handleQualify = (state: QualificationState) => {
    onQualify(offer.id, state, note);
  };

  const handleAddToShortlist = () => {
    onAddToShortlist(offer.id, shortlistPriority, justification);
  };

  const handleSaveNote = () => {
    onAddNote(offer.id, note);
  };

  const handleSavePriority = () => {
    onSetPriority(offer.id, priority);
  };

  const handleSaveJustification = () => {
    onAddNote(offer.id, justification); // reuse note field for justification
  };

  return (
    <div className="offer-detail-panel space-y-5 lg:sticky lg:top-24 max-h-[calc(100vh-120px)] overflow-y-auto pr-2">
      {/* En-tête de l'offre */}
      <div className="glass-card p-5 relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${info.colors.bg} ${info.colors.border}`}>
              {info.icon}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl font-semibold truncate flex-1">{offer.title || "Sans titre"}</h2>
                <span className={`whitespace-nowrap px-3 py-1 rounded-full text-sm font-medium ${info.colors.bg} ${info.colors.border} ${info.colors.text}`}>
                  {info.label}
                </span>
              </div>
              <p className="text-text-dim mt-1">{offer.company} · {place.city || place.region || offer.location || "Lieu non précisé"}</p>
              <div className="flex flex-wrap gap-1.5 mt-2 text-[0.7rem]">
                {offer.contract && <span className="chip chip--mint">{offer.contract}</span>}
                {offer.duration && <span className="chip">{offer.duration}</span>}
                {offer.salary && <span className="chip chip--mint">{offer.salary}</span>}
                {offer.startDate && <span className="chip chip--amber">Début ~ {formatDate(offer.startDate)}</span>}
                {offer.source && <span className="chip chip--muted">{offer.source}</span>}
                <PriorityChip priority={qualification?.priority || 0} />
              </div>
            </div>
          </div>
          {application && (
            <div className="flex flex-col items-end gap-1 text-right">
              <span className="pill pill--ok text-xs">Déjà candidate</span>
              <span className="text-xs text-muted">{application.status} · {application.date ? formatDate(application.date) : ""}</span>
            </div>
          )}
        </div>
      </div>

      {/* Badges d'éligibilité et pertinence */}
      <div className="flex flex-wrap items-center gap-3">
        <EligibilityBadge status={eligibility.status} />
        <RelevanceBadge level={relevance.level} />
        {analysis && analysis.fingerprint && (
          <span className="chip chip--muted text-[0.65rem]">Analyse à jour</span>
        )}
        {!analysis && (
          <span className="chip chip--amber text-[0.65rem]">Non analysée</span>
        )}
        {qualification?.infoToVerify.length && (
          <span className="chip chip--amber">⚠ {qualification.infoToVerify.length} info à vérifier</span>
        )}
      </div>

      {/* Lien réel de l'annonce */}
      {offer.url && (
        <div className="glass-card p-4 border-l-2 border-l-emerald">
          <a href={offer.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-emerald hover:underline font-medium">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Voir l'annonce originale ↗
          </a>
        </div>
      )}

      {/* Actions rapides */}
      <div className="glass-card p-4 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => onOpenReadyToApply(offer.id)}>Prêt à postuler →</button>
        <button className="btn-line" onClick={() => onOpenMissionPFE(offer.id)}>Ouvrir Mission PFE</button>
        <button className="btn-line" onClick={() => onOpenMatching(offer.id)}>Analyser (Matching)</button>
        <button className="btn-line" onClick={() => onAddToComparator(offer.id)}>
          {isInComparator ? "✓ Dans le comparateur" : "Ajouter au comparateur"}
        </button>
        <button className="btn-line" onClick={handleAddToShortlist}>Ajouter à la shortlist</button>
        <button className="btn-line" onClick={() => { setShowGeminiHint(true); onDeepenWithGemini(offer.id); }}>Approfondir avec Gemini</button>
      </div>

      {/* Qualification - Boutons d'état */}
      <Section title="Qualification" icon="🎯">
        <p className="text-sm text-text-dim mb-4">Changez l'état de qualification de cette offre. Vos décisions sont sauvegardées et réversibles.</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {STATE_ORDER.map(state => {
            const sinfo = getStateInfo(state);
            const isActive = qualification?.state === state;
            return (
              <button
                key={state}
                type="button"
                onClick={() => handleQualify(state)}
                className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${isActive ? `bg-emerald-50 border-emerald-500 text-emerald-700` : "bg-white/50 border-line hover:border-line-strong"}`}
                aria-pressed={isActive}
              >
                <span className="mr-1">{sinfo.icon}</span>
                {sinfo.label}
              </button>
            );
          })}
        </div>
        
        {/* Note et priorité */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mono-label block mb-1.5">Note personnelle</label>
            <textarea
              className="input w-full min-h-20"
              value={note}
              onChange={e => setNote(e.target.value)}
              onBlur={handleSaveNote}
              placeholder="Vos impressions, points d'attention, contacts…"
            />
          </div>
          <div>
            <label className="mono-label block mb-1.5">Priorité (0-10)</label>
            <input
              type="number"
              min={0}
              max={10}
              className="input w-full max-w-xs"
              value={priority}
              onChange={e => { const v = Math.max(0, Math.min(10, parseInt(e.target.value) || 0)); setPriority(v); onSetPriority(offer.id, v); }}
            />
          </div>
        </div>

        {/* Justification pour shortlist */}
        <div className="mt-4">
          <label className="mono-label block mb-1.5">Justification (si retenue en shortlist)</label>
          <textarea
            className="input w-full min-h-20"
            value={justification}
            onChange={e => setJustification(e.target.value)}
            placeholder="Pourquoi cette offre mérite d'être retenue ?"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="number" min={1} max={10} className="input w-16" value={shortlistPriority} onChange={e => setShortlistPriority(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))} />
              Position shortlist
            </label>
          </div>
        </div>
      </Section>

      {/* Éligibilité PFE */}
      <Section title="Éligibilité PFE" icon="🎯">
        <div className="space-y-3">
          <div className="p-4 rounded-lg bg-white/50 border border-line">
            <EligibilityBadge status={eligibility.status} />
          </div>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {eligibility.reasons.map((reason, i) => (
              <li key={i} className="text-text-dim">{reason}</li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Pertinence technique */}
      <Section title="Pertinence technique" icon="🔧">
        <div className="space-y-3">
          <div className="p-4 rounded-lg bg-white/50 border border-line">
            <RelevanceBadge level={relevance.level} />
          </div>
          {relevance.domains.length > 0 && (
            <div>
              <p className="mono-label mb-1.5">Domaines identifiés</p>
              <div className="flex flex-wrap gap-1.5">
                {relevance.domains.map((d, i) => (
                  <span key={i} className="chip chip--mint">{d}</span>
                ))}
              </div>
            </div>
          )}
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {relevance.reasons.map((reason, i) => (
              <li key={i} className="text-text-dim">{reason}</li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Exigences et adéquation démontrée */}
      {requirements.length > 0 && (
        <Section title="Exigences et adéquation démontrée" icon="📋">
          <p className="text-sm text-muted mb-4">
            <strong>Prouvée</strong> = preuve décrite et sourcée · <strong>Citée dans le CV</strong> = mention textuelle ·
            <strong>Déclarée</strong> = dans le registre · <strong>Non documentée</strong> = aucune trace
          </p>
          <div className="space-y-3">
            {requirements.map((req: PFERequirement) => (
              <article key={req.term} className="border-t border-line pt-4">
                <div className="flex flex-wrap gap-2 items-center">
                  <strong>{req.term}</strong>
                  <span className={`pill ${req.priority === "obligatoire" ? "pill--wait" : req.priority === "souhaitée" ? "pill--info" : ""}`}>{req.priority}</span>
                  <span className={`pill ${req.match === "prouvée" ? "pill--ok" : req.match === "citée dans le CV" ? "pill--info" : req.match === "déclarée" ? "" : "pill"}`}>{req.match}</span>
                </div>
                <p className="text-xs text-muted mt-2">Annonce : « {req.source} »</p>
                {req.cvExcerpt && <p className="text-xs text-text-dim mt-1">CV : « {req.cvExcerpt} »</p>}
              </article>
            ))}
          </div>
        </Section>
      )}

      {/* Points forts de ma candidature */}
      {strengths.length > 0 && (
        <Section title="Points forts de ma candidature" icon="✅">
          <div className="flex flex-wrap gap-1.5">
            {strengths.map((s, i) => (
              <span key={i} className="chip chip--mint">{s}</span>
            ))}
          </div>
        </Section>
      )}

      {/* Lacunes */}
      {gaps.length > 0 && (
        <Section title="Lacunes à combler" icon="⚠️">
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {gaps.map((g, i) => (
              <li key={i} className="text-text-dim">{g}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Informations à vérifier */}
      {infoToVerify.length > 0 && (
        <Section title="Informations à vérifier" icon="🔍" className="border-l-2 border-l-amber">
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {infoToVerify.map((info: string, i: number) => (
              <li key={i} className="text-amber-deep">{info}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Description complète de l'offre */}
      {(offer.description || offer.missions?.length || offer.prerequisites?.length || offer.profile) && (
        <Section title="Détails de l'offre" icon="📄">
          <div className="space-y-4 text-sm">
            {offer.summary && (
              <div>
                <p className="mono-label mb-1.5">Résumé</p>
                <p className="text-text-dim leading-relaxed">{offer.summary}</p>
              </div>
            )}
            {offer.description && (
              <div>
                <p className="mono-label mb-1.5">Description</p>
                <p className="text-text-dim leading-relaxed">{offer.description}</p>
              </div>
            )}
            {offer.missions?.length && (
              <div>
                <p className="mono-label mb-1.5">Missions</p>
                <ul className="list-disc pl-5 space-y-1 text-text-dim">
                  {offer.missions.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}
            {offer.prerequisites?.length && (
              <div>
                <p className="mono-label mb-1.5">Prérequis</p>
                <ul className="list-disc pl-5 space-y-1 text-text-dim">
                  {offer.prerequisites.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            )}
            {offer.profile && (
              <div>
                <p className="mono-label mb-1.5">Profil recherché</p>
                <p className="text-text-dim leading-relaxed">{offer.profile}</p>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Informations techniques */}
      <details className="glass-card p-4">
        <summary className="mono-label cursor-pointer">Détails techniques</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
          <InfoRow label="ID offre" value={offer.id} copyable />
          <InfoRow label="Source" value={offer.source || "—"} />
          <InfoRow label="URL" value={offer.url || "—"} copyable />
          <InfoRow label="Date détection" value={qualification?.decidedAt ? formatDate(qualification.decidedAt) : "—"} />
          <InfoRow label="Dernière MAJ" value={qualification?.updatedAt ? formatDate(qualification.updatedAt) : "—"} />
          <InfoRow label="État candidature" value={application ? application.status : "Non candidate"} />
        </div>
      </details>

      {showGeminiHint && (
        <div className="glass-card p-4 border-l-2 border-l-violet" role="alert">
          <p className="font-semibold">Analyse Gemini demandée</p>
          <p className="text-sm text-text-dim mt-1">L'analyse approfondie avec Gemini a été lancée. Les résultats apparaîtront dans l'onglet Matching.</p>
          <button className="btn-line btn-sm mt-2" onClick={() => setShowGeminiHint(false)}>Fermer</button>
        </div>
      )}
    </div>
  );
}