"use client";
import { useEffect, useState } from "react";
import { readGmailJson } from "@/lib/gmail-response";
type Progress = { ok: boolean; busy?: boolean; pending?: number; complete?: number; partial?: number; blocked?: number; total?: number; error?: string };

export default function EnrichmentQueue({ email, enabled, paused, refresh }: { email: string; enabled: boolean; paused: boolean; refresh: () => Promise<void> }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled || paused || !email) return;
    let stopped = false;
    const run = async () => {
      while (!stopped) {
        try {
          const response = await fetch("/api/gmail/enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
          const result = await readGmailJson<Progress>(response);
          if (stopped) return;
          if (!response.ok || !result.ok) throw new Error(result.error || "Enrichissement temporairement indisponible");
          if (result.busy) { await new Promise(resolve => setTimeout(resolve, 5000)); continue; }
          setProgress(result);
          setError("");
          await refresh();
          if (!result.pending) return;
        } catch (cause) {
          if (!stopped) setError(cause instanceof Error ? cause.message : "Enrichissement indisponible");
          return;
        }
      }
    };
    void run();
    return () => { stopped = true; };
  }, [email, enabled, paused, refresh]);
  if (!enabled && !progress) return null;
  return <div className="glass-card p-4 mb-5 text-sm" role="status">
    {error || (progress && !progress.pending
      ? `${progress.complete} fiche(s) extraite(s) des annonces · ${progress.partial} partielle(s) · ${progress.blocked} source(s) inaccessible(s).`
      : paused ? "Enrichissement en attente de la fin de la synchronisation…"
        : `Les fiches se complètent automatiquement. Tu peux préparer tes candidatures pendant ce temps.${progress?.pending ? ` Encore ${progress.pending} fiche(s) à vérifier.` : ""}`)}
  </div>;
}
