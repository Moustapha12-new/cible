"use client";

import type { ProcessedEmail, RawOffer } from "@/lib/gmail-dashboard";
import {
  detectionMethodOf,
  emailVisualStatus,
  formatEmailDate,
  humanizeGmailError,
  senderLabel,
  STATUS_GLYPH,
  STATUS_LABEL,
} from "@/lib/gmail-dashboard";
import StatusBadge from "./StatusBadge";
import DetectionMethodBadge from "./DetectionMethodBadge";
import EmailDetail from "./EmailDetail";
import { applyToModule03 } from "./OfferCard";

/** Aperçu replié : 2-3 offres (titre · entreprise · Postuler) + « Voir les N ».
    Le détail complet ne s'affiche qu'une fois déplié. */
function OfferPreview({
  email,
  onExpand,
}: {
  email: ProcessedEmail;
  onExpand: () => void;
}) {
  const offers = email.offers;
  if (offers.length === 0) return null;
  const shown = offers.slice(0, 3);
  const apply = (o: RawOffer) => applyToModule03(o);
  return (
    <div className="mt-3 space-y-1.5" data-testid="offer-preview">
      {shown.map((o, i) => (
        <div
          key={`${o.applicationUrl || o.title || i}`}
          className="flex flex-wrap items-center gap-2 text-[0.8rem]"
          data-testid="offer-preview-item"
        >
          <span className="font-medium truncate max-w-[14rem]" title={o.title}>
            {o.title || "Sans titre"}
          </span>
          {o.company && (
            <span className="text-muted truncate max-w-[10rem]">· {o.company}</span>
          )}
          <span className="flex-1 min-w-0" />
          {o.applicationUrl ? (
            <a
              href={o.applicationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-line h-6 text-[0.68rem] px-2 shrink-0"
              data-testid="btn-apply"
            >
              Postuler ↗
            </a>
          ) : (
            <button
              type="button"
              className="btn-line h-6 text-[0.68rem] px-2 shrink-0"
              data-testid="btn-apply"
              onClick={() => apply(o)}
            >
              Postuler →
            </button>
          )}
        </div>
      ))}
      {offers.length > 3 && (
        <button
          type="button"
          className="text-[0.72rem] text-mint hover:underline text-left"
          onClick={onExpand}
          data-testid="btn-view-all"
        >
          Voir les {offers.length} offres →
        </button>
      )}
    </div>
  );
}

/** Carte liste d'un e-mail : statut, sujet, métadonnées, expand détail. */
export default function EmailCard({
  email,
  expanded,
  onToggle,
  onRelaunch,
  onRelaunchOffer,
  relaunching,
  variantKeys,
}: {
  email: ProcessedEmail;
  expanded: boolean;
  onToggle: () => void;
  onRelaunch?: () => void;
  onRelaunchOffer?: () => void;
  relaunching?: boolean;
  variantKeys?: Set<string>;
}) {
  const status = emailVisualStatus(email);
  const method = detectionMethodOf(email);
  const offerCount = email.offers.length;
  const isError = status === "error" || email.checkpoint?.status === "error";
  const isPendingRetry = email.checkpoint?.status === "pending_retry";
  const errHuman = email.error ? humanizeGmailError(email.error) : null;
  /* P1-4 : offres dont l'enrichissement mérite une relance ciblée. */
  const retryableOffers = email.offers.filter(
    (o) =>
      o.enrichStatus === "blocked" || o.enrichStatus === "partial" || o.enrichStatus === "skipped"
  ).length;

  const subject = email.subject || "(sans objet)";

  return (
    <article
      className="glass-card p-5"
      data-testid="email-card"
      data-status={status}
      data-email-id={email.id}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={`shrink-0 w-8 h-8 rounded-full grid place-items-center font-bold text-sm border ${
            status === "success"
              ? "border-mint/40 text-mint bg-mint/10"
              : status === "warning"
                ? "border-amber/40 text-amber bg-amber/10"
                : status === "error"
                  ? "border-red/40 text-red bg-red/10"
                  : "border-line text-muted bg-surface"
          }`}
          aria-label={STATUS_LABEL[status]}
        >
          {STATUS_GLYPH[status]}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="font-display text-[0.95rem] font-semibold leading-snug truncate max-w-full"
              title={subject}
            >
              {subject}
            </h3>
            {offerCount > 0 && (
              <span className="pill pill--ok shrink-0" data-testid="offer-count">
                {offerCount} offre{offerCount > 1 ? "s" : ""}
              </span>
            )}
            {email.recoveryUsed && (
              <span className="chip chip--amber shrink-0" data-testid="recover-badge">
                récupéré
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[0.74rem] text-muted">
            <span className="truncate max-w-[12rem]" title={email.from}>
              {senderLabel(email.from)}
            </span>
            <span>{formatEmailDate(email.receivedAt)}</span>
            <DetectionMethodBadge method={method} />
            <StatusBadge status={status} />
          </div>

          {(isError || isPendingRetry) && errHuman && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-[0.74rem] text-red truncate max-w-full flex-1" title={email.error}>
                {errHuman.human}
              </p>
              {onRelaunch && (
                <button
                  type="button"
                  className="btn-line h-7 text-[0.7rem] px-2"
                  onClick={onRelaunch}
                  disabled={relaunching}
                  data-testid="btn-relaunch-email"
                >
                  {relaunching ? "…" : "Voir / relancer"}
                </button>
              )}
              {errHuman.detail && (
                <details className="w-full">
                  <summary className="text-[0.68rem] text-muted cursor-pointer hover:text-text-dim">
                    détails techniques
                  </summary>
                  <pre className="text-[0.65rem] font-mono text-muted bg-surface-2/70 rounded p-2 mt-1 overflow-x-auto whitespace-pre-wrap break-words">
                    {email.error}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        {retryableOffers > 0 && onRelaunchOffer && (
          <button
            type="button"
            className="btn-line shrink-0 h-7 text-[0.7rem] px-2"
            onClick={onRelaunchOffer}
            disabled={relaunching}
            data-testid="btn-relance-offer"
            title="Retente uniquement l'enrichissement IA de ces offres (sans re-détection)"
          >
            {relaunching ? "…" : `Relancer enrich. (${retryableOffers})`}
          </button>
        )}
        <button
          type="button"
          className="btn-line shrink-0"
          onClick={onToggle}
          aria-expanded={expanded}
          data-testid="btn-details"
          title="Afficher ou masquer les métadonnées techniques"
        >
          {expanded ? "Masquer technique" : "Technique"}
        </button>
      </div>

      {/* Repliée : aperçu 2-3 offres (Postuler sans clic) ; dépliée : détail complet. */}
      {expanded ? (
        <EmailDetail email={email} hideObservability={false} variantKeys={variantKeys} />
      ) : (
        <OfferPreview email={email} onExpand={onToggle} />
      )}
    </article>
  );
}
