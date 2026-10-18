import React from "react";
import type { CvData } from "@/lib/cv";

export interface DocumentSheetProps {
  cv: CvData | null;
  isAdapted?: boolean;
}

export function DocumentSheet({ cv, isAdapted = false }: DocumentSheetProps) {
  if (!cv) return <div className="min-h-[350px] rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">Importe ton CV maître pour afficher son aperçu.</div>;
  return <article className="max-h-[440px] overflow-auto bg-white border border-slate-200/90 rounded-xl shadow-xs p-4 text-[10.5px] text-slate-800 leading-snug select-text">
    <header className="text-center border-b border-slate-100 pb-3 mb-3">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-900">{cv.basics.name || "Nom non détecté dans le CV"}</h2>
      {cv.basics.headline && <p className={`mt-1 text-[11px] ${isAdapted ? "text-emerald-700 font-semibold" : "text-slate-600"}`}>{cv.basics.headline}</p>}
      {cv.basics.target && <p className="mt-1 text-[10px] text-slate-600">{cv.basics.target}</p>}
      {cv.basics.contact && <p className="mt-1 whitespace-pre-line text-[9px] text-slate-500">{cv.basics.contact}</p>}
    </header>
    {cv.summary && <section className="mb-3"><h3 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">Profil</h3><p className="whitespace-pre-line">{cv.summary}</p></section>}
    {cv.sections.map(section => <section key={section.key} className="mb-3">
      <h3 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">{section.title}</h3>
      {section.kind === "text" ? <p className="whitespace-pre-line">{section.text}</p> : <div className="space-y-2">{section.items.map(item => <div key={item.id}>
        <div className="flex items-baseline justify-between gap-2"><strong>{item.title}</strong>{item.meta && <span className="shrink-0 whitespace-pre-line text-[9px] text-slate-400">{item.meta}</span>}</div>
        {item.detail && <p className="mt-0.5 whitespace-pre-line text-slate-600">{item.detail}</p>}
      </div>)}</div>}
    </section>)}
  </article>;
}
