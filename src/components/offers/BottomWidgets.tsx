import React, { useState } from "react";
import Link from "next/link";
import { Link2, FileText, Clock, MoreVertical } from "lucide-react";
import { CompanyLogo } from "@/components/app/CompanyLogo";
import { HikerBannerScene } from "@/components/app/Scenery";
import { DEMO_PREPARATION_QUEUE } from "@/lib/demo-data";

interface PreparationQueueItem {
  id: string;
  company: string;
  step: string;
  progress: number;
}

interface BottomWidgetsProps {
  onAnalyzeUrl: (url: string) => Promise<void>;
  onPasteTextClick: () => void;
  /** File réelle de préparation (absente = mode démonstration). */
  queueItems?: PreparationQueueItem[];
  queueLabel?: string;
  analyzeSuccessMessage?: string;
}

export function BottomWidgets({
  onAnalyzeUrl,
  onPasteTextClick,
  queueItems,
  queueLabel,
  analyzeSuccessMessage,
}: BottomWidgetsProps) {
  const [inputUrl, setInputUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [notice, setNotice] = useState("");

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim() || analyzing) return;
    setAnalyzing(true);
    setNotice("");
    try {
      await onAnalyzeUrl(inputUrl.trim());
      setInputUrl("");
      setNotice(analyzeSuccessMessage || "Offre analysée et ajoutée !");
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : "Erreur lors de l'analyse");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {/* Widget 1: Ajouter une offre manuellement */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Link2 size={14} />
            </div>
            <h3 className="text-xs font-bold text-slate-900 tracking-tight">
              Ajouter une offre manuellement
            </h3>
          </div>

          <form onSubmit={handleAnalyze} className="flex gap-2 mb-2.5">
            <input
              type="url"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Colle l'URL de l'offre ici…"
              className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={analyzing || !inputUrl.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              {analyzing ? "Analyse…" : "Analyser l'offre"}
            </button>
          </form>

          {notice && (
            <p className="text-[11px] text-blue-600 font-medium mb-2">{notice}</p>
          )}

          <div className="relative flex items-center justify-center my-2.5">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-white px-2 text-[10px] uppercase font-semibold text-slate-400 absolute">
              ou
            </span>
          </div>

          <button
            type="button"
            onClick={onPasteTextClick}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            <FileText size={13} className="text-slate-500" />
            <span>Coller le texte de l&apos;annonce</span>
          </button>
        </div>

        <p className="text-[10px] text-slate-400 leading-tight mt-3">
          L&apos;IA récupère automatiquement les informations (entreprise, missions, compétences…).
        </p>
      </div>

      {/* Widget 2: File de préparation */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Clock size={14} />
            </div>
            <h3 className="text-xs font-bold text-slate-900 tracking-tight">
              File de préparation
            </h3>
            {(queueItems === undefined || queueItems.length > 0) && (
              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                {queueLabel ?? "3 CV en cours"}
              </span>
            )}
          </div>
          <Link
            href="/app/cv"
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
          >
            Voir tout
          </Link>
        </div>

        <div className="flex flex-col gap-3 my-auto">
          {queueItems !== undefined && queueItems.length === 0 && (
            <p className="text-[11px] text-slate-400">
              Aucune préparation en cours. Sélectionne des offres dans le tableau pour lancer le Mode Rafale.
            </p>
          )}
          {(queueItems === undefined ? DEMO_PREPARATION_QUEUE : queueItems).map((item) => (
            <div key={item.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CompanyLogo company={item.company} size="sm" />
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-800 text-[11px]">
                      {item.company}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {item.step}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-600 font-mono">
                    {item.progress}%
                  </span>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-600 p-0.5"
                    aria-label="Document"
                  >
                    <FileText size={13} />
                  </button>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-600 p-0.5"
                    aria-label="Options"
                  >
                    <MoreVertical size={13} />
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Widget 3: Promotional / Inspirational Banner */}
      <div className="relative rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-5 text-white flex flex-col justify-between min-h-[170px]">
        <HikerBannerScene />

        <div className="relative z-10">
          <h3 className="text-sm font-extrabold tracking-tight text-white mb-1">
            Plus de candidatures.
            <br />
            Plus d&apos;opportunités.
          </h3>
          <p className="text-[11px] text-slate-300 max-w-[270px] leading-relaxed">
            Même objectif. Moins d&apos;efforts. L&apos;IA s&apos;occupe du travail répétitif, tu te concentres sur l&apos;essentiel.
          </p>
        </div>

        {/* 3 feature pills at bottom */}
        <div className="relative z-10 flex flex-wrap items-center gap-2 mt-4">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 backdrop-blur-xs text-[10px] font-medium text-slate-200 border border-white/10">
            🎯 Sélection intelligente
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 backdrop-blur-xs text-[10px] font-medium text-slate-200 border border-white/10">
            📄 CV adaptés en un clic
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 backdrop-blur-xs text-[10px] font-medium text-slate-200 border border-white/10">
            📊 Suivi simplifié
          </span>
        </div>
      </div>
    </div>
  );
}
