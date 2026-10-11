"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, saveData, type SkillEvidence, type UserData } from "@/lib/data";
import { cvToText } from "@/lib/cv";
import { AppPageHead } from "@/components/app/AppShell";
import ApplicationJourney from "@/components/app/ApplicationJourney";
import { analyzePfeOffer, canSelectProof, matchingEvidence, pfeFingerprint, proofRecordId, savePfeAnalysis, type PfeAnalysis } from "@/lib/pfe-matching";

const kindLabels: Record<NonNullable<SkillEvidence["kind"]>, string> = {
  project: "Projet académique", experience: "Expérience professionnelle", simulation: "Simulation",
  training: "Formation pratique", achievement: "Réalisation technique", document: "Document", self: "Confirmation personnelle",
};
const statusLabels: Record<SkillEvidence["status"], string> = {
  demonstrated: "Démontrée par une preuve décrite", declared: "Déclarée par moi", studied: "Étudiée",
  verify: "À vérifier", missing: "Non acquise",
};
const emptyProof = (): SkillEvidence => ({ id: crypto.randomUUID(), term: "", title: "", description: "", source: "", skills: [], kind: "project", status: "verify", evidence: "", autonomy: "unknown", updatedAt: "" });
const clean = (text: string) => text.trim().replace(/\s+/g, " ");

export default function MatchingPage() {
  const { user } = useAuth();
  const [data, setData] = useState<UserData | null>(null);
  const [offerId, setOfferId] = useState("");
  const [proof, setProof] = useState<SkillEvidence | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      try {
        const loaded = getOrCreateData(user.name, user.email);
        const requested = new URLSearchParams(window.location.search).get("offer") || "";
        const selected = loaded.offers.some(item => item.id === requested) ? requested : loaded.offers[0]?.id || "";
        const chosenOffer = loaded.offers.find(item => item.id === selected);
        const previous = loaded.pfeAnalyses?.[selected];
        const current = chosenOffer && previous?.fingerprint !== pfeFingerprint(chosenOffer, loaded) ? analyzePfeOffer(chosenOffer, loaded) : null;
        if (current) {
          current.selectedCvTerms = (previous?.selectedCvTerms || []).filter(term => current.requirements.some(row => row.term === term));
          current.selectedEvidenceIds = (previous?.selectedEvidenceIds || []).filter(id => (loaded.profile.skillEvidence || []).some((item, index) => proofRecordId(item, index) === id && canSelectProof(item)));
        }
        const ready = current ? savePfeAnalysis(loaded, current) : loaded;
        if (current) saveData(user.email, ready);
        setData(ready);
        setOfferId(selected);
        if (selected && selected !== requested) window.history.replaceState(null, "", `/app/matching?offer=${encodeURIComponent(selected)}`);
      } catch (error) { setMessage(error instanceof Error ? error.message : "Dossier indisponible"); }
    }, 0);
    return () => clearTimeout(timer);
  }, [user]);
  useEffect(() => {
    if (!data) return;
    const sync = () => {
      const requested = new URLSearchParams(window.location.search).get("offer") || "";
      setOfferId(data.offers.some(item => item.id === requested) ? requested : data.offers[0]?.id || "");
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [data]);

  function persist(next: UserData) {
    if (!user) return;
    try { saveData(user.email, next); setData(next); setMessage("Enregistré dans ton dossier local."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Sauvegarde impossible."); }
  }
  const offer = data?.offers.find(item => item.id === offerId);
  const saved = offer && data?.pfeAnalyses?.[offer.id];
  const stale = !!saved && !!offer && !!data && saved.fingerprint !== pfeFingerprint(offer, data);
  const active: PfeAnalysis | undefined = saved;
  function analyze() {
    if (!offer || !data) return;
    const next = analyzePfeOffer(offer, data);
    if (saved) {
      next.selectedEvidenceIds = saved.selectedEvidenceIds.filter(id => (data.profile.skillEvidence || []).some((item, index) => proofRecordId(item, index) === id && canSelectProof(item)));
      next.selectedCvTerms = (saved.selectedCvTerms || []).filter(term => next.requirements.some(row => row.term === term));
    }
    persist(savePfeAnalysis(data, next));
  }
  function toggleCvTerm(term: string) {
    if (!data || !active) return;
    const selected = active.selectedCvTerms || [];
    persist(savePfeAnalysis(data, { ...active, selectedCvTerms: selected.includes(term) ? selected.filter(item => item !== term) : [...selected, term] }));
  }
  function selectOffer(nextId: string) {
    if (data && user) {
      const chosen = data.offers.find(item => item.id === nextId);
      const previous = data.pfeAnalyses?.[nextId];
      if (chosen && previous?.fingerprint !== pfeFingerprint(chosen, data)) {
        const refreshed = analyzePfeOffer(chosen, data);
        refreshed.selectedCvTerms = (previous?.selectedCvTerms || []).filter(term => refreshed.requirements.some(row => row.term === term));
        refreshed.selectedEvidenceIds = (previous?.selectedEvidenceIds || []).filter(id => (data.profile.skillEvidence || []).some((item, index) => proofRecordId(item, index) === id && canSelectProof(item)));
        const updated = savePfeAnalysis(data, refreshed);
        saveData(user.email, updated);
        setData(updated);
      }
    }
    setOfferId(nextId); setMessage("");
    window.history.pushState(null, "", `/app/matching?offer=${encodeURIComponent(nextId)}`);
  }
  function toggleProof(id: string) {
    if (!data || !active || stale) return;
    const selected = active.selectedEvidenceIds.includes(id) ? active.selectedEvidenceIds.filter(item => item !== id) : [...active.selectedEvidenceIds, id];
    persist(savePfeAnalysis(data, { ...active, selectedEvidenceIds: selected }));
  }
  function saveProof() {
    if (!data || !proof) return;
    const term = clean(proof.term).slice(0, 100);
    const title = clean(proof.title || term).slice(0, 120);
    if (!term || !title) { setMessage("Indique au moins la compétence et l’intitulé de la preuve."); return; }
    const description = (proof.description || proof.evidence || "").trim().slice(0, 1500);
    const source = clean(proof.source || "").slice(0, 160);
    if (proof.status === "demonstrated" && (!description || !source)) { setMessage("Pour marquer cette compétence démontrée, ajoute une description et sa source."); return; }
    const item: SkillEvidence = { ...proof, id: proof.id?.startsWith("legacy:") ? crypto.randomUUID() : proof.id || crypto.randomUUID(), term, title, description, evidence: description, source,
      skills: [...new Set([term, ...(proof.skills || [])].map(clean).filter(Boolean))].slice(0, 15), updatedAt: new Date().toISOString() };
    const existing = data.profile.skillEvidence || [];
    const updated = existing.some((old, index) => proofRecordId(old, index) === proof.id)
      ? existing.map((old, index) => proofRecordId(old, index) === proof.id ? item : old) : [...existing, item];
    persist({ ...data, profile: { ...data.profile, skillEvidence: updated } });
    setProof(null);
  }
  function removeProof(id: string) {
    if (!data) return;
    if (!window.confirm("Retirer cette preuve du registre ? Les analyses déjà sauvegardées resteront consultables comme périmées.")) return;
    persist({ ...data, profile: { ...data.profile, skillEvidence: (data.profile.skillEvidence || []).filter((item, index) => proofRecordId(item, index) !== id) } });
    setProof(null);
  }
  async function askGemini() {
    if (!offer || !data || !active || stale || busy) return;
    const cvOriginal = data.originalCv?.text || (data.cvData ? cvToText(data.cvData) : "");
    if (!cvOriginal.trim()) { setMessage("Ajoute d’abord ton CV maître pour demander une piste personnalisée à Gemini."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        task: "match", profile: data.profile, cvOriginal, offerText: offer.text,
      }) });
      const result = await response.json();
      if (!response.ok || !result.ok || typeof result.result?.strategy !== "string") throw new Error(result.error || "Suggestion indisponible");
      const suggestion = result.result.strategy.trim().slice(0, 1200);
      if (!suggestion) throw new Error("Suggestion vide");
      persist(savePfeAnalysis(data, { ...active, aiSuggestion: suggestion }));
      setMessage("Piste Gemini ajoutée comme hypothèse. Vérifie les faits avant de l’utiliser.");
    } catch { setMessage("Gemini indisponible. L’analyse locale sauvegardée est conservée."); }
    finally { setBusy(false); }
  }
  async function readOfferPage() {
    if (!offer?.url || !data || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: offer.url }) });
      const result = await response.json();
      if (!response.ok || !result.ok || typeof result.text !== "string" || result.text.trim().length < 80) throw new Error(result.error || "Annonce trop courte pour être analysée");
      persist({ ...data, offers: data.offers.map(item => item.id === offer.id ? { ...item, text: result.text.slice(0, 12000) } : item) });
      setMessage("Texte réel de l’annonce enregistré. Lance ou actualise l’analyse.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Lecture de l’annonce impossible. L’offre reste consultable."); }
    finally { setBusy(false); }
  }
  return <>
    <AppPageHead eyebrow="Mission PFE · dès 2027" title="Comprendre chaque opportunité" sub="Repère les critères de l'offre, puis choisis ceux que tu veux déclarer dans ton CV." />
    <div className="glass-card p-5 mb-5">
      <label className="mono-label block mb-2" htmlFor="matching-offer">Offre enregistrée</label>
      <select id="matching-offer" className="input max-w-2xl" value={offerId} onChange={event => selectOffer(event.target.value)}>
        {!offerId && <option value="">Choisir une offre</option>}
        {data?.offers.map(item => <option key={item.id} value={item.id}>{item.title} · {item.company}</option>)}
      </select>
      <p className="text-sm text-muted mt-3">Les offres ouvertes depuis Gmail apparaissent ici après « Analyser » ou « Préparer ma candidature ». Tu peux aussi reprendre un dossier déjà enregistré.</p>
      {!data?.offers.length && <Link href="/app/alertes-gmail" className="btn-primary mt-3">Voir mes offres Gmail →</Link>}
    </div>
    {offer && data && <>
      <ApplicationJourney data={data} offerId={offer.id} current="matching" />
      <section className="glass-card p-6 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="mono-label">Offre choisie</p><h2 className="font-display text-xl font-semibold mt-1">{offer.title}</h2><p className="text-sm text-muted mt-1">{offer.company} · {offer.location || "Lieu à confirmer"} · {offer.duration || "Durée à confirmer"}</p></div><button className="btn-primary" onClick={analyze}>{saved ? "Actualiser l’analyse" : "Analyser cette offre"}</button></div>
        {offer.summary && <p className="text-sm mt-4">{offer.summary}</p>}
        {offer.url && offer.text.trim().length < 80 && <button className="btn-line btn-sm mt-3" disabled={busy} onClick={readOfferPage}>Lire le texte de cette annonce</button>}
        {!offer.description && !offer.text.trim() && <p className="text-sm text-amber mt-3">Fiche courte : l’analyse indiquera les informations à vérifier.</p>}
        {offer.url && <a className="text-sm text-mint underline mt-3 inline-block" href={offer.url} target="_blank" rel="noopener noreferrer">Voir l’annonce source ↗</a>}
      </section>
      {stale && <p role="status" className="glass-card p-4 mb-5 border-l-2! border-l-amber!">L’offre, ton CV ou tes preuves ont changé. Cette analyse est conservée mais périmée ; actualise-la avant de choisir des preuves.</p>}
      {active && <>
        <div className="grid lg:grid-cols-2 gap-4 mb-5">
          <section className="glass-card p-6"><p className="mono-label">Éligibilité PFE</p><h3 className="font-display text-xl mt-2">{active.eligibility.status === "eligible" ? "Compatible selon la fiche" : active.eligibility.status === "excluded" ? "Incompatible selon la fiche" : "À vérifier"}</h3><ul className="list-disc pl-5 text-sm mt-3 space-y-2">{active.eligibility.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul></section>
          <section className="glass-card p-6"><p className="mono-label">Pertinence technique</p><h3 className="font-display text-xl mt-2">{active.relevance.level === "forte" ? "Forte correspondance à explorer" : active.relevance.level === "faible" ? "Lien technique limité" : "À examiner"}</h3><ul className="list-disc pl-5 text-sm mt-3 space-y-2">{active.relevance.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul></section>
        </div>
        <section className="glass-card p-6 mb-5"><h3 className="font-display text-lg font-semibold">Compétences de l’offre</h3><p className="text-sm text-muted mt-2">Coche uniquement les compétences que tu possèdes et veux ajouter à ce CV. Une preuve détaillée est facultative.</p>
          {!active.requirements.length && <p className="text-sm text-amber mt-4">Aucune compétence technique exploitable dans cette fiche. Consulte l’annonce source et complète-la si nécessaire.</p>}
          <div className="grid gap-3 mt-5 sm:grid-cols-2">{active.requirements.map(req => <label key={req.term} className="flex items-start gap-3 rounded-xl border border-line p-4 cursor-pointer"><input type="checkbox" className="mt-1" checked={(active.selectedCvTerms || []).includes(req.term)} onChange={() => toggleCvTerm(req.term)} /><span><strong className="block">{req.term}</strong><span className="text-xs text-muted">{req.match === "non documentée" ? "Pas encore dans ton CV" : "Déjà mentionnée ou documentée"} · {req.priority} dans l’offre</span></span></label>)}</div>
          <details className="mt-5 text-sm"><summary className="cursor-pointer text-mint">Voir les détails et ajouter une preuve (facultatif)</summary><div className="space-y-4 mt-4">{active.requirements.map(req => <article key={req.term} className="border-t border-line pt-4"><strong>{req.term}</strong><p className="text-xs text-muted mt-2">Annonce : « {req.source} »</p>{req.cvExcerpt && <p className="text-xs text-text-dim mt-1">CV : « {req.cvExcerpt} »</p>}{matchingEvidence(data.profile, req).map((item, index) => { const id = proofRecordId(item, (data.profile.skillEvidence || []).indexOf(item)); return <label key={`${id}-${index}`} className="flex gap-2 text-sm mt-2 items-start"><input type="checkbox" checked={active.selectedEvidenceIds.includes(id)} disabled={stale || !canSelectProof(item)} onChange={() => toggleProof(id)} /><span>{item.title || item.term} · {statusLabels[item.status]} · {canSelectProof(item) ? item.source : "Description et source à compléter avant sélection"}</span></label>; })}{!req.evidenceIds.length && <button className="text-sm text-mint underline mt-2" onClick={() => setProof({ ...emptyProof(), term: req.term, title: `Preuve de ${req.term}` })}>Ajouter une preuve</button>}</article>)}</div></details>
        </section>
        <div className="glass-card p-5 mb-5 flex flex-wrap gap-3 items-center"><Link className="btn-primary" href={`/app/adaptation?offer=${encodeURIComponent(offer.id)}`}>Adapter mon CV →</Link><Link className="btn-line" href={`/app/dossier?offer=${encodeURIComponent(offer.id)}`}>Ouvrir le dossier</Link><button className="btn-line" disabled={busy || stale} onClick={askGemini}>{busy ? "Gemini analyse…" : "Conseil IA facultatif"}</button><span className="text-xs text-muted">{(active.selectedCvTerms || []).length} compétence(s) choisie(s) pour le CV</span></div>
        {active.aiSuggestion && <section className="glass-card p-5 mb-5"><h3 className="font-semibold">Piste Gemini · hypothèse à vérifier</h3><p className="text-sm mt-2">{active.aiSuggestion}</p></section>}
      </>}
      <details className="glass-card p-6 mb-5"><summary className="cursor-pointer font-display text-lg font-semibold">Mes preuves détaillées (facultatif)</summary><div className="flex justify-between items-start gap-3 mt-4"><p className="text-sm text-muted">Une preuve peut appuyer plusieurs compétences ; tu peux en ajouter si tu le souhaites.</p><button className="btn-line" onClick={() => setProof(emptyProof())}>Ajouter</button></div>
        {(data.profile.skillEvidence || []).map((item, index) => <article key={proofRecordId(item, index)} className="border-t border-line py-3 mt-3"><div className="flex flex-wrap justify-between gap-2"><div><strong>{item.title || item.term}</strong><p className="text-xs text-muted">{[item.term, ...(item.skills || []).filter(skill => skill !== item.term)].join(" · ")} · {statusLabels[item.status]} · {item.autonomy === "independent" ? "Autonome" : item.autonomy === "assisted" ? "Accompagné" : "Autonomie à préciser"}</p><p className="text-sm mt-1">{item.description || item.evidence || "Description à ajouter"}</p><p className="text-xs text-muted">{item.source || "Source non renseignée"}</p></div><div className="flex gap-2"><button className="btn-line btn-sm" onClick={() => setProof({ ...item, id: proofRecordId(item, index) })}>Modifier</button><button className="btn-line btn-sm" onClick={() => removeProof(proofRecordId(item, index))}>Retirer</button></div></div></article>)}
        {!data.profile.skillEvidence?.length && <p className="text-sm text-muted mt-4">Aucune preuve enregistrée. Les compétences simplement listées dans ton profil restent des déclarations.</p>}
      </details>
    </>}
    {proof && <section className="glass-card p-6 mb-5" aria-label="Éditeur de preuve"><h3 className="font-display text-lg font-semibold">{(data?.profile.skillEvidence || []).some(item => item.id === proof.id) ? "Modifier la preuve" : "Ajouter une preuve"}</h3><div className="grid md:grid-cols-2 gap-3 mt-4"><label className="text-sm">Compétence principale<input className="input mt-1" value={proof.term} onChange={e => setProof({ ...proof, term: e.target.value })} /></label><label className="text-sm">Intitulé<input className="input mt-1" value={proof.title || ""} onChange={e => setProof({ ...proof, title: e.target.value })} /></label><label className="text-sm">Type<select className="input mt-1" value={proof.kind || "project"} onChange={e => setProof({ ...proof, kind: e.target.value as SkillEvidence["kind"] })}>{Object.entries(kindLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-sm">Source réelle (projet, cours, employeur, document…)<input className="input mt-1" value={proof.source || ""} onChange={e => setProof({ ...proof, source: e.target.value })} /></label><label className="text-sm md:col-span-2">Description factuelle<textarea className="input mt-1" rows={3} value={proof.description ?? proof.evidence} onChange={e => setProof({ ...proof, description: e.target.value })} /></label><label className="text-sm">Autres compétences liées (séparées par une virgule)<input className="input mt-1" value={(proof.skills || []).filter(skill => skill !== proof.term).join(", ")} onChange={e => setProof({ ...proof, skills: e.target.value.split(",").map(clean) })} /></label><label className="text-sm">Autonomie<select className="input mt-1" value={proof.autonomy} onChange={e => setProof({ ...proof, autonomy: e.target.value as SkillEvidence["autonomy"] })}><option value="unknown">À préciser</option><option value="assisted">Avec accompagnement</option><option value="independent">En autonomie</option></select></label><label className="text-sm">Statut<select className="input mt-1" value={proof.status} onChange={e => setProof({ ...proof, status: e.target.value as SkillEvidence["status"] })}>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><div className="flex gap-3 mt-4"><button className="btn-primary" onClick={saveProof}>Enregistrer la preuve</button><button className="btn-line" onClick={() => setProof(null)}>Annuler</button></div></section>}
    {message && <p role="status" className="text-sm mb-5">{message}</p>}
  </>;
}
