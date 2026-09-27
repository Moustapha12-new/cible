"use client";

import { useState } from "react";
import Link from "next/link";
import type { RawOffer } from "@/lib/gmail-dashboard";
import { enrichBadge, extractLogoSrc, isIndirectOfferUrl, shortUrl, stripHtml } from "@/lib/gmail-dashboard";
import { offerBridgeKey, offerToOfferText, writeQuickAdapt } from "@/lib/gmail-bridge";

/** Clique Postuler : écrit le pont Module 03 puis navigue vers Adaptation IA. */
export function applyToModule03(offer: RawOffer) {
  const text = offerToOfferText(offer);
  if (text.trim().length < 30) return;
  writeQuickAdapt(text, offer.keywords?.slice(0, 8) ?? [], {
    title: offer.title,
    company: offer.company,
    location: offer.location,
    salary: offer.salary,
    summary: offer.summary,
    keywords: offer.keywords,
    source: offer.source,
    url: offer.applicationUrl || offer.sourceUrl,
  });
  // Navigation full-page volontaire après persistance locale (module 03).
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/app/adaptation";
}

/** Logo d'entreprise extrait du HTML du mail — s'il casse, il disparaît. */
function OfferLogo({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-9 w-9 rounded-md object-contain bg-surface-2 border border-line shrink-0"
    />
  );
}

/** Sous-carte offre : infos + preuves + CTA vers Module 03 / détail. */
export default function OfferCard({
  offer,
  isVariant = false,
}: {
  offer: RawOffer;
  /** P1-6 : badge « variante probable » (groupement UI, jamais exclusion). */
  isVariant?: boolean;
}) {
  const eb = enrichBadge(offer.enrichStatus);
  const detailHref = `/app/alertes-gmail/offre?k=${encodeURIComponent(offerBridgeKey(offer))}`;
  const preview = stripHtml(offer.summary?.trim() || offer.description?.trim() || "");
  const logoSrc = extractLogoSrc(offer.snippet);
  /* P0-3 : redirection Indeed opaque non résoluble hors ligne (payload
     antérieur au champ `indirect` → dérivation par l'URL). */
  const indirect = offer.indirect ?? isIndirectOfferUrl(offer.applicationUrl);
  return (
    <article className="rounded-xl border border-line bg-surface p-4" data-testid="offer-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {logoSrc && <OfferLogo src={logoSrc} alt={offer.company || "logo"} />}
          <div className="min-w-0">
            <h4 className="font-display text-[0.95rem] font-semibold leading-snug">
              {offer.title || "Sans titre"}
            </h4>
            <p className="text-[0.78rem] text-text-dim mt-0.5">
              {[offer.company, offer.location].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
        </div>
        <span className={eb.cls} data-enrich={offer.enrichStatus || "none"}>
          {eb.label}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2">
        {offer.contract && <span className="chip chip--mint">{offer.contract}</span>}
        {offer.duration && <span className="chip">{offer.duration}</span>}
        {offer.salary && <span className="chip chip--mint">{offer.salary}</span>}
        {offer.deadline && <span className="chip chip--amber">limite {offer.deadline}</span>}
        {offer.source && <span className="chip chip--muted">{offer.source}</span>}
        {offer.searchFallback && (
          <span className="chip" title="Aucun lien direct dans l'e-mail — recherche ouverte">
            lien (recherche)
          </span>
        )}
        {indirect && (
          <span
            className="chip chip--amber"
            data-testid="indirect-badge"
            title="Redirection Indeed opaque (engage/cts/pagead) non résoluble hors ligne — le lien ouvre Indeed puis l'offre"
          >
            Lien non direct
          </span>
        )}
        {offer.importStatus && (
          <span className={`chip ${offer.importStatus === "doublon" ? "chip--muted" : "chip--mint"}`}>
            {offer.importStatus}
          </span>
        )}
        {isVariant && (
          <span
            className="chip chip--amber"
            data-testid="variant-badge"
            title="Titre quasi identique à une autre offre (URL différente) — groupement visuel uniquement"
          >
            variante probable
          </span>
        )}
      </div>

      {preview && (
        <p className="text-[0.78rem] text-text-dim leading-relaxed mt-2 line-clamp-3" data-testid="offer-summary">
          {preview}
        </p>
      )}

      {offer.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {offer.skills.map((s) => (
            <span key={s} className="kw-chip is-added text-[0.68rem]">
              {s}
            </span>
          ))}
        </div>
      )}

      {(offer.keywords?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2" data-testid="offer-keywords">
          <span className="mono-label mr-1 self-center">ATS</span>
          {(offer.keywords ?? []).slice(0, 8).map((k) => (
            <span key={k} className="kw-chip is-added text-[0.68rem]">
              {k}
            </span>
          ))}
        </div>
      )}

      {!preview && offer.snippet && (
        <details className="mt-2" data-testid="snippet-block">
          <summary className="text-[0.72rem] text-mint cursor-pointer hover:text-mint-strong">
            Extrait de l&apos;e-mail
          </summary>
          <p
            className="text-[0.78rem] text-text-dim leading-relaxed mt-1.5"
            data-testid="offer-snippet"
          >
            {stripHtml(offer.snippet)}
          </p>
          <details className="mt-1.5">
            <summary className="text-[0.68rem] text-muted cursor-pointer hover:text-mint">
              HTML d&apos;origine (preuve technique)
            </summary>
            <pre className="text-[0.65rem] font-mono text-muted bg-surface-2/70 rounded p-2 overflow-x-auto max-h-20 whitespace-pre-wrap break-words mt-1.5">
              {offer.snippet}
            </pre>
          </details>
        </details>
      )}

      {/* Preuves d'extraction — jamais inventées */}
      <div className="mt-3 pt-3 border-t border-line space-y-1">
        {offer.sourceUrl && (
          <p className="text-[0.68rem] text-muted truncate" title={offer.sourceUrl}>
            <span className="mono-label mr-1">sourceUrl</span>
            <a
              href={offer.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-mint"
            >
              {shortUrl(offer.sourceUrl)}
            </a>
          </p>
        )}
        {offer.anchorText && (
          <p className="text-[0.68rem] text-muted truncate">
            <span className="mono-label mr-1">anchorText</span>
            <span className="text-text-dim">« {offer.anchorText} »</span>
          </p>
        )}
        {offer.description && preview !== stripHtml(offer.description) && (
          <p className="text-[0.72rem] text-muted leading-relaxed line-clamp-3">
            {stripHtml(offer.description)}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button
          type="button"
          className="btn-primary btn-sm"
          data-testid="btn-apply"
          data-adapt-href="/app/adaptation"
          onClick={() => applyToModule03(offer)}
        >
          Postuler{offer.searchFallback ? " (recherche)" : " →"} Module 03
        </button>
        <Link href={detailHref} className="btn-line btn-sm" data-testid="btn-detail">
          Détail
        </Link>
        {offer.applicationUrl && (
          <a
            href={offer.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-line btn-sm"
            data-testid="btn-external"
          >
            Site ↗
          </a>
        )}
      </div>
    </article>
  );
}
