"use client";
import { PFE_TARGET, pfeEligibility } from "@/lib/pfe-target";
import { useEffect, useMemo, useState } from "react";
import type { ProcessedEmail } from "@/lib/gmail-dashboard";
import { useAuth } from "@/lib/auth";
import { getOrCreateData } from "@/lib/data";
import { appliedOfferIds } from "@/lib/cv-keywords";
import Link from "next/link";
import { offerBridgeKey, offerToDetectedOffer, loadCandidatures } from "@/lib/gmail-bridge";
import { locationKey, offerLocation } from "@/lib/offer-location";
import OfferCard from "./OfferCard";

export default function OfferExplorer({ emails }: { emails: ProcessedEmail[] }) {
  const { user } = useAuth();
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [applicationFilter, setApplicationFilter] = useState("available");
  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      const ids = appliedOfferIds(getOrCreateData(user.name, user.email));
      for (const [key, item] of Object.entries(loadCandidatures(user.email))) if (item.status === "sent") ids.add(`gmail-${encodeURIComponent(key)}`);
      setApplied(ids);
    };
    const timer = setTimeout(refresh, 0);
    window.addEventListener("cible:data-changed", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => { clearTimeout(timer); window.removeEventListener("cible:data-changed", refresh); window.removeEventListener("storage", refresh); window.removeEventListener("focus", refresh); };
  }, [user]);
  const [query, setQuery] = useState("");
  const [contract, setContract] = useState("all");
  const [quality, setQuality] = useState("all");
  const [location, setLocation] = useState("all");
  const [pfe, setPfe] = useState("target");
  const [page, setPage] = useState(1);
  const all = useMemo(() => [...new Map(emails.flatMap(e => e.offers).filter(o => !o.searchFallback).map(o => [offerBridgeKey(o), o])).values()], [emails]);
  const appliedCount = all.filter(o => applied.has(offerToDetectedOffer(o).id)).length;
  const available = all.filter(o => applicationFilter === "all" || (applicationFilter === "applied" ? applied.has(offerToDetectedOffer(o).id) : !applied.has(offerToDetectedOffer(o).id)));
  const locations = useMemo(() => {
    const cities = new Map<string, { name: string; count: number }>();
    const regions = new Map<string, { name: string; count: number }>();
    for (const offer of all) {
      const place = offerLocation(offer.location);
      for (const [name, target] of [[place.city, cities], [place.region, regions]] as const) {
        if (!name) continue;
        const key = locationKey(name);
        const previous = target.get(key);
        target.set(key, { name: previous?.name ?? name, count: (previous?.count ?? 0) + 1 });
      }
    }
    const sorted = (values: typeof cities) => [...values].sort((a, b) => a[1].name.localeCompare(b[1].name, "fr"));
    return { cities: sorted(cities), regions: sorted(regions) };
  }, [all]);
  const offers = available.filter(o => {
    const text = [o.title, o.company, o.location, o.contract, ...(o.skills || []), ...(o.keywords || [])].join(" ").toLowerCase();
    const place = offerLocation(o.location);
    const matchesLocation = location === "all" || (location.startsWith("region:")
      ? locationKey(place.region) === location.slice(7)
      : location === "unknown" ? !place.city && !place.region : locationKey(place.city) === location.slice(5));
    const eligible = pfeEligibility(o);
    return (pfe === "all" || (pfe === "confirmed" ? eligible.status === "eligible" : eligible.status !== "excluded")) && matchesLocation && text.includes(query.trim().toLowerCase()) && (contract === "all" || text.includes(contract)) && (quality === "all" || (quality === "complete" ? o.enrichStatus === "ok" : o.enrichStatus !== "ok"));
  });
  const pageCount = Math.max(1, Math.ceil(offers.length / 24));
  const currentPage = Math.min(page, pageCount);
  const visible = offers.slice((currentPage - 1) * 24, currentPage * 24);
  return <section className="mb-8"><div className="section-heading"><h2>Les opportunités de ta boîte mail</h2><span className="chip chip--mint">{all.length} offre(s) unique(s)</span></div><p className="text-sm text-mint mb-3">{PFE_TARGET.label}</p><select className="input mb-4" aria-label="Éligibilité PFE" value={pfe} onChange={e => { setPfe(e.target.value); setPage(1); }}><option value="target">Objectif PFE : compatibles ou à vérifier</option><option value="confirmed">Critères PFE confirmés</option><option value="all">Toutes les offres, y compris hors objectif</option></select><p className="text-sm text-muted mb-5">Choisis une offre pour préparer ton dossier. Une fiche incomplète peut être enrichie depuis son détail.</p><div className="offer-toolbar"><input className="input" aria-label="Rechercher dans les offres Gmail" placeholder="Poste, entreprise, ville, compétence…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /><select className="input" aria-label="Type de contrat" value={contract} onChange={e => { setContract(e.target.value); setPage(1); }}><option value="all">Tous les contrats</option><option value="stage">Stage</option><option value="alternance">Alternance</option></select><select className="input" aria-label="Ville ou région" value={location} onChange={e => { setLocation(e.target.value); setPage(1); }}><option value="all">Toutes les localisations</option><optgroup label="Régions">{locations.regions.map(([key, place]) => <option key={key} value={`region:${key}`}>{place.name} ({place.count})</option>)}</optgroup><optgroup label="Villes">{locations.cities.map(([key, place]) => <option key={key} value={`city:${key}`}>{place.name} ({place.count})</option>)}</optgroup><option value="unknown">Lieu non précisé</option></select><select className="input" aria-label="Complétude des fiches" value={quality} onChange={e => { setQuality(e.target.value); setPage(1); }}><option value="all">Toutes les fiches</option><option value="complete">Fiches enrichies</option><option value="partial">À compléter</option></select></div><div className="flex flex-wrap items-center gap-3 mb-4"><select className="input" aria-label="Statut de candidature" value={applicationFilter} onChange={e => { setApplicationFilter(e.target.value); setPage(1); }}><option value="available">À postuler ({all.length - appliedCount})</option><option value="applied">Déjà postulées ({appliedCount})</option><option value="all">Toutes les offres ({all.length})</option></select><Link href="/app/candidatures" className="text-sm text-mint">Voir le suivi de mes candidatures →</Link></div><p className="text-xs text-muted mb-4" role="status">{offers.length} résultat(s)</p><div className="offer-grid">{visible.map(o => <OfferCard key={offerBridgeKey(o)} offer={o} applied={applied.has(offerToDetectedOffer(o).id)} />)}</div>{pageCount > 1 && <nav className="flex flex-wrap items-center justify-center gap-4 mt-6" aria-label="Pages des offres Gmail"><button className="btn btn-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Précédent</button><span className="text-sm text-muted" aria-live="polite">Page {currentPage} sur {pageCount}</span><button className="btn btn-secondary" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Suivant</button></nav>}{!offers.length && <div className="glass-card p-8 text-center"><h3 className="font-display text-xl">{all.length ? "Aucune offre avec ces filtres." : "Tes prochaines opportunités arrivent ici."}</h3><p className="text-sm text-muted mt-3">{all.length ? "Essaie une autre ville ou élargis tes filtres." : "Lance une synchronisation pour extraire les offres de tes alertes Gmail."}</p></div>}</section>;
}
