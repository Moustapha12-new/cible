"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  getOrCreateData,
  saveData,
  type DetectedOffer,
  type UserData,
} from "@/lib/data";
import { AppPageHead, NAV_LABEL } from "@/components/app/AppShell";
import LoadingState from "@/components/alertes-gmail/LoadingState";
import { AI_LABEL } from "@/lib/ai-labels";

const uid = () => Math.random().toString(36).slice(2, 9);

export default function LettresPage() {
  const { user } = useAuth();
  const [data, setData] = useState<UserData | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    const id = window.setTimeout(() => {
      const d = getOrCreateData(user.name, user.email);
      const best = [...d.offers].sort((a, b) => b.match - a.match)[0];
      setData(d);
      setSelId(best?.id ?? null);
    }, 0);
    return () => window.clearTimeout(id);
  }, [user]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(id);
  }, [toast]);

  /* P2-9 : état de chargement visible au lieu d'un écran blanc. */
  if (!data || !user) return <LoadingState />;

  const offers = [...data.offers].sort((a, b) => b.match - a.match);
  const offer: DetectedOffer | undefined = offers.find((o) => o.id === selId) ?? offers[0];

  const generate = async () => {
    if (!offer || aiBusy) return;
    setAiBusy(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "letter",
          profile: data.profile,
          cvOriginal: data.originalCv?.text,
          offerText: offer.text || `${offer.title} chez ${offer.company} (${offer.location})`,
          company: offer.company,
          role: offer.title,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const r = json.result as { subject?: string; body?: string };
      setDraft([r.subject, "", r.body].filter(Boolean).join("\n"));
      setDirty(false);
    } catch {
      setToast(AI_LABEL.unavailable);
    } finally {
      setAiBusy(false);
    }
  };

  const pick = (id: string) => {
    setSelId(id);
    setDraft("");
    setDirty(false);
  };

  const save = () => {
    if (!offer || !draft.trim()) return;
    persist({
      ...data,
      letters: [
        {
          id: uid(),
          applicationId: null,
          company: offer.company,
          role: offer.title,
          content: draft,
          date: new Date().toLocaleDateString("fr-FR"),
        },
        ...data.letters.filter((l) => !(l.company === offer.company && l.role === offer.title)),
      ],
    });
    setToast(`Lettre « ${offer.company} » enregistrée`);
  };

  const remove = (id: string) =>
    persist({ ...data, letters: data.letters.filter((l) => l.id !== id) });

  const downloadTxt = () => {
    if (!offer) return;
    const blob = new Blob([draft], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lettre_${offer.company.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setToast("Lettre copiée dans le presse-papiers");
    } catch {
      /* clipboard indisponible */
    }
  };

  const persist = (next: UserData) => {
    setData(next);
    saveData(user.email, next);
  };

  return (
    <>
      <AppPageHead
        eyebrow={NAV_LABEL["/app/lettres"]}
        title="Lettres de motivation"
        sub="Une lettre construite uniquement avec ce qui est vrai : ton profil, chiffré, et le vocabulaire de l'offre. Tu gardes la main sur chaque mot."
      />

      {/* Sélecteur d'offre */}
      <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Choisir l'offre cible">
        {offers.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={o.id === (offer?.id ?? "")}
            onClick={() => pick(o.id)}
            className={`rounded-xl border px-4 py-2 text-left transition-all duration-300 ${
              o.id === offer?.id
                ? "border-mint/60 bg-mint/8"
                : "border-line bg-surface hover:border-line-strong"
            }`}
          >
            <span className="block text-[0.82rem] font-medium">{o.company}</span>
            <span className={`mono-label mt-0.5 block ${o.id === offer?.id ? "text-mint" : "text-muted"}`}>
              {o.match}% match
            </span>
          </button>
        ))}
      </div>

      {/* Éditeur */}
      <section className="glass-card p-7">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mb-4">
          <h2 className="font-display text-lg font-semibold mr-auto">
            Brouillon {offer && <>— <span className="text-mint">{offer.company}</span></>}
            {dirty && <span className="mono-label ml-3 text-amber">modifié</span>}
          </h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={generate} disabled={aiBusy || !offer}>
              {aiBusy ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  {AI_LABEL.writeBusy}
                </>
              ) : (
                AI_LABEL.writeCta
              )}
            </button>
            <button type="button" className="btn-line" onClick={copy}>Copier</button>
            <button type="button" className="btn-line" onClick={downloadTxt}>↓ .txt</button>
            <button type="button" className="btn-line" onClick={save}>Enregistrer</button>
          </div>
        </div>
        <textarea
          className="input font-normal"
          rows={16}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
          placeholder="Choisis une offre ci-dessus puis clique sur « Rédiger avec l'IA » — l'IA écrit une lettre ancrée dans ton vrai profil, que tu peux modifier librement…"
        />
        <p className="mt-3 text-[0.75rem] text-muted leading-relaxed">
          La lettre s&apos;appuie uniquement sur tes données réelles et le vocabulaire de
          l&apos;offre. Relis, ajuste le ton : tu gardes la main sur chaque mot.
        </p>
      </section>

      {/* Lettres sauvegardées */}
      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold mb-5">
          Mes lettres <span className="text-muted font-normal text-base">({data.letters.length})</span>
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {data.letters.map((l) => (
            <article key={l.id} className="glass-card p-6 flex flex-col">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <h3 className="font-medium">{l.company}</h3>
                <span className="mono-label shrink-0">{l.date}</span>
              </div>
              <p className="text-[0.78rem] text-muted mb-3">{l.role}</p>
              <p className="text-[0.82rem] text-text-dim leading-relaxed line-clamp-4 whitespace-pre-wrap flex-1">
                {l.content.split("\n\n").slice(1).join(" ")}
              </p>
              <div className="flex gap-2 mt-5">
                <button type="button" className="btn-line" onClick={() => { setSelId(l.applicationId); setDraft(l.content); setDirty(false); setToast("Lettre chargée dans l'éditeur"); }}>
                  Ouvrir
                </button>
                <button type="button" className="btn-line opacity-50 hover:opacity-100" onClick={() => remove(l.id)}>
                  Supprimer
                </button>
              </div>
            </article>
          ))}
          {data.letters.length === 0 && (
            <p className="text-sm text-muted md:col-span-2">
              Aucune lettre enregistrée — génère ton premier brouillon ci-dessus.
            </p>
          )}
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
