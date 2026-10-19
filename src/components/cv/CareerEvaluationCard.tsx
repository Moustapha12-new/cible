"use client";
import { useEffect, useRef, useState } from "react";
import { CAREER_LABELS, type CareerReport } from "@/lib/career-evaluation";

const levels = { strong: "Démontrée", partial: "Partielle / transférable", missing: "Absente du CV", unknown: "À confirmer" };
const priorities = { critical: "Critique", high: "Importante", meaningful: "Utile", preferred: "Souhaitée", low_signal: "Secondaire" };
const evidence = { demonstrated: "Réalisation démontrée", transferable: "Acquis transférable", theoretical: "Connaissance théorique", unconfirmed: "Niveau non confirmé" };
export function CareerEvaluationCard({ offer, report, onReport }: {
  offer: { id: string; title: string; company: string; location: string; text: string };
  report: CareerReport | null; onReport: (report: CareerReport) => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const selectedId = useRef(offer.id);
  selectedId.current = offer.id;
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    if (offer.id) void fetch(`/api/offres/evaluate?offerId=${encodeURIComponent(offer.id)}`, { signal: controller.signal, cache: "no-store" })
      .then(r => r.ok ? r.json() : null).then(r => { if (r?.report && !controller.signal.aborted) onReport(r.report); }).catch(() => {});
    return () => controller.abort();
  }, [offer.id, onReport]);
  async function evaluate() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/offres/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerId: offer.id, offerSnapshot: offer }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Évaluation indisponible.");
      if (result.report.offerId === selectedId.current) onReport(result.report);
    } catch (e) { setError(e instanceof Error ? e.message : "Évaluation indisponible."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-xs space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900">Analyse offre / CV maître</h3>
      <button type="button" disabled={busy || !offer.id} onClick={evaluate} className="rounded-lg bg-blue-600 text-white px-3 py-2 disabled:opacity-50">{busy ? "Analyse de l'annonce puis du CV…" : report ? "Actualiser l'analyse" : "Évaluer cette offre"}</button></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!report ? <p className="text-slate-600">Évaluation à la demande en deux passes. La couverture de mots-clés ne mesure ni la maîtrise, ni les chances d&apos;entretien.</p> : <>
      <p className="font-bold text-blue-800">{report.score}/5 · {report.score >= 4.5 ? "Priorité forte" : report.score >= 4 ? "Offre intéressante" : "Priorité à comparer"} · Confiance {report.confidence === "high" ? "élevée" : report.confidence === "medium" ? "moyenne" : "faible"}</p>
      <p>{report.reason}</p>
      <details><summary className="cursor-pointer font-semibold">Exigences, preuves et risques ({report.requirements.length})</summary>
        <div className="space-y-3 mt-3">{report.requirements.map(r => { const m = report.matches.find(m => m.requirementId === r.id); return <article key={r.id} className="border-t border-slate-200 pt-2">
          <p className="font-semibold">{r.term} · {priorities[r.importance]} · {m ? levels[m.match] : "À confirmer"}</p>
          {r.quote && <p className="text-slate-600">Annonce : « {r.quote} »</p>}
          {r.basis === "inferred" && <p>Hypothèse de lecture, pas un prérequis explicite.</p>}
          {m?.cvQuote && <p>CV : « {m.cvQuote} »</p>}{m?.gap && <p>{m.gap}</p>}
          {m && <p>{evidence[m.evidenceLevel] || "Niveau non confirmé"}</p>}
          {m?.risk && <p className="text-amber-800">Entretien : {m.risk}</p>}{m?.mitigation && <p>{m.mitigation}</p>}
        </article>; })}</div></details>
      <details><summary className="cursor-pointer font-semibold">Conseils et informations à vérifier</summary>
        <div className="space-y-2 mt-2">{Object.entries(report.dimensions).map(([key, d]) => <p key={key}><b>{CAREER_LABELS[key as keyof typeof CAREER_LABELS]}</b> · {d.status === "unknown" ? "Inconnu" : d.status === "partial" ? "Partiel" : "Sourcé"} : {d.explanation}</p>)}
          <ul className="list-disc pl-4">{[...report.strategy, ...report.nextChecks, ...report.warnings].map((s, i) => <li key={i}>{s}</li>)}</ul></div></details>
      <p className="text-[10px] text-slate-500">Analyse du {new Date(report.createdAt).toLocaleDateString("fr-FR")} · Note indicative, distincte d&apos;un score ATS. Tu gardes le choix de postuler.</p>
    </>}
  </section>;
}
