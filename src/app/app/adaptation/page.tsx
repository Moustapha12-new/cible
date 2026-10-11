"use client";
/* eslint-disable react/no-unescaped-entities */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { AppPageHead } from "@/components/app/AppShell";
import ApplicationJourney from "@/components/app/ApplicationJourney";
import CvPreview from "@/components/cv/CvPreview";
import { cvDocumentHtml, parseCvText, DEFAULT_CV_DESIGN, type CvDesign } from "@/lib/cv";
import { getOrCreateData, saveData, type UserData } from "@/lib/data";
import { analyzePfeOffer, pfeFingerprint, proofRecordId, savePfeAnalysis } from "@/lib/pfe-matching";
import { adaptationStale, approvedProofText, assembleCv, cvMasterText, cvQualityChecklist, normalizeAiChanges, saveAdaptation, sectionCanBeOmitted, validateCvChange, type CvAdaptation, type CvChange } from "@/lib/cv-adaptation";

const now = () => new Date().toISOString();
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const safeFile = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 45);

export default function AdaptationPage() {
  const { user } = useAuth();
  const [data, setData] = useState<UserData | null>(null);
  const [offerId, setOfferId] = useState("");
  const [draft, setDraft] = useState<CvAdaptation | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"compare" | "preview">("compare");
  const [design, setDesign] = useState<CvDesign>(DEFAULT_CV_DESIGN);
  const [orientation, setOrientation] = useState<"electrical" | "energy">("electrical");
  const [manualOriginal, setManualOriginal] = useState("");
  const [manualProposed, setManualProposed] = useState("");

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      const loaded = getOrCreateData(user.name, user.email);
      const requested = new URLSearchParams(window.location.search).get("offer") || "";
      const selected = loaded.offers.some(offer => offer.id === requested) ? requested : loaded.offers[0]?.id || "";
      if (selected && selected !== requested) window.history.replaceState(null, "", `/app/adaptation?offer=${encodeURIComponent(selected)}`);
      setData(loaded); setOfferId(selected); setDraft(loaded.cvAdaptations?.[selected]?.[0] || null);
      setOrientation(loaded.cvAdaptations?.[selected]?.[0]?.orientation || (loaded.pfeAnalyses?.[selected]?.relevance.domains.some(value => /renouvel|performance|production|stockage/i.test(value)) ? "energy" : "electrical"));
      setDesign(loaded.cvDesign || DEFAULT_CV_DESIGN);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user]);
  useEffect(() => {
    if (!data) return;
    const sync = () => {
      const requested = new URLSearchParams(window.location.search).get("offer") || "";
      const selected = data.offers.some(offer => offer.id === requested) ? requested : data.offers[0]?.id || "";
      if (selected === offerId) return;
      if (dirty && !window.confirm("Quitter cette offre sans enregistrer les modifications ?")) {
        window.history.pushState(null, "", `/app/adaptation?offer=${encodeURIComponent(offerId)}`);
        return;
      }
      setOfferId(selected); setDraft(data.cvAdaptations?.[selected]?.[0] || null); setDirty(false);
      setOrientation(data.cvAdaptations?.[selected]?.[0]?.orientation || (data.pfeAnalyses?.[selected]?.relevance.domains.some(value => /renouvel|performance|production|stockage/i.test(value)) ? "energy" : "electrical"));
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [data, offerId, dirty]);
  useEffect(() => {
    if (!data || !user || !offerId) return;
    const selected = data.offers.find(item => item.id === offerId);
    if (!selected) return;
    const previous = data.pfeAnalyses?.[offerId];
    if (previous?.fingerprint === pfeFingerprint(selected, data)) return;
    const timer = window.setTimeout(() => {
      const refreshed = analyzePfeOffer(selected, data);
      refreshed.selectedCvTerms = (previous?.selectedCvTerms || []).filter(term => refreshed.requirements.some(row => row.term === term));
      refreshed.selectedEvidenceIds = (previous?.selectedEvidenceIds || []).filter(id => (data.profile.skillEvidence || []).some((item, index) => proofRecordId(item, index) === id));
      const updated = savePfeAnalysis(data, refreshed);
      saveData(user.email, updated);
      setData(updated);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [data, offerId, user]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const offer = data?.offers.find(item => item.id === offerId);
  const matching = data?.pfeAnalyses?.[offerId];
  const versions = data?.cvAdaptations?.[offerId] || [];
  const master = data ? cvMasterText(data) : "";
  const stale = !!(data && offer && matching && matching.fingerprint !== pfeFingerprint(offer, data));
  const draftStale = !!(data && offer && draft && adaptationStale(draft, offer, data));
  const proofText = data && matching ? approvedProofText(data, matching) : "";
  const draftProofText = `${draft?.proofText ?? proofText}\n${(draft?.selectedCvTerms || []).join("\n")}`;
  const assembled = useMemo(() => draft ? assembleCv(draft, draftProofText) : { text: master, issues: [] }, [draft, draftProofText, master]);
  const previewCv = useMemo(() => parseCvText(draft?.status === "approved" && draft.approvedText ? draft.approvedText : assembled.text), [draft, assembled.text]);
  const confirmed = draft?.suggestions.filter(change => change.decision === "accepted").length || 0;
  const waiting = draft?.suggestions.filter(change => change.decision === "pending").length || 0;
  const checklist = matching ? cvQualityChecklist(assembled.text, matching, design.template) : [];
  const masterSections = draft ? parseCvText(draft.masterText).sections : [];
  const sectionOrder = draft?.sectionOrder?.length ? draft.sectionOrder : masterSections.map((_, index) => index);

  function persist(next: CvAdaptation) {
    if (!data || !user) return;
    const updated = saveAdaptation(data, { ...next, updatedAt: now() });
    saveData(user.email, updated);
    setData(updated); setDraft(updated.cvAdaptations?.[offerId]?.find(item => item.id === next.id) || next); setDirty(false);
    setNotice("Travail enregistré sur cet appareil."); setError("");
  }
  function selectOffer(nextId: string) {
    if (dirty && !window.confirm("Quitter cette offre sans enregistrer les modifications ?")) return;
    setOfferId(nextId); setDraft(data?.cvAdaptations?.[nextId]?.[0] || null); setDirty(false); setError("");
    setOrientation(data?.cvAdaptations?.[nextId]?.[0]?.orientation || (data?.pfeAnalyses?.[nextId]?.relevance.domains.some(value => /renouvel|performance|production|stockage/i.test(value)) ? "energy" : "electrical"));
    window.history.pushState(null, "", `/app/adaptation?offer=${encodeURIComponent(nextId)}`);
  }
  function updateChange(changeId: string, patch: Partial<CvChange>) {
    if (!draft) return;
    setDraft({ ...draft, suggestions: draft.suggestions.map(change => change.id === changeId ? { ...change, ...patch } : change) });
    setDirty(true); setNotice("");
  }
  function updateSections(order: number[], hidden: number[]) {
    if (!draft || draft.status === "approved") return;
    setDraft({ ...draft, sectionOrder: order, hiddenSections: hidden });
    setDirty(true); setNotice("");
  }
  function startManualDraft(message = "Brouillon manuel prêt. Choisis un extrait exact de ton CV, puis écris ta proposition.") {
    if (!data || !offer || !matching || !master || stale) return;
    const next: CvAdaptation = { id: id(), offerId, createdAt: now(), updatedAt: now(), status: "draft", orientation, masterFingerprint: matching.fingerprint, matchingFingerprint: matching.fingerprint, matchingAnalyzedAt: matching.analyzedAt, selectedEvidenceIds: [...matching.selectedEvidenceIds], selectedCvTerms: [...(matching.selectedCvTerms || [])], unverifiedTerms: matching.requirements.filter(row => row.match !== "prouvée" && row.match !== "citée dans le CV" && !matching.selectedCvTerms?.includes(row.term)).map(row => row.term), proofText, masterText: master, headline: "", suggestions: [] };
    persist(next); setView("compare"); setNotice(message);
  }
  function addManualChange() {
    if (!draft || draft.status !== "draft") return;
    const change: CvChange = { id: `manual-${id()}`, section: "CV · modification personnelle", original: manualOriginal.trim(), proposed: manualProposed.trim(), reason: "Modification rédigée par toi pour cette offre.", source: "CV maître", decision: "pending" };
    const issues = validateCvChange(change, draft.masterText, draftProofText, draft.unverifiedTerms);
    if (change.original === change.proposed) issues.push("La proposition doit modifier l'extrait de départ.");
    if (issues.length) { setError(issues.join(" ")); return; }
    setDraft({ ...draft, suggestions: [...draft.suggestions, change] });
    setManualOriginal(""); setManualProposed(""); setDirty(true); setError(""); setNotice("Modification ajoutée. Relis-la, accepte-la ou refuse-la, puis enregistre le brouillon.");
    setView("compare");
  }
  async function generate() {
    if (!data || !offer || !matching || !master || busy || stale) return;
    if (draft?.status === "draft" && !window.confirm("Créer une nouvelle proposition ? Le brouillon actuel sera conservé dans l'historique.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const selected = (data.profile.skillEvidence || []).filter((item, index) => item.status === "demonstrated" && matching.selectedEvidenceIds.includes(proofRecordId(item, index)));
      const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        task: "adapt", cvOriginal: master, profile: { ...data.profile, skillEvidence: selected },
        orientation,
        offerText: [offer.title, offer.company, offer.description, offer.text, ...(offer.missions || []), ...(offer.prerequisites || [])].filter(Boolean).join("\n").slice(0, 15000),
        keywords: matching.requirements.filter(row => row.match !== "non documentée").map(row => ({ term: row.term, importance: row.priority })),
        forceKeywords: matching.requirements.filter(row => row.evidenceIds.some(evidenceId => matching.selectedEvidenceIds.includes(evidenceId))).map(row => row.term),
      }) });
      const body = await response.json();
      if (response.status === 429 || body.code === "AI_QUOTA") {
        startManualDraft(body.code === "AI_QUOTA"
          ? "Gemini a atteint sa limite de requêtes. Ton brouillon manuel est prêt ; l'IA pourra être réessayée plus tard."
          : "La limite de requêtes de l'application est atteinte. Ton brouillon manuel est prêt ; réessaie l'IA plus tard.");
        return;
      }
      if (!response.ok || !body.ok) throw new Error(body.error || "Gemini est indisponible. Ton travail enregistré est conservé.");
      const rawChanges = Array.isArray(body.result?.changes) ? body.result.changes : [];
      const headline = typeof body.result?.headline === "string" ? body.result.headline.trim() : "";
      const titleSource = data.profile.title && master.includes(data.profile.title) ? data.profile.title : "";
      const suggestions = normalizeAiChanges([...rawChanges, ...(headline && titleSource ? [{ section: "Titre", original: titleSource, rewritten: headline }] : [])], master, proofText, matching);
      if (!suggestions.length) throw new Error("Gemini n'a proposé aucune reformulation vérifiable. Le CV maître reste intact.");
      const next: CvAdaptation = { id: id(), offerId, createdAt: now(), updatedAt: now(), status: "draft", orientation, masterFingerprint: matching.fingerprint, matchingFingerprint: matching.fingerprint, matchingAnalyzedAt: matching.analyzedAt, selectedEvidenceIds: [...matching.selectedEvidenceIds], selectedCvTerms: [...(matching.selectedCvTerms || [])], unverifiedTerms: matching.requirements.filter(row => row.match !== "prouvée" && row.match !== "citée dans le CV" && !matching.selectedCvTerms?.includes(row.term)).map(row => row.term), proofText, masterText: master, headline, suggestions };
      persist(next); setView("compare");
      setNotice(`${suggestions.length} proposition(s) vérifiable(s). Rien n'est appliqué sans ton accord.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Génération impossible. Le brouillon précédent est conservé."); }
    finally { setBusy(false); }
  }
  function approve() {
    if (!draft || !data || !offer || !user) return;
    if (draft.status === "approved") return;
    if (dirty) { setError("Enregistre d'abord tes modifications."); return; }
    if (draftStale) { setError("Le CV, l'offre ou le matching a changé. Actualise l'analyse et crée une nouvelle proposition."); return; }
    if (waiting) { setError("Accepte ou refuse chaque proposition avant validation."); return; }
    if (assembled.issues.length) { setError("Corrige les points signalés avant validation."); return; }
    if (!window.confirm("Valider ce CV adapté après lecture humaine ? Cette version sera conservée dans l'historique.")) return;
    const cv = parseCvText(assembled.text);
    const approved: CvAdaptation = { ...draft, status: "approved", updatedAt: now(), approvedText: assembled.text, approvedCv: cv };
    const withVersion = saveAdaptation(data, approved);
    const updated: UserData = { ...withVersion, dossiers: { ...withVersion.dossiers, [offerId]: { letterText: "", notes: "", ...withVersion.dossiers?.[offerId], cvText: assembled.text, updatedAt: now() } } };
    saveData(user.email, updated); setData(updated); setDraft(approved); setNotice("Version validée et liée au dossier de candidature."); setView("preview");
  }
  function exportCv() {
    if (!draft?.approvedCv || !offer) return;
    const filename = `CV-${safeFile(offer.title)}-${safeFile(offer.company)}`;
    const html = cvDocumentHtml(draft.approvedCv, design, filename, false);
    const popup = window.open("", "_blank", "width=900,height=1100");
    if (!popup) { setError("Autorise les fenêtres pour ouvrir le CV imprimable."); return; }
    popup.document.open(); popup.document.write(html); popup.document.close();
  }

  if (!data) return <div className="p-8 text-text-dim">Chargement de ton atelier CV…</div>;
  return <div className="space-y-7 pb-20">
    <AppPageHead eyebrow="Candidature ciblée" title="Adapter mon CV" sub="Choisis l'offre, prépare ton CV et valide la version qui te convient." />
    {offer && <ApplicationJourney data={data} offerId={offer.id} current="adaptation" />}
    {offer && draft?.status === "approved" && <Link className="btn-primary inline-flex mb-2" href={`/app/dossier?offer=${encodeURIComponent(offerId)}&step=2`}>Continuer vers Mission PFE →</Link>}
    <section className="glass-card p-6 space-y-4">
      <div className="flex flex-wrap items-end gap-4 justify-between"><div><h2 className="font-display text-xl">L'offre visée</h2><p className="text-sm text-text-dim">Choisis une offre déjà enregistrée et analysée.</p></div><Link className="btn-line" href="/app/alertes-gmail">Voir mes offres</Link></div>
      <select aria-label="Offre à adapter" className="input w-full" value={offerId} onChange={event => selectOffer(event.target.value)}>
        {!data.offers.length && <option value="">Aucune offre enregistrée</option>}
        {data.offers.map(item => <option key={item.id} value={item.id}>{item.title} · {item.company}</option>)}
      </select>
      {offer && <p className="text-sm text-text-dim">{offer.company} · {offer.location || "Lieu à vérifier"} · {offer.title}</p>}
      {!master && <p className="text-amber-700">Ton CV n’est pas encore disponible ici. <Link className="underline" href="/app/cv">Ajouter mon CV</Link> pour pouvoir créer une version adaptée.</p>}
      {offer && !matching && <p role="status" className="text-sm text-text-dim">Analyse locale de l'offre en cours…</p>}
      {matching && <p className="text-sm text-text-dim">{(matching.selectedCvTerms || []).length} compétence(s) choisie(s) pour cette version du CV. <Link className="text-mint underline" href={`/app/matching?offer=${encodeURIComponent(offerId)}`}>Modifier mon choix</Link></p>}
    </section>

    <section className="glass-card p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-xl">Préparer mon CV pour cette offre</h2><p className="text-sm text-text-dim">L’IA propose des modifications ; tu décides lesquelles conserver. Tu peux aussi préparer le CV sans IA.</p></div><button className="btn-primary" type="button" onClick={generate} disabled={!offer || !matching || !master || stale || busy}>{busy ? "Préparation en cours…" : draft ? "Créer une nouvelle proposition" : "Préparer mon CV"}</button></div>
      <details className="text-sm text-text-dim"><summary className="cursor-pointer">Option : orientation de la rédaction</summary><label className="block mt-3">Orientation de départ
        <select className="input block mt-2 w-full md:w-auto" value={orientation} onChange={event => setOrientation(event.target.value as "electrical" | "energy")}><option value="electrical">Génie électrique · électrotechnique · bureau d'études</option><option value="energy">Énergie · performance énergétique · ENR</option></select>
      </label></details>
      {draft && <p className="text-xs text-text-dim">Version du {new Date(draft.createdAt).toLocaleString("fr-FR")} · {draft.status === "approved" ? "validée" : "brouillon"} · orientation {draft.orientation === "energy" ? "énergie / ENR" : "génie électrique / études"} · matching du {new Date(draft.matchingAnalyzedAt).toLocaleDateString("fr-FR")}</p>}
      {draftStale && <p className="text-amber-700">Cette proposition utilise une ancienne version de l'offre, du CV ou des preuves. Tu peux la consulter, mais crée une nouvelle proposition après actualisation du matching.</p>}
      <button className="btn-line" type="button" disabled={!offer || !matching || !master || stale || busy} onClick={() => { if (draft?.status === "draft" && !window.confirm("Créer un nouveau brouillon manuel ? Le brouillon actuel sera conservé dans l'historique.")) return; startManualDraft(); }}>Préparer sans IA</button>
      {notice && <p role="status" className="text-mint text-sm">{notice}</p>}{error && <p role="alert" className="text-amber-700 text-sm">{error}</p>}
      {versions.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Historique des versions">{versions.map(version => <button type="button" key={version.id} className={`btn-line text-xs ${draft?.id === version.id ? "border-mint" : ""}`} onClick={() => { if (dirty && !window.confirm("Quitter sans enregistrer ?")) return; setDraft(version); setDirty(false); setError(""); }}>{new Date(version.createdAt).toLocaleDateString("fr-FR")} · {version.status === "approved" ? "CV validé" : "brouillon"}</button>)}</div>}
    </section>

    {draft && <>
      {draft.status === "draft" && <section className="glass-card p-5 space-y-4" aria-labelledby="manual-change-heading"><div><h2 id="manual-change-heading" className="font-display text-xl">Ajouter une modification personnelle</h2><p className="text-sm text-text-dim">Copie une phrase exacte du CV maître, puis reformule-la. Les faits, dates et compétences sont contrôlés avant l'ajout.</p></div><label className="block text-sm font-semibold" htmlFor="manual-original">Extrait exact du CV maître</label><textarea id="manual-original" className="input w-full min-h-24" value={manualOriginal} onChange={event => setManualOriginal(event.target.value)} /><label className="block text-sm font-semibold" htmlFor="manual-proposed">Ma proposition pour cette offre</label><textarea id="manual-proposed" className="input w-full min-h-24" value={manualProposed} onChange={event => setManualProposed(event.target.value)} /><button type="button" className="btn-primary" onClick={addManualChange} disabled={!manualOriginal.trim() || !manualProposed.trim()}>Ajouter et contrôler</button></section>}
      <div className="flex gap-2"><button type="button" className="btn-line" aria-pressed={view === "compare"} onClick={() => setView("compare")}>Comparer les changements</button><button type="button" className="btn-line" aria-pressed={view === "preview"} onClick={() => setView("preview")}>Voir le CV A4</button></div>
      {view === "compare" ? <section className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4"><div className="glass-card p-5"><h2 className="font-display text-lg mb-3">CV maître · référence</h2><pre className="whitespace-pre-wrap text-sm text-text-dim font-sans max-h-96 overflow-auto">{draft.masterText}</pre></div><div className="glass-card p-5"><h2 className="font-display text-lg mb-3">CV ciblé · aperçu texte</h2><pre className="whitespace-pre-wrap text-sm text-text-dim font-sans max-h-96 overflow-auto">{assembled.text}</pre></div></div>
        {masterSections.length > 1 && <div className="glass-card p-5 space-y-3"><h2 className="font-display text-lg">Priorité des rubriques</h2><p className="text-sm text-text-dim">Place les expériences et projets pertinents plus haut. Tu peux retirer une rubrique secondaire de cette version ; le CV maître reste intact. Les rubriques contenant des faits essentiels restent visibles.</p>{sectionOrder.map((index, position) => <div key={index} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3"><span className={draft.hiddenSections?.includes(index) ? "text-muted line-through" : "text-text-dim"}>{masterSections[index]?.title || `Rubrique ${index + 1}`}</span><div className="flex gap-2"><button type="button" className="btn-line text-xs" aria-label={`Monter ${masterSections[index]?.title}`} disabled={position === 0 || draft.status === "approved"} onClick={() => { const next = [...sectionOrder]; [next[position - 1], next[position]] = [next[position], next[position - 1]]; updateSections(next, draft.hiddenSections || []); }}>↑</button><button type="button" className="btn-line text-xs" aria-label={`Descendre ${masterSections[index]?.title}`} disabled={position === sectionOrder.length - 1 || draft.status === "approved"} onClick={() => { const next = [...sectionOrder]; [next[position + 1], next[position]] = [next[position], next[position + 1]]; updateSections(next, draft.hiddenSections || []); }}>↓</button><button type="button" className="btn-line text-xs" disabled={draft.status === "approved" || (!draft.hiddenSections?.includes(index) && !sectionCanBeOmitted(masterSections[index]))} onClick={() => updateSections(sectionOrder, draft.hiddenSections?.includes(index) ? (draft.hiddenSections || []).filter(value => value !== index) : [...(draft.hiddenSections || []), index])}>{draft.hiddenSections?.includes(index) ? "Restaurer" : "Retirer du CV ciblé"}</button></div></div>)}</div>}
        {draft.suggestions.map(change => { const issues = validateCvChange(change, draft.masterText, draftProofText, draft.unverifiedTerms); return <article key={change.id} className="glass-card p-5 space-y-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-display text-lg">{change.section}</h3><span className="text-xs text-text-dim">{change.decision === "pending" ? "À décider" : change.decision === "accepted" ? "Accepté" : "Refusé"}</span></div><div className="grid md:grid-cols-2 gap-4 text-sm"><div><p className="mono-label mb-2">Avant · source du CV</p><p className="text-text-dim">{change.original}</p></div><div><label className="mono-label block mb-2" htmlFor={`edit-${change.id}`}>Après · proposition modifiable</label><textarea id={`edit-${change.id}`} className="input w-full min-h-28" value={change.edited ?? change.proposed} disabled={draft.status === "approved"} onChange={event => updateChange(change.id, { edited: event.target.value, decision: "pending" })} /></div></div><p className="text-xs text-text-dim">Pourquoi : {change.reason} Source : « {change.source} »</p>{issues.length > 0 && <ul className="text-sm text-amber-700 list-disc pl-5">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}<div className="flex gap-2"><button type="button" className="btn-primary" disabled={draft.status === "approved" || issues.length > 0} onClick={() => updateChange(change.id, { decision: "accepted" })}>Accepter</button><button type="button" className="btn-line" disabled={draft.status === "approved"} onClick={() => updateChange(change.id, { decision: "rejected" })}>Refuser · garder l'original</button></div></article>; })}
        <div className="flex flex-wrap items-center gap-3"><button type="button" className="btn-primary" disabled={!dirty} onClick={() => draft && persist(draft)}>Enregistrer le brouillon</button><span className="text-sm text-text-dim">{dirty ? "Modifications non enregistrées" : "Brouillon enregistré"} · {confirmed} acceptée(s), {waiting} à décider</span></div>
      </section> : <section className="glass-card p-5 space-y-4"><div className="flex flex-wrap gap-3 justify-between"><div><h2 className="font-display text-xl">Aperçu A4</h2><p className="text-sm text-text-dim">Le même moteur sert à l'aperçu et à l'impression PDF. L'export s'arrête si le texte dépasse une page lisible.</p></div><select aria-label="Modèle de CV" className="input" value={design.template} onChange={event => setDesign({ ...design, template: event.target.value as CvDesign["template"] })}><option value="professional">Professionnel</option><option value="grey">Gris</option><option value="ats">ATS simple</option><option value="compact">Compact</option></select></div><CvPreview cv={previewCv} design={design} />{draft.status === "approved" && <button type="button" className="btn-primary" onClick={exportCv}>Ouvrir le PDF imprimable</button>}</section>}
      <section className="glass-card p-6 space-y-3"><h2 className="font-display text-xl">Contrôle avant validation</h2><ul className="grid md:grid-cols-2 gap-2 text-sm text-text-dim"><li>Offre et matching : {draftStale ? "à actualiser" : "à jour"}</li><li>Compétences prouvées : {matching?.requirements.filter(row => row.match === "prouvée").length || 0}</li><li>Propositions acceptées : {confirmed}</li><li>Propositions à décider : {waiting}</li><li>Faits : {assembled.issues.length ? `${assembled.issues.length} point(s) à corriger` : "aucun conflit détecté"}</li></ul><ul className="grid md:grid-cols-2 gap-3">{checklist.map(item => <li key={item.label} className="rounded-lg border border-line p-3 text-sm"><b className={item.ok ? "text-mint" : "text-amber-700"}>{item.ok ? "✓" : "À vérifier"} · {item.label}</b><p className="text-text-dim mt-1">{item.detail}</p></li>)}</ul><p className="text-xs text-text-dim">Vérifie toi-même l'orthographe, les faits, l'ordre des expériences et la lisibilité. Le contrôle automatique ne garantit pas l'exactitude ; aucun score ATS officiel n'est calculé.</p>{assembled.issues.map(issue => <p key={issue} className="text-amber-700 text-sm">{issue}</p>)}<div className="flex flex-wrap gap-3"><button type="button" className="btn-primary" disabled={draft.status === "approved" || dirty || waiting > 0 || assembled.issues.length > 0 || draftStale} onClick={approve}>Valider ce CV pour l'offre</button>{offer && <Link className="btn-line" href={`/app/dossier?offer=${encodeURIComponent(offerId)}`}>Ouvrir le dossier</Link>}</div></section>
    </>}
  </div>;
}
