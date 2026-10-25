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
  emptyData,
  type DetectedOffer,
  type UserData,
  type OfferCvFile,
} from "@/lib/data";
import { DEFAULT_CV_DESIGN, parseCvText, cvToText, type CvData } from "@/lib/cv";
import { nextRafaleCandidates, readRafaleQueue, writeRafaleQueue } from "@/lib/offres-filters";
import { applyPlanToCv, type ApplicableOperation } from "@/lib/cv-plan-apply";
import { CompanyLogo } from "@/components/app/CompanyLogo";
import { DocumentSheet } from "@/components/cv/DocumentSheet";
import { CareerEvaluationCard } from "@/components/cv/CareerEvaluationCard";
import type { CareerReport } from "@/lib/career-evaluation";

/* La page n'utilise AUCUNE donnée de démonstration : l'offre sélectionnée
   vient toujours des offres réelles du dossier (`data.offers`). */
type OfferRow = {
  id: string;
  company: string;
  title: string;
  location: string;
  tags: string[];
  analysisKeywords: string[];
  date: string;
  matchPercentage: number | null;
  receivedAt?: string;
  url?: string;
  duration: string;
  description: string;
  analysisText: string;
};

function offerRow(o: DetectedOffer): OfferRow {
  return {
    id: o.id,
    company: o.company || "Entreprise non précisée",
    title: o.title || "Offre sans titre",
    location: o.location || "",
    tags: (o.skills || o.keywords || []).slice(0, 3),
    analysisKeywords: (o.skills || o.keywords || []).filter((item): item is string => typeof item === "string").slice(0, 40),
    date: "Récente",
    matchPercentage: typeof o.match === "number" && o.match > 0 ? o.match : null,
    receivedAt: o.receivedAt,
    url: o.url,
    duration: o.duration || o.contract || "Durée inconnue",
    description: (o.description || o.text || "").slice(0, 600),
    analysisText: [...new Set([o.description, o.text, o.profile, o.missions?.join("\n"), o.prerequisites?.join("\n")]
      .filter((value): value is string => typeof value === "string" && !!value.trim()))]
      .join("\n").slice(0, 12_000),
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
    analysisKeywords: [],
    date: "",
    matchPercentage: null,
    duration: "Durée inconnue",
    description: "",
    analysisText: "",
  });
  const [viewMode, setViewMode] = useState<"side" | "toggle">("side");
  const [toggleActive, setToggleActive] = useState<"before" | "after">("after");

  // CV data states
  const [candidateName, setCandidateName] = useState("");
  const [candidateTitle, setCandidateTitle] = useState("");
  const [adaptedTitle, setAdaptedTitle] = useState("");
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
  const [careerReport, setCareerReport] = useState<CareerReport | null>(null);
  const [keywordAudit, setKeywordAudit] = useState<{ present: string[]; missing: string[] } | null>(null);
  const [planOps, setPlanOps] = useState<ApplicableOperation[]>([]);
  const [adaptationOfferId, setAdaptationOfferId] = useState<string | null>(null);
  const [preparedCv, setPreparedCv] = useState<CvData | null>(null);
  const [customCv, setCustomCv] = useState<OfferCvFile | null>(null);
  const [generatedFile, setGeneratedFile] = useState<OfferCvFile | null>(null);

  /* ── Mode Rafale : après l'envoi, proposer l'offre suivante du même filtre ── */
  const rafaleMode = searchParams.get("rafale") === "1";
  const [rafaleNext, setRafaleNext] = useState<
    { id: string; company: string; title: string; url?: string; remaining: number } | null
  >(null);
  const [customBusy, setCustomBusy] = useState(false);
  const customInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCustomCv(null);
    setGeneratedFile(null);
    if (!selectedOffer.id) return;
    let active = true;
    fetch(`/api/cv/custom?offerId=${encodeURIComponent(selectedOffer.id)}`, { cache: "no-store" })
      .then(res => res.json()).then(json => { if (active && json.ok) setCustomCv(json.file); }).catch(() => {});
    return () => { active = false; };
  }, [selectedOffer.id]);

  const handleCustomUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedOffer.id) return;
    setCustomBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("offerId", selectedOffer.id);
      const res = await fetch("/api/cv/custom", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Import impossible.");
      setCustomCv(json.file);
      setToastMessage("Ton PDF est sélectionné pour cette offre. Après l'envoi, clique sur « J'ai envoyé ce CV » pour en archiver la version exacte.");
    } catch (error) { setToastMessage(error instanceof Error ? error.message : "Import impossible."); }
    finally { setCustomBusy(false); }
  };

  const useGeneratedCv = async () => {
    try {
      const res = await fetch("/api/cv/custom", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerId: selectedOffer.id }) });
      if (!res.ok) throw new Error("Modification impossible.");
      setCustomCv(null);
      setToastMessage("Le CV généré est à nouveau sélectionné. Les CV déjà envoyés restent archivés.");
    } catch { setToastMessage("Modification impossible. Réessaie."); }
  };

  // Modals
  const [changeOfferModal, setChangeOfferModal] = useState(false);
  const [editCvModal, setEditCvModal] = useState(false);
  const [addSkillModal, setAddSkillModal] = useState(false);
  const [newSkillText, setNewSkillText] = useState("");
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [profileBio, setProfileBio] = useState("");

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
      setPlanOps([]);
      setRecruiter(null);
      setCareerReport(null);
      setKeywordAudit(null);
      setAdaptationOfferId(null);
      setPreparedCv(null);
    }

    // Restaure le CV maître du compte lorsque ce navigateur n'en a pas encore
    // de copie locale. Ne remplace jamais un CV déjà présent sur cet appareil.
    if (!local.originalCv?.text?.trim() && !local.cvData) {
      let active = true;
      fetch("/api/cv/reference", { cache: "no-store" })
        .then(res => res.json())
        .then((json: { ok?: boolean; originalCv?: UserData["originalCv"]; cvData?: UserData["cvData"] }) => {
          if (!active || !json.ok || (!json.originalCv?.text?.trim() && !json.cvData)) return;
          const latest = getOrCreateData(user.name, user.email);
          if (latest.originalCv?.text?.trim() || latest.cvData) return;
          const restored = {
            ...latest,
            originalCv: json.originalCv || { name: "CV maître", text: cvToText(json.cvData!) },
            cvData: json.cvData || parseCvText(json.originalCv!.text),
          };
          setData(restored);
          try { saveData(user.email, restored); } catch { /* Le compte reste la source de vérité si le cache local est plein. */ }
        })
        .catch(() => {});
      return () => { active = false; };
    }
  }, [user, offerParam]);

  // Import CV PDF
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!user) { setToastMessage("Connecte-toi avant d’importer ton CV maître."); e.target.value = ""; return; }

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
      const json = await res.json() as { ok?: boolean; text?: string; pages?: number; name?: string; cvData?: UserData["cvData"]; error?: string };
      if (res.ok && json.ok && json.text && json.cvData) {
        const latest = data ?? emptyData(user.name, user.email);
        const next = { ...latest, originalCv: { name: json.name || file.name, text: json.text, pages: json.pages, sizeBytes: file.size, importedAt: new Date().toISOString() }, cvData: json.cvData };
        setData(next);
        setPreparedCv(null);
        setAdaptationOfferId(null);
        setPlanOps([]);
        setCareerReport(null);
        setKeywordAudit(null);
        setRecruiter(null);
        try { saveData(user.email, next); } catch { /* Import déjà confirmé dans Supabase ; cache local facultatif. */ }
        setCandidateName(json.cvData.basics.name || user!.name || "");
        if (json.cvData.basics.headline) {
          setCandidateTitle(json.cvData.basics.headline);
          setAdaptedTitle(json.cvData.basics.headline);
        }
        setToastMessage(`CV maître « ${json.name || file.name} » enregistré sur ton compte (${json.pages} page(s)).`);
      } else {
        setToastMessage(json.error || "Le CV n’a pas été enregistré. Réessaie l’import avant le téléchargement.");
      }
    } catch {
      setToastMessage("Le CV n’a pas été enregistré. Vérifie ta connexion puis réessaie l’import.");
    } finally {
      e.target.value = "";
    }
  };

  // Run adaptation — POST /api/cv/adapt : analyse déterministe (éligibilité,
  // matrice exigence → preuve croisée avec le registre du dossier maître) puis
  // passe « recruteur » Gemini intégralement revalidée. Le CV maître n'est
  // jamais modifié ; seules les opérations acceptées sont appliquées à l'export.
  const performAdaptation = async (): Promise<{ operations: ApplicableOperation[]; cv: CvData } | null> => {
    setIsAdapting(true);
    setGeneratedFile(null);
    setToastMessage("Analyse de l'offre, propositions Gemini si utiles, puis contrôle de chaque modification…");
    try {
      if (!selectedOffer.id) {
        setToastMessage("Sélectionne d'abord une offre réelle.");
        return null;
      }
      const res = await fetch("/api/cv/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: selectedOffer.id,
          rewrite: true,
          offerSnapshot: {
            id: selectedOffer.id,
            title: selectedOffer.title,
            company: selectedOffer.company,
            location: selectedOffer.location,
            keywords: selectedOffer.analysisKeywords,
            text: selectedOffer.analysisText,
            url: selectedOffer.url,
            contract: selectedOffer.duration,
            source: "Sélection Mon CV",
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setToastMessage(`Adaptation indisponible — ${json?.error || "CV maître conservé tel quel."}`);
        return null;
      }
      const accepted: ApplicableOperation[] = (json.plan?.operations ?? []).filter(
        (op: ApplicableOperation) => op.decision !== "rejected" && op.op !== "keep",
      );
      setPlanOps(accepted);
      setPreparedCv(json.preparedCv);
      setRecruiter(json.recruiter ?? null);
      setCareerReport(json.careerReport ?? null);
      setKeywordAudit(json.keywordAudit ?? null);
      setAdaptationOfferId(selectedOffer.id);
      if (json.recruiter?.headline && !json.recruiter.headlineIssues?.length) {
        setAdaptedTitle(json.recruiter.headline);
      } else if (json.strategy?.headline) {
        setAdaptedTitle(json.strategy.headline);
      }
      const rewrites = accepted.filter(op => op.op === "rephrase_fact" || op.op === "rewrite_profile").length;
      const refused = json.rejected?.length ?? 0;
      if (json.aiError) {
        setToastMessage(`Gemini indisponible : ${json.aiError} Le plan déterministe reste consultable.`);
      } else if (!accepted.length) {
        setToastMessage("Copie de candidature composée et vérifiée sur une page A4. Aucune reformulation IA supplémentaire acceptée.");
      } else {
        setToastMessage(`Adaptation vérifiée : ${rewrites} reformulation(s) validée(s), ${refuséeOrRefused(refused)} refusée(s) pour non-preuve.`);
      }
      return { operations: accepted, cv: json.preparedCv };
    } catch {
      setToastMessage("Adaptation indisponible — CV maître conservé tel quel.");
      return null;
    } finally {
      setIsAdapting(false);
    }
  };
  const handleRegenerate = async () => { await performAdaptation(); };
  const refuséeOrRefused = (count: number) => String(count);

  // Download PDF
  const handleDownloadPdf = async (type: "original" | "adapted") => {
    setIsDownloading(true);
    setToastMessage("Génération du PDF A4 en cours…");
    try {
      if (type === "adapted" && customCv?.offerId === selectedOffer.id) {
        const res = await fetch(`/api/cv/custom?offerId=${encodeURIComponent(selectedOffer.id)}&file=1`, { cache: "no-store" });
        if (!res.ok) throw new Error("Ton PDF personnel est momentanément indisponible.");
        const url = URL.createObjectURL(await res.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = customCv.fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setToastMessage("Ton PDF personnel a été téléchargé sans modification.");
        return;
      }
      let currentPlan = planOps;
      let currentPrepared = adaptationOfferId === selectedOffer.id ? preparedCv : null;
      if (type === "adapted" && adaptationOfferId !== selectedOffer.id) {
        const result = await performAdaptation();
        if (result === null) return;
        currentPlan = result.operations;
        currentPrepared = result.cv;
      }
      /* Vrai CV maître uniquement : structuré si présent, sinon parsé depuis
         le texte importé. Aucune expérience, coordonnée ou école de démonstration
         n'est jamais exportée (03_TESTS C.1/C.8). */
      let sourceData = data;
      if (!sourceData?.cvData && !sourceData?.originalCv?.text?.trim() && user) {
        const refRes = await fetch("/api/cv/reference", { cache: "no-store" });
        const ref = await refRes.json() as { ok?: boolean; originalCv?: UserData["originalCv"]; cvData?: UserData["cvData"] };
        if (refRes.ok && ref.ok && (ref.originalCv?.text?.trim() || ref.cvData)) {
          const latest = sourceData ?? emptyData(user.name, user.email);
          sourceData = {
            ...latest,
            originalCv: ref.originalCv || { name: "CV maître", text: cvToText(ref.cvData!) },
            cvData: ref.cvData || parseCvText(ref.originalCv!.text),
          };
          setData(sourceData);
          try { saveData(user.email, sourceData); } catch { /* Le CV reste disponible depuis le compte pour le téléchargement. */ }
        }
      }
      const master = sourceData?.originalCv?.text?.trim() ? parseCvText(sourceData.originalCv.text) : sourceData?.cvData;
      if (!master) {
        setToastMessage("Aucun CV maître confirmé — importe ton vrai CV (Mon CV) avant de télécharger.");
        return;
      }
      if (type === "adapted" && !selectedOffer.id) {
        setToastMessage("Sélectionne d'abord une offre réelle.");
        return;
      }
      /* Le plan d'opérations acceptées (titre de disponibilité verrouillé,
         reformulations prouvées, réordonnancements) est appliqué au CV
         structuré avant export — aucune opération refusée n'y accède. */
      const prepared = type === "adapted" ? currentPrepared || applyPlanToCv(master, currentPlan).cv : master;
      const res = await fetch("/api/cv/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cv: {
            ...prepared,
            basics: {
              ...prepared.basics,
              name: prepared.basics.name || candidateName,
              headline: prepared.basics.headline || (type === "adapted" ? adaptedTitle : candidateTitle),
            },
          },
          design: sourceData?.cvDesign ?? DEFAULT_CV_DESIGN,
          offerId: selectedOffer.id || undefined,
          offerText: selectedOffer.analysisText,
        }),
      });

      if (res.ok) {
        if (type === "adapted") setGeneratedFile({ offerId: selectedOffer.id, fileName: "CV-cible.pdf", documentId: res.headers.get("X-Document-Id") || "", versionId: res.headers.get("X-Version-Id") || "", sha256: res.headers.get("X-Content-SHA256") || "", uploadedAt: new Date().toISOString() });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `CV_${(candidateName || "candidat").replace(/\s+/g, "_")}_${selectedOffer.company}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        setToastMessage("Téléchargement du PDF réussi !");

        // Add to history
        if (selectedOffer.id) setCvHistory((prev) => [
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
    } catch (error) {
      setToastMessage(`Téléchargement du PDF indisponible — ${error instanceof Error ? error.message : "réessaie."}`);
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
  const handleApplyWithCv = async () => {
    const file = customCv || generatedFile;
    if (!file || file.offerId !== selectedOffer.id) { setToastMessage("Importe ton PDF personnel ou télécharge d'abord le PDF généré avant de confirmer l'envoi."); return; }
    setCustomBusy(true);
    try {
      const offer: DetectedOffer = { id: selectedOffer.id, title: selectedOffer.title, company: selectedOffer.company, location: selectedOffer.location, salary: "", match: 0, keywords: selectedOffer.analysisKeywords, text: selectedOffer.analysisText, url: selectedOffer.url };
      const res = await fetch("/api/candidatures/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer, ...file, cvText: customCv?.text || (preparedCv ? cvToText(preparedCv) : undefined) }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Archivage impossible.");
      /* Mirror local : l'archivage est déjà côté serveur, mais l'appareil doit
         le connaître pour que toute sauvegarde ultérieure (hors serveur) ne
         l'écrase pas. */
      if (user?.email && json.application?.id) {
        const latest = getOrCreateData(user.name, user.email);
        if (!latest.applications.some((row) => row.id === json.application.id)) {
          try { saveData(user.email, { ...latest, applications: [json.application, ...latest.applications] }); } catch { /* Le dossier serveur reste la source de vérité. */ }
        }
      }
      // Advance only after the server confirms that the exact sent CV is archived.
      if (rafaleMode) {
        const latest = getOrCreateData(user?.name || "", user?.email || "");
        const applied = new Set(latest.applications.flatMap(a => a.offerId ? [a.offerId] : []));
        applied.add(selectedOffer.id);
        const queue = readRafaleQueue().filter(id => !applied.has(id) && !latest.dismissedOfferIds?.includes(id));
        const remaining = queue.length ? nextRafaleCandidates(latest.offers, applied, selectedOffer.id, queue) : [];
        const next = remaining[0];
        writeRafaleQueue(queue);
        setGeneratedFile(null);
        setCustomCv(null);
        setPreparedCv(null);
        setRafaleNext(null);
        const requestedReturn = searchParams.get("returnTo") || "";
        const returnTo = /^\/app\/offres(?:\?|#|$)/.test(requestedReturn) ? requestedReturn : "/app/offres?rafale=1#rafale-session";
        if (next) {
          setToastMessage("Candidature enregistrée. Passage à l’offre suivante.");
          router.replace(`/app/cv?offer=${encodeURIComponent(next.id)}&rafale=1&returnTo=${encodeURIComponent(returnTo)}`);
        } else {
          router.push(returnTo);
        }
        return;
      }
      router.push(`/app/candidatures?open=${encodeURIComponent(json.application.id)}`);
    } catch (error) { setToastMessage(error instanceof Error ? error.message : "Archivage impossible."); }
    finally { setCustomBusy(false); }
  };

  const masterCv: CvData | null = data?.originalCv?.text?.trim() ? parseCvText(data.originalCv.text) : data?.cvData || null;
  const adaptedCv = masterCv && adaptationOfferId === selectedOffer.id
    ? preparedCv || applyPlanToCv(masterCv, planOps).cv
    : masterCv;
  const importedName = data?.originalCv?.name || (masterCv ? "CV maître structuré" : "Aucun CV maître importé");
  const importedWhen = data?.originalCv?.importedAt
    ? new Date(data.originalCv.importedAt).toLocaleDateString("fr-FR")
    : null;
  const importedSize = data?.originalCv?.sizeBytes
    ? `${(data.originalCv.sizeBytes / 1024 / 1024).toFixed(2).replace(".", ",")} Mo`
    : null;

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
      <input ref={customInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleCustomUpload} />
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

      {/* ── Mode Rafale : offre suivante du même filtre ── */}
      {rafaleNext && (
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                <CheckCircle2 size={14} />
                Candidature enregistrée en mode Rafale
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {rafaleNext.id
                  ? `${rafaleNext.remaining} offre${rafaleNext.remaining > 1 ? "s" : ""} restante${rafaleNext.remaining > 1 ? "s" : ""} dans ton filtre. Ton filtre reste actif jusqu'à sa réinitialisation.`
                  : "Plus aucune offre ne correspond à ce filtre. Élargis les filtres depuis Mes offres pour continuer."}
              </p>
            </div>
            <Link href="/app/candidatures" className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 whitespace-nowrap">
              Voir mes candidatures →
            </Link>
          </div>

          {rafaleNext.id && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-500">{rafaleNext.company}</p>
                <h4 className="text-sm font-bold text-slate-900 leading-snug">{rafaleNext.title}</h4>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {rafaleNext.url && (
                  <a href={rafaleNext.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800">
                    <ExternalLink size={12} />
                    Ouvrir l&apos;offre
                  </a>
                )}
                <Link
                  href={`/app/cv?offer=${encodeURIComponent(rafaleNext.id)}&start=1&rafale=1`}
                  onClick={() => setRafaleNext(null)}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700"
                >
                  Adapter mon CV pour cette offre
                  <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

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
                <h3 className="text-xs font-bold text-slate-900 truncate" title={importedName}>{importedName}</h3>
                {masterCv && <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-200">CV maître</span>}
              </div>
              <p className="text-[10px] text-slate-400 mb-1.5">
                {importedWhen ? `Importé le ${importedWhen}` : masterCv ? "CV chargé depuis ton compte" : "Importe ton vrai CV pour commencer"}
              </p>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                {data?.originalCv?.pages ? <span>📄 {data.originalCv.pages} pages</span> : null}
                {data?.originalCv?.pages && importedSize ? <span>•</span> : null}
                {importedSize ? <span>PDF ({importedSize})</span> : masterCv ? <span>Source du compte</span> : null}
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
              {profileBio || masterCv?.summary || data?.profile.title || "Aucun résumé de profil enregistré."}
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
              Le CV ne change qu&apos;après analyse et validation des preuves.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-1 text-center">
            {[
              { num: 1, label: "Offre sélectionnée", complete: !!selectedOffer.id },
              { num: 2, label: "Analyse vérifiée", complete: adaptationOfferId === selectedOffer.id },
              { num: 3, label: "Copie A4 préparée", complete: adaptationOfferId === selectedOffer.id },
              { num: 4, label: "PDF à télécharger", complete: false },
            ].map((step) => (
              <div key={step.num} className="flex flex-col items-center" title={step.complete ? "Terminé" : "À faire"}>
                <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center mb-1 ${step.complete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {step.complete ? "✓" : step.num}
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
              <span>⏱ {selectedOffer.duration}</span>
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
              {selectedOffer.description || "Aucune description détaillée n’est disponible pour cette offre."}
            </p>

            {/* Retour direct à l'annonce : le lien exact de l'offre de stage */}
            {selectedOffer.url ? (
              <a
                href={selectedOffer.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
              >
                <ExternalLink size={12} />
                Voir l&apos;offre et postuler sur le site
              </a>
            ) : (
              <p className="mt-1 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[10px] text-slate-400">
                Aucun lien de candidature n&apos;est enregistré pour cette offre.
              </p>
            )}
          </div>
        </div>

        <div className="lg:col-span-12 lg:order-last"><CareerEvaluationCard offer={{ id: selectedOffer.id, title: selectedOffer.title, company: selectedOffer.company, location: selectedOffer.location, text: selectedOffer.analysisText }} report={careerReport?.offerId === selectedOffer.id ? careerReport : null} onReport={setCareerReport} />
          {keywordAudit && !customCv && <p className="text-xs text-slate-600 mt-2">Contrôle du PDF final · Mots-clés présents : {keywordAudit.present.join(", ") || "aucun"}. Absents : {keywordAudit.missing.join(", ") || "aucun"}. Une présence textuelle ne prouve pas la maîtrise ; aucun mot-clé absent n&apos;est ajouté automatiquement.</p>}
        </div>
        {/* Center Column (6 cols ~ 50%): Aperçu côte à côte */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900">
                Aperçu de l&apos;adaptation de ton CV
              </h3>
              <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${adaptationOfferId === selectedOffer.id ? "text-emerald-700 bg-emerald-50 border border-emerald-200" : "text-slate-600 bg-slate-100 border border-slate-200"}`}>
                {adaptationOfferId === selectedOffer.id ? <Check size={11} strokeWidth={3} /> : null}
                <span>{customCv ? "PDF personnel sélectionné" : adaptationOfferId === selectedOffer.id ? "Copie A4 vérifiée" : "Pas encore analysé"}</span>
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
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-slate-700 space-y-2">
            <strong>{customCv ? `CV choisi : ${customCv.fileName}` : "Tu préfères utiliser ton propre CV ?"}</strong>
            <p>Importe ton PDF pour cette offre. Il sera conservé exactement tel quel. Après l&apos;envoi, confirme la version pour la retrouver dans Mes candidatures.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!selectedOffer.id || customBusy} onClick={() => customInput.current?.click()} className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white disabled:opacity-50">{customBusy ? "Enregistrement…" : customCv ? "Remplacer mon PDF" : "Utiliser mon propre CV"}</button>
              {customCv && <button type="button" onClick={useGeneratedCv} className="rounded-lg border px-3 py-2">Revenir au CV généré</button>}
              {(customCv || generatedFile) && <button type="button" disabled={customBusy} onClick={handleApplyWithCv} className="rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white">J&apos;ai envoyé ce CV</button>}
            </div>
          </div>
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

                <DocumentSheet cv={masterCv} isAdapted={false} />

                <button
                  type="button"
                  onClick={() => handleDownloadPdf("original")}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  <Download size={13} />
                  <span>Exporter une synthèse A4</span>
                </button>
              </div>

              {/* Right Document: Après adaptation */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-700">{customCv ? "Ton CV personnel" : "Après adaptation"}</span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                    {customCv ? "Fichier original conservé" : adaptationOfferId === selectedOffer.id ? "Adaptation vérifiée" : "En attente d’analyse"}
                  </span>
                </div>

                {customCv ? <iframe title="Mon PDF personnel pour cette offre" className="w-full h-[440px] rounded-xl border" src={`/api/cv/custom?offerId=${encodeURIComponent(selectedOffer.id)}&file=1&version=${customCv.versionId}`} /> : adaptationOfferId === selectedOffer.id ? <DocumentSheet cv={adaptedCv} isAdapted /> : <div className="min-h-[440px] rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-6 flex flex-col justify-center text-center"><h3 className="text-sm font-semibold text-slate-900">Ton CV adapté apparaîtra ici</h3><p className="mt-2 text-xs text-slate-600">Lance l’analyse pour comparer les modifications avec ton CV maître. Aucune adaptation n’a encore été effectuée pour cette offre.</p></div>}

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
                    disabled={customBusy}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <CheckCircle2 size={13} />
                    <span>J&apos;ai envoyé ce CV</span>
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
                customCv ? <iframe title="Mon PDF personnel pour cette offre" className="w-full h-[440px] rounded-xl border" src={`/api/cv/custom?offerId=${encodeURIComponent(selectedOffer.id)}&file=1&version=${customCv.versionId}`} /> : adaptationOfferId === selectedOffer.id ? <DocumentSheet cv={adaptedCv} isAdapted /> : <div className="min-h-[440px] rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-6 flex flex-col justify-center text-center"><h3 className="text-sm font-semibold text-slate-900">Ton CV adapté apparaîtra ici</h3><p className="mt-2 text-xs text-slate-600">Lance l’analyse pour comparer les modifications avec ton CV maître. Aucune adaptation n’a encore été effectuée pour cette offre.</p></div>
              ) : (
                <DocumentSheet cv={masterCv} isAdapted={false} />
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

            {customCv ? <p className="text-[11px] text-slate-600 leading-relaxed">Tu utilises ton PDF personnel pour cette offre. Son contenu et sa mise en page sont conservés. La confirmation d&apos;envoi archive ce fichier exact pour tes futurs entretiens.</p> : !recruiter ? (
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
                        La copie A4 sélectionne et condense le parcours. Aucune reformulation IA supplémentaire n&apos;a été acceptée.
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
                    setCareerReport(null);
                    setKeywordAudit(null);
                    setRecruiter(null);
                    setPreparedCv(null);
                    setAdaptationOfferId(null);
                    setPlanOps([]);
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
