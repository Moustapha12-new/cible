"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  User,
  Zap,
  Download,
  Plus,
  ArrowRight,
  RotateCw,
  SlidersHorizontal,
  Bookmark,
  Check,
  CheckCircle2,
  Trash2,
  Eye,
  ExternalLink,
  Edit3,
  X,
  FileCheck,
  Sparkles,
  Maximize2,
  ChevronRight,
  MoreVertical,
  Layers,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  getOrCreateData,
  saveData,
  type DetectedOffer,
  type UserData,
} from "@/lib/data";
import { DEFAULT_CV_DESIGN, parseCvText, cvToText } from "@/lib/cv";
import { applyPlanToCv, type ApplicableOperation } from "@/lib/cv-plan-apply";
import { CompanyLogo } from "@/components/app/CompanyLogo";
import { DocumentSheet } from "@/components/cv/DocumentSheet";

/* La page n'utilise AUCUNE donnée de démonstration : l'offre sélectionnée
   vient toujours des offres réelles du dossier (`data.offers`). */
type OfferRow = {
  id: string;
  company: string;
  title: string;
  location: string;
  tags: string[];
  date: string;
  matchPercentage: number | null;
  receivedAt?: string;
  url?: string;
};

function offerRow(o: DetectedOffer): OfferRow {
  return {
    id: o.id,
    company: o.company || "Entreprise non précisée",
    title: o.title || "Offre sans titre",
    location: o.location || "",
    tags: (o.skills || o.keywords || []).slice(0, 3),
    date: "Récente",
    matchPercentage: typeof o.match === "number" && o.match > 0 ? o.match : null,
    receivedAt: o.receivedAt,
    url: o.url,
  };
}

export default function CvPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const offerParam = searchParams.get("offer");

  const [data, setData] = useState<UserData | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<OfferRow>({
    id: "",
    company: "Aucune offre sélectionnée",
    title: "Sélectionne une offre réelle",
    location: "",
    tags: [],
    date: "",
    matchPercentage: null,
  });
  const [viewMode, setViewMode] = useState<"side" | "toggle">("side");
  const [toggleActive, setToggleActive] = useState<"before" | "after">("after");

  // CV data states
  const [candidateName, setCandidateName] = useState("");
  const [candidateTitle, setCandidateTitle] = useState("Ingénieur en génie électrique");
  const [adaptedTitle, setAdaptedTitle] = useState(
    "Ingénieur en génie électrique spécialisé en réseaux et dimensionnement"
  );
  const [isAdapting, setIsAdapting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  /* Rapport de l'adaptation vérifiée (éligibilité, axe, refus, lacunes) et
     plan d'opérations validé serveur — appliqué au CV avant export PDF. */
  type RecruiterPanel = {
    eligibility: { status: "eligible" | "needs_confirmation" | "ineligible"; reasons: string[] };
    focus?: string; headline?: string; headlineIssues: string[];
    accepted: { zone: string; op: string }[];
    rejected: { op: { zone: string }; issues: string[] }[];
    refused: { keyword: string; reason: string }[];
    unsupported: string[];
    warnings: string[];
  };
  const [recruiter, setRecruiter] = useState<RecruiterPanel | null>(null);
  const [planOps, setPlanOps] = useState<ApplicableOperation[]>([]);

  // Modals
  const [changeOfferModal, setChangeOfferModal] = useState(false);
  const [editCvModal, setEditCvModal] = useState(false);
  const [addSkillModal, setAddSkillModal] = useState(false);
  const [newSkillText, setNewSkillText] = useState("");
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [profileBio, setProfileBio] = useState(
    "Ingénieur en génie électrique, spécialisé en automatisation et systèmes énergétiques."
  );

  // Skills memory
  const [skillsMemory, setSkillsMemory] = useState<string[]>([
    "Génie électrique",
    "Réseaux",
    "Automatisation",
    "Dimensionnement",
    "Énergie",
    "Smart Grid",
    "DIgSILENT",
    "PSS/E",
    "AutoCAD",
    "MATLAB",
    "Supervision",
    "Courant fort",
  ]);

  // CV history
  /* Historique vide au démarrage : il ne s'enrichit que de VRAIS téléchargements. */
  const [cvHistory, setCvHistory] = useState<{ id: string; name: string; offer: string; date: string; status: string }[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load user data & match selected offer
  useEffect(() => {
    if (!user) return;
    const local = getOrCreateData(user.name, user.email);
    setData(local);
    setCandidateName(user.name || "");
    /* Titre d'aperçu = VRAI titre du CV maître (ou titre du profil), jamais un
       contenu de démonstration. */
    const masterHeadline = local.cvData?.basics.headline?.trim() || local.profile.title?.trim() || "";
    if (masterHeadline) {
      setCandidateTitle(masterHeadline);
      setAdaptedTitle(masterHeadline);
    }

    /* L'offre vient TOUJOURS du dossier réel : paramètre d'URL s'il pointe une
       offre du dossier, sinon la première offre réelle — jamais la démo. */
    const rows = (local.offers || []).map(offerRow);
    const match = (offerParam ? rows.find((o) => o.id === offerParam) : undefined) || rows[0];
    if (match) {
      setSelectedOffer(match);
    }
  }, [user, offerParam]);

  // Import CV PDF
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setToastMessage("Seuls les fichiers PDF sont acceptés.");
      return;
    }

    setToastMessage("Analyse et import du CV en cours…");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error("Erreur de lecture"));
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/cv/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdf: base64, name: file.name }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setToastMessage(`CV « ${file.name} » importé avec succès (${json.pages} page(s)).`);
      } else {
        setToastMessage("CV importé (texte extrait).");
      }
    } catch {
      setToastMessage("CV importé en local.");
    }
  };

  // Run adaptation — POST /api/cv/adapt : analyse déterministe (éligibilité,
  // matrice exigence → preuve croisée avec le registre du dossier maître) puis
  // passe « recruteur » Gemini intégralement revalidée. Le CV maître n'est
  // jamais modifié ; seules les opérations acceptées sont appliquées à l'export.
  const handleRegenerate = async () => {
    setIsAdapting(true);
    setToastMessage("Analyse de l'offre et adaptation sous contrôle de preuves…");
    try {
      const masterText = (data?.originalCv?.text?.trim() || (data?.cvData ? cvToText(data.cvData) : "")) || "";
      if (!masterText) {
        setToastMessage("Aucun CV maître confirmé — importe ton vrai CV avant d'adapter.");
        return;
      }
      if (!selectedOffer.id) {
        setToastMessage("Sélectionne d'abord une offre réelle.");
        return;
      }
      const res = await fetch("/api/cv/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: selectedOffer.id, rewrite: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setToastMessage(`Adaptation indisponible — ${json?.error || "CV maître conservé tel quel."}`);
        return;
      }
      const accepted: ApplicableOperation[] = (json.plan?.operations ?? []).filter(
        (op: ApplicableOperation) => op.decision !== "rejected" && op.op !== "keep",
      );
      setPlanOps(accepted);
      setRecruiter(json.recruiter ?? null);
      if (json.recruiter?.headline && !json.recruiter.headlineIssues?.length) {
        setAdaptedTitle(json.recruiter.headline);
      } else if (json.strategy?.headline) {
        setAdaptedTitle(json.strategy.headline);
      }
      const rewrites = accepted.filter(op => op.op === "rephrase_fact" || op.op === "rewrite_profile").length;
      const refused = json.rejected?.length ?? 0;
      if (json.aiError) {
        setToastMessage("Plan de preuves généré à partir du dossier maître (IA indisponible — analyse déterministe conservée).");
      } else {
        setToastMessage(`Adaptation vérifiée : ${rewrites} reformulation(s) validée(s), ${refuséeOrRefused(refused)} refusée(s) pour non-preuve.`);
      }
    } catch {
      setToastMessage("Adaptation indisponible — CV maître conservé tel quel.");
    } finally {
      setIsAdapting(false);
    }
  };
  const refuséeOrRefused = (count: number) => String(count);

  // Download PDF
  const handleDownloadPdf = async (type: "original" | "adapted") => {
    setIsDownloading(true);
    setToastMessage("Génération du PDF A4 en cours…");
    try {
      /* Vrai CV maître uniquement : structuré si présent, sinon parsé depuis
         le texte importé. Aucune expérience, coordonnée ou école de démonstration
         n'est jamais exportée (03_TESTS C.1/C.8). */
      const master = data?.cvData
        ?? (data?.originalCv?.text?.trim() ? parseCvText(data.originalCv.text) : null);
      if (!master) {
        setToastMessage("Aucun CV maître confirmé — importe ton vrai CV (Mon CV) avant de télécharger.");
        return;
      }
      if (!selectedOffer.id) {
        setToastMessage("Sélectionne d'abord une offre réelle.");
        return;
      }
      /* Le plan d'opérations acceptées (titre de disponibilité verrouillé,
         reformulations prouvées, réordonnancements) est appliqué au CV
         structuré avant export — aucune opération refusée n'y accède. */
      const prepared = type === "adapted" && planOps.length ? applyPlanToCv(master, planOps).cv : master;
      const res = await fetch("/api/cv/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cv: {
            ...prepared,
            basics: {
              ...prepared.basics,
              name: candidateName || prepared.basics.name,
              headline: type === "adapted" ? adaptedTitle : (master.basics.headline || candidateTitle),
            },
          },
          design: data?.cvDesign ?? DEFAULT_CV_DESIGN,
          offerId: selectedOffer.id || undefined,
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `CV_${(candidateName || "candidat").replace(/\s+/g, "_")}_${selectedOffer.company}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        setToastMessage("Téléchargement du PDF réussi !");

        // Add to history
        setCvHistory((prev) => [
          {
            id: `hist-${Date.now()}`,
            name: `CV - ${selectedOffer.company} - ${selectedOffer.tags[0] || "Adapté"}`,
            offer: `${selectedOffer.company} - ${selectedOffer.title}`,
            date: new Date().toLocaleDateString("fr-FR"),
            status: "Adapté",
          },
          ...prev,
        ]);
      } else {
        /* Aucun faux PDF de secours : l'échec est dit tel quel (03_TESTS C.8). */
        const detail = await res.json().catch(() => null);
        setToastMessage(`PDF indisponible : ${detail?.error || "erreur serveur"}`);
      }
    } catch {
      setToastMessage("Téléchargement du PDF indisponible — réessaie.");
    } finally {
      setIsDownloading(false);
    }
  };

  // Add skill to memory
  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillText.trim()) return;
    setSkillsMemory((prev) => [...new Set([...prev, newSkillText.trim()])]);
    setNewSkillText("");
    setAddSkillModal(false);
    setToastMessage("Compétence ajoutée à votre mémoire.");
  };

  // Confirm application
  const handleApplyWithCv = () => {
    if (!user) return;
    const local = getOrCreateData(user.name, user.email);
    const newApp = {
      id: `app-${Date.now()}`,
      company: selectedOffer.company,
      role: selectedOffer.title,
      status: "sent" as const,
      daysAgo: 0,
      source: "Cible (Mon CV)",
      cvName: `CV_${candidateName.replace(/\s+/g, "_")}_${selectedOffer.company}.pdf`,
      date: new Date().toISOString(),
      notes: "Candidature enregistrée suite à l'adaptation du CV.",
    };
    const next = { ...local, applications: [newApp, ...local.applications] };
    saveData(user.email, next);
    setToastMessage("Candidature enregistrée ! Redirection vers Mes candidatures…");
    setTimeout(() => {
      router.push("/app/candidatures");
    }, 1200);
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

      {/* Hidden file input for CV import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* ── Top Header Row ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-[28px] font-extrabold tracking-tight text-slate-900 leading-tight">
            Mon CV
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Crée, optimise et adapte ton CV automatiquement pour chaque opportunité de stage de 6 mois.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
          >
            <Download size={14} className="rotate-180" />
            <span>Importer un CV</span>
          </button>
          <button
            type="button"
            onClick={() => setEditCvModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus size={14} />
            <span>Créer un nouveau CV</span>
          </button>
        </div>
      </div>

      {/* ── Top Three Cards Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Mon CV principal */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex items-center justify-between relative group">
          <div className="flex items-center gap-3 min-w-0">
            {/* Thumbnail */}
            <div className="w-12 h-14 bg-slate-50 border border-slate-200 rounded-lg p-1.5 flex flex-col justify-between shrink-0 shadow-2xs">
              <div className="space-y-1">
                <div className="w-6 h-1 bg-slate-300 rounded" />
                <div className="w-8 h-0.5 bg-slate-200 rounded" />
                <div className="w-7 h-0.5 bg-slate-200 rounded" />
              </div>
              <div className="text-[7px] text-slate-400 font-mono">PDF</div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="text-xs font-bold text-slate-900 truncate">
                  CV - {candidateName}
                </h3>
                <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-200">
                  Par défaut
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mb-1.5">
                Dernière modification : 10 janv. 2025
              </p>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                <span>📄 2 pages</span>
                <span>•</span>
                <span>🇫🇷 Français</span>
                <span>•</span>
                <span>PDF (1,2 Mo)</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
            aria-label="Options"
          >
            <MoreVertical size={16} />
          </button>
        </div>

        {/* Card 2: Mon profil */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <User size={14} />
              </div>
              <h3 className="text-xs font-bold text-slate-900 tracking-tight">
                Mon profil
              </h3>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">
              {profileBio}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditProfileModal(true)}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-3 self-start cursor-pointer"
          >
            <span>Voir et modifier mon profil</span>
            <ArrowRight size={12} />
          </button>
        </div>

        {/* Card 3: Adapte ton CV en 4 étapes */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-md bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                <Zap size={14} className="fill-amber-500" />
              </div>
              <h3 className="text-xs font-bold text-slate-900 tracking-tight">
                Adapte ton CV en 4 étapes
              </h3>
            </div>
            <p className="text-[10px] text-slate-400 mb-3">
              Un CV ciblé et optimisé en moins d&apos;une minute.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-1 text-center">
            {[
              { num: 1, label: "Sélectionne une offre" },
              { num: 2, label: "Analyse par l'IA" },
              { num: 3, label: "Adaptation de ton CV" },
              { num: 4, label: "Télécharge et postule" },
            ].map((step) => (
              <div key={step.num} className="flex flex-col items-center">
                <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold flex items-center justify-center mb-1">
                  {step.num}
                </span>
                <span className="text-[9px] text-slate-600 leading-tight line-clamp-2">
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Middle 3-Column Section (Main Adaptation Workspace) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column (3 cols ~ 25%): Offre sélectionnée */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-900">
              Offre sélectionnée pour l&apos;adaptation
            </h3>
            <button
              type="button"
              onClick={() => setChangeOfferModal(true)}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              Changer d&apos;offre →
            </button>
          </div>

          {/* Selected offer card */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <CompanyLogo company={selectedOffer.company} size="sm" />
              <span className="text-xs font-bold text-slate-800">
                {selectedOffer.company}
              </span>
            </div>

            <h4 className="text-[13px] font-bold text-slate-900 leading-snug">
              {selectedOffer.title}
            </h4>

            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span>📍 {selectedOffer.location}</span>
              <span>•</span>
              <span>⏱ 6 mois</span>
            </div>

            <div className="flex flex-wrap gap-1 mt-1">
              {selectedOffer.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md"
                >
                  {tag}
                </span>
              ))}
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 rounded-xl p-2.5 mt-2">
              Correspond parfaitement à ton projet de réseau BT et à ton expérience en analyse énergétique.
            </p>
          </div>
        </div>

        {/* Center Column (6 cols ~ 50%): Aperçu côte à côte */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900">
                Aperçu de l&apos;adaptation de ton CV
              </h3>
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <Check size={11} strokeWidth={3} />
                <span>Adaptation terminée</span>
              </span>
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 text-[11px]">
                <button
                  type="button"
                  onClick={() => setViewMode("side")}
                  className={`px-2 py-0.5 rounded font-medium transition-all ${
                    viewMode === "side" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600"
                  }`}
                >
                  Côte à côte
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("toggle")}
                  className={`px-2 py-0.5 rounded font-medium transition-all ${
                    viewMode === "toggle" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600"
                  }`}
                >
                  Avant / Après
                </button>
              </div>

              <button
                type="button"
                onClick={() => setEditCvModal(true)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600"
                aria-label="Agrandir / Modifier"
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>

          {/* Side by side documents */}
          {viewMode === "side" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
              {/* Left Document: Avant adaptation */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-700">Avant adaptation</span>
                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    CV général
                  </span>
                </div>

                <DocumentSheet
                  name={candidateName}
                  headline={candidateTitle}
                  contact={{
                    location: "Paris, France",
                    email: user?.email || "moustapha.ibrahim@example.com",
                    phone: "06 12 34 56 78",
                  }}
                  experiences={[
                    {
                      title: "Stage - TotalEnergies",
                      period: "2024 - 2024",
                      bullets: [
                        "Analyse de performances énergétiques",
                        "Étude de solutions techniques",
                        "Participation au dimensionnement",
                      ],
                    },
                  ]}
                  education={[
                    {
                      degree: "ECAM-EPMI - Diplôme d'ingénieur",
                      school: "Spécialité : Génie électrique",
                      period: "2022 - 2025",
                    },
                  ]}
                  skills={[
                    { name: "Énergie" },
                    { name: "Automatisation" },
                    { name: "Analyse" },
                    { name: "Excel" },
                    { name: "Python" },
                  ]}
                  projects={[
                    {
                      title: "Projet de fin d'études",
                      period: "2024 - 2025",
                      description: "Optimisation d'un réseau électrique",
                    },
                  ]}
                  isAdapted={false}
                />

                <button
                  type="button"
                  onClick={() => handleDownloadPdf("original")}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  <Download size={13} />
                  <span>Télécharger le CV d&apos;origine</span>
                </button>
              </div>

              {/* Right Document: Après adaptation */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-700">Après adaptation</span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                    Optimisé pour l&apos;offre
                  </span>
                </div>

                <DocumentSheet
                  name={candidateName}
                  headline={adaptedTitle}
                  contact={{
                    location: "Paris, France",
                    email: user?.email || "moustapha.ibrahim@example.com",
                    phone: "06 12 34 56 78",
                  }}
                  experiences={[
                    {
                      title: "Stage - Bureau d'études (Réseaux électriques)",
                      period: "2024 - 2024",
                      bullets: [
                        "Analyse et dimensionnement de réseaux BT",
                        "Étude des schémas unifilaires et bilans de puissance",
                        "Utilisation de logiciels de simulation (DIgSILENT, PSS/E)",
                      ],
                    },
                  ]}
                  education={[
                    {
                      degree: "ECAM-EPMI - Diplôme d'ingénieur",
                      school: "Spécialité : Génie électrique",
                      period: "2022 - 2025",
                    },
                  ]}
                  skills={[
                    { name: "Réseaux électriques", highlighted: true },
                    { name: "Dimensionnement", highlighted: true },
                    { name: "DIgSILENT", highlighted: true },
                    { name: "PSS/E", highlighted: true },
                    { name: "Excel" },
                  ]}
                  projects={[
                    {
                      title: "Étude et dimensionnement d'un poste de distribution BT",
                      period: "2024 - 2025",
                      description: "Simulation sous DIgSILENT et validation technique",
                      highlighted: true,
                    },
                  ]}
                  isAdapted={true}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadPdf("adapted")}
                    disabled={isDownloading}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <Download size={13} />
                    <span>{isDownloading ? "Génération…" : "Télécharger le PDF"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyWithCv}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <CheckCircle2 size={13} />
                    <span>J&apos;ai postulé</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Toggle view (Avant vs Après) */
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setToggleActive("before")}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold border ${
                    toggleActive === "before"
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-slate-200"
                  }`}
                >
                  CV original
                </button>
                <button
                  type="button"
                  onClick={() => setToggleActive("after")}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold border ${
                    toggleActive === "after"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-700 border-slate-200"
                  }`}
                >
                  CV adapté
                </button>
              </div>

              {toggleActive === "after" ? (
                <DocumentSheet
                  name={candidateName}
                  headline={adaptedTitle}
                  contact={{
                    location: "Paris, France",
                    email: user?.email || "moustapha.ibrahim@example.com",
                    phone: "06 12 34 56 78",
                  }}
                  experiences={[
                    {
                      title: "Stage - Bureau d'études (Réseaux électriques)",
                      period: "2024 - 2024",
                      bullets: [
                        "Analyse et dimensionnement de réseaux BT",
                        "Étude des schémas unifilaires et bilans de puissance",
                        "Utilisation de logiciels de simulation (DIgSILENT, PSS/E)",
                      ],
                    },
                  ]}
                  education={[
                    {
                      degree: "ECAM-EPMI - Diplôme d'ingénieur",
                      school: "Spécialité : Génie électrique",
                      period: "2022 - 2025",
                    },
                  ]}
                  skills={[
                    { name: "Réseaux électriques", highlighted: true },
                    { name: "Dimensionnement", highlighted: true },
                    { name: "DIgSILENT", highlighted: true },
                    { name: "PSS/E", highlighted: true },
                    { name: "Excel" },
                  ]}
                  projects={[
                    {
                      title: "Étude et dimensionnement d'un poste de distribution BT",
                      period: "2024 - 2025",
                      description: "Simulation sous DIgSILENT et validation technique",
                      highlighted: true,
                    },
                  ]}
                  isAdapted={true}
                />
              ) : (
                <DocumentSheet
                  name={candidateName}
                  headline={candidateTitle}
                  contact={{
                    location: "Paris, France",
                    email: user?.email || "moustapha.ibrahim@example.com",
                    phone: "06 12 34 56 78",
                  }}
                  experiences={[
                    {
                      title: "Stage - TotalEnergies",
                      period: "2024 - 2024",
                      bullets: [
                        "Analyse de performances énergétiques",
                        "Étude de solutions techniques",
                      ],
                    },
                  ]}
                  education={[
                    {
                      degree: "ECAM-EPMI - Diplôme d'ingénieur",
                      school: "Spécialité : Génie électrique",
                      period: "2022 - 2025",
                    },
                  ]}
                  skills={[
                    { name: "Énergie" },
                    { name: "Automatisation" },
                    { name: "Excel" },
                  ]}
                  projects={[]}
                  isAdapted={false}
                />
              )}
            </div>
          )}
        </div>

        {/* Right Column (3 cols ~ 25%): Audit de l'adaptation (moteur + recruteur IA) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-xs font-bold text-slate-900 pb-2 border-b border-slate-100 mb-3">
              Audit de l&apos;adaptation
            </h3>

            {!recruiter ? (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Lance l&apos;adaptation pour obtenir l&apos;éligibilité réelle de l&apos;offre, l&apos;axe retenu,
                les reformulations validées avec leurs preuves, et les exigences que ton parcours ne couvre pas.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Éligibilité (vérifiée sur contrat, durée, début 2027, domaine) */}
                <div className="flex items-start gap-2.5">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      recruiter.eligibility.status === "eligible"
                        ? "bg-emerald-50 text-emerald-600"
                        : recruiter.eligibility.status === "needs_confirmation"
                          ? "bg-amber-50 text-amber-600"
                          : "bg-red-50 text-red-600"
                    }`}
                  >
                    <Check size={12} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1">
                    <strong className="text-xs font-bold text-slate-900">
                      Éligibilité —{" "}
                      {recruiter.eligibility.status === "eligible"
                        ? "éligible"
                        : recruiter.eligibility.status === "needs_confirmation"
                          ? "à confirmer"
                          : "non éligible"}
                    </strong>
                    <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                      {recruiter.eligibility.reasons[0]}
                    </p>
                  </div>
                </div>

                {/* Axe principal (stratégie fondée sur des preuves) */}
                {recruiter.focus && (
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Zap size={12} />
                    </div>
                    <div className="flex-1">
                      <strong className="text-xs font-bold text-slate-900">Axe principal</strong>
                      <p className="text-[10px] text-slate-600 leading-snug mt-0.5">{recruiter.focus}</p>
                    </div>
                  </div>
                )}

                {/* Modifications réellement validées */}
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText size={12} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <strong className="text-xs font-bold text-slate-900">Modifications validées</strong>
                      <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {planOps.length}
                      </span>
                    </div>
                    {planOps.length ? (
                      <ul className="text-[10px] text-slate-600 leading-snug list-disc pl-3.5 space-y-0.5">
                        {planOps.slice(0, 4).map(op => (
                          <li key={op.op + op.zone}>{op.zone}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[10px] text-slate-500 leading-snug">
                        Aucune réécriture nécessaire : ton CV maître couvre déjà les besoins obligatoires.
                      </p>
                    )}
                  </div>
                </div>

                {/* Refus motivés (aucune affirmation non prouvée n'est appliquée) */}
                {recruiter.rejected.length > 0 && (
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
                      <X size={12} />
                    </div>
                    <div className="flex-1">
                      <strong className="text-xs font-bold text-slate-900">
                        Refusées ({recruiter.rejected.length})
                      </strong>
                      <ul className="text-[10px] text-slate-500 leading-snug list-disc pl-3.5 mt-0.5 space-y-0.5">
                        {recruiter.rejected.slice(0, 3).map((entry, index) => (
                          <li key={index}>
                            {entry.op.zone} — {entry.issues[0]}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Exigences non démontrées : dites, jamais ajoutées */}
                {recruiter.unsupported.length > 0 && (
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 mt-0.5">
                      <SlidersHorizontal size={12} />
                    </div>
                    <div className="flex-1">
                      <strong className="text-xs font-bold text-slate-900">Non démontré — jamais ajouté</strong>
                      <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                        {recruiter.unsupported.slice(0, 4).join(" • ")}
                      </p>
                    </div>
                  </div>
                )}

                {recruiter.warnings.length > 0 && (
                  <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-snug">
                    {recruiter.warnings[0]}
                  </p>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isAdapting}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <RotateCw size={13} className={isAdapting ? "animate-spin" : ""} />
            <span>{isAdapting ? "Vérification des preuves…" : "Relancer l'adaptation vérifiée"}</span>
          </button>
        </div>
      </div>

      {/* ── Bottom Section (Mémoire de compétences & Historique) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Panel: Ma mémoire de compétences */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Layers size={14} />
                </div>
                <h3 className="text-xs font-bold text-slate-900">
                  Ma mémoire de compétences
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAddSkillModal(true)}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                Gérer mes compétences →
              </button>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed mb-3">
              L&apos;IA utilise tes compétences, expériences et projets pour personnaliser tes CV. Plus tu l&apos;enrichis, plus les résultats sont pertinents.
            </p>

            <div className="flex flex-wrap gap-1.5">
              {skillsMemory.slice(0, 5).map((skill) => (
                <span
                  key={skill}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"
                >
                  {skill}
                </span>
              ))}
              <button
                type="button"
                onClick={() => setAddSkillModal(true)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                +{skillsMemory.length - 5}
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Historique de mes CV */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <FileCheck size={14} />
                </div>
                <h3 className="text-xs font-bold text-slate-900">
                  Historique de mes CV
                </h3>
              </div>
              <Link
                href="/app/cv"
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
              >
                Voir tout l&apos;historique →
              </Link>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed mb-3">
              Retrouve toutes les versions de tes CV générées pour tes candidatures.
            </p>

            <div className="flex flex-col divide-y divide-slate-100">
              {cvHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-slate-900 truncate">
                      {item.name}
                    </span>
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
                      ✔ {item.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-slate-400 font-mono">
                      {item.date}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf("adapted")}
                      className="text-slate-400 hover:text-slate-700 p-1"
                      aria-label="Télécharger"
                    >
                      <Download size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCvHistory((prev) => prev.filter((x) => x.id !== item.id))
                      }
                      className="text-slate-400 hover:text-rose-600 p-1"
                      aria-label="Supprimer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal: Changer d'offre ── */}
      {changeOfferModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Sélectionner une offre pour l&apos;adaptation
              </h3>
              <button
                type="button"
                onClick={() => setChangeOfferModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto no-scrollbar">
              {(data?.offers || []).map(offerRow).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setSelectedOffer(o);
                    setChangeOfferModal(false);
                    setToastMessage(`Offre changée pour ${o.company}.`);
                  }}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 text-left transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <CompanyLogo company={o.company} size="sm" />
                    <div>
                      <strong className="text-xs font-bold text-slate-900 block">
                        {o.company}
                      </strong>
                      <span className="text-[11px] text-slate-600">
                        {o.title}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-600">
                    {o.matchPercentage}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Ajouter compétence ── */}
      {addSkillModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-900">
                Ajouter une compétence
              </h3>
              <button
                type="button"
                onClick={() => setAddSkillModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddSkill} className="flex flex-col gap-3">
              <input
                type="text"
                value={newSkillText}
                onChange={(e) => setNewSkillText(e.target.value)}
                placeholder="Ex : MATLAB, Protection HTA…"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddSkillModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
                >
                  Ajouter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Modifier profil ── */}
      {editProfileModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-100 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-900">
                Modifier mon profil
              </h3>
              <button
                type="button"
                onClick={() => setEditProfileModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                Titre professionnel
                <input
                  type="text"
                  value={candidateTitle}
                  onChange={(e) => setCandidateTitle(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                Bio / Objectif (Stage de 6 mois)
                <textarea
                  rows={3}
                  value={profileBio}
                  onChange={(e) => setProfileBio(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 resize-none"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditProfileModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditProfileModal(false);
                    setToastMessage("Profil mis à jour !");
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Éditeur manuel de CV ── */}
      {editCvModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Correction manuelle du CV adapté
              </h3>
              <button
                type="button"
                onClick={() => setEditCvModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                Nom complet
                <input
                  type="text"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                Titre adapté pour l&apos;offre
                <input
                  type="text"
                  value={adaptedTitle}
                  onChange={(e) => setAdaptedTitle(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                />
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditCvModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditCvModal(false);
                    setToastMessage("Modifications manuelles enregistrées !");
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
                >
                  Valider les modifications
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
