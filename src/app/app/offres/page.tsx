"use client";
import { currentCareerReport } from "@/lib/career-evaluation";
import { appliedOfferIds as getAppliedOfferIds, visibleInOfferTab } from "@/lib/applied-offers";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  ExternalLink,
  SkipForward,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  getOrCreateData,
  saveData,
  offerSnapshot,
  mergeUserData,
  type Application,
  type DetectedOffer,
  type UserData,
} from "@/lib/data";
import { loadGmailStore, normalizeUrl } from "@/lib/gmail-client";
import { postGmailSyncLocked } from "@/lib/gmail-sync-client";
import { discoveryUrlKey } from "@/lib/discovery-identity";
import { isOfferDismissed } from "@/lib/offer-dismissal";
import { cvMasterText, offerCvCoverage } from "@/lib/offer-cv-coverage";
import { offerToDetectedOffer, type OfferLike } from "@/lib/gmail-bridge";
import {
  eligibleOffers,
  fallbackSelection,
  selectionSignature,
} from "@/lib/daily-recommendations";

import {
  DEMO_USER_PROFILE,
  DEMO_RECOMMENDED_OFFERS,
  DEMO_TABLE_OFFERS,
  type DemoRecommendedOffer,
  type DemoTableOffer,
} from "@/lib/demo-data";
import {
  computeFacetCounts,
  DOMAIN_KEYWORDS,
  EMPTY_FILTERS,
  matchesOfferFilters,
  SOURCE_SITES,
  writeRafaleQueue,
  writeRafaleOffers,
  type OfferListFilters,
} from "@/lib/offres-filters";
import { DailyOfferCard } from "@/components/offers/DailyOfferCard";
import { AssistantAiCard } from "@/components/offers/AssistantAiCard";
import { OffersTable, type OffersTabCounts } from "@/components/offers/OffersTable";
import { FiltersSidebar } from "@/components/offers/FiltersSidebar";
import { BottomWidgets, ManualOfferCard } from "@/components/offers/BottomWidgets";

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

/* ── Filtres de la page : état local, jamais une navigation ──
   Chaque clic sur une case ne déclenche plus de transition de route (c'était
   la cause du gel) ; l'URL ne sert plus qu'à l'entrée (lien direct, ?rafale=1)
   et les filtres survivent au rechargement via sessionStorage. */
const FILTERS_STORAGE_KEY = "cible:offres-filters:v1";
const CONTRACT_IDS = ["stage-6", "alternance", "autre"];
const REGION_IDS = ["all", "idf", "ara", "paca", "ge"];
const PERIOD_IDS = ["all", "24h", "7d", "30d"];

function filtersFromParams(params: URLSearchParams): OfferListFilters {
  return {
    contracts: (params.get("contracts") || "").split(",").filter((x) => CONTRACT_IDS.includes(x)),
    domains: (params.get("domains") || "").split(",").filter((x) => x in DOMAIN_KEYWORDS),
    sources: (params.get("sources") || "").split(",").filter((x) => x in SOURCE_SITES),
    region: REGION_IDS.includes(params.get("region") || "") ? params.get("region")! : "all",
    period: PERIOD_IDS.includes(params.get("period") || "") ? params.get("period")! : "all",
  };
}

const hasActiveFilters = (filters: OfferListFilters) =>
  !!filters.contracts.length ||
  !!filters.domains.length ||
  !!filters.sources.length ||
  (filters.region !== "all" && !!filters.region) ||
  (filters.period !== "all" && !!filters.period);

function readStoredFilters(): OfferListFilters | null {
  try {
    const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OfferListFilters>;
    const list = (value: unknown, allowed: (id: string) => boolean) =>
      Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && allowed(id)) : [];
    return {
      contracts: list(parsed.contracts, (id) => CONTRACT_IDS.includes(id)),
      domains: list(parsed.domains, (id) => id in DOMAIN_KEYWORDS),
      sources: list(parsed.sources, (id) => id in SOURCE_SITES),
      region: typeof parsed.region === "string" && REGION_IDS.includes(parsed.region) ? parsed.region : "all",
      period: typeof parsed.period === "string" && PERIOD_IDS.includes(parsed.period) ? parsed.period : "all",
    };
  } catch {
    return null;
  }
}

/* ── Dernier catalogue connu, gardé sur l'appareil ──
   L'écran n'attend plus le serveur pour afficher les offres : la copie locale
   s'affiche tout de suite, puis le serveur la remplace. Le texte des annonces
   est tronqué pour rester sous le quota du navigateur. */
const catalogCacheKey = (email: string) => `cible:catalogue-cache:v1:${email.trim().toLowerCase()}`;
const CACHED_TEXT_LIMIT = 2000;

function readCatalogCache(email: string): DetectedOffer[] {
  try {
    const raw = localStorage.getItem(catalogCacheKey(email));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (offer): offer is DetectedOffer =>
        !!offer && typeof offer === "object" && typeof (offer as DetectedOffer).id === "string" && typeof (offer as DetectedOffer).title === "string"
    );
  } catch {
    return [];
  }
}

function writeCatalogCache(email: string, offers: DetectedOffer[]): void {
  try {
    const light = offers.slice(0, 300).map((offer) => ({
      id: offer.id,
      title: offer.title,
      company: offer.company,
      location: offer.location,
      salary: offer.salary,
      match: offer.match,
      keywords: (offer.keywords || []).slice(0, 20),
      skills: (offer.skills || []).slice(0, 20),
      text: (offer.text || "").slice(0, CACHED_TEXT_LIMIT),
      url: offer.url,
      source: offer.source,
      contract: offer.contract,
      duration: offer.duration,
      deadline: offer.deadline,
      receivedAt: offer.receivedAt,
      gmailStatus: offer.gmailStatus,
      cvCoverage: offer.cvCoverage,
    }));
    localStorage.setItem(catalogCacheKey(email), JSON.stringify(light));
  } catch {
    /* quota atteint : le catalogue serveur reste la source de vérité */
  }
}

const isExpiredOffer = (o: DetectedOffer) =>
  !!o.deadline &&
  /^\d{4}-\d{2}-\d{2}$/.test(o.deadline) &&
  Date.parse(`${o.deadline}T23:59:59`) < Date.now();

function toTableRow(o: DetectedOffer, applied: boolean, report?: import("@/lib/career-evaluation").CareerReport | null): DemoTableOffer {
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
    careerScore: report?.score,
    careerReason: report ? `${report.reason} · Confiance ${report.confidence}` : undefined,
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
  /* Les frappes restent instantanées : le filtrage suit un cran derrière. */
  const deferredSearch = useDeferredValue(searchQuery);
  const deferredCompany = useDeferredValue(companyFilter);

  /* ── Mode Rafale : enchaîner les candidatures sans perdre le filtre ── */
  const [rafaleMode, setRafaleMode] = useState(false);
  const [savingApplication, setSavingApplication] = useState(false);
  const applicationSaveLock = useRef(false);
  const [rafaleSkipped, setRafaleSkipped] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (searchParams.get("rafale") !== "1") return;
    queueMicrotask(() => setRafaleMode(true));
  }, [searchParams]);

  const [sideFilters, setSideFiltersState] = useState<OfferListFilters>(EMPTY_FILTERS);
  const setSideFilters = useCallback((filters: OfferListFilters) => {
    setSideFiltersState(filters);
    /* Nouveau filtre = nouvelle file Rafale : les offres passées redeviennent éligibles. */
    setRafaleSkipped(new Set());
    try {
      sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      /* stockage indisponible : les filtres restent valables pour la session */
    }
  }, []);

  /* Restauration des filtres (lien direct puis session) + filtres rapides du
     bandeau, envoyés par AppShell sans passer par l'URL. */
  useEffect(() => {
    const fromUrl = filtersFromParams(new URLSearchParams(window.location.search));
    const restored = hasActiveFilters(fromUrl) ? fromUrl : readStoredFilters();
    if (restored) {
      /* Un lien direct avec filtres devient aussi l'état de la session. */
      try {
        sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(restored));
      } catch {
        /* stockage indisponible */
      }
      queueMicrotask(() => setSideFiltersState(restored));
    }
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: keyof OfferListFilters; value?: string }>).detail;
      if (!detail?.key) return;
      const key = detail.key;
      const value = detail.value ?? "";
      setRafaleSkipped(new Set());
      setSideFiltersState((prev) => {
        const list = value ? value.split(",").filter(Boolean) : [];
        const next: OfferListFilters = key === "region"
          ? { ...prev, region: value || "all" }
          : key === "period"
            ? { ...prev, period: value || "all" }
            : key === "contracts"
              ? { ...prev, contracts: list }
              : key === "domains"
                ? { ...prev, domains: list }
                : { ...prev, sources: list };
        try {
          sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* stockage indisponible */
        }
        return next;
      });
    };
    window.addEventListener("cible:offer-filter-request", onRequest);
    return () => window.removeEventListener("cible:offer-filter-request", onRequest);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("cible:offer-filters", { detail: sideFilters }));
  }, [sideFilters]);
  useEffect(() => {
    if (data) window.dispatchEvent(new CustomEvent("cible:catalog-stats", { detail: {
      offers: data.offers.length, applications: data.applications.length,
      interviews: data.applications.filter(a => a.status === "interview").length,
    } }));
  }, [data]);

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

  /* ── Sauvegarde serveur best-effort ──
     Le dossier serveur contient des candidatures écrites par d'autres écrans
     (/api/candidatures/apply, Gmail, adaptation) qui n'existent pas en local.
     On recharge son état courant, on FUSIONNE l'ajout local dedans, puis on
     écrit : jamais d'écrasement du serveur par un état local incomplet. */
  const pushToServer = useCallback(async (next: UserData) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const current = (await fetch("/api/user-data", { cache: "no-store" })
          .then((r) => r.json().catch(() => null))
          .catch(() => null)) as { ok?: boolean; record?: { data: UserData; version: number } } | null;
        const remote = current?.ok && current.record?.data ? current.record.data : null;
        const version = current?.ok && typeof current.record?.version === "number"
          ? current.record.version
          : recordVersionRef.current;
        const res = await fetch("/api/user-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: remote ? mergeUserData(remote, next) : next, version }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; version?: number };
        if (res.ok && json.ok && typeof json.version === "number") {
          recordVersionRef.current = json.version;
          return true;
        }
        /* Version périmée (écriture concurrente) : une seule relance avec l'état serveur frais. */
      } catch {
        /* Sauvegarde serveur indisponible : les données locales restent conservées. */
        return false;
      }
    }
    return false;
  }, []);

  const removeOffers = async (ids: string[]) => {
    if (demoMode) { setDemoRows(rows => rows.filter(row => !ids.includes(row.id))); setSelectedIds(new Set()); return; }
    if (!data || !user || !ids.length) return;

    try {
      const response = await fetch("/api/offres/dismiss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, offers: data.offers.filter(offer => ids.includes(offer.id)).map(({ id, url, title, company, location }) => ({ id, url, title, company, location })) }) });
      if (!response.ok) throw new Error();
      const result = await response.json();
      loadRevision.current += 1;
      const next = { ...data, dismissedOfferIds: [...new Set([...(data.dismissedOfferIds || []), ...result.dismissedOfferIds as string[]])] };
      setData(current => current ? { ...current, dismissedOfferIds: [...new Set([...(current.dismissedOfferIds || []), ...next.dismissedOfferIds])] } : next);
      setRecommendedOffers(rows => rows.filter(row => !isOfferDismissed(row, next.dismissedOfferIds)));
      setSelectedIds(new Set());
      try { saveData(user.email, next); } catch { /* Server has confirmed persistence. */ }
      setSyncNotice(`${ids.length} offre(s) supprimée(s) de Mes offres. Tes candidatures et CV envoyés restent conservés.`);
    } catch { setSyncNotice("Suppression non enregistrée. Réessaie : les offres ont été conservées."); }
  };

  /* ── Chargement des offres réelles : serveur d'abord, appareil en secours ── */
  const previousCatalogs = useRef<{ email: string; snapshot: DetectedOffer[]; discovery: DetectedOffer[] }>({ email: "", snapshot: [], discovery: [] });
  const loadRevision = useRef(0);
  const lastRefresh = useRef(0);
  const loadOffers = useCallback(async () => {
    if (!user) return;
    const revision = ++loadRevision.current;
    lastRefresh.current = Date.now();
    // Start independent reads together; bound both the request and JSON body time.
    const requests = ["/api/user-data", "/api/offres/snapshot", "/api/offres/discovery"].map(async url => {
      try {
        const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
        return { ok: res.ok, json: await res.json() };
      } catch { return { ok: false, json: null }; }
    });
    const local = getOrCreateData(user.name, user.email);
    const localGmail = loadGmailStore(user.email).offers
      .filter((o) => o.status !== "doublon")
      .map((o) => offerToDetectedOffer(o));

    /* Affichage immédiat : le dernier catalogue connu s'affiche pendant que le
       serveur répond, au lieu d'une page vide qui ressemble à un compte vide. */
    const cachedOffers = readCatalogCache(user.email);
    if (cachedOffers.length) {
      const quick = mergeOffers([cachedOffers, local.offers, localGmail]);
      if (quick.length) {
        setData({ ...local, offers: quick });
        setLoadState({
          loading: false,
          error: null,
          note: "Catalogue de cet appareil affiché — mise à jour avec le serveur en cours.",
          snapshotCount: cachedOffers.length,
        });
      }
    }

    let remoteOffers: DetectedOffer[] = [];
    let remoteData: UserData | null = null;
    let remoteApplications: Application[] | null = null;
    if (previousCatalogs.current.email !== user.email) previousCatalogs.current = { email: user.email, snapshot: [], discovery: [] };
    let snapshotOffers = previousCatalogs.current.snapshot;
    let discoveryOffers = previousCatalogs.current.discovery;
    let snapshotCount: number | null = null;
    const notes: string[] = [];

    // 1 — Dossier serveur (offres manuelles/sélectionnées + candidatures).
    try {
      const res = await requests[0];
      const json = res.json as {
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
      const res = await requests[1];
      const json = res.json as {
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
      const res = await requests[2];
      const json = res.json as { ok?: boolean; offers?: DetectedOffer[] };
      if (res.ok && json.ok && Array.isArray(json.offers)) {
        discoveryOffers = json.offers;
      } else notes.push("Registre des stages découverts indisponible.");
    } catch { notes.push("Registre des stages découverts indisponible."); }

    // Fusion : dossier serveur → offres publiques → Gmail → appareil.
    if (revision !== loadRevision.current) return;
    previousCatalogs.current = { email: user.email, snapshot: snapshotOffers, discovery: discoveryOffers };
    const merged = mergeOffers([remoteOffers, discoveryOffers, snapshotOffers, local.offers, localGmail]);
    const applications = remoteApplications
      ? [
          ...remoteApplications,
          ...local.applications.filter((a) => !remoteApplications!.some((r) => r.id === a.id)),
        ]
      : local.applications;
    const effective: UserData = { ...(remoteData || local), offers: merged, applications };
    /* Texte du CV maître sérialisé une seule fois pour tout le catalogue. */
    const masterCvText = cvMasterText(effective);
    const scored: DetectedOffer[] = [];
    for (let i = 0; i < merged.length; i++) {
      if (i % 25 === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        if (revision !== loadRevision.current) return;
      }
      const offer = merged[i];
      scored.push({ ...offer, cvCoverage: offerCvCoverage(offer, effective, masterCvText) });
    }
    effective.offers = scored;
    setData(effective);
    writeCatalogCache(user.email, merged);

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
    const cvText = masterCvText;
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
      loadRevision.current += 1;
    };
  }, [loadOffers]);

  // Une confirmation d'envoi dans un autre onglet doit retirer l'offre au retour.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = (event: Event) => {
      if (document.visibilityState === "hidden") return;
      if ((event.type === "focus" || event.type === "visibilitychange") && Date.now() - lastRefresh.current < 30_000) return;
      clearTimeout(timer);
      timer = setTimeout(() => { void loadOffers(); }, 250);
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("cible:data-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("cible:data-changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
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
        /* Même protocole que le tableau « Alertes Gmail » : corps JSON explicite
           et attente du verrou (409) — sans corps, le serveur répondait 400. */
        const res = await postGmailSyncLocked(user.email, "sync");
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
    const ids = filteredOffers.map((offer) => offer.id);
    setSelectedIds(previous => {
      const next = new Set(previous);
      const allInFilter = ids.every(id => next.has(id));
      ids.forEach(id => allInFilter ? next.delete(id) : next.add(id));
      return next;
    });
  };

  /* ── Enregistre les vraies offres (texte complet) pour l'adaptation CV ──
     Une seule écriture pour plusieurs offres : en mode Rafale, l'offre courante
     ET la suivante sont enregistrées, sinon Mon CV ne connaîtrait pas la suite. */
  const handleSelectOffers = (ids: string[]) => {
    if (!user || demoMode) return;
    const local = getOrCreateData(user.name, user.email);
    const present = new Set(local.offers.flatMap((offer) => offerKeys(offer)));
    const additions: DetectedOffer[] = [];
    for (const id of ids) {
      const found = realOffersById.get(id);
      if (!found) continue;
      const keys = offerKeys(found);
      if (keys.some((key) => present.has(key))) continue;
      for (const key of keys) present.add(key);
      additions.push(found);
    }
    if (!additions.length) return;
    const next = { ...local, offers: [...additions, ...local.offers] };
    saveData(user.email, next);
    pushToServer(next);
  };

  const handleSelectOffer = (id: string) => handleSelectOffers([id]);

  const launchRafale = async (ids: string[]) => {
    if (!user || demoMode || !ids.length) return;
    const offers = ids.flatMap(id => realOffersById.get(id) || []);
    if (!offers.length) return;
    writeRafaleQueue(offers.map(offer => offer.id));
    writeRafaleOffers(offers);
    try {
      const response = await fetch("/api/offres/rafale", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer: offers[0] }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Offre non enregistrée.");
      handleSelectOffers([offers[0].id]);
      router.push(`/app/cv?offer=${encodeURIComponent(offers[0].id)}&start=1&rafale=1&returnTo=${encodeURIComponent("/app/offres?rafale=1#rafale-session")}`);
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : "La session Rafale n'a pas démarré.");
    }
  };

  /* ── Marquage « postulé » : enregistre une vraie candidature, sans inventaire ── */
  const handleMarkApplied = async (ids: string[]) => {
    if (!user || demoMode || applicationSaveLock.current) return;
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
        offerSnapshot: offerSnapshot(offer),
        notes: "Marqué comme postulé depuis Mes offres ; aucun CV n'est encore archivé pour cette candidature.",
      });
    }
    if (!additions.length) {
      setSyncNotice("Ces candidatures sont déjà enregistrées.");
      return;
    }
    const next = { ...local, applications: [...additions, ...local.applications] };
    applicationSaveLock.current = true;
    setSavingApplication(true);
    const saved = await pushToServer(next);
    applicationSaveLock.current = false;
    setSavingApplication(false);
    if (!saved) {
      setSyncNotice("Enregistrement impossible. L’offre reste affichée : réessaie pour confirmer ta candidature.");
      return;
    }
    try { saveData(user.email, next); } catch { /* Confirmed on server. */ }
    setData(current => current ? mergeUserData(current, next) : next);
    setSelectedIds(new Set());
    await loadOffers();
    setSyncNotice(
      rafaleMode
        ? `${additions.length} candidature${additions.length > 1 ? "s" : ""} enregistrée${additions.length > 1 ? "s" : ""}. L'offre suivante du même filtre est prête — tu peux enchaîner.`
        : `${additions.length} candidature${additions.length > 1 ? "s" : ""} enregistrée${additions.length > 1 ? "s" : ""}.`
    );
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
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; text?: string; error?: string; draft?: DetectedOffer };
      if (res.ok && json.ok && typeof json.text === "string" && json.text.trim().length > 50) {
        setPastedText(json.text.slice(0, 30_000));
        setPastedTitle(json.draft?.title || "");
        setPastedCompany(json.draft?.company || "");
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

  const realOffersById = useMemo(() => {
    const map = new Map<string, DetectedOffer>();
    for (const offer of data?.offers || []) map.set(offer.id, offer);
    return map;
  }, [data]);

  const appliedOfferIds = useMemo(
    () => data ? getAppliedOfferIds(data) : new Set<string>(),
    [data]
  );

  /* Une ligne par offre, calculée une seule fois par chargement : changer de
     filtre ne recalcule plus le rapport carrière de chaque offre. */
  const offerRows = useMemo(() => {
    if (demoMode) return demoRows.map((row) => ({ row, offer: null as DetectedOffer | null }));
    if (!data) return [];
    return data.offers.filter(offer => !isOfferDismissed(offer, data.dismissedOfferIds)).map((offer) => ({
      offer,
      row: toTableRow(offer, appliedOfferIds.has(offer.id), currentCareerReport(offer, data)),
    }));
  }, [demoMode, demoRows, data, appliedOfferIds]);

  const baseRows = useMemo<DemoTableOffer[]>(() => {
    if (demoMode) return offerRows.map((item) => item.row);
    return offerRows.filter((item) => item.offer && matchesOfferFilters(item.offer, sideFilters)).map((item) => item.row);
  }, [demoMode, offerRows, sideFilters]);

  const tabCounts = useMemo<OffersTabCounts | undefined>(() => {
    if (demoMode) return undefined;
    const favoritesCount = baseRows.filter((r) => r.status !== "postulee" && favorites.has(r.id)).length;
    return {
      all: baseRows.filter((r) => r.status !== "postulee").length,
      new: baseRows.filter((r) => r.status === "nouvelle").length,
      todo: baseRows.filter((r) => r.status === "a_traiter").length,
      applied: baseRows.filter((r) => r.status === "postulee").length,
      favorites: favoritesCount,
      expired: baseRows.filter((r) => r.status === "expiree").length,
    };
  }, [demoMode, baseRows, favorites]);

  const filteredOffers = useMemo(() => {
    return baseRows.filter((offer) => {
      // Tab filter
      if (!visibleInOfferTab(offer.status, activeTab)) return false;
      if (activeTab === "favorites" && !favorites.has(offer.id)) return false;
      if (activeTab === "new" && offer.status !== "nouvelle") return false;
      if (activeTab === "todo" && offer.status !== "a_traiter") return false;
      if (activeTab === "applied" && offer.status !== "postulee") return false;
      if (activeTab === "expired" && offer.status !== "expiree") return false;

      // Search query filter
      if (deferredSearch.trim()) {
        const q = deferredSearch.toLowerCase();
        const matches =
          offer.title.toLowerCase().includes(q) ||
          offer.company.toLowerCase().includes(q) ||
          offer.location.toLowerCase().includes(q) ||
          offer.tags.some((t) => t.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // Company filter from sidebar
      if (deferredCompany.trim()) {
        if (!offer.company.toLowerCase().includes(deferredCompany.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [baseRows, activeTab, favorites, deferredSearch, deferredCompany]);

  /* Offre proposée par le mode Rafale : la première du filtre encore ouverte. */
  const rafaleRows = useMemo(
    () => (rafaleMode
      ? filteredOffers.filter((row) => !rafaleSkipped.has(row.id) && row.status !== "postulee" && row.status !== "expiree")
      : []),
    [rafaleMode, filteredOffers, rafaleSkipped]
  );
  const rafaleCurrent = rafaleRows[0];

  /* ── Statistiques réelles (compte du dossier, indépendant des filtres) ── */
  const realTotal = demoMode ? DEMO_USER_PROFILE.stats.totalOffers : data?.offers.filter(offer => !isOfferDismissed(offer, data.dismissedOfferIds)).length ?? 0;
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
          <button
            type="button"
            onClick={() => {
              if (rafaleMode) { setRafaleMode(false); return; }
              setRafaleMode(true);
              setRafaleSkipped(new Set());
              const candidates = filteredOffers.filter(row => row.status !== "postulee" && row.status !== "expiree");
              const chosen = selectedIds.size ? candidates.filter(row => selectedIds.has(row.id)) : candidates;
              if (chosen.length && !demoMode) void launchRafale(chosen.map(row => row.id));
            }}
            aria-pressed={rafaleMode}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-2 transition-all shadow-2xs text-left cursor-pointer border ${rafaleMode
              ? "bg-gradient-to-r from-indigo-600 to-purple-600 border-indigo-500 text-white"
              : "bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100/80 hover:to-purple-100/80 border-indigo-100/80"}`}
          >
            <div className={`w-7 h-7 rounded-lg text-white flex items-center justify-center shrink-0 shadow-xs ${rafaleMode ? "bg-white/20" : "bg-gradient-to-br from-indigo-500 to-purple-600"}`}>
              <Zap size={14} className="fill-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className={`text-xs font-bold ${rafaleMode ? "text-white" : "text-slate-900"}`}>
                  {rafaleMode ? "Quitter le mode Rafale" : "Mode Rafale ⚡"}
                </span>
              </div>
              <span className={`text-[10px] ${rafaleMode ? "text-indigo-100" : "text-slate-500"}`}>
                {rafaleMode
                  ? "Candidatures enchaînées avec le même filtre."
                  : "Postule offre après offre sans perdre tes filtres. →"}
              </span>
            </div>
          </button>
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
            <div className="md:col-span-2 lg:col-span-4 xl:col-span-1 flex flex-col gap-3.5">
              <ManualOfferCard onAnalyzeUrl={handleAnalyzeUrl} onPasteTextClick={() => { setPastedNotice(null); setPasteModalOpen(true); }} analyzeSuccessMessage="Annonce récupérée dans le formulaire — complète puis enregistre." />
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
            <div className="md:col-span-2 lg:col-span-4 xl:col-span-1 flex flex-col gap-3.5">
              <ManualOfferCard onAnalyzeUrl={handleAnalyzeUrl} onPasteTextClick={() => { setPastedNotice(null); setPasteModalOpen(true); }} analyzeSuccessMessage="Annonce récupérée dans le formulaire — complète puis enregistre." />
              <AssistantAiCard priorityCount={recommendationPriorities} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
          <div className="px-4 py-6 rounded-2xl border border-slate-200/90 bg-white text-xs text-slate-500">
            {loadState.loading
              ? "Calcul de vos recommandations…"
              : "Aucune recommandation calculée pour le moment : synchronise Gmail pour importer tes offres, puis complète ton CV principal pour affiner la sélection."}
          </div>
          <ManualOfferCard onAnalyzeUrl={handleAnalyzeUrl} onPasteTextClick={() => { setPastedNotice(null); setPasteModalOpen(true); }} analyzeSuccessMessage="Annonce récupérée dans le formulaire — complète puis enregistre." />
          </div>
        )}
      </section>

      {/* ── Section 2: Toutes mes offres + Filtres Sidebar ── */}
      <section className="grid grid-cols-1 lg:grid-cols-4 xl:grid-cols-4 gap-4 items-start">
        {/* Main table column (~75%) */}
        <div className="lg:col-span-3">
          {/* Mode Rafale : l'offre à traiter maintenant, dans le filtre courant */}
          {rafaleMode && (
            <div id="rafale-session" className="scroll-mt-20 mb-4 rounded-2xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/90 to-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                    <Zap size={13} className="fill-indigo-600 text-indigo-600" />
                    Mode Rafale · {rafaleRows.length} offre{rafaleRows.length > 1 ? "s" : ""} restante{rafaleRows.length > 1 ? "s" : ""} avec ces filtres
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Après chaque candidature, l&apos;offre suivante du même filtre est proposée. Les filtres restent actifs tant que tu ne les réinitialises pas.
                  </p>
                </div>
                <a href="#offer-filters" className="text-[11px] font-semibold text-indigo-700 hover:underline">
                  Gérer mes filtres ↓
                </a>
              </div>

              {rafaleCurrent ? (
                <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500">{rafaleCurrent.company}</p>
                    <h4 className="text-sm font-bold text-slate-900 leading-snug">{rafaleCurrent.title}</h4>
                    <p className="text-[11px] text-slate-500">
                      {rafaleCurrent.location} · {rafaleCurrent.date}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {rafaleCurrent.url && (
                      <a
                        href={rafaleCurrent.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"
                      >
                        <ExternalLink size={12} />
                        Ouvrir l&apos;offre et postuler
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void launchRafale(rafaleRows.map(row => row.id))}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700"
                    >
                      <FileText size={12} />
                      Adapter mon CV
                    </button>
                    <button
                      type="button"
                      disabled={savingApplication}
                      onClick={() => void handleMarkApplied([rafaleCurrent.id])}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                    >
                      <Star size={12} />
                      {savingApplication ? "Enregistrement…" : "J’ai postulé → offre suivante"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRafaleSkipped((prev) => new Set(prev).add(rafaleCurrent.id))}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      <SkipForward size={12} />
                      Passer
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-indigo-200 bg-white px-3 py-4 text-[11px] text-slate-500">
                  Aucune offre restante avec ces filtres. Modifie ou réinitialise les filtres pour continuer.
                </p>
              )}
            </div>
          )}

          <OffersTable
            offers={filteredOffers}
            totalOffersCount={realTotal}
            tabCounts={tabCounts}
            showDelete={true}
            onDeleteOffer={id => { void removeOffers([id]); }}
            selectedIds={selectedIds}
            favorites={favorites}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onToggleFavorite={handleToggleFavorite}
            onSelectOffer={handleSelectOffer}
            onBulkEnqueue={() => {
              const queue = filteredOffers.map(row => row.id).filter(id => selectedIds.has(id) && realOffersById.has(id));
              if (!queue.length) { setSyncNotice("Sélectionne au moins une offre disponible dans ce filtre."); return; }
              void launchRafale(queue);
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
            onBulkDelete={() => { void removeOffers([...selectedIds]); }}
          />
        </div>

        {/* Right filter sidebar (~25%) — filtres réels */}
        <div id="offer-filters" className="lg:col-span-1 scroll-mt-20">
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
          hideManual
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
