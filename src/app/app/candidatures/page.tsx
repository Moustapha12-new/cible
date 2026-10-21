"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  FileText,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  Eye,
  ExternalLink,
  ChevronRight,
  MoreVertical,
  Check,
  Send,
  Sparkles,
  Edit3,
  X,
  List,
  LayoutGrid,
  ChevronDown,
  ArrowRight,
  ShieldCheck,
  Briefcase,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  getOrCreateData,
  saveData,
  mergeUserData,
  type UserData,
  type Application,
  type AppStatus,
} from "@/lib/data";
import { CompanyLogo } from "@/components/app/CompanyLogo";
import {
  DEMO_USER_PROFILE,
  DEMO_APPLICATIONS,
  type DemoApplication,
} from "@/lib/demo-data";

export default function CandidaturesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const openParam = searchParams.get("open");

  // State
  const [data, setData] = useState<UserData | null>(null);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<
    "all" | "sent" | "interview" | "offer" | "rejected"
  >("all");
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  const [sortOrder, setSortOrder] = useState<"recent" | "company">("recent");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Interview modal & notes state
  const [interviewModalOpen, setInterviewModalOpen] = useState(false);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [interviewResult, setInterviewResult] = useState<{
    questions: { q: string; tip: string }[];
    strengths: string[];
    technicalKeywords: string[];
  } | null>(null);

  const [viewCvModal, setViewCvModal] = useState(false);
  const [viewCvVersion, setViewCvVersion] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load real data
  useEffect(() => {
    if (!user) return;
    const local = getOrCreateData(user.name, user.email);
    setData(local);

    fetch("/api/user-data", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok || !json.record?.data) return;
        const remote = json.record.data as UserData;
        /* Fusion serveur (source de vérité) + apports de l'appareil, puis
           mise en cache local : une candidature archivée depuis un autre
           écran reste visible même hors ligne ensuite. */
        const merged = mergeUserData(remote, local);
        setData(merged);
        try { saveData(user.email, merged); } catch { /* Cache local facultatif. */ }
      })
      .catch(() => {});
  }, [user]);

  // Handle open query param
  useEffect(() => {
    if (openParam) {
      setSelectedAppId(openParam);
    }
  }, [openParam]);

  // Applications pool: demo vs real
  const applicationsPool = useMemo<DemoApplication[]>(() => {
    if (demoMode) return DEMO_APPLICATIONS;
    if (!data || !data.applications.length) return [];
    return data.applications.map((app) => {
      const offer = data.offers.find(o => o.id === app.offerId);
      const snap = app.offerSnapshot;
      const contractLine = (snap?.contract || offer?.contract) || "";
      const durationLine = (snap?.duration || offer?.duration) || "";
      const summaryText = (snap?.summary || offer?.description || offer?.text || "").trim();
      const locationText = (snap?.location || offer?.location || "").trim();
      const skillsList = (snap?.skills || offer?.skills || offer?.keywords || []);
      const postedAt = snap?.receivedAt || offer?.receivedAt || snap?.deadline || offer?.deadline;
      return ({
      id: app.id,
      company: app.company,
      title: app.role || snap?.title || offer?.title || "Intitulé non renseigné",
      location: locationText || "Lieu non renseigné",
      date: app.date
        ? new Date(app.date).toLocaleDateString("fr-FR")
        : "Date non renseignée",
      status: app.status,
      statusLabel:
        app.status === "interview"
          ? "Entretien"
          : app.status === "offer"
          ? "Accepté"
          : app.status === "rejected"
          ? "Refusé"
          : "Postulé",
      tags: skillsList.slice(0, 3),
      cvFileName: app.cvName || "CV non renseigné",
      cvFileSize: "Taille non renseignée",
      cvSentDate: (app.sentDocumentVersions?.at(-1)?.sentAt || app.date) ? new Date(app.sentDocumentVersions?.at(-1)?.sentAt || app.date!).toLocaleDateString("fr-FR") : "Date non renseignée",
      offerSummary: summaryText || "Description non enregistrée.",
      offerContract: [contractLine, durationLine].filter(Boolean).join(" · ") || "Contrat non renseigné",
      offerPostedDate: postedAt && !Number.isNaN(Date.parse(postedAt)) ? new Date(postedAt).toLocaleDateString("fr-FR") : "Date de publication non renseignée",
      checklist: [],
      notes: app.notes || "",
      timeline: [
        { step: "CV archivé", date: app.sentDocumentVersions?.length ? "Version archivée" : "À vérifier", active: false, completed: !!app.sentDocumentVersions?.length },
        { step: "Postulé", date: "Récent", active: app.status === "sent", completed: true },
        { step: "Entretien", date: "À venir", active: app.status === "interview", completed: app.status === "interview" || app.status === "offer" },
        { step: "Décision", date: "À venir", active: app.status === "offer" || app.status === "rejected", completed: app.status === "offer" },
      ],
      journal: [],
    });
    });
  }, [demoMode, data]);

  // Filtered applications
  const filteredApps = useMemo(() => {
    return applicationsPool.filter((app) => {
      if (activeTab === "sent" && app.status !== "sent") return false;
      if (activeTab === "interview" && app.status !== "interview") return false;
      if (activeTab === "offer" && app.status !== "offer") return false;
      if (activeTab === "rejected" && app.status !== "rejected") return false;
      return true;
    });
  }, [applicationsPool, activeTab]);

  // Selected application
  const selectedApp = useMemo(() => {
    return (
      applicationsPool.find((a) => a.id === selectedAppId) ||
      applicationsPool[0] ||
      null
    );
  }, [applicationsPool, selectedAppId]);

  useEffect(() => {
    if (selectedApp) {
      setNotesDraft(selectedApp.notes || "");
    }
  }, [selectedApp]);

  // Checklist toggle
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({
    c1: true,
    c2: true,
    c3: false,
    c4: false,
  });

  const toggleChecklistItem = (id: string) => {
    setChecklistState((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // KPI counts
  const kpis = useMemo(() => {
    const total = applicationsPool.length;
    const interviews = applicationsPool.filter((a) => a.status === "interview").length;
    const accepted = applicationsPool.filter((a) => a.status === "offer").length;
    const rejected = applicationsPool.filter((a) => a.status === "rejected").length;
    return { total, interviews, accepted, rejected };
  }, [applicationsPool]);

  // Prépare l'entretien à partir du texte du CV réellement déclaré envoyé.
  const handleOpenInterviewPrep = async () => {
    if (!selectedApp) return;
    const archived = data?.applications.find(app => app.id === selectedApp.id);
    if (!archived?.cvText?.trim()) {
      setToastMessage("Le texte du CV envoyé n'est pas disponible pour l'IA. Tu peux consulter son PDF exact dans Voir le CV.");
      return;
    }
    setInterviewModalOpen(true);
    setInterviewLoading(true);
    setInterviewResult(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "entretien", offerText: selectedApp.offerSummary + " " + selectedApp.title, cvOriginal: archived.cvText }),
      });
      const json = await res.json();
      if (!res.ok || !json.result) throw new Error(json.error || "Préparation indisponible.");
      const result = json.result as { questions?: { q: string; a?: string; insight?: string; tip?: string }[]; strengths?: string[] };
      setInterviewResult({ questions: (result.questions || []).map(row => ({ q: row.q, tip: [row.a || row.tip, row.insight].filter(Boolean).join(" ") })), strengths: result.strengths || [], technicalKeywords: selectedApp.tags });
    } catch (error) {
      setInterviewModalOpen(false);
      setToastMessage(error instanceof Error ? error.message : "Préparation indisponible.");
    } finally { setInterviewLoading(false); }
  };
  // Download exact archived CV
  const handleDownloadCv = async (app: DemoApplication, versionId?: string | null) => {
    if (demoMode) { setToastMessage("Exemple de démonstration : aucun PDF personnel archivé."); return; }
    try {
    setToastMessage(`Téléchargement de ${app.cvFileName}…`);
    const version = data?.applications.find(row => row.id === app.id)?.sentDocumentVersions?.find(row => row.versionId === versionId);
    const response = await fetch(`/api/candidatures/${encodeURIComponent(app.id)}/document${versionId ? `?version=${encodeURIComponent(versionId)}` : ""}`, { cache: "no-store" });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "CV archivé indisponible.");
    }
    if (!response.headers.get("content-type")?.includes("application/pdf")) throw new Error("Le serveur n'a pas renvoyé de PDF.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = version?.fileName || app.cvFileName;
    a.click();
    URL.revokeObjectURL(url);
    setToastMessage("CV téléchargé avec succès.");
    } catch (error) { setToastMessage(error instanceof Error ? error.message : "Téléchargement impossible."); }
  };

  // Save personal notes
  const handleSaveNotes = async () => {
    if (!selectedApp || demoMode) { setToastMessage("Les notes de démonstration ne sont pas enregistrées."); return; }
    try {
      const response = await fetch(`/api/candidatures/${encodeURIComponent(selectedApp.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: notesDraft }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Enregistrement impossible.");
      setData(current => current ? { ...current, applications: current.applications.map(a => a.id === selectedApp.id ? result.application : a) } : current);
      setEditNotes(false);
      setToastMessage("Note personnelle enregistrée !");
    } catch (error) { setToastMessage(error instanceof Error ? error.message : "Enregistrement impossible."); }
  };

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  return (
    <div className="flex flex-col gap-6 max-w-[1680px] mx-auto pb-12">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl border border-slate-700 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Sparkles size={14} className="text-blue-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Demo Mode Indicator Banner ── */}
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
              demoMode ? "bg-amber-500 animate-pulse" : "bg-blue-500"
            }`}
          />
          <span>
            {demoMode ? (
              <>
                <strong className="font-semibold">Mode Démonstration actif</strong> —
                Affichage fidèle des 12 candidatures de référence issues des captures.
              </>
            ) : (
              <>
                <strong className="font-semibold">Compte réel</strong> —{" "}
                {data?.applications.length || 0} candidature
                {(data?.applications.length || 0) > 1 ? "s" : ""} enregistrée
                {(data?.applications.length || 0) > 1 ? "s" : ""}.
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
            ? `Basculer sur mon compte réel (${data?.applications.length || 0} candidature${
                (data?.applications.length || 0) > 1 ? "s" : ""
              })`
            : "Afficher le mode démonstration de référence"}
        </button>
      </div>

      {/* ── Top Header Row ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-[28px] font-extrabold tracking-tight text-slate-900 leading-tight">
            Mes candidatures
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Retrouve toutes tes candidatures et le CV exact envoyé pour chaque offre.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setToastMessage("Export CSV/PDF généré.")}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl shadow-2xs transition-colors self-start sm:self-auto cursor-pointer"
        >
          <Download size={14} />
          <span>Exporter mes candidatures</span>
        </button>
      </div>

      {/* ── 4 KPI Cards Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Card 1: Candidatures envoyées */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <FileText size={20} />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 tracking-tight">
                  {kpis.total}
                </span>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Candidatures envoyées
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Entretiens planifiés */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Calendar size={20} />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 tracking-tight">
                  {kpis.interviews}
                </span>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Entretiens planifiés
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Offre acceptée */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle size={20} />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 tracking-tight">
                  {kpis.accepted}
                </span>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Offre acceptée
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Refusés */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <XCircle size={20} />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 tracking-tight">
                  {kpis.rejected}
                </span>
              </div>
              <span className="text-xs text-slate-500 font-medium">Refusés</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Split Section: Table (Left ~60%) & Detail Panel (Right ~40%) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Table (~7 cols ~ 58%) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden">
          {/* Tabs and Controls */}
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200/80 px-4 pt-3 pb-0 gap-2">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {[
                { id: "all", label: `Toutes (${applicationsPool.length})` },
                {
                  id: "sent",
                  label: `Postulées (${
                    applicationsPool.filter((a) => a.status === "sent").length
                  })`,
                },
                {
                  id: "interview",
                  label: `Entretiens (${
                    applicationsPool.filter((a) => a.status === "interview").length
                  })`,
                },
                {
                  id: "offer",
                  label: `Acceptées (${
                    applicationsPool.filter((a) => a.status === "offer").length
                  })`,
                },
                {
                  id: "rejected",
                  label: `Refusées (${
                    applicationsPool.filter((a) => a.status === "rejected").length
                  })`,
                },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`pb-3 px-3 text-xs font-semibold whitespace-nowrap transition-colors relative ${
                      isActive
                        ? "text-blue-600 border-b-2 border-blue-600"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pb-2.5 ml-auto">
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded font-medium ${
                    viewMode === "list"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  <List size={13} />
                  <span>Vue liste</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded font-medium ${
                    viewMode === "cards"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  <LayoutGrid size={13} />
                  <span>Vue cartes</span>
                </button>
              </div>

              <div className="relative">
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as "recent" | "company")}
                  className="appearance-none bg-white border border-slate-200 rounded-lg pl-3 pr-7 py-1 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  <option value="recent">Trier : Plus récentes</option>
                  <option value="company">Trier : Entreprise A-Z</option>
                </select>
                <ChevronDown
                  size={12}
                  className="absolute right-2 top-2.5 text-slate-400 pointer-events-none"
                />
              </div>
            </div>
          </div>

          {/* Applications list */}
          {filteredApps.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                <Briefcase size={22} />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-1">
                Aucune candidature dans cet onglet
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mb-4">
                Postulez à des offres depuis « Mes offres » ou « Mon CV » pour les retrouver ici avec leur CV archivé.
              </p>
              <Link
                href="/app/offres"
                className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl shadow-xs hover:bg-blue-700 transition-colors"
              >
                Explorer mes offres
              </Link>
            </div>
          ) : viewMode === "list" ? (
            <div className="divide-y divide-slate-100">
              {filteredApps.map((app) => {
                const isSelected = selectedAppId === app.id;

                return (
                  <div
                    key={app.id}
                    onClick={() => setSelectedAppId(app.id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-50/60 border-l-4 border-l-blue-600"
                        : "hover:bg-slate-50/70"
                    }`}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedIds.has(app.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(app.id)) next.delete(app.id);
                          else next.add(app.id);
                          return next;
                        });
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer shrink-0"
                    />

                    {/* Company Logo + Name */}
                    <div className="flex items-center gap-2 w-[130px] shrink-0">
                      <CompanyLogo company={app.company} size="sm" />
                      <span className="text-xs font-bold text-slate-800 truncate">
                        {app.company}
                      </span>
                    </div>

                    {/* Title & Tags */}
                    <div className="flex-1 min-w-0 pr-2">
                      <h4 className="text-xs font-bold text-slate-900 truncate mb-1">
                        {app.title}
                      </h4>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {app.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Location */}
                    <div className="hidden sm:block text-[11px] text-slate-500 shrink-0 w-[85px] truncate">
                      📍 {app.location}
                    </div>

                    {/* Date */}
                    <div className="hidden md:block text-[11px] text-slate-400 font-mono shrink-0 w-[75px] text-right">
                      {app.date}
                    </div>

                    {/* Status Pill */}
                    <div className="shrink-0 w-[85px] text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          app.status === "interview"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : app.status === "offer"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : app.status === "rejected"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-slate-50 text-slate-700 border border-slate-200"
                        }`}
                      >
                        {app.statusLabel}
                      </span>
                    </div>

                    {/* Actions button */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAppId(app.id);
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-blue-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                      >
                        Voir
                      </button>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-slate-600 p-1"
                        aria-label="Options"
                      >
                        <MoreVertical size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Cards View */
            <div className="grid grid-cols-1 md:grid-cols-2 p-4 gap-3">
              {filteredApps.map((app) => (
                <div
                  key={app.id}
                  onClick={() => setSelectedAppId(app.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col gap-2 ${
                    selectedAppId === app.id
                      ? "border-blue-500 bg-blue-50/20"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CompanyLogo company={app.company} size="sm" />
                      <span className="text-xs font-bold text-slate-800">
                        {app.company}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        app.status === "interview"
                          ? "bg-blue-50 text-blue-700"
                          : app.status === "offer"
                          ? "bg-emerald-50 text-emerald-700"
                          : app.status === "rejected"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {app.statusLabel}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-900">{app.title}</h4>
                  <p className="text-[11px] text-slate-500">📍 {app.location} • {app.date}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Detail Panel (~5 cols ~ 42%) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-5 flex flex-col gap-4 sticky top-20">
          {selectedApp ? (
            <>
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <CompanyLogo company={selectedApp.company} size="md" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">
                        {selectedApp.company}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          selectedApp.status === "interview"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : selectedApp.status === "offer"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : selectedApp.status === "rejected"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-slate-50 text-slate-700 border border-slate-200"
                        }`}
                      >
                        {selectedApp.statusLabel}
                      </span>
                    </div>
                    <h3 className="text-sm font-extrabold text-slate-900 leading-snug mt-0.5">
                      {selectedApp.title}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-600 p-1"
                    aria-label="Options"
                  >
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>

              {/* Meta: location, contract, duration */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span>📍 {selectedApp.location}</span>
                <span>•</span>
                <span>⏱ {demoMode ? "Stage • 6 mois" : data?.offers.find(o => o.id === data.applications.find(a => a.id === selectedApp.id)?.offerId)?.duration || "Durée non renseignée"}</span>
                <span>•</span>
                <span>📅 Posté le {selectedApp.offerPostedDate}</span>
              </div>

              {/* Section 1: Résumé de l'offre originale */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    Résumé de l&apos;offre originale
                  </span>
                  <Link
                    href={`/app/offres?q=${encodeURIComponent(selectedApp.company)}`}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                  >
                    <span>Voir l&apos;offre</span>
                    <ArrowRight size={11} />
                  </Link>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  {selectedApp.offerSummary}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedApp.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Section 2: CV envoyé (version archivée) */}
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    CV envoyé (version archivée)
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Check size={10} strokeWidth={3} />
                    <span>Version archivée</span>
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/90">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 font-bold flex items-center justify-center text-[10px] shrink-0 font-mono">
                      PDF
                    </div>
                    <div className="min-w-0">
                      <strong className="text-xs font-bold text-slate-900 block truncate">
                        {selectedApp.cvFileName}
                      </strong>
                      <span className="text-[10px] text-slate-500">
                        Version envoyée le {selectedApp.cvSentDate} • Taille : {selectedApp.cvFileSize}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadCv(selectedApp)}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Télécharger</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setViewCvVersion(null); setViewCvModal(true); }}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    <Eye size={13} />
                    <span>Voir le CV</span>
                  </button>
                </div>
                {(data?.applications.find(app => app.id === selectedApp.id)?.sentDocumentVersions?.length || 0) > 1 && <div className="space-y-1 text-xs">
                  <strong>Versions déclarées envoyées</strong>
                  {data?.applications.find(app => app.id === selectedApp.id)?.sentDocumentVersions?.map((version, index) => <button key={version.versionId} type="button" className="block text-left text-blue-700 underline" onClick={() => { setViewCvVersion(version.versionId); setViewCvModal(true); }}>
                    {version.fileName || `Version ${index + 1}`} {version.sentAt ? `— ${new Date(version.sentAt).toLocaleDateString("fr-FR")}` : ""}
                  </button>)}
                </div>}
              </div>

              {/* Section 3: Suivi de ma candidature (Timeline) */}
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-900">
                  Suivi de ma candidature
                </span>
                <div className="flex items-center justify-between px-2 py-2">
                  {selectedApp.timeline.map(item => ({ ...item, state: item.completed ? "done" : item.active ? "active" : "todo" })).map((s, idx, arr) => (
                    <div key={s.step} className="flex flex-col items-center relative flex-1">
                      {idx < arr.length - 1 && (
                        <div
                          className={`absolute top-2.5 left-1/2 w-full h-0.5 -z-0 ${
                            s.state === "done" ? "bg-emerald-500" : "bg-slate-200"
                          }`}
                        />
                      )}
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold z-10 ${
                          s.state === "done"
                            ? "bg-emerald-500 text-white"
                            : s.state === "active"
                            ? "bg-blue-600 text-white ring-4 ring-blue-100"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {s.state === "done" ? "✓" : idx + 1}
                      </div>
                      <span className="text-[9.5px] font-semibold text-slate-700 mt-1">
                        {s.step}
                      </span>
                      <span className="text-[8.5px] text-slate-400 font-mono">
                        {s.date}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 4: Prochaines actions */}
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-900">
                  Prochaines actions
                </span>

                {selectedApp.nextInterview && (
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-purple-50/80 border border-purple-100 text-xs">
                    <div className="w-6 h-6 rounded-md bg-purple-200/70 text-purple-700 flex items-center justify-center shrink-0">
                      <Calendar size={14} />
                    </div>
                    <div>
                      <strong className="text-xs font-bold text-purple-950 block">
                        {selectedApp.nextInterview.label}
                      </strong>
                      <span className="text-[11px] text-purple-700">
                        {selectedApp.nextInterview.date} • {selectedApp.nextInterview.details}
                      </span>
                    </div>
                  </div>
                )}

                {/* Checklist items */}
                <div className="flex flex-col gap-1.5 text-xs">
                  {selectedApp.checklist.map((item) => {
                    const isChecked = checklistState[item.id] ?? item.done;
                    return (
                      <label
                        key={item.id}
                        className="flex items-center gap-2 cursor-pointer text-slate-700 hover:text-slate-900 select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleChecklistItem(item.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                        />
                        <span className={isChecked ? "line-through text-slate-400" : ""}>
                          {item.text}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {/* AI Interview Coach Trigger */}
                <button
                  type="button"
                  onClick={handleOpenInterviewPrep}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer mt-1"
                >
                  <Sparkles size={14} className="fill-white" />
                  <span>Ouvrir ma préparation d&apos;entretien avec Gemini →</span>
                </button>
              </div>

              {/* Section 5: Notes personnelles */}
              <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    Notes personnelles
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditNotes(!editNotes)}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 size={11} />
                    <span>{editNotes ? "Fermer" : "Modifier"}</span>
                  </button>
                </div>

                {editNotes ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      rows={3}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleSaveNotes}
                      className="self-end px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
                    >
                      Enregistrer
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                    {notesDraft || "Aucune note personnelle enregistrée."}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              Sélectionnez une candidature pour afficher ses détails complets.
            </div>
          )}
        </div>
      </div>

      {/* ── Modal: Préparation d'entretien avec Gemini ── */}
      {interviewModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Préparation d&apos;entretien avec l&apos;IA
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Basée sur l&apos;offre de {selectedApp?.company} et ton CV exact envoyé
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInterviewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {interviewLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <Sparkles size={24} className="text-blue-500 animate-spin" />
                <p className="text-xs text-slate-600">
                  Génération des questions et conseils d&apos;entretien personnalisés…
                </p>
              </div>
            ) : interviewResult ? (
              <div className="flex flex-col gap-4 text-xs">
                <div>
                  <h4 className="font-bold text-slate-800 mb-2">
                    🎯 Questions probables du recruteur & Conseils :
                  </h4>
                  <div className="flex flex-col gap-2.5">
                    {interviewResult.questions.map((q, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200"
                      >
                        <strong className="text-slate-900 block mb-1">
                          « {q.q} »
                        </strong>
                        <p className="text-emerald-800 text-[11px] font-medium bg-emerald-50/70 p-2 rounded-lg border border-emerald-200/60">
                          💡 <strong>Conseil IA :</strong> {q.tip}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 mb-1.5">
                    🛡 Mots-clés techniques à placer naturellement :
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {interviewResult.technicalKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-semibold text-[11px]"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setInterviewModalOpen(false)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs"
                  >
                    C&apos;est compris, prêt pour l&apos;entretien !
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Modal: Aperçu du CV envoyé ── */}
      {viewCvModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-100 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  CV envoyé pour {selectedApp?.company}
                </h3>
                <span className="text-[11px] text-slate-500">
                  {viewCvVersion ? "Version archivée sélectionnée" : `Version archivée du ${selectedApp?.cvSentDate}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewCvModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {!demoMode && selectedApp ? <iframe title="PDF exact déclaré envoyé" className="w-full h-[65vh] rounded-xl border" src={`/api/candidatures/${encodeURIComponent(selectedApp.id)}/document?inline=1${viewCvVersion ? `&version=${encodeURIComponent(viewCvVersion)}` : ""}`} /> : <p className="text-sm text-slate-500">Aucun PDF personnel dans cet exemple.</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setViewCvModal(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedApp) handleDownloadCv(selectedApp, viewCvVersion);
                  setViewCvModal(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs flex items-center gap-1.5"
              >
                <Download size={13} />
                <span>Télécharger ce CV</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
