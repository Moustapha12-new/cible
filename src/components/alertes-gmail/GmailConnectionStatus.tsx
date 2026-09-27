"use client";

import { formatLastSync } from "@/lib/gmail-dashboard";
import { GMAIL_LABEL } from "@/lib/gmail-client";

export type ConnState = {
  checking: boolean;
  connected: boolean;
  configured: boolean;
  gmailAccount?: string;
  reason?: string;
  lastSync?: string | null;
};

/** Header : connexion Gmail, dernière synchro et LA zone d'actions unique
    (P1-8) — Connecter / Synchroniser / Relancer les erreurs n'existent qu'ici ;
    le primaire est dynamique : « Relancer les N e-mails en erreur » dès que
    N > 0. Reconnecter et Déconnecter sont deux boutons distincts (P1-9). */
export default function GmailConnectionStatus({
  conn,
  lastSync,
  syncing,
  errorCount = 0,
  onConnect,
  onSync,
  onRelaunchErrors,
  onDisconnect,
}: {
  conn: ConnState;
  lastSync?: string | null;
  syncing: boolean;
  /** E-mails en erreur/pending_retry (primaire dynamique). */
  errorCount?: number;
  onConnect: () => void;
  onSync: () => void;
  onRelaunchErrors: () => void;
  onDisconnect?: () => void;
}) {
  const syncLabel = formatLastSync(lastSync ?? conn.lastSync ?? null);
  const hasErrors = errorCount > 0;

  return (
    <section className="glass-card p-6 mb-6" data-testid="gmail-connection">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="min-w-0 mr-auto">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-lg font-semibold">Connexion Gmail</h2>
            {conn.checking && (
              <span className="pill pill--wait" data-testid="conn-badge" data-state="checking">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin mr-1.5" />
                Vérification de la connexion…
              </span>
            )}
            {!conn.checking &&
              (conn.connected ? (
                <span className="pill pill--ok" data-testid="conn-badge" data-state="connected">
                  <span className="w-1.5 h-1.5 rounded-full bg-mint mr-1.5 inline-block" />
                  Connecté{conn.gmailAccount ? ` · ${conn.gmailAccount}` : ""}
                </span>
              ) : (
                <span className="pill pill--wait" data-testid="conn-badge" data-state="disconnected">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber mr-1.5 inline-block" />
                  Non connecté
                </span>
              ))}
          </div>
          <p className="text-[0.78rem] text-muted mt-1">
            Lecture seule · étiquette Gmail surveillée :{" "}
            <code className="font-mono bg-surface-2/70 px-1.5 py-0.5 rounded text-[0.72rem]">
              « {GMAIL_LABEL} »
            </code>
          </p>
          <p className="text-[0.8rem] text-text-dim mt-2" data-testid="last-sync">
            Dernière synchronisation : <b>{syncLabel}</b>
          </p>
          {conn.reason && !conn.connected && !conn.checking && (
            <p className="text-[0.72rem] text-amber mt-1">{conn.reason}</p>
          )}
        </div>

        {/* Zone d'actions unique (P1-8) */}
        <div className="flex flex-wrap gap-2" data-testid="actions-zone">
          {!conn.connected && !conn.checking && (
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={onConnect}
              data-testid="btn-connect"
            >
              Connecter Gmail
            </button>
          )}
          {conn.connected && (
            <>
              <button
                type="button"
                className={hasErrors ? "btn-line btn-sm" : "btn-primary btn-sm"}
                onClick={onSync}
                disabled={syncing}
                data-testid="btn-sync"
              >
                {syncing ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Synchronisation…
                  </>
                ) : (
                  "Synchroniser maintenant"
                )}
              </button>
              <button
                type="button"
                className={hasErrors ? "btn-primary btn-sm" : "btn-line btn-sm"}
                onClick={onRelaunchErrors}
                disabled={syncing || !hasErrors}
                data-testid="btn-relaunch-errors"
                title={
                  hasErrors
                    ? "Re-traite uniquement les e-mails en erreur"
                    : "Aucun e-mail en erreur à relancer"
                }
              >
                {hasErrors
                  ? `Relancer les ${errorCount} e-mail${errorCount > 1 ? "s" : ""} en erreur`
                  : "Aucune erreur à relancer"}
              </button>
              <button
                type="button"
                className="btn-line btn-sm opacity-70 hover:opacity-100"
                onClick={onConnect}
                title="Reconnecter le compte Gmail (échange un nouveau token)"
                data-testid="btn-reconnect"
              >
                Reconnecter
              </button>
              {onDisconnect && (
                <button
                  type="button"
                  className="btn-line btn-sm opacity-70 hover:opacity-100"
                  onClick={onDisconnect}
                  title="Déconnecter ce compte Gmail de l'application"
                  data-testid="btn-disconnect"
                >
                  Déconnecter
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
