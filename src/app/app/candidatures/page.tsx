"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, saveData, STATUS_META, type UserData, type AppStatus } from "@/lib/data";
import { AppPageHead } from "@/components/app/AppShell";
import DocumentsExchanges from "@/components/dossier/DocumentsExchanges";
import ReadyToApply from "@/components/app/ReadyToApply";

const ARROW_RIGHT = "\u2192";

export default function CandidaturesPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [data, setData] = useState<UserData | null>(null);
  const [query, setQuery] = useState("");
  const [manualOpen, setManualOpen] = useState<{ requested: string | null; id: string } | null>(null);
  const requestedOpen = searchParams.get("open");
  const open = manualOpen?.requested === requestedOpen ? manualOpen.id : requestedOpen;
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => setData(getOrCreateData(user.name, user.email)), 0);
    return () => clearTimeout(timer);
  }, [user]);
  if (!data || !user) return <p role="status">Chargement de tes candidatures\u2026</p>;
  const persist = (next: UserData) => { saveData(user.email, next); setData(next); };
  const matches = (company: string, role: string) => `${company} ${role}`.toLowerCase().includes(query.toLowerCase());
  const drafts = data.offers.filter(offer => data.dossiers?.[offer.id] && !data.dossiers[offer.id].applicationId && matches(offer.company, offer.title));
  const selectedApplication = data.applications.find(item => item.id === open);
  const selectedOffer = selectedApplication ? data.offers.find(item => item.id === selectedApplication.offerId) : null;
  return <>
    <AppPageHead eyebrow="Du premier dossier \u00e0 l\u2019entretien" title="Chaque candidature a sa place." sub="Reprends tes pr\u00e9parations, retrouve les documents envoy\u00e9s et garde une trace de tes \u00e9changes." />
    <div className="flex gap-3 flex-wrap mb-7"><input aria-label="Rechercher une candidature" className="input flex-1 min-w-48" placeholder="Rechercher un poste ou une entreprise\u2026" value={query} onChange={event => setQuery(event.target.value)} /><Link href="/app/alertes-gmail" className="btn-primary">Nouvelle candidature {ARROW_RIGHT}</Link></div>
    {drafts.length > 0 && <section className="mb-8"><h2 className="font-display text-xl mb-4">En pr\u00e9paration \u00b7 {drafts.length}</h2><div className="offer-grid">{drafts.map(offer => <Link href={`/app/dossier?offer=${encodeURIComponent(offer.id)}#documents-echanges`} key={offer.id} className="glass-card p-5"><span className="chip chip--amber">Brouillon</span><h3 className="font-semibold mt-4">{offer.company}</h3><p className="text-sm text-muted mt-1">{offer.title}</p><p className="text-sm text-mint mt-5">Reprendre le dossier {ARROW_RIGHT}</p></Link>)}</div></section>}
    <div className="application-board">{(Object.keys(STATUS_META) as AppStatus[]).map(status => {
      const applications = data.applications.filter(application => application.status === status && matches(application.company, application.role));
      return <section key={status} className="board-column"><h2>{STATUS_META[status].label}<span>{applications.length}</span></h2>{applications.map(application => {
        const offer = data.offers.find(item => item.id === application.offerId);
        return <article key={application.id} className="glass-card p-4 mb-3"><h3 className="font-semibold">{application.company}</h3><p className="text-sm text-muted mt-1">{application.role}</p><p className="text-xs text-muted mt-3">{application.date ? new Date(application.date).toLocaleDateString("fr-FR") : "Date non renseign\u00e9e"} \u00b7 {application.source}</p>
          <button className="text-mint text-sm mt-4" onClick={() => setManualOpen({ requested: requestedOpen, id: open === application.id ? "" : application.id })} aria-expanded={open === application.id} aria-controls={`application-${application.id}`}>Documents & suivi {open === application.id ? "\u2212" : "+"}</button>
          {open === application.id && <div id={`application-${application.id}`} className="mt-4 space-y-4">
            <ReadyToApply
              offerId={application.offerId || application.id}
              user={user}
              data={data}
              onDataChange={setData}
              mode="compact"
              onNavigate={(href) => {
                if (href.startsWith("http")) window.open(href, "_blank", "noopener,noreferrer");
                else window.location.href = href;
              }}
            />
            <label className="block text-xs font-semibold">Statut<select aria-label={`Statut de ${application.company}`} className="input w-full mt-2" value={application.status} onChange={event => { const nextStatus = event.target.value as AppStatus; persist({ ...data, applications: data.applications.map(item => item.id === application.id ? { ...item, status: nextStatus, statusHistory: nextStatus === item.status ? item.statusHistory : [...(item.statusHistory || []), { status: nextStatus, at: new Date().toISOString() }] } : item) }); }}>{(Object.keys(STATUS_META) as AppStatus[]).map(value => <option key={value} value={value}>{STATUS_META[value].label}</option>)}</select></label>
            <label className="block text-xs font-semibold">Notes et relance<textarea className="input w-full mt-2 min-h-28" value={application.notes || ""} onChange={event => persist({ ...data, applications: data.applications.map(item => item.id === application.id ? { ...item, notes: event.target.value } : item) })} /></label>
            {application.cvText && <details><summary className="text-sm cursor-pointer">CV envoy\u00e9 \u00b7 {application.cvName || "CV"}</summary><p className="text-xs whitespace-pre-wrap leading-6 mt-3">{application.cvText}</p></details>}
            {application.letterText && <details><summary className="text-sm cursor-pointer">Lettre envoy\u00e9e</summary><p className="text-xs whitespace-pre-wrap leading-6 mt-3">{application.letterText}</p></details>}
            {offer && <Link href={`/app/dossier?offer=${encodeURIComponent(offer.id)}#documents-echanges`} className="text-xs text-mint underline">Voir dans Mission PFE {ARROW_RIGHT}</Link>}
            <button className="text-xs text-muted underline" onClick={() => { if (window.confirm(`Supprimer la candidature ${application.company} ?`)) persist({ ...data, applications: data.applications.filter(item => item.id !== application.id), dossiers: Object.fromEntries(Object.entries(data.dossiers || {}).map(([key, doc]) => [key, doc.applicationId === application.id ? { ...doc, applicationId: undefined } : doc])) }); }}>Supprimer du suivi</button>
          </div>}
        </article>;
      })}{!applications.length && <p className="text-xs text-muted py-6 text-center">Aucune candidature ici pour le moment.</p>}</section>;
    })}</div>
    {selectedApplication && !selectedOffer && <DocumentsExchanges data={data} onChange={setData} user={user} caseKey={selectedApplication.offerId || selectedApplication.id} application={selectedApplication} />}
    {!data.applications.length && !drafts.length && <div className="mentor-note mt-6"><h3 className="font-display text-xl">On commence par une offre.</h3><p className="text-sm mt-3">Choisis une offre Gmail, pr\u00e9pare ton dossier et confirme l\u2019envoi. Ton suivi se remplira au fil de tes d\u00e9marches.</p></div>}
  </>;
}
