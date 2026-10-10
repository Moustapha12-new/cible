"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getOrCreateData,
  saveData,
  type UserData,
  type DetectedOffer,
  type Application,
  STATUS_META,
  type AppStatus,
} from "@/lib/data";
import { evaluateApplicationReadiness, type ApplicationReadiness, type ReadinessItem, getApplicationChannel } from "@/lib/application-readiness";
import { prepareSubmission, confirmSubmission, correctSubmission, cancelSubmission, getSubmissionPreview, type SubmissionData, type SubmissionChannel } from "@/lib/application-submission";
import { cvMasterText, getApprovedCVText } from "@/lib/cv-adaptation";

const STATUS_COLORS: Record<ReadinessItem["status"], { bg: string; border: string; icon: string; label: string }> = {
  ready: { bg: "bg-emerald-50 border-emerald-200", border: "border-l-3 border-emerald-500", icon: "✓", label: "Prêt" },
  to_verify: { bg: "bg-amber-50 border-amber-200", border: "border-l-3 border-amber-500", icon: "⚠", label: "À vérifier" },
  missing: { bg: "bg-red-50 border-red-200", border: "border-l-3 border-red-500", icon: "✕", label: "Manquant" },
  not_needed: { bg: "bg-gray-50 border-gray-200", border: "border-l-3 border-gray-400", icon: "○", label: "Non requis" },
};

const CATEGORY_LABELS: Record<ReadinessItem["category"], string> = {
  cv: "CV",
  letter: "Lettre",
  documents: "Documents",
  matching: "Analyse",
  profile: "Profil",
  link: "Lien",
  eligibility: "PFE",
};

const CATEGORY_ICONS: Record<ReadinessItem["category"], string> = {
  cv: "📄",
  letter: "✉️",
  documents: "📎",
  matching: "🔍",
  profile: "👤",
  link: "🔗",
  eligibility: "🎯",
};

function formatDateFR(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Date invalide";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function ReadinessBadge({ item }: { item: ReadinessItem }) {
  const style = STATUS_COLORS[item.status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${style.bg} ${style.border}`}>
      <span>{style.icon}</span>
      <span>{style.label}</span>
    </span>
  );
}

function ReadinessItemCard({ item, onAction }: { item: ReadinessItem; onAction?: (href: string) => void }) {
  const style = STATUS_COLORS[item.status];
  const categoryLabel = CATEGORY_LABELS[item.category];
  const categoryIcon = CATEGORY_ICONS[item.category];

  const handleClick = (href: string) => {
    if (onAction) onAction(href);
    else window.location.href = href;
  };

  return (
    <article className={`group p-4 rounded-xl border transition-colors ${style.bg} ${style.border}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-xl flex-shrink-0" aria-hidden="true">{categoryIcon}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-text-main truncate">{item.label}</strong>
              <ReadinessBadge item={item} />
              <span className="chip chip--muted text-[0.55rem]">{categoryLabel}</span>
            </div>
            <p className="text-sm text-text-dim mt-1">{item.message}</p>
            {item.details && item.details.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-muted cursor-pointer">Détails</summary>
                <ul className="list-disc pl-5 text-xs text-text-dim mt-1 space-y-0.5">
                  {item.details.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </details>
            )}
          </div>
        </div>
        {item.action && item.actionHref && (
          <button
            type="button"
            onClick={() => handleClick(item.actionHref!)}
            className="btn-line btn-sm flex-shrink-0 whitespace-nowrap"
          >
            {item.action}
          </button>
        )}
      </div>
    </article>
  );
}

function SubmissionPreviewModal({ 
  preview, 
  onClose, 
  onConfirm,
  offerId,
  channel,
  urlUsed,
  sentAt,
  notes,
  confirmationRef
}: {
  preview: NonNullable<ReturnType<typeof getSubmissionPreview>["preview"]>;
  onClose: () => void;
  onConfirm: (data: SubmissionData) => void;
  offerId: string;
  channel: SubmissionChannel;
  urlUsed?: string;
  sentAt: string;
  notes?: string;
  confirmationRef?: string;
}) {
  const [localChannel, setLocalChannel] = useState<SubmissionChannel>(channel);
  const [localUrl, setLocalUrl] = useState(urlUsed || "");
  const [localSentAt, setLocalSentAt] = useState(sentAt.slice(0, 16).replace("T", "T"));
  const [localNotes, setLocalNotes] = useState(notes || "");
  const [localConfirmationRef, setLocalConfirmationRef] = useState(confirmationRef || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    setBusy(true);
    setError("");
    
    const sentAtISO = new Date(localSentAt).toISOString();
    
    const submissionData: SubmissionData = {
      offerId,
      company: preview.company,
      role: preview.role,
      source: "Dossier Cible",
      sentAt: sentAtISO,
      channel: localChannel,
      urlUsed: localChannel === "website" ? localUrl : undefined,
      cvText: preview.cvPreview, // Will be replaced with full text in confirmSubmission
      cvName: preview.cvName,
      letterText: preview.letterPreview,
      notes: localNotes,
      confirmationRef: localConfirmationRef,
    };

    onConfirm(submissionData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 id="modal-title" className="font-display text-xl font-semibold">Confirmer l&apos;envoi de la candidature</h2>
            <p className="text-sm text-muted mt-1">{preview.company} — {preview.role}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text-main p-1" aria-label="Fermer">✕</button>
        </div>

        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm" role="alert">{error}</div>}

        <div className="space-y-5 mb-6">
          <div>
            <label className="block text-xs font-semibold mb-2">Canal de candidature</label>
            <div className="flex flex-wrap gap-2">
              {(["website", "platform", "email", "other"] as SubmissionChannel[]).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setLocalChannel(c)}
                  className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                    localChannel === c
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-line bg-white/50 hover:border-line-strong"
                  }`}
                >
                  {c === "website" ? "Site entreprise" : c === "platform" ? "Plateforme" : c === "email" ? "E-mail" : "Autre"}
                </button>
              ))}
            </div>
          </div>

          {localChannel === "website" && (
            <div>
              <label htmlFor="submission-url" className="block text-xs font-semibold mb-2">URL utilisée</label>
              <input
                id="submission-url"
                type="url"
                className="input w-full"
                value={localUrl}
                onChange={e => setLocalUrl(e.target.value)}
                placeholder="https://entreprise.com/candidature/..."
              />
            </div>
          )}

          <div>
            <label htmlFor="submission-date" className="block text-xs font-semibold mb-2">Date d&apos;envoi</label>
            <input
              id="submission-date"
              type="datetime-local"
              className="input w-full max-w-xs"
              value={localSentAt}
              onChange={e => setLocalSentAt(e.target.value)}
            />
            <p className="text-xs text-muted mt-1">La date du jour est proposée par défaut. Modifiez si l&apos;envoi a eu lieu un autre jour.</p>
          </div>

          <div>
            <label htmlFor="submission-notes" className="block text-xs font-semibold mb-2">Notes (relance, contact, référence...)</label>
            <textarea
              id="submission-notes"
              className="input w-full min-h-24"
              value={localNotes}
              onChange={e => setLocalNotes(e.target.value)}
              placeholder="Ex: Relance prévue J+10, contact M. Dupont, référence offre #12345"
            />
          </div>

          <div>
            <label htmlFor="submission-ref" className="block text-xs font-semibold mb-2">Référence de confirmation (optionnel)</label>
            <input
              id="submission-ref"
              type="text"
              className="input w-full"
              value={localConfirmationRef}
              onChange={e => setLocalConfirmationRef(e.target.value)}
              placeholder="Numéro de dossier, ID candidature, accusé de réception..."
            />
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <h3 className="font-semibold mb-3">Récapitulatif des pièces jointes</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between p-3 rounded-lg border border-line bg-white/50">
              <span className="font-medium">{preview.cvName}</span>
              <span className="text-muted">{Math.round(preview.cvPreview.length / 1000)} Ko (texte)</span>
            </div>
            {preview.letterPreview && (
              <div className="flex items-center justify-between p-3 rounded-lg border border-line bg-white/50">
                <span>Lettre de motivation</span>
                <span className="text-muted">{Math.round(preview.letterPreview.length / 1000)} Ko (texte)</span>
              </div>
            )}
            {preview.documentsCount > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg border border-line bg-white/50">
                <span>{preview.documentsCount} document(s) complémentaire(s)</span>
                <span className="text-muted">Depuis la bibliothèque</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mt-6">
          <button onClick={onClose} className="btn-ghost flex-1" disabled={busy}>Annuler</button>
          <button onClick={handleConfirm} className="btn-primary flex-1" disabled={busy}>
            {busy ? "Enregistrement…" : "Confirmer l&apos;envoi"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value, copyable = false, icon }: { 
  label: string; 
  value: string; 
  copyable?: boolean; 
  icon?: string;
}) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="p-4 rounded-xl border border-line bg-white/50">
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="text-lg">{icon}</span>}
        <span className="mono-label text-[0.58rem]">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-sm text-text-main truncate flex-1">{value || "—"}</p>
        {copyable && value && (
          <button
            type="button"
            onClick={handleCopy}
            className={`p-1.5 rounded-lg transition-colors ${copied ? "bg-emerald-100 text-emerald-700" : "text-muted hover:text-text-main"}`}
            aria-label={copied ? "Copié !" : "Copier"}
          >
            {copied ? "✓" : "📋"}
          </button>
        )}
      </div>
    </div>
  );
}

interface ReadyToApplyProps {
  offerId: string;
  user: { name: string; email: string };
  data: UserData;
  onDataChange: (data: UserData) => void;
  mode?: "full" | "compact";
  onNavigate?: (href: string) => void;
}

export default function ReadyToApply({ offerId, user, data, onDataChange, mode = "full", onNavigate }: ReadyToApplyProps) {
  const router = useRouter();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [modalPreview, setModalPreview] = useState<ReturnType<typeof getSubmissionPreview>["preview"] | null>(null);
  const [modalChannel, setModalChannel] = useState<SubmissionChannel>("website");
  const [modalUrl, setModalUrl] = useState("");
  const [modalSentAt, setModalSentAt] = useState("");
  const [modalNotes, setModalNotes] = useState("");
  const [modalConfirmationRef, setModalConfirmationRef] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const offer = data.offers.find(o => o.id === offerId);
  const application = data.applications.find(a => a.offerId === offerId);

  const handleNavigate = useCallback((href: string) => {
    if (onNavigate) onNavigate(href);
    else if (href.startsWith("http")) window.open(href, "_blank", "noopener,noreferrer");
    else router.push(href);
  }, [onNavigate, router]);

  if (!offer) {
    return (
      <div className="glass-card p-8 text-center">
        <h3 className="font-display text-xl">Offre introuvable</h3>
        <p className="text-sm text-muted mt-3">Cette offre n&apos;existe plus dans vos données.</p>
        <Link href="/app/alertes-gmail" className="btn-primary mt-5">Retour aux offres</Link>
      </div>
    );
  }

  const readiness = evaluateApplicationReadiness(data, offerId);
  const hasApplication = !!application;
  const channelInfo = getApplicationChannel(offer);
  const isSent = hasApplication && application.status !== "rejected";

  const handleOpenConfirmModal = () => {
    const preview = getSubmissionPreview(data, offerId);
    if (!preview.ok || !preview.preview) {
      setToast(preview.error || "Impossible de prévisualiser l&apos;envoi");
      return;
    }
    setModalPreview(preview.preview);
    setModalChannel(channelInfo?.type === "url" ? "website" : "website");
    setModalUrl(preview.preview.urlUsed || "");
    setModalSentAt(new Date().toISOString().slice(0, 16));
    setModalNotes(data.dossiers?.[offerId]?.notes || "");
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async (submissionData: SubmissionData) => {
    setConfirmBusy(true);
    setConfirmError("");
    
    try {
      const result = confirmSubmission(data, submissionData);
      if (!result.ok) {
        setConfirmError(result.error || "Erreur lors de l'enregistrement");
        return;
      }
      
      // Save to localStorage and update state
      saveData(user.email, result.data!);
      onDataChange(result.data!);
      
      setShowConfirmModal(false);
      setToast(`Candidature enregistrée pour ${submissionData.company}`);
      
      // Navigate to candidatures after short delay
      setTimeout(() => router.push(`/app/candidatures?open=${result.applicationId}`), 1500);
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : "Erreur inattendue");
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleCancelSubmission = () => {
    if (!window.confirm("Annuler l'enregistrement de cette candidature ? Le dossier restera en préparation.")) return;
    
    const result = cancelSubmission(data, offerId);
    if (result.ok) {
      saveData(user.email, result.data!);
      onDataChange(result.data!);
      setToast("Candidature annulée, dossier remis en préparation");
    } else {
      setToast(result.error || "Impossible d'annuler");
    }
  };

  const handleCorrectSubmission = (corrections: Partial<Application>) => {
    const app = data.applications.find(a => a.offerId === offerId);
    if (!app) return;
    
    const result = correctSubmission(data, app.id, corrections);
    if (result.ok) {
      saveData(user.email, result.data!);
      onDataChange(result.data!);
      setToast("Candidature mise à jour");
    } else {
      setToast(result.error || "Erreur de mise à jour");
    }
  };

  if (mode === "compact") {
    return (
      <section className="glass-card p-5 space-y-4" aria-labelledby="readiness-heading">
        <div className="flex items-center justify-between">
          <h2 id="readiness-heading" className="font-display text-lg font-semibold">Prêt à postuler</h2>
          <ReadinessBadge item={{ id: "", category: "cv", label: "", status: readiness?.overall === "ready" ? "ready" : readiness?.overall === "incomplete" ? "to_verify" : "missing", message: "" }} />
        </div>
        <p className="text-sm text-text-dim">
          {readiness?.missingCount || 0} manquant(s), {readiness?.toVerifyCount || 0} à vérifier, {readiness?.readyCount || 0} prêt(s)
        </p>
        <div className="flex flex-wrap gap-2">
          {readiness?.items.filter(i => i.status === "missing" || i.status === "to_verify").slice(0, 3).map(item => (
            <ReadinessItemCard key={item.id} item={item} onAction={handleNavigate} />
          ))}
        </div>
        <div className="flex flex-wrap gap-3 pt-2 border-t border-line">
          {channelInfo && channelInfo.type === "url" && (
            <a href={channelInfo.value!} target="_blank" rel="noopener noreferrer" className="btn-primary">{channelInfo.actionText}</a>
          )}
          {hasApplication ? (
            <Link href={`/app/candidatures?open=${application.id}`} className="btn-line">Voir le suivi</Link>
          ) : (
            <button onClick={handleOpenConfirmModal} className="btn-primary" disabled={readiness?.overall === "blocked"}>
              {readiness?.overall === "blocked" ? "Compléter d&apos;abord" : "J&apos;ai envoyé ma candidature"}
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="space-y-6" aria-labelledby="readiness-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h2 id="readiness-heading" className="font-display text-xl font-semibold">Prêt à postuler</h2>
          <ReadinessBadge item={{ id: "", category: "cv", label: "", status: readiness.overall === "ready" ? "ready" : readiness.overall === "incomplete" ? "to_verify" : "missing", message: "" }} />
        </div>
        
        <p className="text-sm text-text-dim">
          {readiness.missingCount} élément(s) manquant(s), {readiness.toVerifyCount} à vérifier, {readiness.readyCount} prêt(s)
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {readiness.items.map(item => (
            <ReadinessItemCard key={item.id} item={item} onAction={handleNavigate} />
          ))}
        </div>
      </section>

      {/* Documents à envoyer - Sélection */}
      <section className="glass-card p-6 space-y-4 mt-6" aria-labelledby="docs-heading">
        <h3 id="docs-heading" className="font-display text-lg font-semibold">Documents à envoyer</h3>
        
        <div className="grid sm:grid-cols-2 gap-4">
          {/* CV */}
          <div className="p-4 rounded-xl border border-line bg-white/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📄</span>
                <strong>CV</strong>
              </div>
              {getApprovedCVText(data, offerId) && (
                <span className="pill pill--ok text-xs">Approuvé</span>
              )}
            </div>
            <p className="text-sm text-text-dim mb-3">
              {getApprovedCVText(data, offerId) 
                ? "Version adaptée et approuvée pour cette offre"
                : data.dossiers?.[offerId]?.cvText?.trim()
                  ? "CV du dossier (non approuvé via l&apos;atelier)"
                  : cvMasterText(data)?.trim()
                    ? "CV maître (non adapté)"
                    : "Aucun CV disponible"
              }</p>
            <div className="flex flex-wrap gap-2">
              {getApprovedCVText(data, offerId) && (
                <Link href={`/app/adaptation?offer=${encodeURIComponent(offerId)}`} className="btn-line btn-sm">Voir l&apos;atelier</Link>
              )}
              {data.dossiers?.[offerId]?.cvText && (
                <button 
                  type="button" 
                  className="btn-line btn-sm"
                  onClick={() => handleNavigate(`/app/dossier?offer=${encodeURIComponent(offerId)}`)}
                >
                  Voir dans le dossier
                </button>
              )}
            </div>
          </div>

          {/* Lettre */}
          <div className="p-4 rounded-xl border border-line bg-white/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">✉️</span>
                <strong>Lettre de motivation</strong>
              </div>
              {data.dossiers?.[offerId]?.letterText?.trim() && (
                <span className="pill pill--ok text-xs">Préparée</span>
              )}
            </div>
            <p className="text-sm text-text-dim mb-3">
              {data.dossiers?.[offerId]?.letterText?.trim()
                ? "Lettre rédigée dans le dossier"
                : data.letters.some(l => l.company === offer.company && l.role === offer.title)
                  ? `${data.letters.filter(l => l.company === offer.company && l.role === offer.title).length} lettre(s) enregistrée(s)`
                  : "Aucune lettre pour l'instant"
              }</p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/app/lettres`} className="btn-line btn-sm">Voir mes lettres</Link>
              <button 
                type="button" 
                className="btn-line btn-sm"
                onClick={() => handleNavigate(`/app/dossier?offer=${encodeURIComponent(offerId)}`)}
              >
                Rédiger dans le dossier
              </button>
            </div>
          </div>

          {/* Documents complémentaires */}
          <div className="sm:col-span-2 p-4 rounded-xl border border-line bg-white/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📎</span>
                <strong>Documents complémentaires</strong>
              </div>
            </div>
            <p className="text-sm text-text-dim mb-3">
              {(data.documents || []).filter(d => d.caseKeys.includes(offerId)).length} document(s) dans la bibliothèque du dossier
            </p>
            <Link href={`/app/dossier?offer=${encodeURIComponent(offerId)}#documents-echanges`} className="btn-line btn-sm">
              Gérer les documents
            </Link>
          </div>
        </div>
      </section>

      {/* Informations pour formulaires externes */}
      <section className="glass-card p-6 space-y-4 mt-6" aria-labelledby="info-heading">
        <h3 id="info-heading" className="font-display text-lg font-semibold">Informations pour les formulaires</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <InfoCard label="Prénom" value={data.profile.firstName} copyable icon="👤" />
          <InfoCard label="Nom" value={data.profile.lastName} copyable icon="👤" />
          <InfoCard label="Email" value={data.profile.email} copyable icon="📧" />
          <InfoCard label="Téléphone" value={data.profile.phone} copyable icon="📞" />
          <InfoCard label="Ville" value={data.profile.city} copyable icon="📍" />
          <InfoCard label="Titre" value={data.profile.title} copyable icon="🎓" />
          <InfoCard label="Stage recherché" value="PFE 6 mois — Février 2027" copyable icon="📅" />
          <InfoCard label="Mobilité" value={data.profile.city ? "France entière" : "À préciser"} icon="🌍" />
        </div>
      </section>

      {/* Canal de candidature */}
      <section className="glass-card p-6 space-y-4 mt-6" aria-labelledby="channel-heading">
        <h3 id="channel-heading" className="font-display text-lg font-semibold">Ouvrir le canal de candidature</h3>
        
        <div className="flex flex-wrap items-center gap-3">
          {channelInfo?.type === "url" && channelInfo.value && (
            <>
              <a 
                href={channelInfo.value} 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn-primary"
              >
                {channelInfo.actionText} ↗
              </a>
              <span className="text-sm text-muted truncate max-w-xs">{channelInfo.value}</span>
            </>
          )}
          {channelInfo?.type !== "url" && (
            <>
              <button className="btn-line" onClick={() => handleNavigate(`/app/dossier?offer=${encodeURIComponent(offerId)}`)}>
                {channelInfo?.actionText || "Renseigner le lien"}
              </button>
              <span className="text-sm text-muted">Aucun lien valide enregistré pour cette offre</span>
            </>
          )}
        </div>
        
        <p className="text-xs text-muted">
          Un clic sur « Postuler » n&apos;enregistre pas l&apos;envoi. Confirmez manuellement après avoir postulé sur le site externe.
        </p>
      </section>

      {/* Confirmation d'envoi / Actions principales */}
      <section className="glass-card p-6 space-y-4 mt-6" aria-labelledby="action-heading">
        <h3 id="action-heading" className="font-display text-lg font-semibold">
          {hasApplication ? "Candidature enregistrée" : "Confirmation de l&apos;envoi"}
        </h3>

        {hasApplication ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-line bg-white/50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{application.company} — {application.role}</p>
                  <p className="text-sm text-muted mt-1">
                    Statut : <span className={`pill ${STATUS_META[application.status].cls}`}>{STATUS_META[application.status].label}</span>
                    {application.date && ` · Envoyée le ${formatDateFR(application.date)}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/app/candidatures?open=${application.id}`} className="btn-line btn-sm">Voir le suivi</Link>
                  <button onClick={handleCancelSubmission} className="btn-line btn-sm text-red-600 hover:bg-red-50 border-red-200">Annuler l&apos;envoi</button>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-line bg-white/50">
              <p className="text-sm font-semibold mb-3">Corriger les informations d&apos;envoi</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-xs font-semibold block">
                  Date d&apos;envoi
                  <input type="date" className="input w-full mt-1" defaultValue={application.date?.slice(0, 10)} 
                    onChange={e => handleCorrectSubmission({ date: new Date(e.target.value).toISOString() })} />
                </label>
                <label className="text-xs font-semibold block">
                  Notes
                  <input type="text" className="input w-full mt-1" defaultValue={application.notes || ""}
                    onChange={e => handleCorrectSubmission({ notes: e.target.value })} />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={handleOpenConfirmModal} 
              className="btn-primary"
              disabled={readiness.overall === "blocked"}
            >
              {readiness.overall === "blocked" ? "Éléments manquants — compléter d&apos;abord" : "J&apos;ai envoyé ma candidature"}
            </button>
            <Link href={`/app/dossier?offer=${encodeURIComponent(offerId)}`} className="btn-line">
              Retour au dossier
            </Link>
          </div>
        )}
      </section>

      {/* Modal de confirmation */}
      {showConfirmModal && modalPreview && (
        <SubmissionPreviewModal
          preview={modalPreview}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmSubmit}
          offerId={offerId}
          channel={modalChannel}
          urlUsed={modalUrl}
          sentAt={modalSentAt}
          notes={modalNotes}
          confirmationRef={modalConfirmationRef}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 glass-card p-4 rounded-xl border border-line shadow-lg animate-slide-up" role="status">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {toast}
          </div>
        </div>
      )}
    </>
  );
}