"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  RotateCw,
  Zap,
  ChevronLeft,
  ChevronRight,
  Star,
  X,
  FileText,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  getOrCreateData,
  saveData,
  type Application,
  type DetectedOffer,
  type UserData,
} from "@/lib/data";
import { loadGmailStore, normalizeUrl } from "@/lib/gmail-client";
import { discoveryUrlKey } from "@/lib/discovery-identity";
import { offerCvCoverage } from "@/lib/offer-cv-coverage";
import { offerToDetectedOffer, type OfferLike } from "@/lib/gmail-bridge";
import {
  eligibleOffers,
  fallbackSelection,
  selectionSignature,
} from "@/lib/daily-recommendations";
import { cvToText } from "@/lib/cv";
import {
  DEMO_USER_PROFILE,
  DEMO_RECOMMENDED_OFFERS,
  DEMO_TABLE_OFFERS,
  type DemoRecommendedOffer,
  type DemoTableOffer,
} from "@/lib/demo-data";
import {
  applyOfferFilters,
  computeFacetCounts,
  EMPTY_FILTERS,
  type OfferListFilters,
} from "@/lib/offres-filters";
import { DailyOfferCard } from "@/components/offers/DailyOfferCard";
import { AssistantAiCard } from "@/components/offers/AssistantAiCard";
import { OffersTable, type OffersTabCounts } from "@/components/offers/OffersTable";
import { FiltersSidebar } from "@/components/offers/FiltersSidebar";
import { BottomWidgets } from "@/components/offers/BottomWidgets";

/* ── Aide à la fusion multi-sources (identité + dédup conservées) ── */

/** Clés d'identité d'une offre : id stable, URL normalisée, titre|entreprise|localité.
    Mêmes règles que le pont Alertes Gmail (offerBridgeKey) pour que l'identité
    reste cohérente entre Mes offres, le CV et les candidatures. */
function offerKeys(o: DetectedOffer): string[] {
  const keys: string[] = [];
  if (o.id) keys.push(o.id);
  const url = normalizeUrl(o.url || "");
  if (url) keys.push(`u:${url}`);
  const strong = discoveryUrlKey(o.url);
  if (strong) keys.push(strong);
  if (!url) keys.push(
    `t:${`${o.title || ""}|${o.company || ""}|${o.location || ""}`.trim().toLowerCase()}`
  );
  return keys;
}

/** Fusionne les sources par ordre de priorité. La première occurrence garde son
    id ; si une source suivante porte un contenu nettement plus complet (texte
    d'annonce), elle remplace le contenu en gardant l'id canonique. */
function mergeOffers(groups: DetectedOffer[][]): DetectedOffer[] {
  const seen = new Map<string, number>();
  const out: DetectedOffer[] = [];
  for (const group of groups) {
    for (const offer of group) {
      if (!offer || !offer.title) continue;
      const keys = offerKeys(offer);
      const hit = keys.map((k) => seen.get(k)).find((i) => i !== undefined);
      if (hit !== undefined) {
        const existing = out[hit];
        const gained = (offer.text?.length || 0) > (existing.text?.length || 0) * 1.5 + 200;
        if (gained) out[hit] = { ...offer, id: existing.id };
        continue;
      }
      const index = out.length;
      for (const k of keys) seen.set(k, index);
      out.push(offer);
    }
  }
  return out;
}

/* Identifiants locaux générés hors du composant (règle de pureté React). */
const newLocalId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const isExpiredOffer = (o: DetectedOffer) =>
  !!o.deadline &&
  /^\d{4}-\d{2}-\d{2}$/.test(o.deadline) &&
  Date.parse(`${o.deadline}T23:59:59`) < Date.now();

function toTableRow(o: DetectedOffer, applied: boolean): DemoTableOffer {
  const tags = (o.skills?.length ? o.skills : o.keywords || []).slice(0, 3);
  const expired = isExpiredOffer(o);
  return {
    id: o.id,
    company: o.company || "Entreprise non précisée",
    title: o.title || "Offre sans titre",
    location: o.location || "Localisation non précisée",
    tags,
    date: o.receivedAt
      ? new Date(o.receivedAt).toLocaleDateString("fr-FR")
      : "Date inconnue",
    receivedAt: o.receivedAt,
    /* Jamais de score inventé : « — » tant qu'aucun matching n'a été calculé. */
    matchPercentage: o.cvCoverage?.score ?? null,
    matchExplanation: o.cvCoverage?.reason,
    status: applied ? "postulee" : expired ? "expiree" : o.gmailStatus === "nouvelle" ? "nouvelle" : "a_traiter",
    url: o.url,
  };
}

type GmailStatus = {
  connected: boolean;
  configured?: boolean;
  lastSync?: string | null;
  gmailAccount?: string;
  reason?: string;
} | null;

type LoadState = {
  loading: boolean;
  /** Erreur bloquante (aucune source disponible). */
  error: string | null;
  /** Note non bloquante (ex. snapshot serveur injoignable). */
  note: string | null;
  snapshotCount: number | null;
};

export default function OffresPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryFromUrl = searchParams.get("q") || "";

  // Data states
  const [data, setData] = useState<UserData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({
    loading: true,
    error: null,
    note: null,
    snapshotCount: null,
  });
  const [recommendedOffers, setRecommendedOffers] = useState<DemoRecommendedOffer[]>([]);
  const [recommendationPriorities, setRecommendationPriorities] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Lignes de démonstration (état local dédié — jamais mélangées au réel).
  const [demoRows, setDemoRows] = useState<DemoTableOffer[]>(DEMO_TABLE_OFFERS);

  // Démo séparée et explicitement activable — jamais mélangée aux données réelles.
  const [demoMode, setDemoMode] = useState<boolean>(false);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState(queryFromUrl);
  const [activeTab, setActiveTab] = useState<
    "all" | "new" | "todo" | "applied" | "favorites" | "expired"
  >("all");
  const [companyFilter, setCompanyFilter] = useState("");
  const [sideFilters, setSideFilters] = useState<OfferListFilters>(EMPTY_FILTERS);

  // Modal states
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pastedTitle, setPastedTitle] = useState("");
  const [pastedCompany, setPastedCompany] = useState("");
  const [pastedUrl, setPastedUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [pastedNotice, setPastedNotice] = useState<string | null>(null);
  const [pasteBusy, setPasteBusy] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus>(null);

  const recordVersionRef = useRef(0);

  /* ── Sauvegarde serveur best-effort (versionnement optimiste) ── */
  const pushToServer = useCallback(async (next: UserData) => {
    try {
      const res = await fetch("/api/user-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: next, version: recordVersionRef.current }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; version?: number };
      if (res.ok && json.ok && typeof json.version === "number") {
        recordVersionRef.current = json.version;
      }
    } catch {
      /* Sauvegarde serveur indisponible : les données locales restent conservées. */
    }
  }, []);

  /* ── Chargement des offres réelles : serveur d'abord, appareil en secours ── */
  const loadOffers = useCallback(async () => {
    if (!user) return;
    const local = getOrCreateData(user.name, user.email);
    const localGmail = loadGmailStore(user.email).offers
      .filter((o) => o.status !== "doublon")
      .map((o) => offerToDetectedOffer(o));

    let remoteOffers: DetectedOffer[] = [];
    let remoteData: UserData | null = null;
    let remoteApplications: Application[] | null = null;
    let snapshotOffers: DetectedOffer[] = [];
    let discoveryOffers: DetectedOffer[] = [];
    let snapshotCount: number | null = null;
    const notes: string[] = [];

    // 1 — Dossier serveur (offres manuelles/sélectionnées + candidatures).
    try {
      const res = await fetch("/api/user-data", { cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        record?: { data: UserData; version: number };
      };
      if (res.ok && json.ok && json.record?.data) {
        recordVersionRef.current = json.record.version || 0;
        remoteData = json.record.data;
        remoteOffers = Array.isArray(json.record.data.offers) ? json.record.data.offers : [];
        remoteApplications = Array.isArray(json.record.data.applications)
          ? json.record.data.applications
          : [];
      } else {
        notes.push("Dossier serveur injoignable — affichage des offres de cet appareil.");
      }
    } catch {
      notes.push("Dossier serveur injoignable — affichage des offres de cet appareil.");
    }

    // 2 — Catalogue Gmail persistant côté serveur (source de vérité pérenne).
    try {
      const res = await fetch("/api/offres/snapshot", { cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        offers?: (OfferLike & { atsScore?: number })[];
        count?: number;
      };
      if (res.ok && json.ok && Array.isArray(json.offers)) {
        snapshotOffers = json.offers.map((o) =>
          offerToDetectedOffer(o, typeof o.atsScore === "number" ? o.atsScore : 0)
        );
        snapshotCount = typeof json.count === "number" ? json.count : snapshotOffers.length;
      } else {
        notes.push(json.error || "Cataloge Gmail serveur injoignable.");
      }
    } catch {
      notes.push("Catalogue Gmail serveur injoignable.");
    }

    // 3 — Offres publiques vérifiées, conservées dans le stockage serveur.
    try {
      const res = await fetch("/api/offres/discovery", { cache: "no-store" });
      const json = await res.json() as { ok?: boolean; offers?: DetectedOffer[] };
      if (res.ok && json.ok && Array.isArray(json.offers)) {
        discoveryOffers = json.offers;
      } else notes.push("Registre des stages découverts indisponible.");
    } catch { notes.push("Registre des stages découverts indisponible."); }

    // Fusion : dossier serveur → offres publiques → Gmail → appareil.
    const merged = mergeOffers([remoteOffers, discoveryOffers, snapshotOffers, local.offers, localGmail]);
    const applications = remoteApplications
      ? [
          ...remoteApplications,
          ...local.applications.filter((a) => !remoteApplications!.some((r) => r.id === a.id)),
        ]
      : local.applications;
    const effective: UserData = { ...(remoteData || local), offers: merged, applications };
    effective.offers = merged.map(offer => ({ ...offer, cvCoverage: offerCvCoverage(offer, effective) }));
    setData(effective);

    const blocking =
      merged.length === 0 && (snapshotCount === 0 || snapshotCount === null) && notes.length > 0
        ? "Aucune offre disponible : vérifie ta connexion puis relance la synchronisation Gmail."
        : null;
    setLoadState({
      loading: false,
      error: blocking,
      note: notes.length ? notes.join(" ") : null,
      snapshotCount,
    });

    // 4 — Recommandations réelles du jour (moteur daily-recommendations).
    const cvText = effective.originalCv?.text || (effective.cvData ? cvToText(effective.cvData) : "");
    const eligible = eligibleOffers(merged, effective);
    if (!eligible.length) {
      setRecommendedOffers([]);
      setRecommendationPriorities(0);
    } else {
      const selection = fallbackSelection(
        eligible,
        cvText,
        new Date().toISOString().slice(0, 10),
        selectionSignature(eligible, cvText)
      );
      const byId = new Map(eligible.map((o) => [o.id, o]));
      const items: DemoRecommendedOffer[] = selection.picks.flatMap((pick) => {
        const offer = byId.get(pick.id);
        if (!offer) return [];
        return [
          {
            id: offer.id,
            rank: selection.picks.indexOf(pick) + 1,
            priorityLabel: pick.priority ? "Priorité du jour" : "À examiner",
            company: offer.company || "Entreprise non précisée",
            title: offer.title || "Offre sans titre",
            location: offer.location || "Localisation non précisée",
            duration: offer.duration || "Durée à vérifier",
            tags: (offer.skills?.length ? offer.skills : offer.keywords || []).slice(0, 3),
            description: pick.reason,
            url: offer.url,
          },
        ];
      });
      setRecommendedOffers(items);
      setRecommendationPriorities(selection.picks.filter((p) => p.priority).length);
    }
  }, [user]);

  // Charge au montage puis à chaque changement d'identité (sans setState synchrone d'effet).
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return loadOffers();
    });
    return () => {
      cancelled = true;
    };
  }, [loadOffers]);

  // Favoris locaux + statut Gmail réel (tous deux résolus après une promesse).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const status = await fetch("/api/gmail/status", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null as GmailStatus);
      let stored: string[] = [];
      try {
        const raw = localStorage.getItem(`cible:favorites:${user.email}`);
        if (raw) stored = JSON.parse(raw);
      } catch {
        /* stockage indisponible */
      }
      if (cancelled) return;
      if (stored.length) setFavorites(new Set(stored));
      if (status?.ok) setGmailStatus(status as GmailStatus);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // La recherche pilotée par AppShell (?q=) reste synchronisée.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setSearchQuery(queryFromUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [queryFromUrl]);

  /* ── Synchronisation Gmail : lots enchaînés puis rechargement serveur ── */
  const handleSyncGmail = async () => {
    if (!user || isSyncing) return;
    setIsSyncing(true);
    setSyncNotice(null);
    try {
      let batches = 0;
      let idle = 0;
      let remaining = 0;
      while (batches < 10 && idle < 3) {
        setSyncNotice(`Synchronisation… lot ${batches + 1}`);
        const res = await fetch("/api/gmail/sync", { method: "POST" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          emailsRead?: number;
          remaining?: number;
          detected?: number;
        };
        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Synchronisation impossible pour le moment.");
        }
        batches += 1;
        remaining = Number(json.remaining || 0);
        if (!json.emailsRead || remaining <= 0) idle += 1;
        else idle = 0;
        if (remaining > 0 && idle < 3) {
          setSyncNotice(`Synchronisation… lot ${batches + 1} (pause respectant le quota Gmail)`);
          await new Promise((r) => setTimeout(r, 6000));
        }
      }
      await loadOffers();
      setSyncNotice(
        remaining > 0
          ? `Lot enregistré — il reste ${remaining} e-mails. Relance la synchronisation pour continuer.`
          : `Synchronisation terminée (${batches} lot${batches > 1 ? "s" : ""}).`
      );
    } catch (e) {
      setSyncNotice(e instanceof Error ? e.message : "Synchronisation impossible.");
    } finally {
      setIsSyncing(false);
    }
  };

  /* ── Favoris ── */
  const handleToggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (user?.email) {
        localStorage.setItem(`cible:favorites:${user.email}`, JSON.stringify([...next]));
      }
      return next;
    });
  };

  /* ── Sélection ── */
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredOffers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOffers.map((o) => o.id)));
    }
  };

  /* ── Enregistre la vraie offre (texte complet) pour l'adaptation CV ── */
  const handleSelectOffer = (id: string) => {
    if (!user || demoMode) return;
    const found = realOffersById.get(id);
    if (!found) return;
    const local = getOrCreateData(user.name, user.email);
    const keys = new Set(offerKeys(found));
    if (local.offers.some((o) => offerKeys(o).some((k) => keys.has(k)))) return;
    const next = { ...local, offers: [found, ...local.offers] };
    saveData(user.email, next);
    pushToServer(next);
  };

  /* ── Marquage « postulé » : enregistre une vraie candidature, sans inventaire ── */
  const handleMarkApplied = async (ids: string[]) => {
    if (!user || demoMode) return;
    const local = getOrCreateData(user.name, user.email);
    const now = new Date().toISOString();
    const additions: Application[] = [];
    for (const id of ids) {
      const offer = realOffersById.get(id);
      if (!offer) continue;
      if (local.applications.some((a) => a.offerId === offer.id)) continue;
      additions.push({
        id: newLocalId("app"),
        offerId: offer.id,
        offerUrl: offer.url,
        company: offer.company,
        role: offer.title,
        status: "sent",
        daysAgo: 0,
        source: "Mes offres (marqué manuellement)",
        date: now,
        notes: "Marqué comme postulé depuis Mes offres ; aucun CV n'est encore archivé pour cette candidature.",
      });
    }
    if (!additions.length) {
      setSyncNotice("Ces candidatures sont déjà enregistrées.");
      return;
    }
    const next = { ...local, applications: [...additions, ...local.applications] };
    saveData(user.email, next);
    await pushToServer(next);
    setSelectedIds(new Set());
    await loadOffers();
    setSyncNotice(`${additions.length} candidature${additions.length > 1 ? "s" : ""} enregistrée${additions.length > 1 ? "s" : ""}.`);
  };

  /* ── Ajout par URL : extraction réelle puis formulaire de confirmation ── */
  const handleAnalyzeUrl = async (url: string) => {
    setPastedTitle("");
    setPastedCompany("");
    setPastedUrl(url);
    setPastedText("");
    setPastedNotice(null);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; text?: string; error?: string };
      if (res.ok && json.ok && typeof json.text === "string" && json.text.trim().length > 50) {
        setPastedText(json.text.slice(0, 30_000));
        setPastedNotice("Annonce récupérée. Vérifie le titre et l'entreprise, puis enregistre.");
      } else {
        setPastedNotice(json.error || "Page illisible — colle le texte de l'annonce manuellement.");
      }
    } catch {
      setPastedNotice("Analyse impossible — colle le texte de l'annonce manuellement.");
    }
    setPasteModalOpen(true);
  };

  /* ── Enregistrement réel d'une annonce collée (serveur + rechargement) ── */
  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !pastedText.trim() || pasteBusy) return;
    if (!pastedTitle.trim() || !pastedCompany.trim()) {
      setPastedNotice("Le titre et l'entreprise sont requis pour enregistrer l'offre.");
      return;
    }
    setPasteBusy(true);
    setPastedNotice(null);
    const offer: DetectedOffer = {
      id: newLocalId("manual"),
      title: pastedTitle.trim().slice(0, 200),
      company: pastedCompany.trim().slice(0, 120),
      location: "",
      salary: "",
      match: 0,
      keywords: [],
      text: pastedText.trim().slice(0, 30_000),
      url: pastedUrl.trim() || undefined,
      source: "Ajout manuel",
      receivedAt: new Date().toISOString(),
    };
    try {
      const res = await fetch("/api/offres/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setPastedNotice(json.error || "Enregistrement impossible — réessaie.");
        return;
      }
      setPasteModalOpen(false);
      setPastedTitle("");
      setPastedCompany("");
      setPastedUrl("");
      setPastedText("");
      await loadOffers();
      setSyncNotice("Offre enregistrée dans ton dossier serveur.");
    } catch {
      setPastedNotice("Enregistrement impossible — réessaie.");
    } finally {
      setPasteBusy(false);
    }
  };

  /* ── Vue démo séparée (jamais mélangée aux données réelles) ── */
  const facetCounts = useMemo(
    () => (demoMode || !data ? undefined : computeFacetCounts(data.offers)),
    [demoMode, data]
  );

  const realOffersById = new Map<string, DetectedOffer>();
  for (const offer of data?.offers || []) realOffersById.set(offer.id, offer);

  const appliedOfferIds = useMemo(
    () => new Set((data?.applications || []).map((a) => a.offerId).filter(Boolean) as string[]),
    [data]
  );

  const baseRows = useMemo<DemoTableOffer[]>(() => {
    if (demoMode) return demoRows;
    if (!data) return [];
    return applyOfferFilters(data.offers, sideFilters).map((o) =>
      toTableRow(o, appliedOfferIds.has(o.id))
    );
  }, [demoMode, demoRows, data, sideFilters, appliedOfferIds]);

  const tabCounts = useMemo<OffersTabCounts | undefined>(() => {
    if (demoMode) return undefined;
    const favoritesCount = baseRows.filter((r) => favorites.has(r.id)).length;
    return {
      all: baseRows.length,
      new: baseRows.filter((r) => r.status === "nouvelle").length,
      todo: baseRows.filter((r) => r.status === "a_traiter").length,
      applied: baseRows.filter((r) => r.status === "postulee").length,
      favorites: favoritesCount,
      expired: baseRows.filter((r) => r.status === "expiree").length,
    };
  }, [demoMode, baseRows, favorites]);

  const filteredOffers = (() => {
    return baseRows.filter((offer) => {
      // Tab filter
      if (activeTab === "favorites" && !favorites.has(offer.id)) return false;
      if (activeTab === "new" && offer.status !== "nouvelle") return false;
      if (activeTab === "todo" && offer.status !== "a_traiter") return false;
      if (activeTab === "applied" && offer.status !== "postulee") return false;
      if (activeTab === "expired" && offer.status !== "expiree") return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          offer.title.toLowerCase().includes(q) ||
          offer.company.toLowerCase().includes(q) ||
          offer.location.toLowerCase().includes(q) ||
          offer.tags.some((t) => t.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // Company filter from sidebar
      if (companyFilter.trim()) {
        if (!offer.company.toLowerCase().includes(companyFilter.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  })();

  /* ── Statistiques réelles (compte du dossier, indépendant des filtres) ── */
  const realTotal = demoMode ? DEMO_USER_PROFILE.stats.totalOffers : data?.offers.length ?? 0;
  const lastSyncLabel = (() => {
    if (demoMode) return DEMO_USER_PROFILE.lastGmailSync.time;
    if (!gmailStatus) return "…";
    if (!gmailStatus.connected) return "Gmail non connecté";
    return gmailStatus.lastSync
      ? new Date(gmailStatus.lastSync).toLocaleString("fr-FR")
      : "jamais";
  })();

  const preparationQueue = useMemo(() => {
    if (demoMode) return undefined;
    const labels: Record<string, string> = {
      pending: "En attente",
      running: "Adaptation IA",
      ready: "PDF prêt",
      failed: "Échec",
    };
    return (data?.bulkCvQueue || []).slice(0, 3).map((item) => ({
      id: item.offerId,
      company: data?.offers.find((o) => o.id === item.offerId)?.company || "Offre enregistrée",
      step: labels[item.status] || item.status,
      progress: item.status === "ready" ? 100 : item.status === "running" ? 50 : 0,
    }));
  }, [demoMode, data]);

  const activeQueueCount = useMemo(
    () => (data?.bulkCvQueue || []).filter((q) => q.status === "pending" || q.status === "running").length,
    [data]
  );

  const userName = user?.name ? user.name.split(" ")[0] : null;

  return (
    <div className="flex flex-col gap-6 max-w-[1680px] mx-auto pb-12">
      {/* ── Bandeau compte réel / démonstration ── */}
      <div
        className={`flex flex-wrap items-center justify-between px-3.5 py-2 rounded-xl text-xs border transition-colors ${
          demoMode
            ? "bg-amber-50/90 border-amber-200/90 text-amber-900"
            : "bg-blue-50/90 border-blue-200/90 text-blue-900"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              demoMode ? "bg-amber-500 animate-pulse" : loadState.loading ? "bg-blue-400 animate-pulse" : "bg-blue-500"
            }`}
          />
          <span>
            {demoMode ? (
              <>
                <strong className="font-semibold">Mode Démonstration actif</strong> — Affichage
                fidèle des {DEMO_USER_PROFILE.stats.totalOffers} offres de référence issues des
                captures.
              </>
            ) : loadState.loading ? (
              <strong className="font-semibold">Chargement de vos offres depuis le serveur…</strong>
            ) : (
              <>
                <strong className="font-semibold">Compte réel</strong> —{" "}
                {realTotal} offre{realTotal > 1 ? "s" : ""} dans votre espace
                {loadState.snapshotCount !== null
                  ? ` (catalogue serveur : ${loadState.snapshotCount})`
                  : ""}
                .
              </>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDemoMode(!demoMode)}
          className={`font-semibold underline ml-auto px-2 py-0.5 rounded cursor-pointer ${
            demoMode ? "hover:text-amber-950" : "hover:text-blue-950"
          }`}
        >
          {demoMode
            ? `Basculer sur mon compte réel (${data?.offers.length ?? 0} offre${(data?.offers.length ?? 0) > 1 ? "s" : ""})`
            : "Afficher le mode démonstration de référence"}
        </button>
      </div>

      {/* États réels : erreur bloquante ou note non bloquante */}
      {!demoMode && loadState.error && (
        <div className="px-3.5 py-2 rounded-xl text-xs border bg-rose-50/90 border-rose-200/90 text-rose-900">
          {loadState.error}
        </div>
      )}
      {!demoMode && !loadState.error && loadState.note && (
        <div className="px-3.5 py-2 rounded-xl text-xs border bg-amber-50/80 border-amber-200/80 text-amber-900">
          {loadState.note}
        </div>
      )}

      {/* ── Top Greetings & Mode Rafale Banner ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Greetings and Subtitle */}
        <div>
          <h1 className="text-2xl md:text-[28px] font-extrabold tracking-tight text-slate-900 leading-tight">
            {userName ? `Bonjour ${userName} 👋` : "Bonjour 👋"}
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Voici tes meilleures opportunités du jour, sélectionnées selon ton profil et tes offres
            enregistrées.
          </p>
        </div>

        {/* Right: Gmail status sync + Mode Rafale card */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Gmail sync pill — valeurs réelles */}
          <div className="flex items-center gap-2 bg-white border border-slate-200/90 rounded-xl px-3 py-2 shadow-2xs">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                gmailStatus?.connected ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
              }`}
            />
            <div className="text-[11px] text-slate-600">
              <span className="font-semibold text-slate-700">Dernière synchronisation :</span>{" "}
              {lastSyncLabel} •{" "}
              <span className="font-medium text-slate-800">
                {demoMode
                  ? `${DEMO_USER_PROFILE.lastGmailSync.analyzedCount} e-mails analysés`
                  : loadState.snapshotCount !== null
                    ? `${loadState.snapshotCount} offres sauvegardées`
                    : "catalogue serveur indisponible"}
              </span>
            </div>
            <button
              type="button"
              onClick={handleSyncGmail}
              disabled={isSyncing}
              className="flex items-center gap-1 ml-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              <RotateCw size={12} className={isSyncing ? "animate-spin" : ""} />
              <span>Synchroniser</span>
            </button>
          </div>

          {/* Mode Rafale Header CTA Card */}
          <Link
            href="/app/offres?rafale=1"
            className="flex items-center gap-3 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100/80 hover:to-purple-100/80 border border-indigo-100/80 rounded-xl px-3.5 py-2 transition-all shadow-2xs group"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Zap size={14} className="fill-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900">Mode Rafale ⚡</span>
              </div>
              <span className="text-[10px] text-slate-500">
                Sélectionne plusieurs offres et génère tous tes CV en une fois. →
              </span>
            </div>
          </Link>
        </div>
      </div>

      {/* Progression / résultat de synchronisation */}
      {syncNotice && (
        <div className="px-3.5 py-2 rounded-xl text-xs border bg-slate-50 border-slate-200 text-slate-700">
          {syncNotice}
        </div>
      )}

      {/* ── Section 1: Recommandations du jour ── */}
      <section className="flex flex-col gap-3">
        {/* Section title & controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm md:text-base font-bold text-slate-900 tracking-tight">
              {demoMode ? "Mes 10 meilleures offres du jour" : "Mes offres recommandées du jour"}
            </h2>
            {recommendationPriorities > 0 && !demoMode && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full shadow-2xs">
                <Star size={11} className="fill-amber-500 text-amber-500" />
                <span>
                  {recommendationPriorities} priorité{recommendationPriorities > 1 ? "s" : ""}
                </span>
              </span>
            )}
            {demoMode && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full shadow-2xs">
                <Star size={11} className="fill-amber-500 text-amber-500" />
                <span>4 priorités</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className="p-1 rounded-md border border-slate-200 hover:bg-slate-100 text-slate-600"
                aria-label="Précédent"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="p-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                aria-label="Suivant"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Recommendations + Assistant IA Card Grid */}
        {demoMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
            {DEMO_RECOMMENDED_OFFERS.slice(0, 4).map((offer) => (
              <DailyOfferCard
                key={offer.id}
                offer={offer}
                isFavorite={favorites.has(offer.id)}
                onToggleFavorite={handleToggleFavorite}
                onSelectOffer={handleSelectOffer}
              />
            ))}
            <div className="md:col-span-2 lg:col-span-4 xl:col-span-1">
              <AssistantAiCard />
            </div>
          </div>
        ) : recommendedOffers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
            {recommendedOffers.slice(0, 4).map((offer) => (
              <DailyOfferCard
                key={offer.id}
                offer={offer}
                isFavorite={favorites.has(offer.id)}
                onToggleFavorite={handleToggleFavorite}
                onSelectOffer={handleSelectOffer}
              />
            ))}
            <div className="md:col-span-2 lg:col-span-4 xl:col-span-1">
              <AssistantAiCard priorityCount={recommendationPriorities} />
            </div>
          </div>
        ) : (
          <div className="px-4 py-6 rounded-2xl border border-slate-200/90 bg-white text-xs text-slate-500">
            {loadState.loading
              ? "Calcul de vos recommandations…"
              : "Aucune recommandation calculée pour le moment : synchronise Gmail pour importer tes offres, puis complète ton CV principal pour affiner la sélection."}
          </div>
        )}
      </section>

      {/* ── Section 2: Toutes mes offres + Filtres Sidebar ── */}
      <section className="grid grid-cols-1 lg:grid-cols-4 xl:grid-cols-4 gap-4 items-start">
        {/* Main table column (~75%) */}
        <div className="lg:col-span-3">
          <OffersTable
            offers={filteredOffers}
            totalOffersCount={realTotal}
            tabCounts={tabCounts}
            showDelete={demoMode}
            selectedIds={selectedIds}
            favorites={favorites}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onToggleFavorite={handleToggleFavorite}
            onSelectOffer={handleSelectOffer}
            onBulkEnqueue={() => {
              router.push("/app/cv?bulk=1");
            }}
            onBulkMarkApplied={() => {
              if (demoMode) {
                setDemoRows((prev) =>
                  prev.map((o) => (selectedIds.has(o.id) ? { ...o, status: "postulee" } : o))
                );
                setSelectedIds(new Set());
                return;
              }
              handleMarkApplied([...selectedIds]);
            }}
            onBulkDelete={() => {
              if (!demoMode) return;
              setDemoRows((prev) => prev.filter((o) => !selectedIds.has(o.id)));
              setSelectedIds(new Set());
            }}
          />
        </div>

        {/* Right filter sidebar (~25%) — filtres réels */}
        <div className="lg:col-span-1">
          <FiltersSidebar
            filters={sideFilters}
            onFiltersChange={setSideFilters}
            facetCounts={facetCounts}
            onSearchChange={setCompanyFilter}
            onReset={() => {
              setCompanyFilter("");
              setSearchQuery("");
              setSideFilters(EMPTY_FILTERS);
              setActiveTab("all");
            }}
          />
        </div>
      </section>

      {/* ── Section 3: Bottom 3 widgets ── */}
      <section className="pt-2">
        <BottomWidgets
          onAnalyzeUrl={handleAnalyzeUrl}
          onPasteTextClick={() => {
            setPastedNotice(null);
            setPasteModalOpen(true);
          }}
          queueItems={preparationQueue}
          queueLabel={
            activeQueueCount > 0
              ? `${activeQueueCount} CV en préparation`
              : "Aucune préparation"
          }
          analyzeSuccessMessage="Annonce récupérée dans le formulaire — complète puis enregistre."
        />
      </section>

      {/* ── Modal Coller le texte de l'annonce ── */}
      {pasteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Coller le texte d&apos;une annonce
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPasteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X size={18} />
              </button>
            </div>

            {pastedNotice && (
              <p className="text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5">
                {pastedNotice}
              </p>
            )}

            <form onSubmit={handlePasteSubmit} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                  Entreprise *
                  <input
                    type="text"
                    value={pastedCompany}
                    onChange={(e) => setPastedCompany(e.target.value)}
                    placeholder="Ex : Schneider Electric"
                    required
                    className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                  Intitulé du poste *
                  <input
                    type="text"
                    value={pastedTitle}
                    onChange={(e) => setPastedTitle(e.target.value)}
                    placeholder="Ex : Stage Automatisation"
                    required
                    className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                Lien de l&apos;annonce (optionnel)
                <input
                  type="url"
                  value={pastedUrl}
                  onChange={(e) => setPastedUrl(e.target.value)}
                  placeholder="https://…"
                  className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                Texte complet de l&apos;annonce *
                <textarea
                  rows={6}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Colle ici la description de la mission, les compétences requises…"
                  className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasteModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={pasteBusy || !pastedText.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 rounded-lg shadow-xs"
                >
                  {pasteBusy ? "Enregistrement…" : "Enregistrer l'offre"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
