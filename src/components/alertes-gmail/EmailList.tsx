"use client";

import { useMemo, useState } from "react";
import type { ProcessedEmail } from "@/lib/gmail-dashboard";
import { findVariantKeys } from "@/lib/gmail-dashboard";
import EmailCard from "./EmailCard";
import EmptyState from "./EmptyState";

/** P0-5 : page visible — 30 cartes d'un clic, le reste au chargement demandé. */
const PAGE_SIZE = 30;

/** Liste scrollable des e-mails traités. P0-5 : pagination (30/page) et
    variantes calculées sur la page visible uniquement — findVariantKeys
    reste borné à l'écran même avec des centaines d'e-mails. */
export default function EmailList({
  emails,
  expandedId,
  onToggle,
  onRelaunch,
  onRelaunchOffer,
  relaunchingId,
  onFirstSync,
  firstSyncDisabled = false,
}: {
  emails: ProcessedEmail[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  onRelaunch?: (id: string) => void;
  onRelaunchOffer?: (id: string) => void;
  relaunchingId?: string | null;
  /** P2-5 : CTA première synchronisation sur l'état vide. */
  onFirstSync?: () => void;
  firstSyncDisabled?: boolean;
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const shown = useMemo(
    () => emails.slice(0, Math.min(visible, emails.length)),
    [emails, visible]
  );
  /* P1-6 : clés `${emailId}#${index}` à badger « variante probable » —
     regroupement UI uniquement, calcul borné à la page visible. */
  const variantKeys = useMemo(() => findVariantKeys(shown), [shown]);
  const remaining = emails.length - shown.length;

  if (emails.length === 0) {
    return (
      <EmptyState
        action={
          onFirstSync
            ? { label: "Première synchro (~8 min)", onClick: onFirstSync, disabled: firstSyncDisabled }
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="email-list">
      {shown.map((e) => (
        <EmailCard
          key={e.id}
          email={e}
          expanded={expandedId === e.id}
          onToggle={() => onToggle(e.id)}
          onRelaunch={onRelaunch ? () => onRelaunch(e.id) : undefined}
          onRelaunchOffer={onRelaunchOffer ? () => onRelaunchOffer(e.id) : undefined}
          relaunching={relaunchingId === e.id}
          variantKeys={variantKeys}
        />
      ))}
      {remaining > 0 && (
        <button
          type="button"
          className="btn-line w-full"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          data-testid="email-list-more"
        >
          Afficher {Math.min(PAGE_SIZE, remaining)} de plus ({remaining} restant
          {remaining > 1 ? "s" : ""})
        </button>
      )}
    </div>
  );
}
