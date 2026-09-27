"use client";

import { useEffect, useState } from "react";
import type { LastRunStats, SyncSummaryGlobal } from "@/lib/gmail-dashboard";
import { formatLastSync, progressPct } from "@/lib/gmail-dashboard";

type Metric = {
  key: string;
  label: string;
  value: number;
  hint: string;
  tone: "ok" | "warn" | "err" | "muted";
};

const TONE_CLS: Record<Metric["tone"], string> = {
  ok: "text-mint",
  warn: "text-amber",
  err: "text-red",
  muted: "text-muted",
};

const TONE_ICON: Record<Metric["tone"], string> = {
  ok: "✓",
  warn: "!",
  err: "✖",
  muted: "·",
};

/* Définitions (info-bulles) : le cumul et le run courant ne se mélangent plus. */
const METRIC_DEFS: Record<string, string> = {
  read: "Cumul depuis le début : e-mails listés dans le libellé surveillé.",
  detected: "Cumul depuis le début : offres brutes extraites, avant dédoublonnage.",
  imported: "Cumul depuis le début : offres uniques réellement ajoutées au Module 03.",
  dupes: "Cumul depuis le début : offres ignorées car déjà présentes.",
  nooffer: "Cumul depuis le début : e-mails vérifiés sans aucune offre de stage.",
  errors: "Cumul depuis le début : e-mails en erreur — relançables un par un.",
  pending: "Cumul depuis le début : e-mails en attente de nouvelle tentative.",
};

export type LiveProgress = { processed: number; total: number } | null;

/** Grande carte résumé premium :
    1. bloc DERNIÈRE SYNCHRO (run persisté) · 2. barre (run en cours ou cumul)
    · 3. métriques = TOTAL DEPUIS LE DÉBUT (checkpoints). */
export default function SyncSummaryCard({
  summary,
  totalInLabel,
  lastRun = null,
  runProgress = null,
  etaMin = null,
}: {
  summary: SyncSummaryGlobal;
  totalInLabel: number;
  lastRun?: LastRunStats | null;
  runProgress?: LiveProgress;
  etaMin?: number | null;
}) {
  const live = runProgress && runProgress.total > 0 ? runProgress : null;
  const processed = live ? live.processed : summary.emailsProcessed;
  const target = progressPct(
    processed,
    live ? live.total : totalInLabel || summary.emailsRead || 1
  );
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => setPct(target), 80);
    return () => window.clearTimeout(id);
  }, [target]);

  const metrics: Metric[] = [
    { key: "read", label: "E-mails lus", value: summary.emailsRead, hint: "dans le libellé", tone: "muted" },
    { key: "detected", label: "Offres détectées", value: summary.totalOffersDetected, hint: "brutes", tone: "ok" },
    { key: "imported", label: "Importées", value: summary.newOffersImported, hint: "nouvelles", tone: "ok" },
    { key: "dupes", label: "Doublons", value: summary.duplicatesIgnored, hint: "ignorés", tone: "muted" },
    { key: "nooffer", label: "Sans offre", value: summary.noOfferVerified, hint: "vérifié", tone: "muted" },
    { key: "errors", label: "Erreurs", value: summary.errors, hint: "à relancer", tone: summary.errors > 0 ? "err" : "muted" },
    {
      key: "pending",
      label: "En attente",
      /* P0-2 : « En attente » = jamais traité + à réessayer (?? 0 : snapshots/caches antérieurs à P0-2). */
      value: (summary.pending ?? 0) + (summary.pendingRetry ?? 0),
      hint: "à traiter",
      tone: (summary.pending ?? 0) + (summary.pendingRetry ?? 0) > 0 ? "warn" : "muted",
    },
  ];

  return (
    <section className="glass-card p-7 mb-6 overflow-hidden" data-testid="summary-card">
      {/* 1 — DERNIÈRE SYNCHRO : réponse du dernier run complet, persistée */}
      {lastRun && (
        <div
          className="rounded-xl border border-line bg-surface p-4 mb-5"
          data-testid="last-run-block"
          title="Statistiques du dernier run terminé (mémorisées sur cet appareil)."
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <p className="mono-label">dernière synchro</p>
            <p className="text-[0.72rem] text-muted">{formatLastSync(lastRun.at)}</p>
          </div>
          <p className="text-[0.84rem] text-text-dim leading-relaxed">
            <b className="tabular-nums">{lastRun.processedThisRun}</b> traité
            {lastRun.processedThisRun > 1 ? "s" : ""} sur ce run ·{" "}
            <b className="tabular-nums">{lastRun.totalOffersDetected}</b> offre
            {lastRun.totalOffersDetected > 1 ? "s" : ""} ·{" "}
            <span className="tabular-nums">{lastRun.duplicatesIgnored}</span>{" "}
            doublon{lastRun.duplicatesIgnored > 1 ? "s" : ""}
            {lastRun.errors > 0 && (
              <>
                {" "}· <span className="text-red tabular-nums">{lastRun.errors}</span> erreur
                {lastRun.errors > 1 ? "s" : ""}
              </>
            )}
            {lastRun.pendingRetry > 0 && (
              <>
                {" "}· <span className="text-amber tabular-nums">{lastRun.pendingRetry}</span> à réessayer
              </>
            )}
          </p>
          {(lastRun.interrupted || lastRun.truncated || lastRun.enrichDeferred ||
            (lastRun.arrivedDuringRun ?? 0) > 0 || (lastRun.remaining ?? 0) > 0) && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {lastRun.interrupted && (
                <span className="chip chip--amber">interrompu (délai)</span>
              )}
              {lastRun.truncated && <span className="chip">libellé tronqué (500 premiers)</span>}
              {lastRun.enrichDeferred && <span className="chip">enrichissement différé</span>}
              {(lastRun.remaining ?? 0) > 0 && (
                <span className="chip">
                  {lastRun.remaining} non traité{(lastRun.remaining ?? 0) > 1 ? "s" : ""} — prochain
                  run
                </span>
              )}
              {(lastRun.arrivedDuringRun ?? 0) > 0 && (
                <span className="chip chip--amber">+{lastRun.arrivedDuringRun} pendant la synchro</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2 — En-tête + barre : run en cours (polling léger) ou cumul */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <p className="eyebrow">synthèse</p>
          <h2 className="mt-2 font-display text-xl font-semibold">
            <span className="tabular-nums" data-testid="total-label">
              {totalInLabel}
            </span>{" "}
            e-mail{totalInLabel > 1 ? "s" : ""} dans le libellé
          </h2>
          {live ? (
            <>
              <p className="text-[0.82rem] text-text-dim mt-1" data-testid="run-progress-line">
                <b className="tabular-nums">{live.processed}</b> traité
                {live.processed > 1 ? "s" : ""} sur{" "}
                <b className="tabular-nums">{live.total}</b> planifiés (ce run)
              </p>
              {etaMin !== null && (
                <p className="text-[0.78rem] text-mint mt-0.5" data-testid="run-eta">
                  ≈ {etaMin} min restante{etaMin > 1 ? "s" : ""} (estimation)
                </p>
              )}
            </>
          ) : (
            <p className="text-[0.82rem] text-text-dim mt-1">
              <b className="tabular-nums">{summary.emailsProcessed}</b> traité
              {summary.emailsProcessed > 1 ? "s" : ""} sur{" "}
              <b className="tabular-nums">{totalInLabel || summary.emailsRead}</b>{" "}
              <span title="Cumul depuis le début, reconstruit à partir des checkpoints.">
                (cumul)
              </span>
            </p>
          )}
        </div>
        <div className="text-right">
          <p
            className="font-display text-3xl font-semibold tabular-nums text-mint"
            data-testid="progress-pct"
          >
            {pct}%
          </p>
          <p className="mono-label text-muted!">{live ? "ce run" : "analysés"}</p>
        </div>
      </div>

      {/* Barre de progression premium */}
      <div
        className="h-3 rounded-full bg-surface-2 overflow-hidden mb-6"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Emails analysés"
        data-testid="progress-bar"
        data-scope={live ? "run" : "cumul"}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background:
              "linear-gradient(90deg, var(--emerald-bright), var(--emerald), var(--amber))",
          }}
        />
      </div>

      {/* 3 — TOTAL DEPUIS LE DÉBUT (cumul checkpoints) */}
      <p className="mono-label mb-2" data-testid="cumul-scope">
        total depuis le début
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <div
            key={m.key}
            className="rounded-xl border border-line bg-surface p-3 min-w-0"
            data-metric={m.key}
            title={METRIC_DEFS[m.key]}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[0.7rem] font-bold ${TONE_CLS[m.tone]}`} aria-hidden="true">
                {TONE_ICON[m.tone]}
              </span>
              <span className="mono-label text-[0.68rem]! truncate">{m.label}</span>
            </div>
            <p className={`font-display text-2xl font-semibold tabular-nums ${TONE_CLS[m.tone]}`}>
              {m.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
