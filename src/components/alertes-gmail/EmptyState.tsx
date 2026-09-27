import { GMAIL_LABEL } from "@/lib/gmail-client";

/** Aucun e-mail dans le libellé / aucun résultat à afficher. */
export default function EmptyState({
  title,
  description,
  action,
}: {
  title?: string;
  description?: string;
  /** P2-5 : CTA « Première synchro (~8 min) » sur l'état vide (pas d'écran mort). */
  action?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  return (
    <div className="glass-card p-8 max-w-2xl" data-testid="empty-state">
      <p className="font-display text-lg font-semibold mb-2">
        {title || "Aucun e-mail dans le libellé"}
      </p>
      <p className="text-[0.88rem] text-text-dim leading-relaxed">
        {description ||
          `Configure dans Gmail un libellé nommé exactement « ${GMAIL_LABEL} », classe-y tes alertes de stages, connecte ton compte puis lance la synchronisation.`}
      </p>
      {action && (
        <button
          type="button"
          className="btn-primary btn-sm mt-4"
          onClick={action.onClick}
          disabled={action.disabled}
          data-testid="btn-first-sync"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
