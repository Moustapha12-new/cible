"use client";
import { useEffect, useState } from "react";
import { readGmailJson } from "@/lib/gmail-response";
type Progress = { ok: boolean; busy?: boolean; pending?: number; complete?: number; partial?: number; blocked?: number; total?: number; error?: string };

export default function EnrichmentQueue({ email, enabled, paused, refresh, background = false }: { email: string; enabled: boolean; paused: boolean; refresh: () => Promise<void>; background?: boolean }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled || paused || !email) return;
    let stopped = false;
    const run = async () => {
      if (background) {
        try {
          const response = await fetch("/api/gmail/enrich", { cache: "no-store" });
          const state = await response.json();
          if (stopped || !response.ok || !state.ready || !state.pending) return;
        } catch { return; }
      }
      let retries = 0;
      let lastRefresh = 0;
      while (!stopped) {
        try {
          const response = await fetch("/api/gmail/enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
          if ([429, 502, 503, 504].includes(response.status) && retries < 3) {
            retries++;
            setError("Service temporairement occupé : reprise automatique en cours…");
            await new Promise(resolve => setTimeout(resolve, 20_000 * retries));
            continue;
          }
          const result = await readGmailJson<Progress>(response);
          if (stopped) return;
          if (!response.ok || !result.ok) throw new Error(result.error || "Enrichissement temporairement indisponible");
          if (result.busy) { await new Promise(resolve => setTimeout(resolve, 5000)); continue; }
          retries = 0;
          setProgress(result);
          setError("");
          if (!result.pending || Date.now() - lastRefresh >= 30_000) {
            await refresh();
            lastRefresh = Date.now();
          }
          if (!result.pending) return;
          await new Promise(resolve => setTimeout(resolve, 5500));
        } catch (cause) {
          if (!stopped) setError(cause instanceof Error ? cause.message : "Enrichissement indisponible");
          return;
        }
      }
    };
    void run();
    return () => { stopped = true; };
  }, [email, enabled, paused, refresh, background]);
  if (background) return null;
  if (!enabled && !progress) return null;
  return <div className="glass-card p-4 mb-5 text-sm" role="status">
    {error || (progress && !progress.pending
      ? `${progress.complete} fiche(s) extraite(s) des annonces · ${progress.partial} partielle(s) · ${progress.blocked} source(s) inaccessible(s).`
      : paused ? "Enrichissement en attente de la fin de la synchronisation…"
        : `Les fiches se complètent automatiquement. Tu peux préparer tes candidatures pendant ce temps.${progress?.pending ? ` Encore ${progress.pending} fiche(s) à vérifier.` : ""}`)}
  </div>;
}
