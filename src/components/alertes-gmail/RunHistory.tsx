"use client";

import { useState } from "react";
import { formatLastSync, type RunHistEntry } from "@/lib/gmail-dashboard";

const nfr = (n: number, s: string, p: string) => `${n} ${n > 1 ? p : s}`;

const fmtDur = (ms: number) =>
  ms >= 60_000
    ? `${Math.round(ms / 60_000)} min`
    : `${Math.max(1, Math.round(ms / 1000))} s`;

const ACTION_LABEL: Record<string, string> = {
  sync: "synchro complète",
  relaunch_errors: "relance des erreurs",
  relaunch_email: "relance d'un e-mail",
  relaunch_offer: "relance d'enrichissement",
};

/** P3-1 : historique des syncs — liste cliquable, détail par run (persistant). */
export default function RunHistory({ entries }: { entries: RunHistEntry[] }) {
  const [openAt, setOpenAt] = useState<string | null>(null);
  if (entries.length === 0) return null;
  return (
    <section className="mb-6" data-testid="run-history">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <h2 className="font-display text-xl font-semibold">
          Historique des syncs{" "}
          <span className="mono-label text-muted!">({entries.length})</span>
        </h2>
      </div>
      <ul className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden">
        {entries.map((e) => {
          const open = openAt === e.at;
          return (
            <li key={e.at}>
              <button
                type="button"
                className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left text-[0.82rem] hover:bg-surface-2/60 transition-colors"
                onClick={() => setOpenAt(open ? null : e.at)}
                aria-expanded={open}
                data-testid="run-history-item"
              >
                <span className="mono-label shrink-0">{formatLastSync(e.at)}</span>
                <span className="text-text-dim tabular-nums">
                  {nfr(e.processed, "e-mail", "e-mails")}
                </span>
                <span className="text-text-dim tabular-nums">
                  {nfr(e.offers, "offre", "offres")}
                </span>
                <span className="text-mint tabular-nums">
                  {nfr(e.created, "nouvelle", "nouvelles")}
                </span>
                <span
                  className={`tabular-nums ${e.errors > 0 ? "text-red" : "text-muted"}`}
                >
                  {nfr(e.errors, "erreur", "erreurs")}
                </span>
                <span className="mono-label ml-auto tabular-nums">{fmtDur(e.durationMs)}</span>
              </button>
              {open && (
                <div
                  className="px-4 py-3 text-[0.78rem] text-text-dim bg-surface-2/40 leading-relaxed"
                  data-testid="run-history-detail"
                >
                  <p className="mono-label mb-1.5">
                    {ACTION_LABEL[e.action] ?? e.action} · {new Date(e.at).toLocaleString("fr-FR")}
                  </p>
                  <p className="tabular-nums">
                    {nfr(e.emailsRead, "e-mail lu", "e-mails lus")} ·{" "}
                    {nfr(e.processed, "analysé", "analysés")} ·{" "}
                    {nfr(e.offers, "offre trouvée", "offres trouvées")} ·{" "}
                    {nfr(e.created, "importée", "importées")} ·{" "}
                    {nfr(e.errors, "erreur", "erreurs")} · durée {fmtDur(e.durationMs)}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
