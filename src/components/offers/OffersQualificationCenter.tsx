"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, saveData, type UserData, type DetectedOffer, type Application } from "@/lib/data";
import { getAllQualifications, updateQualification, bulkUpdateQualification, addToHistory, undoLastDecision, reorderShortlist, getShortlistedOffers, type OfferQualification, type QualificationState, getFreshAnalysis } from "@/lib/offer-qualification";
import { offerLocation } from "@/lib/offer-location";
import { AppPageHead } from "@/components/app/AppShell";
import OfferInbox from "@/components/offers/OfferInbox";
import OfferDetailPanel from "@/components/offers/OfferDetailPanel";
import OfferComparator from "@/components/offers/OfferComparator";
import ShortlistView from "@/components/offers/ShortlistView";
import { localImportRecords } from "@/lib/catalog-import";

type ViewMode = "inbox" | "detail" | "comparator" | "shortlist";

export default function OffersQualificationCenter() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<UserData | null>(null);
  const [view, setView] = useState<ViewMode>("inbox");
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [comparatorIds, setComparatorIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{ offerIds: string[]; prevStates: Record<string, QualificationState> } | null>(null);
  const [importState, setImportState] = useState<{ busy: boolean; message: string }>({ busy: false, message: "" });

  const importCatalog = async () => {
    if (!data || importState.busy) return;
    setImportState({ busy: true, message: "Vérification du catalogue…" });
    try {
      const inventory = await fetch("/api/catalog/import", { cache: "no-store" });
      if (!inventory.ok) throw new Error("Le stockage P4-A n'est pas encore configuré.");
      const local = localImportRecords(data);
      let saved = 0;
      for (let offset = 0; offset < local.length;) {
        let end = Math.min(offset + 50, local.length);
        let payload = JSON.stringify({ source: "local", records: local.slice(offset, end) });
        while (payload.length > 700_000 && end > offset + 1) {
          end--;
          payload = JSON.stringify({ source: "local", records: local.slice(offset, end) });
        }
        if (payload.length > 700_000) throw new Error(`Offre ${local[offset].id} trop volumineuse pour l'import ; aucune donnée originale n'a été supprimée.`);
        setImportState({ busy: true, message: `Import local : ${end} / ${local.length}` });
        const response = await fetch("/api/catalog/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Import local interrompu.");
        saved += result.saved || 0;
        offset = end;
      }
      for (const source of ["server", "gmail"] as const) {
        let cursor: number | null = 0;
        while (cursor !== null) {
          setImportState({ busy: true, message: `Import ${source} : ${cursor} offres parcourues` });
          const response: Response = await fetch("/api/catalog/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, cursor }) });
          const result: { error?: string; saved?: number; nextCursor: number | null } = await response.json();
          if (response.status === 409 && source === "gmail") break;
          if (!response.ok) throw new Error(result.error || `Import ${source} interrompu.`);
          saved += result.saved || 0;
          cursor = result.nextCursor;
        }
      }
      setImportState({ busy: false, message: `${saved} nouvelles offres sauvegardées. Les lots déjà importés ont été conservés.` });
    } catch (error) {
      setImportState({ busy: false, message: error instanceof Error ? error.message : "Import interrompu. Relance pour reprendre." });
    }
  };

  // Initialize data
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      const loaded = getOrCreateData(user.name, user.email);
      setData(loaded);
      
      // Handle URL params
      const offerParam = searchParams.get("offer");
      const compareParam = searchParams.get("compare");
      const viewParam = searchParams.get("view");
      
      if (viewParam && ["inbox", "detail", "comparator", "shortlist"].includes(viewParam)) {
        setView(viewParam as ViewMode);
      }
      if (offerParam && loaded.offers.some(o => o.id === offerParam)) {
        setSelectedOfferId(offerParam);
        setView("detail");
      }
      if (compareParam) {
        const ids = compareParam.split(",").filter(id => loaded.offers.some(o => o.id === id));
        if (ids.length >= 2) {
          setComparatorIds(ids);
          setView("comparator");
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [user, searchParams]);

  const qualifications = useMemo(() => data ? getAllQualifications(data) : {}, [data]);
  const selectedOffer = useMemo(() => data?.offers.find(o => o.id === selectedOfferId) || null, [data, selectedOfferId]);
  const selectedQualification = selectedOfferId ? qualifications[selectedOfferId] : null;
  const selectedAnalysis = selectedOffer ? getFreshAnalysis(data!, selectedOffer) : null;
  const selectedApplication = selectedOfferId ? data?.applications.find(a => a.offerId === selectedOfferId) || null : null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleQualify = useCallback((offerId: string, state: QualificationState, note?: string) => {
    if (!data) return;
    const prevState = qualifications[offerId]?.state;
    if (prevState === state) return;
    
    const nextData = updateQualification(data, offerId, { state, note });
    setData(nextData);
    saveData(user!.email, nextData);
    setLastAction({ offerIds: [offerId], prevStates: { [offerId]: prevState || "new" } });
    showToast(`Offre qualifiée : ${state}`);
  }, [data, qualifications, user, showToast]);

  const handleBulkQualify = useCallback((offerIds: string[], state: QualificationState) => {
    if (!data) return;
    const prevStates: Record<string, QualificationState> = {};
    offerIds.forEach(id => { prevStates[id] = qualifications[id]?.state || "new"; });
    
    let nextData = data;
    offerIds.forEach(id => {
      nextData = updateQualification(nextData, id, { state });
    });
    setData(nextData);
    saveData(user!.email, nextData);
    setLastAction({ offerIds, prevStates });
    showToast(`${offerIds.length} offre${offerIds.length > 1 ? "s" : ""} qualifiée${offerIds.length > 1 ? "s" : ""} : ${state}`);
  }, [data, qualifications, user, showToast]);

  const handleUndo = useCallback((offerId: string) => {
    if (!data) return;
    const nextData = undoLastDecision(data, offerId);
    if (nextData !== data) {
      setData(nextData);
      saveData(user!.email, nextData);
      showToast("Décision annulée");
    }
  }, [data, user, showToast]);

  const handleAddToShortlist = useCallback((offerId: string, priority: number, justification: string) => {
    if (!data) return;
    const nextData = updateQualification(data, offerId, { 
      state: "shortlisted", 
      priority, 
      justification,
      shortlistPosition: (getShortlistedOffers(data).length || 0) + 1 
    });
    setData(nextData);
    saveData(user!.email, nextData);
    showToast("Offre ajoutée à la shortlist");
  }, [data, user, showToast]);

  const handleRemoveFromShortlist = useCallback((offerId: string) => {
    if (!data) return;
    const nextData = updateQualification(data, offerId, { state: "to_examine" });
    setData(nextData);
    saveData(user!.email, nextData);
    showToast("Offre retirée de la shortlist");
  }, [data, user, showToast]);

  const handleOpenDetail = useCallback((offerId: string) => {
    setSelectedOfferId(offerId);
    setView("detail");
    router.push(`/app/offers?offer=${encodeURIComponent(offerId)}`);
  }, [router]);

  const handleOpenMatching = useCallback((offerId: string) => {
    router.push(`/app/matching?offer=${encodeURIComponent(offerId)}`);
  }, [router]);

  const handleOpenMissionPFE = useCallback((offerId: string) => {
    router.push(`/app/dossier?offer=${encodeURIComponent(offerId)}`);
  }, [router]);

  const handleOpenReadyToApply = useCallback((offerId: string) => {
    router.push(`/app/dossier?offer=${encodeURIComponent(offerId)}#ready-to-apply`);
  }, [router]);

  const handleAddToComparator = useCallback((offerId: string) => {
    if (comparatorIds.includes(offerId)) {
      setComparatorIds(comparatorIds.filter(id => id !== offerId));
    } else if (comparatorIds.length < 4) {
      setComparatorIds([...comparatorIds, offerId]);
    } else {
      showToast("Maximum 4 offres en comparaison");
    }
  }, [comparatorIds, showToast]);

  const handleRemoveFromComparator = useCallback((offerId: string) => {
    setComparatorIds(comparatorIds.filter(id => id !== offerId));
  }, [comparatorIds]);

  const handleReorderComparator = useCallback((ids: string[]) => {
    setComparatorIds(ids);
  }, []);

  const handleSetPersonalPriority = useCallback((offerId: string, priority: number) => {
    if (!data) return;
    const nextData = updateQualification(data, offerId, { priority });
    setData(nextData);
    saveData(user!.email, nextData);
  }, [data, user]);

  const handleUpdateNote = useCallback((offerId: string, note: string) => {
    if (!data) return;
    const nextData = updateQualification(data, offerId, { note });
    setData(nextData);
    saveData(user!.email, nextData);
  }, [data, user]);

  const handleUpdateJustification = useCallback((offerId: string, justification: string) => {
    if (!data) return;
    const nextData = updateQualification(data, offerId, { justification });
    setData(nextData);
    saveData(user!.email, nextData);
  }, [data, user]);

  const handleNavigate = useCallback((href: string) => {
    if (href.startsWith("http")) window.open(href, "_blank", "noopener,noreferrer");
    else router.push(href);
  }, [router]);

  const handleDeepenWithGemini = useCallback((offerId: string) => {
    // This would trigger a Gemini analysis - for now navigate to matching page
    router.push(`/app/matching?offer=${encodeURIComponent(offerId)}&gemini=true`);
  }, [router]);

  const handleRetainFromComparator = useCallback((offerId: string) => {
    handleAddToShortlist(offerId, 1, "");
  }, [handleAddToShortlist]);

  const handleReorderShortlist = useCallback((offerIds: string[]) => {
    if (!data) return;
    const nextData = reorderShortlist(data, offerIds);
    setData(nextData);
    saveData(user!.email, nextData);
  }, [data, user]);

  // Keyboard shortcuts for the main page
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      
      if (e.key === "Escape") {
        if (view !== "inbox") {
          setView("inbox");
          setSelectedOfferId(null);
          setComparatorIds([]);
          router.push("/app/offers");
        }
      }
      if (e.key === "c" && e.ctrlKey && view === "inbox") {
        setView("comparator");
      }
      if (e.key === "s" && e.ctrlKey && view === "inbox") {
        setView("shortlist");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view, router]);

  if (!user) {
    return (
      <div className="app-boot">
        <p className="mono-label">chargement de votre centre de qualification…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-boot">
        <p className="mono-label">chargement des offres…</p>
      </div>
    );
  }

  const allOffersCount = data.offers?.length || 0;
  const toProcessCount = Object.values(qualifications).filter(q => 
    !["rejected", "applied"].includes(q.state)
  ).length;

  return (
    <>
      <AppPageHead
        eyebrow="Mission PFE · février 2027"
        title="Centre intelligent de qualification"
        sub={`Examinez, comparez et sélectionnez vos offres de stage. ${allOffersCount} offres au total, ${toProcessCount} à traiter.`}
      />

      <div className="glass-card p-4 mb-5 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-line" disabled={importState.busy} onClick={importCatalog}>Importer dans la bibliothèque permanente</button>
        <p className="text-sm text-muted" role="status">{importState.message || "Copie les offres locales et le snapshot Gmail par lots, sans effacer les originaux."}</p>
      </div>

      {toast && (
        <div className="toast animate-slide-up" role="status">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
          {toast}
        </div>
      )}

      {/* Navigation par vues */}
      <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Vues du centre de qualification">
        <button
          role="tab"
          aria-selected={view === "inbox"}
          className={`btn-line ${view === "inbox" ? "bg-emerald-50 border-emerald-300 text-emerald-700" : ""}`}
          onClick={() => { setView("inbox"); router.push("/app/offers"); }}
        >
          📥 Boîte de réception
        </button>
        <button
          role="tab"
          aria-selected={view === "shortlist"}
          className={`btn-line ${view === "shortlist" ? "bg-violet-50 border-violet-300 text-violet-700" : ""}`}
          onClick={() => { setView("shortlist"); router.push("/app/offers?view=shortlist"); }}
        >
          📋 Shortlist ({getShortlistedOffers(data).length})
        </button>
        <button
          role="tab"
          aria-selected={view === "comparator"}
          className={`btn-line ${view === "comparator" ? "bg-blue-50 border-blue-300 text-blue-700" : ""}`}
          onClick={() => { 
            if (comparatorIds.length >= 2) { setView("comparator"); router.push(`/app/offers?compare=${comparatorIds.join(",")}`); }
            else showToast("Sélectionnez au moins 2 offres (cochez-les puis 'Comparer')");
          }}
          disabled={comparatorIds.length < 2}
        >
          ⚖️ Comparateur ({comparatorIds.length}/4)
        </button>
        <span className="flex items-center ml-auto text-sm text-muted">
          Raccourcis : <kbd className="px-1.5 py-0.5 bg-surface-2 rounded text-[0.7rem] font-mono">Échap</kbd> retour · <kbd className="px-1.5 py-0.5 bg-surface-2 rounded text-[0.7rem] font-mono">Ctrl+C</kbd> comparateur · <kbd className="px-1.5 py-0.5 bg-surface-2 rounded text-[0.7rem] font-mono">Ctrl+S</kbd> shortlist
        </span>
      </div>

      {/* Barre de progression pour la vue détail */}
      {view === "detail" && selectedOffer && (
        <div className="glass-card p-3 mb-4 border border-line flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="btn-line btn-sm" onClick={() => { setView("inbox"); setSelectedOfferId(null); router.push("/app/offers"); }}>← Boîte de réception</button>
            <span className="text-sm font-medium">{selectedOffer.title}</span>
            <span className="text-sm text-muted">·</span>
            <span className="text-sm text-text-dim">{selectedOffer.company}</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-line btn-sm" onClick={() => handleAddToComparator(selectedOffer!.id)}>
              {comparatorIds.includes(selectedOffer.id) ? "✓ Comparateur" : "+ Comparateur"}
            </button>
            <button className="btn-line btn-sm" onClick={() => handleOpenMissionPFE(selectedOffer!.id)}>Mission PFE</button>
            <button className="btn-primary btn-sm" onClick={() => handleOpenReadyToApply(selectedOffer!.id)}>Prêt à postuler</button>
          </div>
        </div>
      )}

      {/* Barre comparateur actif */}
      {view !== "comparator" && comparatorIds.length > 0 && (
        <div className="glass-card p-3 mb-4 border border-line border-blue-300 bg-blue-50 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium">{comparatorIds.length}/4 offres prêtes à comparer</span>
          <div className="flex gap-2">
            <button className="btn-primary btn-sm" onClick={() => { setView("comparator"); router.push(`/app/offers?compare=${comparatorIds.join(",")}`); }}>Ouvrir le comparateur</button>
            <button className="btn-line btn-sm" onClick={() => setComparatorIds([])}>Vider</button>
          </div>
        </div>
      )}

      {/* Contenu principal selon la vue */}
      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        {/* Colonne principale */}
        <div className="min-w-0">
          {view === "inbox" && (
            <OfferInbox
              data={data}
              onQualify={handleQualify}
              onBulkQualify={handleBulkQualify}
              onOpenDetail={handleOpenDetail}
              onAddToShortlist={handleAddToShortlist}
              onOpenMatching={handleOpenMatching}
              onOpenMissionPFE={handleOpenMissionPFE}
              onOpenReadyToApply={handleOpenReadyToApply}
              onAddToComparator={handleAddToComparator}
              selectedForCompare={comparatorIds}
              onUndo={handleUndo}
              onNavigate={handleNavigate}
            />
          )}

          {view === "detail" && selectedOffer && (
            <OfferDetailPanel
              offer={selectedOffer}
              qualification={selectedQualification}
              analysis={selectedAnalysis}
              application={selectedApplication}
              data={data}
              onQualify={handleQualify}
              onAddToShortlist={handleAddToShortlist}
              onOpenMatching={handleOpenMatching}
              onOpenMissionPFE={handleOpenMissionPFE}
              onOpenReadyToApply={handleOpenReadyToApply}
              onAddNote={handleUpdateNote}
              onSetPriority={handleSetPersonalPriority}
              onAddToComparator={handleAddToComparator}
              isInComparator={comparatorIds.includes(selectedOffer.id)}
              onNavigate={handleNavigate}
              onDeepenWithGemini={handleDeepenWithGemini}
            />
          )}

          {view === "comparator" && (
            <OfferComparator
              offerIds={comparatorIds}
              data={data}
              onRemove={handleRemoveFromComparator}
              onReorder={handleReorderComparator}
              onOpenDetail={handleOpenDetail}
              onOpenMissionPFE={handleOpenMissionPFE}
              onRetain={handleRetainFromComparator}
              onNavigate={handleNavigate}
              onClose={() => { setView("inbox"); setComparatorIds([]); router.push("/app/offers"); }}
            />
          )}

          {view === "shortlist" && (
            <ShortlistView
              data={data}
              onReorder={handleReorderShortlist}
              onUpdatePriority={handleSetPersonalPriority}
              onUpdateNote={handleUpdateNote}
              onUpdateJustification={handleUpdateJustification}
              onOpenDetail={handleOpenDetail}
              onOpenMissionPFE={handleOpenMissionPFE}
              onOpenReadyToApply={handleOpenReadyToApply}
              onRemoveFromShortlist={handleRemoveFromShortlist}
              onNavigate={handleNavigate}
            />
          )}
        </div>

        {/* Panneau de détail pour la vue inbox */}
        {view === "inbox" && selectedOffer && (
          <aside className="lg:block hidden" aria-labelledby="detail-panel-heading">
            <OfferDetailPanel
              offer={selectedOffer}
              qualification={selectedQualification}
              analysis={selectedAnalysis}
              application={selectedApplication}
              data={data}
              onQualify={handleQualify}
              onAddToShortlist={handleAddToShortlist}
              onOpenMatching={handleOpenMatching}
              onOpenMissionPFE={handleOpenMissionPFE}
              onOpenReadyToApply={handleOpenReadyToApply}
              onAddNote={handleUpdateNote}
              onSetPriority={handleSetPersonalPriority}
              onAddToComparator={handleAddToComparator}
              isInComparator={comparatorIds.includes(selectedOffer.id)}
              onNavigate={handleNavigate}
              onDeepenWithGemini={handleDeepenWithGemini}
            />
          </aside>
        )}

        {/* Panneau vide quand aucune offre sélectionnée en vue inbox */}
        {view === "inbox" && !selectedOffer && (
          <aside className="lg:block hidden" aria-labelledby="empty-panel-heading">
            <div className="glass-card p-8 text-center">
              <h3 id="empty-panel-heading" className="font-display text-lg">Sélectionnez une offre</h3>
              <p className="text-sm text-muted mt-3">Cliquez sur une offre dans la liste pour voir ses détails, la qualifier et agir.</p>
              <div className="mt-6 space-y-2 text-xs text-muted">
                <p>Raccourcis clavier :</p>
                <p>↑/↓ Navigation · Entrée Détail · 1-7 Qualifier · S Shortlist · M Matching · D Mission PFE · P Prêt à postuler · C Comparer · Z Annuler</p>
              </div>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
