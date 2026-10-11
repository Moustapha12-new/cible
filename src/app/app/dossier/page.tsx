"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, saveData, type UserData } from "@/lib/data";
import ConfirmedSkills from "@/components/cv/ConfirmedSkills";
import CvPreview from "@/components/cv/CvPreview";
import { cvToText, parseCvText, cvDocumentHtml, DEFAULT_CV_DESIGN } from "@/lib/cv";
import { hasCvTerm } from "@/lib/cv-keywords";
import { atsScore } from "@/lib/ats";
import { AppPageHead } from "@/components/app/AppShell";
import ApplicationJourney from "@/components/app/ApplicationJourney";
import DocumentsExchanges from "@/components/dossier/DocumentsExchanges";
import { sentDocumentSnapshot } from "@/lib/pfe-documents";
import ReadyToApply from "@/components/app/ReadyToApply";

const ARROW_RIGHT = "→";
const HELLIPSIS = "…";
const AMP = "&";
const QUOT = '"';
const LT = "<";
const GT = ">";

export default function DossierPage() {
  const { user } = useAuth();
  const [data, setData] = useState<UserData | null>(null);
  const [id, setId] = useState("");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const offerId = params.get("offer") || "";
      const loaded = getOrCreateData(user.name, user.email);
      setId(offerId);
      const requestedStep = params.get("step");
      const parsedStep = requestedStep === null ? -1 : Number(requestedStep);
      setStep(Number.isInteger(parsedStep) && parsedStep >= 0 && parsedStep <= 3 ? parsedStep : window.location.hash === "#ready-to-apply" ? 3 : 0);
      setData(loaded);
    }, 0);
    return () => clearTimeout(timer);
  }, [user]);
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      setId(params.get("offer") || "");
      const requested = params.has("step") ? Number(params.get("step")) : -1;
      setStep(Number.isInteger(requested) && requested >= 0 && requested <= 3 ? requested : window.location.hash === "#ready-to-apply" ? 3 : 0);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  if (!data || !user) return <p role="status">Ouverture du dossier…</p>;
  const offer = data.offers.find(o => o.id === id);
  if (!offer) return <><AppPageHead eyebrow="Mon dossier" title="Choisis une offre pour commencer." sub="Chaque offre garde son CV, sa lettre et son suivi dans un même dossier." /><Link href="/app/alertes-gmail" className="btn-primary">Trouver mon stage dans Gmail {ARROW_RIGHT}</Link><Link href="/app/offers" className="btn-line ml-3">Explorer les offres</Link></>;
  const original = data.originalCv?.text || (data.cvData ? cvToText(data.cvData) : "");
  const doc = data.dossiers?.[id] || { cvText: original, letterText: "", notes: "", updatedAt: "" };
  function goToStep(nextStep: number) {
    setStep(nextStep);
    window.history.pushState(null, "", `/app/dossier?offer=${encodeURIComponent(id)}&step=${nextStep}`);
  }
  const present = offer.keywords.filter(k => hasCvTerm(doc.cvText, k));
  const missing = offer.keywords.filter(k => !present.includes(k));
  const coverage = offer.keywords.length && doc.cvText.trim() ? Math.round(present.length / offer.keywords.length * 100) : null;
  const structure = doc.cvText.trim() ? atsScore(doc.cvText) : null;
  function update(patch: Partial<typeof doc>) {
    if (!user || !data) return;
    const latest = getOrCreateData(user.name, user.email);
    const next = { ...latest, dossiers: { ...latest.dossiers, [id]: { ...doc, ...patch, updatedAt: new Date().toISOString() } } };
    saveData(user.email, next);
    setData(next);
  }
  async function generateLetter() {
    if (!data || !offer || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "letter", profile: data.profile, cvOriginal: doc.cvText, offerText: offer.text, company: offer.company, role: offer.title }) });
      const json = await response.json();
      if (!response.ok || !json.ok || !json.result?.body) throw new Error(json.error || "La lettre n’a pas pu être générée. Réessaie.");
      update({ letterText: [json.result.subject, json.result.body].filter(Boolean).join("\n\n") });
    } catch (e) { setError(e instanceof Error ? e.message : "Service indisponible"); }
    finally { setBusy(false); }
  }
  async function readOffer() {
    if (!offer || !data || busy) return;
    setBusy(true); setError("");
    try {
      let text = offer.text;
      if (offer.url) {
        const response = await fetch("/api/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: offer.url }) });
        const json = await response.json();
        if (!response.ok || !json.ok) throw new Error(json.error || "Page inaccessible. Colle le texte de l’annonce ci-dessous pour continuer.");
        text = json.text;
      }
      const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "keywords", offerText: text }) });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Analyse indisponible. Tu peux continuer en complétant le texte.");
      const keywords = (json.result.keywords || []).map((k: string | { term: string }) => typeof k === "string" ? k : k.term).filter(Boolean);
      const latest = getOrCreateData(user!.name, user!.email);
      const next = { ...latest, offers: latest.offers.map(o => o.id === id ? { ...o, text, keywords } : o) };
      saveData(user!.email, next); setData(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Lecture impossible"); }
    finally { setBusy(false); }
  }
  function download(text: string, name: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }
  const previewCv = parseCvText(doc.cvText);
  previewCv.basics.target ||= `Candidature — ${offer.title} · ${offer.company}`;
  function printCv() {
    const popup = window.open("", "_blank");
    if (!popup) { setError("Autorise les fenêtres pour ouvrir ton CV imprimable."); return; }
    popup.document.write(cvDocumentHtml(previewCv, data!.cvDesign ?? DEFAULT_CV_DESIGN, `CV - ${offer!.company}`, true));
    popup.document.close();
  }
  function printDocument(text: string, name: string) {
    const popup = window.open("", "_blank");
    if (!popup) { setError("Autorise l’ouverture de la fenêtre pour imprimer ton document."); return; }
    const escape = (value: string) => value.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "\"");
    const html = "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><title>" + escape(name) + "</title><style>@page{size:A4;margin:20mm}body{font:11pt/1.65 Arial,sans-serif;color:#17281e;max-width:720px;margin:30px auto}main{white-space:pre-wrap;overflow-wrap:break-word}button{padding:12px 18px;margin-bottom:24px;background:#205c3c;color:white;border:0;border-radius:6px}@media print{body{margin:0}button{display:none}}</style></head><body><button onclick=\"window.print()\">Imprimer / enregistrer en PDF</button><main>" + escape(text) + "</main></body></html>";
    popup.document.write(html);
    popup.document.close();
    popup.focus();
  }
  return <>
    <Link href="/app" className="text-sm text-muted">← Mon tableau de bord</Link>
    <div className="mt-6"><AppPageHead eyebrow={`Dossier de candidature · ${offer.company}`} title={offer.title} sub={[offer.location, offer.source].filter(Boolean).join(" · ")} /><Link className="btn-line mb-5" href={`/app/matching?offer=${encodeURIComponent(offer.id)}`}>Comprendre l’offre et choisir mes preuves {ARROW_RIGHT}</Link></div>
    <ApplicationJourney data={data} offerId={id} current={step === 3 ? "ready" : "dossier"} />
    <nav className="journey" aria-label="Etapes de candidature">{["Comprendre l’offre", "Optimiser mon CV", "Préparer ma lettre", "Vérifier & postuler"].map((label, i) => <button key={label} type="button" onClick={() => goToStep(i)} aria-current={step === i ? "step" : undefined} className={step === i ? "active" : ""}><span>{i + 1}</span>{label}</button>)}</nav>
    <div className="dossier-layout">
      <section className="glass-card p-6 sm:p-8">
        {step === 0 && <><p className="eyebrow">L’opportunité</p><button className="btn-line mt-4" disabled={busy || (!offer.url && offer.text.trim().length < 30)} onClick={readOffer}>{busy ? "Lecture de l’annonce…" : "Lire l’annonce & extraire les mots-clés"}</button><h2 className="font-display text-2xl mt-3 mb-5">Ce que le recruteur recherche</h2><p className="whitespace-pre-wrap text-sm leading-7 text-text-dim">{offer.text || "Le contenu complet n’est pas disponible. Colle le texte de l’annonce ci-dessous."}</p><details className="mt-5"><summary className="cursor-pointer text-sm text-mint">Compléter ou corriger le texte de l’offre</summary><textarea aria-label="Texte complet de l’offre" className="input w-full min-h-56 mt-3" value={offer.text} onChange={e => { const next = { ...data, offers: data.offers.map(o => o.id === id ? { ...o, text: e.target.value } : o) }; saveData(user.email, next); setData(next); }} /></details><button className="btn-primary mt-6" onClick={() => goToStep(1)}>Préparer mon CV {ARROW_RIGHT}</button></>}
        {step === 1 && <><p className="eyebrow">Une version pour cette offre</p><h2 className="font-display text-2xl mt-3">Ton expérience, mieux mise en valeur.</h2><p className="text-sm text-muted mt-3 mb-5">Conserve tes faits réels. Mets en avant les projets, cours et expériences qui répondent aux missions.</p><ConfirmedSkills offer={offer} onChange={setData} /><label htmlFor="dossier-cv" className="text-sm font-semibold">CV de ce dossier · sauvegardé à chaque modification</label><textarea id="dossier-cv" className="input w-full min-h-96 mt-3 leading-7" value={doc.cvText} onChange={e => update({ cvText: e.target.value })} placeholder="Colle ton CV ici ou ajoute ton CV dans Mon profil & CV." /><div className="mt-5"><p className="text-sm font-semibold mb-3">Aperçu de ton CV · modèle enregistré</p><CvPreview cv={previewCv} design={data.cvDesign ?? DEFAULT_CV_DESIGN} /><Link href="/app/cv/builder" className="text-sm text-mint inline-block mt-3">Changer le design de mes CV {ARROW_RIGHT}</Link></div><div className="flex flex-wrap gap-3 mt-5">{offer.text.trim().length >= 30 ? <Link href={`/app/adaptation?offer=${encodeURIComponent(id)}`} className="btn-line">Optimiser avec l’IA {ARROW_RIGHT}</Link> : <button className="btn-line" onClick={() => goToStep(0)}>Compléter le texte de l’offre {ARROW_RIGHT}</button>}<button className="btn-primary" disabled={!doc.cvText.trim()} onClick={() => goToStep(2)}>Continuer vers la lettre {ARROW_RIGHT}</button><button className="btn-line" disabled={!doc.cvText.trim()} onClick={printCv}>Imprimer / PDF</button><button className="btn-line" disabled={!doc.cvText.trim()} onClick={() => download(doc.cvText, "cv.txt")}>Exporter le texte</button></div></>}
        {step === 2 && <><p className="eyebrow">Une lettre personnelle</p><h2 className="font-display text-2xl mt-3">Explique pourquoi ce stage te correspond.</h2><p className="text-sm text-muted my-4">Le brouillon s’appuie sur le CV de ce dossier et cette offre. Relis-le et ajoute ce qui te motive vraiment.</p><button className="btn-line mb-5" onClick={generateLetter} disabled={busy || !doc.cvText.trim() || offer.text.trim().length < 30}>{busy ? "Rédaction en cours…" : "Générer un brouillon"}</button><label htmlFor="dossier-letter" className="block text-sm font-semibold">Lettre de motivation</label><textarea id="dossier-letter" className="input w-full min-h-96 mt-3 leading-7" value={doc.letterText} onChange={e => update({ letterText: e.target.value })} placeholder="Tu peux aussi écrire ta lettre directement ici." /><div className="flex gap-3 flex-wrap mt-5"><button className="btn-primary" onClick={() => goToStep(3)}>Vérifier mon dossier {ARROW_RIGHT}</button><button className="btn-line" disabled={!doc.letterText.trim()} onClick={() => download(doc.letterText, "lettre-motivation.txt")}>Exporter la lettre</button></div></>}
        {step === 3 && (
          <ReadyToApply
            offerId={id}
            user={user}
            data={data}
            onDataChange={setData}
            mode="full"
            onNavigate={(href) => {
              if (href.startsWith("http")) window.open(href, "_blank", "noopener,noreferrer");
              else window.location.href = href;
            }}
          />
        )}
        {error && <p className="mt-4 text-red-700" role="alert">{error}</p>}
      </section>
      <aside className="space-y-4"><div className="glass-card p-6"><p className="eyebrow">Repères ATS</p><div className="dossier-score">{coverage === null ? "—" : `${coverage}%`}</div><p className="text-sm font-semibold">Couverture des mots-clés de l’offre</p><p className="text-xs text-muted mt-2">{offer.keywords.length ? `${present.length} sur ${offer.keywords.length} mots-clés présents dans le texte du CV.` : "Aucun mot-clé extrait : compléte l’analyse dans l’outil d’optimisation."} Cet indicateur ne prédit pas la décision du recruteur.</p><ConfirmedSkills offer={offer} onChange={setData} /><div className="mt-5 flex flex-wrap gap-2">{offer.keywords.map(k => <span key={k} className={`chip ${present.includes(k) ? "chip--mint" : "chip--amber"}`}>{present.includes(k) ? "✓ " : "+ "}{k}</span>)}</div>{missing.length > 0 && <p className="text-xs text-muted mt-4">Ajoute uniquement les compétences que tu possèdes réellement.</p>}</div><div className="glass-card p-6"><p className="font-semibold text-sm">Lisibilité du CV</p><p className="text-2xl font-semibold mt-3">{structure ? `${structure.score}/100` : "À analyser"}</p>{structure?.breakdown.filter(b => b.got < b.max).slice(0, 3).map(b => <p key={b.label} className="text-xs text-muted mt-3">{b.label} : {b.detail}</p>)}</div><div className="mentor-note"><p className="font-display text-xl">Tu as plus à raconter que tu ne le penses.</p><p className="text-sm mt-3 leading-6">Projet de cours, association, job étudiant : une expérience concrète vaut mieux qu’une liste de qualités.</p></div></aside>
    </div>
    <DocumentsExchanges data={data} onChange={setData} user={user} caseKey={id} offer={offer} application={data.applications.find(item => item.id === doc.applicationId || item.offerId === id)} />
  </>;
}

