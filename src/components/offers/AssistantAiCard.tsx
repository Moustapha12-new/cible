import React from "react";
import Link from "next/link";
import { Sparkles, Check, ArrowRight } from "lucide-react";

export function AssistantAiCard({ priorityCount = 4 }: { priorityCount?: number }) {
  return (
    <div className="flex flex-col bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 relative h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-7 h-7 rounded-full bg-[#0a1532] text-white flex items-center justify-center shrink-0 shadow-xs">
          <Sparkles size={14} className="text-blue-400" />
        </div>
        <h3 className="text-xs font-bold text-slate-900 tracking-tight">
          Assistant IA
        </h3>
      </div>

      {/* Main tip */}
      <p className="text-[11px] text-slate-600 leading-relaxed mb-3">
        {priorityCount > 0
          ? `Aujourd'hui, je te recommande de traiter en priorité les ${priorityCount} offre${priorityCount > 1 ? "s" : ""} ci-contre. Elles correspondent le mieux à ton profil et à tes projets actuels.`
          : "Aujourd'hui, aucune offre prioritaire n'a été calculée : synchronise Gmail ou complète ton CV pour obtenir des recommandations."}
      </p>

      {/* Checklist */}
      <div className="flex flex-col gap-1.5 mb-4">
        {[
          "Analyse automatique des offres",
          "Adaptation intelligente de ton CV",
          "Préparation en série (Mode Rafale)",
          "Suivi de tes candidatures",
        ].map((item) => (
          <div key={item} className="flex items-center gap-2 text-[11px] text-slate-700">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <Check size={10} strokeWidth={3} />
            </span>
            <span>{item}</span>
          </div>
        ))}
      </div>

      {/* Action button */}
      <div className="mt-auto pt-2 border-t border-slate-100">
        <Link
          href="/app/offres?recommendations=1"
          className="flex items-center justify-center gap-1.5 w-full py-2 px-3 bg-blue-50 hover:bg-blue-100/80 text-blue-700 font-semibold text-xs rounded-xl transition-colors"
        >
          <span>Voir mes recommandations</span>
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
