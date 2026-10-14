import React from "react";
import Link from "next/link";
import { Bookmark, Check, Zap } from "lucide-react";
import { CompanyLogo } from "@/components/app/CompanyLogo";
import type { DemoRecommendedOffer } from "@/lib/demo-data";

interface DailyOfferCardProps {
  offer: DemoRecommendedOffer;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onSelectOffer: (id: string) => void;
}

export function DailyOfferCard({
  offer,
  isFavorite,
  onToggleFavorite,
  onSelectOffer,
}: DailyOfferCardProps) {
  return (
    <article className="flex flex-col bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-slate-300 transition-all p-4 relative group">
      {/* Top row: Priority Rank & Bookmark */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold flex items-center justify-center">
            {offer.rank}
          </span>
          <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
            {offer.priorityLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onToggleFavorite(offer.id)}
          className={`p-1 rounded-md transition-colors ${
            isFavorite
              ? "text-amber-500 fill-amber-500 hover:text-amber-600"
              : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
          }`}
          aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        >
          <Bookmark size={16} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      {/* Company Header */}
      <div className="flex items-center gap-2.5 mb-2">
        <CompanyLogo company={offer.company} size="sm" />
        <span className="text-xs font-bold text-slate-800 tracking-tight">
          {offer.company}
        </span>
      </div>

      {/* Job Title */}
      <h3 className="text-[13px] font-bold text-slate-900 leading-snug line-clamp-2 min-h-[38px] mb-1.5">
        {offer.title}
      </h3>

      {/* Meta (Location & Duration) */}
      <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2.5">
        <span>📍 {offer.location}</span>
        <span>•</span>
        <span>⏱ {offer.duration || "Durée à vérifier"}</span>
      </div>

      {/* Skill Tags */}
      <div className="flex flex-wrap gap-1 mb-3">
        {offer.tags.map((tag) => (
          <span
            key={tag}
            className="text-[10px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200/80 px-2 py-0.5 rounded-md transition-colors"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Reason text */}
      <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed mb-4 min-h-[32px]">
        {offer.description}
      </p>

      {/* Match badge & score row — absents tant qu'aucun score n'a été calculé. */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 mb-3">
        {offer.matchType ? (
          <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] font-semibold">
            <Check size={12} strokeWidth={2.5} />
            <span>{offer.matchType}</span>
          </div>
        ) : (
          <span className="text-[11px] text-slate-400 font-medium">Match à vérifier</span>
        )}
        <span className="text-[15px] font-extrabold text-emerald-600 tracking-tight">
          {offer.matchPercentage != null ? `${offer.matchPercentage}%` : "—"}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Link
          href={`/app/cv?offer=${encodeURIComponent(offer.id)}&start=1`}
          onClick={() => onSelectOffer(offer.id)}
          className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold rounded-lg shadow-xs transition-colors"
        >
          <Zap size={12} className="fill-white" />
          <span>Adapter mon CV</span>
        </Link>
        {offer.url ? (
          <a
            href={offer.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 py-1.5 px-2 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium rounded-lg border border-slate-200 transition-colors"
          >
            <span>Voir l&apos;offre</span>
          </a>
        ) : (
          <button
            type="button"
            className="flex items-center justify-center py-1.5 px-2 bg-white text-slate-700 text-[11px] font-medium rounded-lg border border-slate-200"
          >
            Voir l&apos;offre
          </button>
        )}
      </div>
    </article>
  );
}
