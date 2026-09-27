/** État d'erreur si le chargement / la synchro échoue.
    `message` = phrase FR ; `detail` = message technique d'origine, replié. */
export default function ErrorState({
  message,
  detail,
  onRetry,
}: {
  message: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="glass-card p-6 border-l-2! border-l-red-400!"
      role="alert"
      data-testid="error-state"
    >
      <p className="mono-label text-red! mb-2">erreur</p>
      <p className="text-[0.88rem] text-text-dim leading-relaxed">{message}</p>
      {detail && detail !== message && (
        <details className="mt-2">
          <summary className="text-[0.72rem] text-muted cursor-pointer hover:text-text-dim">
            détails techniques
          </summary>
          <pre className="text-[0.68rem] font-mono text-muted bg-surface-2/70 rounded p-2 mt-1.5 overflow-x-auto whitespace-pre-wrap break-words">
            {detail}
          </pre>
        </details>
      )}
      {onRetry && (
        <button type="button" className="btn-line mt-4" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}
