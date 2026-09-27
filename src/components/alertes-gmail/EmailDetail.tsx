"use client";

import { useEffect, useState } from "react";
import type { ProcessedEmail, RawOffer } from "@/lib/gmail-dashboard";
import {
  detectionMethodOf,
  emailMetaRows,
  humanizeGmailError,
  humanizeReason,
} from "@/lib/gmail-dashboard";
import { offerBridgeKey } from "@/lib/gmail-bridge";
import OfferCard from "./OfferCard";
import DetectionMethodBadge from "./DetectionMethodBadge";

/** Carte détaillée d'un e-mail.
    P3-2 : 2 niveaux — normal (phrases FR) / panneau « Détails techniques »
    replié (ids, codes, checkpoints), jamais mélangés. */
export default function EmailDetail({
  email,
  hideObservability = false,
  variantKeys,
}: {
  email: ProcessedEmail;
  /** Masque le panneau technique (la liste d'offres reste visible). */
  hideObservability?: boolean;
  /** P1-6 : clés `${emailId}#${index}` à badger « variante probable ». */
  variantKeys?: Set<string>;
}) {
  const method = detectionMethodOf(email);
  const meta = emailMetaRows(email);
  const shownError = email.error ? humanizeGmailError(email.error) : null;

  /* P0-5 : le payload dashboard est allégé (snippet/sourceUrl sortis) —
     on régénère les offres COMPLÈTES à l'ouverture de la carte (1 lecture
     checkpoint), jamais au chargement de la liste. */
  const [fullOffers, setFullOffers] = useState<RawOffer[] | null>(null);
  useEffect(() => {
    if (email.offers.length === 0) return;
    if (!email.offers.some((o) => !o.snippet || !o.sourceUrl)) return;
    let stop = false;
    void (async () => {
      try {
        const r = await fetch(`/api/gmail/offer-detail?id=${encodeURIComponent(email.id)}`);
        const j = (await r.json()) as { ok?: boolean; offers?: RawOffer[] };
        if (stop || !j.ok || !Array.isArray(j.offers)) return;
        const byKey = new Map(j.offers.map((o) => [offerBridgeKey(o), o]));
        setFullOffers(email.offers.map((o) => byKey.get(offerBridgeKey(o)) ?? o));
      } catch {
        /* détail non critique : le snippet reste simplement masqué */
      }
    })();
    return () => {
      stop = true;
    };
  }, [email.id, email.offers]);

  return (
    <div className="mt-4 pt-4 border-t border-line space-y-4" data-testid="email-detail">
      {/* Niveau normal — uniquement du lisible. */}
      <div className="space-y-1">
        {email.reason && (
          <p className="text-[0.78rem] text-text-dim">
            <span className="mono-label mr-1">raison</span>
            {humanizeReason(email.reason)}
          </p>
        )}
        {shownError && (
          <p className="text-[0.75rem] text-red">
            <span className="mono-label mr-1">erreur</span>
            {shownError.human}
          </p>
        )}
      </div>

      {/* Niveau 2 — panneau technique replié (ids, codes, checkpoints). */}
      {!hideObservability && (
        <details className="rounded-lg bg-surface-2/60 p-3" data-testid="tech-details">
          <summary className="mono-label cursor-pointer select-none">
            Détails techniques
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-[0.75rem] text-muted break-all">
              <span className="mono-label">id</span> {email.id}
            </p>
            {email.reason && (
              <p className="text-[0.72rem] text-text-dim break-all">
                <span className="mono-label mr-1">raison brute</span>
                {email.reason}
              </p>
            )}
            {email.error && (
              <p className="text-[0.72rem] text-red break-all">
                <span className="mono-label mr-1">erreur brute</span>
                {email.error}
              </p>
            )}
            <div>
              <p className="mono-label mb-2">observabilité</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.72rem] font-mono text-text-dim">
                {meta.map((row) => (
                  <span key={row.label}>
                    <span className="text-muted">{row.label}=</span>
                    {row.value}
                  </span>
                ))}
              </div>
              <div className="mt-2">
                <DetectionMethodBadge method={method} />
                {email.recoveryUsed && (
                  <span className="chip chip--amber ml-2" data-testid="recover-badge">
                    récupéré
                  </span>
                )}
              </div>
            </div>
          </div>
        </details>
      )}

      {email.offers.length > 0 ? (
        <div className="space-y-3">
          <p className="mono-label">
            {email.offers.length} offre{email.offers.length > 1 ? "s" : ""} détectée
            {email.offers.length > 1 ? "s" : ""}
          </p>
          {email.offers.map((o, i) => (
            <OfferCard
              key={`${o.applicationUrl}-${i}`}
              offer={fullOffers?.[i] ?? o}
              isVariant={variantKeys?.has(`${email.id}#${i}`) === true}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-line p-4" data-testid="no-offer-block">
          <p className="text-[0.85rem] text-text-dim">Aucune offre de stage identifiée</p>
          {email.reason && (
            <p className="text-[0.75rem] text-muted mt-1">{humanizeReason(email.reason)}</p>
          )}
        </div>
      )}
    </div>
  );
}
