"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, type UserData } from "@/lib/data";
import { analyzeOffer, profileHas, type Analysis } from "@/lib/skills";
import { AppPageHead } from "@/components/app/AppShell";

const EXAMPLES = [
  {
    label: "Alternance marketing — L'Oréal",
    text: "Vous piloterez la stratégie de contenu du site : SEO on-page, rédaction d'articles optimisés, analyse d'audience via Google Analytics, animation du CRM et reporting mensuel des KPI au comité marketing. Vous travaillez en équipe avec les équipes e-commerce et communication.",
  },
  {
    label: "Community manager — Doctolib",
    text: "Vous animez nos communautés sur Instagram, LinkedIn et TikTok : calendrier éditorial, rédaction de contenus engageants, veille et reporting analytics hebdomadaire. Autonomie, rigueur et bon niveau d'anglais attendus.",
  },
  {
    label: "Communication interne — SNCF",
    text: "Vous rédigez la newsletter des collaborateurs (emailing), préparez les supports de présentation sur Pack Office et contribuez à l'organisation d'événements internes. Rigueur et esprit d'équipe indispensables.",
  },
];

const R = 54;
const CIRC = 2 * Math.PI * R;

export default function MatchingPage() {
  const { user } = useAuth();
  const [data, setData] = useState<UserData | null>(null);
  const [offer, setOffer] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Analysis | null>(null);
  const [gauge, setGauge] = useState(CIRC);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [selMissing, setSelMissing] = useState<Set<string>>(new Set());
  type Report = {
    strategy: string;
    changes: { area: string; change: string; keywords: string[] }[];
    addedKeywords: string[];
    considerations: { title: string; detail: string }[];
  };
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    if (!user) return;
    const id = window.setTimeout(() => setData(getOrCreateData(user.name, user.email)), 0);
    return () => window.clearTimeout(id);
  }, [user]);

  /* Animation de l'aiguille : part de 0 puis atteint le score. */
  useEffect(() => {
    if (!result) return;
    const id = window.setTimeout(
      () => setGauge(CIRC * (1 - result.score / 100)),
      60
    );
    return () => window.clearTimeout(id);
  }, [result]);

  const analyze = async () => {
    if (offer.trim().length < 40 || busy || !data) return;
    setBusy(true);
    setAiNote(null);
    setReport(null);
    setSelMissing(new Set());
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "match",
          profile: data.profile,
          cvOriginal: data.originalCv?.text,
          offerText: offer,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const r = json.result as {
        score: number;
        matched: string[];
        missing: string[];
        strategy?: string;
        changes?: Report["changes"];
        addedKeywords?: string[];
        considerations?: Report["considerations"];
      };
      setResult({
        score: Math.max(0, Math.min(100, Math.round(r.score))),
        found: (r.matched ?? []).map((key) => ({ key, weight: 6 })),
        missing: (r.missing ?? []).map((key) => ({ key, aliases: [], weight: 6 })),
        wordCount: offer.trim().split(/\s+/).filter(Boolean).length,
      });
      setReport({
        strategy: r.strategy ?? "",
        changes: r.changes ?? [],
        addedKeywords: r.addedKeywords ?? [],
        considerations: r.considerations ?? [],
      });
      setAiNote("Analyse par Gemini de ton CV original face à cette offre");
    } catch {
      setResult(analyzeOffer(offer));
      setAiNote("IA indisponible — analyse locale de secours");
    } finally {
      setBusy(false);
    }
  };

  const toggleMissing = (key: string) => {
    setSelMissing((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const adaptWithSelection = () => {
    if (!offer.trim() || !data) return;
    try {
      window.localStorage.setItem(
        "cible:quick-adapt",
        JSON.stringify({
          offerText: offer,
          selected: [...selMissing],
          at: Date.now(),
        })
      );
    } catch {
      /* stockage indisponible → on navigue quand même */
    }
    // Navigation full-page volontaire après persistance locale.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/app/adaptation";
  };

  const skills = data?.profile.skills ?? [];
  const hasCvSource =
    !!data?.originalCv?.text || skills.length > 0 || !!data?.profile.title;

  return (
    <>
      <AppPageHead
        eyebrow="Module 02"
        title="Matching ATS"
        sub="Colle l'annonce qui te fait de l'œil. Gemini la compare à ton CV original et te dit exactement où tu te situes — mots-clés réels, conseils concrets."
      />

      {!hasCvSource && (
        <div className="glass-card p-5 mb-4 border-l-2! border-l-amber!">
          <p className="text-[0.85rem] text-text-dim leading-relaxed">
            <b>Ton espace est encore vide.</b> Sans CV, Gemini n&apos;a rien à comparer et le score
            sera forcément bas. Colle ton CV original dans{" "}
            <Link href="/app/cv" className="text-mint hover:text-mint-strong underline underline-offset-2">
              CV intelligent
            </Link>{" "}
            (30 secondes) puis reviens ici — l&apos;analyse deviendra réelle.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-[1.25fr_1fr] gap-4 items-start">
        {/* Entrée */}
        <section className="glass-card p-7">
          <label htmlFor="offer" className="mono-label mb-3 block">Texte de l&apos;offre</label>
          <textarea
            id="offer"
            className="input"
            rows={9}
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            placeholder="Colle ici l'intégralité de l'offre (missions, profil recherché…). Plus c'est complet, plus le diagnostic est juste."
          />
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="mono-label">Exemples :</span>
            {EXAMPLES.map((ex) => (
              <button key={ex.label} type="button" className="chip" onClick={() => setOffer(ex.text)}>
                {ex.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 mt-6">
            <p className="text-[0.75rem] text-muted">
              {offer.trim().split(/\s+/).filter(Boolean).length} mots ·{" "}
              comparé par IA à ton CV original
            </p>
            <button type="button" className="btn-primary" onClick={analyze} disabled={busy || offer.trim().length < 40}>
              {busy ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  Analyse…
                </>
              ) : (
                "Analyser cette offre"
              )}
            </button>
          </div>
        </section>

        {/* Résultat */}
        <section className="glass-card p-7 lg:sticky lg:top-24">
          {!result ? (
            <div className="py-14 text-center">
              <p className="font-display text-5xl font-semibold text-surface-2 select-none">◎</p>
              <p className="mt-4 text-sm text-muted leading-relaxed max-w-[26ch] mx-auto">
                Le score apparaîtra ici dès que tu auras collé une offre.
              </p>
            </div>
          ) : (
            <>
              {/* Jauge */}
              <div className="relative w-fit mx-auto mb-6">
                <svg width="150" height="150" viewBox="0 0 128 128" role="img" aria-label={`Score de compatibilité ${result.score} sur 100`}>
                  <circle cx="64" cy="64" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
                  <circle
                    cx="64" cy="64" r={R} fill="none"
                    stroke="var(--emerald)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={gauge}
                    transform="rotate(-90 64 64)"
                    style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1)" }}
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <p className="font-display text-4xl font-semibold tabular-nums">{result.score}<span className="text-lg text-muted">%</span></p>
                </div>
              </div>
              <p className="text-center mono-label mb-2">
                compatibilité de ton CV original avec l&apos;offre
              </p>
              {aiNote && (
                <p className="text-center text-[0.7rem] text-muted mb-5">{aiNote}</p>
              )}

              {/* Mots-clés trouvés */}
              <p className="mono-label mb-3">
                Mots-clés de l&apos;offre ({result.found.length})
              </p>
              <div className="flex flex-wrap gap-1.5 mb-6">
                {result.found.map((f) =>
                  profileHas(skills, f.key) ? (
                    <span key={f.key} className="kw-chip is-added">{f.key} ✓</span>
                  ) : (
                    <span key={f.key} className="kw-chip is-added border-violet/40! text-violet!">{f.key} · à prouver</span>
                  )
                )}
              </div>

              {/* Manquants — sélectionnables */}
              {result.missing.length > 0 && (
                <>
                  <p className="mono-label mb-3">
                    À ajouter si c&apos;est vrai pour toi ·{" "}
                    <span className="text-text-dim">
                      clique pour sélectionner
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {result.missing.map((m) => {
                      const on = selMissing.has(m.key);
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => toggleMissing(m.key)}
                          aria-pressed={on}
                          className={`kw-chip cursor-pointer transition-all active:scale-95 ${
                            on
                              ? "border-mint/60! bg-mint/10! text-mint!"
                              : "border-amber/40! text-amber!"
                          }`}
                        >
                          {on ? "✓ " : ""}{m.key}
                        </button>
                      );
                    })}
                  </div>
                  {selMissing.size > 0 && (
                    <p className="text-[0.72rem] text-mint mb-6">
                      {selMissing.size} sélectionné{selMissing.size > 1 ? "s" : ""} —
                      ils seront intégrés en priorité dans ton CV.
                    </p>
                  )}
                </>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-primary justify-center" onClick={adaptWithSelection}>
                  {selMissing.size > 0
                    ? `Adapter mon CV (+${selMissing.size})`
                    : "Adapter mon CV"}
                </button>
                <Link href="/app/lettres" className="btn-line">Lettre adaptée</Link>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Rapport détaillé Gemini */}
      {report && (report.strategy || report.changes.length > 0 || report.considerations.length > 0) && (
        <div className="mt-10 space-y-6">
          {report.strategy && (
            <section className="glass-card p-7">
              <p className="mono-label mb-3">Stratégie globale</p>
              <p className="text-[0.95rem] text-text-dim leading-relaxed max-w-4xl">{report.strategy}</p>
            </section>
          )}

          {report.changes.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between gap-4 mb-5">
                <h2 className="font-display text-xl font-semibold">Ce qu&apos;il faut modifier</h2>
                <span className="mono-label">{report.changes.length} changement{report.changes.length > 1 ? "s" : ""}</span>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {report.changes.map((c, i) => (
                  <article key={i} className="glass-card p-6">
                    <div className="flex items-start gap-3">
                      <span className="score-pill shrink-0"><b className="tabular-nums">{i + 1}</b></span>
                      <div className="min-w-0">
                        <p className="mono-label">{c.area}</p>
                        <p className="mt-2 text-[0.88rem] leading-relaxed text-text-dim">{c.change}</p>
                        {c.keywords?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {c.keywords.map((k) => <span key={k} className="chip chip--mint">{k}</span>)}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {report.addedKeywords.length > 0 && (
            <section className="glass-card p-7">
              <p className="mono-label mb-3">Mots-clés légitimes à mettre en avant ({report.addedKeywords.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {report.addedKeywords.map((k) => <span key={k} className="kw-chip is-added">{k}</span>)}
              </div>
            </section>
          )}

          {report.considerations.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-semibold mb-5">Points de vigilance</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {report.considerations.map((c, i) => (
                  <article key={i} className="glass-card p-6 border-l-2! border-l-amber!">
                    <p className="font-medium text-[0.9rem]">{c.title}</p>
                    <p className="mt-2 text-[0.82rem] text-text-dim leading-relaxed">{c.detail}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
