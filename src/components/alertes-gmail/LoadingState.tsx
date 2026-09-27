/** État de chargement pendant une synchronisation / le premier fetch. */
export default function LoadingState({ label }: { label?: string }) {
  return (
    <div className="glass-card p-8 flex flex-col items-center gap-4" data-testid="loading-state">
      <span className="inline-block w-6 h-6 rounded-full border-2 border-mint border-t-transparent animate-spin" />
      <p className="mono-label text-muted!">{label || "chargement des alertes Gmail…"}</p>
      <div className="w-full max-w-md space-y-2" aria-hidden="true">
        <div className="h-3 rounded bg-surface-2 animate-pulse" />
        <div className="h-3 rounded bg-surface-2 animate-pulse w-5/6" />
        <div className="h-3 rounded bg-surface-2 animate-pulse w-2/3" />
      </div>
    </div>
  );
}
