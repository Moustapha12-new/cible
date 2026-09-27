"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, saveData, type Application } from "@/lib/data";
import { FRENCH_BOARDS, type JobOffer } from "@/lib/jobs";
import { AppPageHead, NAV_LABEL } from "@/components/app/AppShell";
import { AI_LABEL } from "@/lib/ai-labels";

const SOURCE_CLS: Record<string, string> = {
  LinkedIn: "pill--info",
  Remotive: "pill--ok",
  Jobicy: "pill--wait",
};

export default function OffersPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("");
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const prefillDone = useRef(false);

  /* Import d'une annonce depuis son URL → résumé IA → ajout direct au pipeline. */
  const [importUrl, setImportUrl] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function importByLink() {
    const u = importUrl.trim();
    if (!/^https?:\/\//i.test(u) || importBusy || !user) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const scrapeRes = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const scraped = await scrapeRes.json();
      if (!scraped.ok) throw new Error(scraped.error);
      const d = getOrCreateData(user.name, user.email);
      const aiRes = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "offer",
          profile: d.profile,
          cvOriginal: d.originalCv?.text,
          offerText: scraped.text,
        }),
      });
      const aiJson = await aiRes.json();
      if (!aiJson.ok) throw new Error(aiJson.error);
      const r = aiJson.result;
      saveData(user.email, {
        ...d,
        offers: [
          {
            id: Math.random().toString(36).slice(2, 9),
            title: r.title || "Offre importée",
            company: r.company || "Non précisée",
            location: r.location || "",
            salary: r.salary || "",
            match: Math.max(0, Math.min(100, Math.round(r.match ?? 50))),
            keywords: (r.keywords ?? []).slice(0, 6),
            summary: r.summary,
            level: r.level,
            text: scraped.text.slice(0, 4000),
            url: u,
            source: "Lien importé",
          },
          ...d.offers,
        ],
      });
      setImportUrl("");
      setToast(`« ${(r.title ?? "Offre").slice(0, 42)} » importée — visible dans Candidatures`);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import impossible depuis ce lien");
    } finally {
      setImportBusy(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  function follow(o: JobOffer) {
    if (!user) return;
    const d = getOrCreateData(user.name, user.email);
    const app: Application = {
      id: Math.random().toString(36).slice(2, 9),
      company: o.company || o.source,
      role: o.title,
      status: "sent",
      daysAgo: 0,
      source: `Offre ${o.source}`,
    };
    saveData(user.email, { ...d, applications: [app, ...d.applications] });
    setToast(`${o.title.slice(0, 42)} ajoutée à ton pipeline`);
  }

  useEffect(() => {
    if (!user || prefillDone.current) return;
    const id = window.setTimeout(() => {
      const d = getOrCreateData(user.name, user.email);
      const kw =
        d.profile.title ||
        d.profile.skills.slice(0, 3).join(" ") ||
        "alternance marketing";
      const city = d.profile.city.replace(/\s*\d+ᵉ$/, "").trim() || "Paris";
      prefillDone.current = true;
      setQ(kw);
      setLoc(city);
      runSearch(kw, city);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function runSearch(query?: string, city?: string) {
    const kw = (query ?? q).trim() || "alternance";
    const place = (city ?? loc).trim() || "France";
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/jobs?q=${encodeURIComponent(kw)}&l=${encodeURIComponent(place)}`);
      const json = (await res.json()) as { offers?: JobOffer[]; errors?: string[] };
      setOffers(json.offers ?? []);
      setErrors(json.errors ?? []);
    } catch {
      setOffers([]);
      setErrors(["La recherche a échoué — vérifie ta connexion et réessaie."]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AppPageHead
        eyebrow={NAV_LABEL["/app/offers"]}
        title={NAV_LABEL["/app/offers"]}
        sub="Cible interroge en direct LinkedIn, Remotive et Jobicy, puis te renvoie vers les grands sites français pré-remplis avec TES mots-clés. Chaque offre existe vraiment — on ne t'invente rien."
      />

      {/* Import depuis un lien */}
      <div className="glass-card p-5 mb-4">
        <p className="mono-label mb-3">Tu as l&apos;URL d&apos;une annonce ? (LinkedIn, WTTJ, HelloWork…)</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="input flex-1"
            placeholder="https://www.linkedin.com/jobs/view/…"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            inputMode="url"
            aria-label="URL de l'annonce"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); importByLink(); } }}
          />
          <button
            type="button"
            className="btn-line shrink-0"
            onClick={importByLink}
            disabled={importBusy || !/^https?:\/\//i.test(importUrl.trim())}
          >
            {importBusy ? (
              <>
                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                {AI_LABEL.pageBusy}
              </>
            ) : (
              "✨ Importer avec résumé IA"
            )}
          </button>
        </div>
        <p className={`mt-2 text-[0.72rem] leading-relaxed ${importError ? "text-amber" : "text-muted"}`}>
          {importError ??
            "L'annonce est résumée (missions, compétences attendues, niveau) puis ajoutée à tes offres dans Candidatures."}
        </p>
      </div>

      {/* Formulaire */}
      <form
        className="glass-card p-5 mb-8 flex flex-col sm:flex-row gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <input
          className="input flex-1"
          placeholder="Métier ou mots-clés — ex : alternance marketing digital"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Mots-clés"
        />
        <input
          className="input sm:max-w-56"
          placeholder="Ville ou région"
          value={loc}
          onChange={(e) => setLoc(e.target.value)}
          aria-label="Localisation"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={loading}>
          {loading ? "Recherche…" : "Chercher"}
        </button>
      </form>

      {/* Résultats */}
      {loading && (
        <div className="grid md:grid-cols-2 gap-4 mb-10">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="glass-card p-6 animate-pulse">
              <div className="h-3 w-24 bg-line rounded-full" />
              <div className="h-4 w-3/4 bg-line rounded-full mt-4" />
              <div className="h-3 w-1/2 bg-line rounded-full mt-3" />
            </div>
          ))}
        </div>
      )}

      {!loading && searched && offers.length === 0 && (
        <div className="glass-card p-8 text-center mb-10">
          <p className="font-display text-lg font-semibold">Aucune offre remontée pour cette recherche</p>
          <p className="mt-2 text-[0.85rem] text-muted max-w-md mx-auto leading-relaxed">
            Essaie des mots-clés plus larges (« marketing », « stage communication »), ou passe par les
            sites français ci-dessous : leurs moteurs couvrent des centaines de milliers d&apos;offres.
          </p>
        </div>
      )}

      {!loading && offers.length > 0 && (
        <section className="mb-12">
          <div className="flex items-baseline justify-between gap-4 mb-5">
            <h2 className="font-display text-xl font-semibold">
              {offers.length} offre{offers.length > 1 ? "s" : ""} trouvée{offers.length > 1 ? "s" : ""}
            </h2>
            <span className="mono-label">liens officiels · nouvelle fenêtre</span>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {offers.map((o) => (
              <article key={o.id} className="glass-card p-6 flex flex-col">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className={`pill ${SOURCE_CLS[o.source] ?? ""}`}>{o.source}</span>
                  {o.date && (
                    <span className="text-[0.7rem] text-muted tabular-nums">
                      {new Date(o.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </div>
                <a href={o.url} target="_blank" rel="noopener noreferrer" className="group">
                  <h3 className="font-display font-semibold leading-snug group-hover:text-mint transition-colors">
                    {o.title}
                  </h3>
                </a>
                <p className="mt-1.5 text-[0.78rem] text-muted truncate">
                  {o.company} {o.location && `· ${o.location}`}
                </p>
                <div className="mt-auto pt-4 flex flex-wrap gap-2">
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="btn-primary text-[0.8rem]! px-4! h-9! inline-flex items-center">
                    Voir l&apos;offre ↗
                  </a>
                  <Link href="/app/adaptation" className="btn-line text-[0.8rem]! px-4! h-9! inline-flex items-center">
                    Adapter mon CV
                  </Link>
                  <button
                    type="button"
                    onClick={() => follow(o)}
                    className="btn-line text-[0.8rem]! px-4! h-9!"
                  >
                    + Pipeline
                  </button>
                </div>
              </article>
            ))}
          </div>
          {errors.length > 0 && (
            <p className="mt-4 text-[0.75rem] text-muted">
              Sources injoignables lors de cette recherche : {errors.join(" · ")}. Les autres résultats restent valides.
            </p>
          )}
        </section>
      )}

      {/* Sites français */}
      <section>
        <div className="flex items-baseline justify-between gap-4 mb-5">
          <h2 className="font-display text-xl font-semibold">Tous les grands sites français</h2>
          <span className="mono-label">{FRENCH_BOARDS.length} sources officielles</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FRENCH_BOARDS.map((b) => (
            <a
              key={b.id}
              href={b.build(q || "alternance", loc || "France")}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-card p-5 group transition-transform duration-300 hover:-translate-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium group-hover:text-mint transition-colors">{b.label}</h3>
                {b.tier === "search" && <span className="chip chip--mint shrink-0">pré-rempli</span>}
              </div>
              <p className="mt-1.5 text-[0.76rem] text-muted leading-relaxed">{b.desc}</p>
              <p className="mt-3 text-[0.72rem] text-mint-strong font-medium">
                {b.tier === "search" ? `« ${q || "alternance"} » → ${loc || "France"} ↗` : "Ouvrir le site ↗"}
              </p>
            </a>
          ))}
        </div>
      </section>

      {toast && (
        <div className="toast" role="status">
          <span className="w-2 h-2 rounded-full bg-mint inline-block" />
          {toast}
        </div>
      )}
    </>
  );
}
