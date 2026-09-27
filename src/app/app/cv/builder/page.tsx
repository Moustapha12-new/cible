"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, saveData, type UserData } from "@/lib/data";
import { AppPageHead, NAV_LABEL } from "@/components/app/AppShell";
import LoadingState from "@/components/alertes-gmail/LoadingState";
import { AI_LABEL } from "@/lib/ai-labels";
import { removeAiPhrases, type AiPhraseReport } from "@/lib/facts";
import {
  cvBodyHtml,
  cvDocumentHtml,
  cvStyles,
  numbersSafe,
  parseCvText,
  type CvData,
  type CvDesign,
  type CvItem,
  type CvSection,
} from "@/lib/cv";

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "").slice(0, 12);

type Suggestion = {
  sectionKey: string;
  itemId: string;
  proposed: string;
  reason: string;
  risky?: boolean;
  method?: string;
};

type EntretienQ = { q: string; a: string; insight?: string };

type AtsScore = { score: number; hardSkills: { covered: number; total: number }; titleKeywords: { covered: number; total: number }; businessContext: { covered: number; total: number } };

type EnrichQuestion = { questionId: string; itemId: string; question: string; placeholder: string };
type EnrichItem = { itemId: string; sectionKey: string; title: string; currentDescription: string; weaknessReason: string };

type ImproveChange = { section: string; original: string; rewritten: string; method: string; impact: string; reason: string };
type TrimCut = { section: string; original: string; trimmed: string; wordsSaved: number; priority: string };
type BatchItem = { id: string; match: number; matchedKeywords: string[]; missingKeywords: string[]; topRecommendation: string; effortLevel: string; estimatedBoost: number };

const emptyCv = (): CvData => ({
  basics: { name: "", headline: "", contact: "" },
  summary: "",
  sections: [],
});

const cvToText = (cv: CvData): string =>
  [
    cv.basics.name,
    cv.basics.contact,
    cv.summary,
    ...cv.sections.map((s) =>
      s.kind === "text"
        ? `${s.title}\n${s.text}`
        : `${s.title}\n${s.items.map((i) => `${i.title}${i.meta ? ` — ${i.meta}` : ""} : ${i.detail}`).join("\n")}`
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

export default function CvBuilderPage() {
  const { user } = useAuth();
  const [data, setData] = useState<UserData | null>(null);
  const [cv, setCv] = useState<CvData | null>(null);
  const [design, setDesign] = useState<CvDesign>({ template: "design", accent: "#0b6b4f", fontSize: 11 });
  const [toast, setToast] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const [aiBusy, setAiBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [skillsAdd, setSkillsAdd] = useState<{ sectionKey: string; terms: string[] }[]>([]);
  const [headline, setHeadline] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [entretien, setEntretien] = useState<EntretienQ[] | null>(null);
  const [entretienBusy, setEntretienBusy] = useState(false);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [atsScore, setAtsScore] = useState<AtsScore | null>(null);
  const [aiPhraseReport, setAiPhraseReport] = useState<AiPhraseReport | null>(null);

  /* Enrichment wizard state */
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [enrichStep, setEnrichStep] = useState<"idle" | "questions" | "generating" | "done">("idle");
  const [enrichQuestions, setEnrichQuestions] = useState<EnrichQuestion[]>([]);
  const [enrichItems, setEnrichItems] = useState<EnrichItem[]>([]);
  const [enrichAnswers, setEnrichAnswers] = useState<Record<string, string>>({});
  const [enrichQIdx, setEnrichQIdx] = useState(0);
  const [enrichSummary, setEnrichSummary] = useState<string | null>(null);

  /* Boost ATS state */
  const [boostBusy, setBoostBusy] = useState(false);

  /* Improve (diff) state */
  const [improveBusy, setImproveBusy] = useState(false);
  const [improveChanges, setImproveChanges] = useState<ImproveChange[]>([]);
  const [improveChecked, setImproveChecked] = useState<Set<number>>(new Set());
  const [improveHeadline, setImproveHeadline] = useState<string | null>(null);
  const [improveSummary, setImproveSummary] = useState<string | null>(null);
  const [improveSkillsAdd, setImproveSkillsAdd] = useState<{ sectionKey: string; terms: string[] }[]>([]);
  const [improveSkillsReorder, setImproveSkillsReorder] = useState<{ sectionKey: string; ordered: string[] }[]>([]);
  const [improveWarnings, setImproveWarnings] = useState<string[]>([]);

  /* Trim state */
  const [trimBusy, setTrimBusy] = useState(false);
  const [trimCuts, setTrimCuts] = useState<TrimCut[]>([]);
  const [trimChecked, setTrimChecked] = useState<Set<number>>(new Set());
  const [trimRemove, setTrimRemove] = useState<{ section: string; reason: string }[]>([]);
  const [trimRemoveChecked, setTrimRemoveChecked] = useState<Set<number>>(new Set());
  const [trimWords, setTrimWords] = useState<{ total: number; target: number; final: number } | null>(null);

  /* Batch compare state */
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchItem[]>([]);
  const [batchSummary, setBatchSummary] = useState<string | null>(null);
  const [batchQuickWins, setBatchQuickWins] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    const id = window.setTimeout(() => {
      const d = getOrCreateData(user.name, user.email);
      setData(d);
      setCv(d.cvData ?? (d.originalCv?.text ? parseCvText(d.originalCv.text) : emptyCv()));
    }, 0);
    return () => window.clearTimeout(id);
  }, [user]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  /* P2-9 : état de chargement visible au lieu d'un écran blanc. */
  if (!data) return <LoadingState />;
  if (!cv) return null;

  const persist = (next: CvData) => {
    setCv(next);
    const nd: UserData = { ...data, cvData: next };
    setData(nd);
    saveData(user!.email, nd);
  };

  const mutateSection = (key: string, fn: (s: CvSection) => CvSection) =>
    persist({ ...cv, sections: cv.sections.map((s) => (s.key === key ? fn(s) : s)) });

  const mutateItem = (key: string, itemId: string, fn: (i: CvItem) => CvItem) =>
    mutateSection(key, (s) => ({ ...s, items: s.items.map((i) => (i.id === itemId ? fn(i) : i)) }));

  const moveSection = (key: string, dir: -1 | 1) => {
    const idx = cv.sections.findIndex((s) => s.key === key);
    const target = idx + dir;
    if (target < 0 || target >= cv.sections.length) return;
    const next = [...cv.sections];
    [next[idx], next[target]] = [next[target], next[idx]];
    persist({ ...cv, sections: next });
  };

  /* ─── IA : suggestions sur les DONNÉES, appliquées par l'utilisateur ─── */

  const offers = data.offers;
  const offer = offers.find((o) => o.id === offerId) ?? offers[0];

  const runSuggestions = async () => {
    if (aiBusy || !offer) return;
    setAiBusy(true);
    setSuggestions(null);
    setEntretien(null);
    setAtsScore(null);
    setAiPhraseReport(null);
    setEnrichStep("idle");
    setEnrichQuestions([]);
    setImproveChanges([]);
    setTrimCuts([]);
    setTrimRemove([]);
    setBatchResults([]);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "suggest",
          cv,
          offerText: `${offer.title} — ${offer.company}. ${offer.text}`,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const r = json.result as {
        headline?: string;
        summary?: string;
        items?: { sectionKey: string; itemId: string; proposed: string; reason: string }[];
        skillsAdd?: { sectionKey: string; terms: string[] }[];
        atsScore?: AtsScore;
      };
      const whole = cvToText(cv);
      const valid: Suggestion[] = (r.items ?? [])
        .filter((s) => {
          const sec = cv.sections.find((x) => x.key === s.sectionKey);
          return sec && sec.items.some((i) => i.id === s.itemId && i.detail.trim());
        })
        .map((s) => ({
          ...s,
          risky: !numbersSafe(
            cv.sections.find((x) => x.key === s.sectionKey)?.items.find((i) => i.id === s.itemId)?.detail ?? "",
            s.proposed,
            whole
          ),
        }));
      setSuggestions(valid);
      setChecked(new Set(valid.filter((s) => !s.risky).map((s) => s.itemId)));
      setSkillsAdd((r.skillsAdd ?? []).filter((sa) => cv.sections.some((x) => x.key === sa.sectionKey)));
      setHeadline(r.headline ?? null);
      setSummary(r.summary ?? null);
      setAtsScore(r.atsScore ?? null);

      /* Post-traitement anti-phrases IA sur les suggestions */
      const phraseReport = removeAiPhrases(valid.map((s) => s.proposed).join("\n"), offer.text);
      if (phraseReport.replaced > 0) setAiPhraseReport(phraseReport);

      setToast(`${valid.length} suggestion(s) prête(s) à appliquer`);
    } catch {
      setToast("IA indisponible — réessaie dans un instant");
    } finally {
      setAiBusy(false);
    }
  };

  const applySuggestions = () => {
    if (!suggestions) return;
    const next: CvData = JSON.parse(JSON.stringify(cv));
    if (checked.has("__headline__") && headline) next.basics.headline = headline;
    if (checked.has("__summary__") && summary) next.summary = summary;
    for (const s of suggestions) {
      if (!checked.has(s.itemId)) continue;
      const sec = next.sections.find((x) => x.key === s.sectionKey);
      const item = sec?.items.find((i) => i.id === s.itemId);
      if (item) item.detail = s.proposed;
    }
    for (const sa of skillsAdd) {
      const sec = next.sections.find((x) => x.key === sa.sectionKey);
      if (sec && sec.kind === "text") {
        const terms = sa.terms.filter((t) => !sec.text.toLowerCase().includes(t.toLowerCase()));
        if (terms.length) sec.text = `${sec.text.replace(/\s*$/, "")}${sec.text.trim() ? ", " : ""}${terms.join(", ")}`;
      }
    }
    persist(next);
    setSuggestions(null);
    setToast("Suggestions appliquées — aperçu et PDF mis à jour");
  };

  const runEntretien = async () => {
    if (entretienBusy || !offer) return;
    setEntretienBusy(true);
    setEntretien(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "entretien",
          cvOriginal: cvToText(cv),
          offerText: `${offer.title} — ${offer.company}. ${offer.text}`,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setEntretien(json.result.questions ?? []);
    } catch {
      setToast("IA indisponible — réessaie dans un instant");
    } finally {
      setEntretienBusy(false);
    }
  };

  /* ─── Enrichment Wizard : analyse → questions → génération ─── */

  const runEnrichAnalyze = async () => {
    if (enrichBusy || !offer) return;
    setEnrichBusy(true);
    setEnrichStep("idle");
    setEnrichQuestions([]);
    setEnrichItems([]);
    setEnrichAnswers({});
    setEnrichSummary(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "enrich", cv, offerText: `${offer.title} — ${offer.company}. ${offer.text}` }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const r = json.result as { items_to_enrich?: EnrichItem[]; questions?: EnrichQuestion[]; analysisSummary?: string };
      if (!r.questions?.length) {
        setEnrichSummary(r.analysisSummary ?? "Le CV est déjà bien détaillé.");
        setEnrichStep("done");
        return;
      }
      setEnrichItems(r.items_to_enrich ?? []);
      setEnrichQuestions(r.questions);
      setEnrichSummary(r.analysisSummary ?? null);
      setEnrichStep("questions");
      setEnrichQIdx(0);
    } catch {
      setToast("IA indisponible — réessaie dans un instant");
    } finally {
      setEnrichBusy(false);
    }
  };

  const runEnrichGenerate = async () => {
    if (enrichBusy || !offer) return;
    setEnrichBusy(true);
    setEnrichStep("generating");
    try {
      const answersArr = Object.entries(enrichAnswers)
        .filter(([, a]) => a.trim())
        .map(([questionId, answer]) => {
          const q = enrichQuestions.find((x) => x.questionId === questionId);
          return { question_id: questionId, answer, item_id: q?.itemId, question_text: q?.question };
        });
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "suggest",
          cv,
          offerText: `${offer.title} — ${offer.company}. ${offer.text}\n\nContexte supplémentaire du candidat :\n${answersArr.map((a) => `- ${a.question_text} : ${a.answer}`).join("\n")}`,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const r = json.result as { headline?: string; summary?: string; items?: { sectionKey: string; itemId: string; proposed: string; reason: string }[]; skillsAdd?: { sectionKey: string; terms: string[] }[] };
      const whole = cvToText(cv);
      const valid: Suggestion[] = (r.items ?? []).map((s) => ({
        ...s,
        risky: !numbersSafe(cv.sections.find((x) => x.key === s.sectionKey)?.items.find((i) => i.id === s.itemId)?.detail ?? "", s.proposed, whole),
      }));
      setSuggestions(valid);
      setChecked(new Set(valid.filter((s) => !s.risky).map((s) => s.itemId)));
      setSkillsAdd((r.skillsAdd ?? []).filter((sa) => cv.sections.some((x) => x.key === sa.sectionKey)));
      setHeadline(r.headline ?? null);
      setSummary(r.summary ?? null);
      setEnrichStep("done");
      setToast(`${valid.length} suggestion(s) enrichie(s) prête(s)`);
    } catch {
      setToast("IA indisponible — réessaie dans un instant");
    } finally {
      setEnrichBusy(false);
    }
  };

  /* ─── Improve (diff-based) : amélioration ciblée du CV ─── */

  const runImprove = async () => {
    if (improveBusy || !offer) return;
    setImproveBusy(true);
    setImproveChanges([]);
    setImproveHeadline(null);
    setImproveSummary(null);
    setImproveSkillsAdd([]);
    setImproveSkillsReorder([]);
    setImproveWarnings([]);
    setSuggestions(null);
    setAtsScore(null);
    setAiPhraseReport(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "improve",
          cvOriginal: cvToText(cv),
          offerText: `${offer.title} — ${offer.company}. ${offer.text}`,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const r = json.result as {
        changes?: ImproveChange[];
        skillsAdd?: { sectionKey: string; terms: string[] }[];
        skillsReorder?: { sectionKey: string; ordered: string[] }[];
        headline?: string;
        summary?: string;
        warnings?: string[];
      };
      const changes = r.changes ?? [];
      setImproveChanges(changes);
      setImproveChecked(new Set(changes.map((_, i) => i)));
      setImproveHeadline(r.headline ?? null);
      setImproveSummary(r.summary ?? null);
      setImproveSkillsAdd((r.skillsAdd ?? []).filter((sa) => cv.sections.some((x) => x.key === sa.sectionKey)));
      setImproveSkillsReorder((r.skillsReorder ?? []).filter((sr) => cv.sections.some((x) => x.key === sr.sectionKey)));
      setImproveWarnings(r.warnings ?? []);
      setToast(`${changes.length} modification(s) amélioratrice(s) prête(s)`);
    } catch {
      setToast("IA indisponible — réessaie dans un instant");
    } finally {
      setImproveBusy(false);
    }
  };

  const applyImprove = () => {
    if (!improveChanges.length) return;
    const next: CvData = JSON.parse(JSON.stringify(cv));
    if (improveHeadline) next.basics.headline = improveHeadline;
    if (improveSummary) next.summary = improveSummary;
    for (let i = 0; i < improveChanges.length; i++) {
      if (!improveChecked.has(i)) continue;
      const c = improveChanges[i];
      for (const sec of next.sections) {
        if (sec.kind === "list") {
          for (const item of sec.items) {
            if (item.detail.includes(c.original)) {
              item.detail = item.detail.replace(c.original, c.rewritten);
            }
          }
        } else if (sec.text.includes(c.original)) {
          sec.text = sec.text.replace(c.original, c.rewritten);
        }
      }
    }
    for (const sa of improveSkillsAdd) {
      const sec = next.sections.find((x) => x.key === sa.sectionKey);
      if (sec && sec.kind === "text") {
        const terms = sa.terms.filter((t) => !sec.text.toLowerCase().includes(t.toLowerCase()));
        if (terms.length) sec.text = `${sec.text.replace(/\s*$/, "")}${sec.text.trim() ? ", " : ""}${terms.join(", ")}`;
      }
    }
    for (const sr of improveSkillsReorder) {
      const sec = next.sections.find((x) => x.key === sr.sectionKey);
      if (sec && sec.kind === "text") sec.text = sr.ordered.join(", ");
    }
    persist(next);
    setImproveChanges([]);
    setToast("Améliorations appliquées");
  };

  /* ─── Trim : ajuster le CV à 1 page ─── */

  const runTrim = async () => {
    if (trimBusy || !offer) return;
    setTrimBusy(true);
    setTrimCuts([]);
    setTrimChecked(new Set());
    setTrimRemove([]);
    setTrimRemoveChecked(new Set());
    setTrimWords(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "trim",
          cvOriginal: cvToText(cv),
          offerText: `${offer.title} — ${offer.company}. ${offer.text}`,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const r = json.result as {
        totalWords?: number;
        targetWords?: number;
        estimatedFinalWords?: number;
        cuts?: TrimCut[];
        sectionsToRemove?: { section: string; reason: string }[];
        skillsReorder?: { sectionKey: string; ordered: string[] }[];
      };
      const cuts = r.cuts ?? [];
      setTrimCuts(cuts);
      setTrimChecked(new Set(cuts.map((_, i) => i)));
      setTrimRemove(r.sectionsToRemove ?? []);
      setTrimRemoveChecked(new Set((r.sectionsToRemove ?? []).map((_, i) => i)));
      setTrimWords({
        total: r.totalWords ?? cvToText(cv).split(/\s+/).length,
        target: r.targetWords ?? 450,
        final: r.estimatedFinalWords ?? 0,
      });
      setToast(`${cuts.length} coupe(s) proposée(s) pour 1 page`);
    } catch {
      setToast("IA indisponible — réessaie dans un instant");
    } finally {
      setTrimBusy(false);
    }
  };

  const applyTrim = () => {
    if (!trimCuts.length) return;
    const next: CvData = JSON.parse(JSON.stringify(cv));
    for (let i = 0; i < trimCuts.length; i++) {
      if (!trimChecked.has(i)) continue;
      const c = trimCuts[i];
      for (const sec of next.sections) {
        if (sec.kind === "list") {
          for (const item of sec.items) {
            if (item.detail.includes(c.original)) {
              item.detail = item.detail.replace(c.original, c.trimmed);
            }
          }
        } else if (sec.text.includes(c.original)) {
          sec.text = sec.text.replace(c.original, c.trimmed);
        }
      }
    }
    const toRemove = new Set<number>();
    for (let i = 0; i < trimRemove.length; i++) {
      if (!trimRemoveChecked.has(i)) continue;
      toRemove.add(i);
    }
    if (toRemove.size > 0) {
      const removedTitles = new Set([...toRemove].map((i) => trimRemove[i].section));
      next.sections = next.sections.filter((s) => !removedTitles.has(s.title));
    }
    persist(next);
    setTrimCuts([]);
    setTrimRemove([]);
    setToast("Coupes appliquées — vérifie l'aperçu");
  };

  /* ─── Batch Compare : comparer plusieurs offres ─── */

  const runBatchCompare = async () => {
    if (batchBusy) return;
    if (offers.length === 0) {
      setToast("Ajoute des offres dans Candidatures d'abord");
      return;
    }
    setBatchBusy(true);
    setBatchResults([]);
    setBatchSummary(null);
    setBatchQuickWins([]);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "batch-compare",
          cvOriginal: cvToText(cv),
          jobs: offers.map((o) => ({ id: o.id, title: o.title, company: o.company, location: "" })),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const r = json.result as { batch?: BatchItem[]; globalSummary?: string; quickWins?: string[] };
      setBatchResults(r.batch ?? []);
      setBatchSummary(r.globalSummary ?? null);
      setBatchQuickWins(r.quickWins ?? []);
      setToast(`${(r.batch ?? []).length} offres comparées`);
    } catch {
      setToast("IA indisponible — réessaie dans un instant");
    } finally {
      setBatchBusy(false);
    }
  };

  /* ─── Boost ATS : mode agressif pour les robots-tri ─── */

  const runBoostAts = async () => {
    if (boostBusy || !offer) return;
    setBoostBusy(true);
    setSuggestions(null);
    setAtsScore(null);
    setAiPhraseReport(null);
    setEnrichStep("idle");
    try {
      const kwRes = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "keywords", offerText: offer.text }),
      });
      const kwJson = await kwRes.json();
      const keywords = kwJson.ok ? kwJson.result.keywords ?? [] : [];
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "boost-ats",
          cvOriginal: cvToText(cv),
          offerText: `${offer.title} — ${offer.company}. ${offer.text}`,
          keywords,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const r = json.result as {
        headline?: string;
        changes?: { section: string; original: string; rewritten: string }[];
        skillsReorg?: { sectionKey: string; originalText: string; reorganizedText: string }[];
        atsScore?: AtsScore;
      };
      setAtsScore(r.atsScore ?? null);
      if (r.changes?.length) {
        const boosts: Suggestion[] = r.changes.map((c) => ({
          sectionKey: "",
          itemId: "",
          proposed: c.rewritten,
          reason: `Boost ATS — ${c.section}`,
          risky: false,
          method: "KEYWORD_INSERT",
        }));
        setSuggestions(boosts);
        setChecked(new Set(boosts.map((s) => s.itemId)));
      }
      if (r.skillsReorg?.length) {
        const next = JSON.parse(JSON.stringify(cv)) as CvData;
        for (const sr of r.skillsReorg) {
          const sec = next.sections.find((x) => x.key === sr.sectionKey);
          if (sec && sec.kind === "text") sec.text = sr.reorganizedText;
        }
        persist(next);
      }
      setToast(r.atsScore ? `Boost ATS — score : ${r.atsScore.score}/100` : "Boost ATS appliqué");
    } catch {
      setToast("IA indisponible — réessaie dans un instant");
    } finally {
      setBoostBusy(false);
    }
  };

  /* ─── Exports ─── */

  const printPdf = () => {
    const w = window.open("", "_blank", "width=880,height=1000");
    if (!w) {
      setToast("Autorise les pop-ups pour l&apos;aperçu PDF");
      return;
    }
    w.document.write(
      cvDocumentHtml(cv, design, `${cv.basics.name || "cv"} — ${offer?.company ?? "cible."}`) +
        "<script>window.onload=()=>setTimeout(()=>window.print(),250)</script>"
    );
    w.document.close();
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(cv, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cv_${(cv.basics.name || "cible").replace(/\s+/g, "_").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as CvData;
        if (!parsed.basics || !Array.isArray(parsed.sections)) throw new Error();
        persist(parsed);
        setToast("CV importé");
      } catch {
        setToast("Fichier JSON invalide");
      }
    };
    reader.readAsText(file);
  };

  const input = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[0.85rem] focus:border-mint/60 outline-none";

  return (
    <>
      <AppPageHead
        eyebrow={`${NAV_LABEL["/app/cv"]} · Builder`}
        title="Builder CV"
        sub="Données à gauche, aperçu live au centre, design à droite. L'IA propose, tu appliques — le PDF sort exactement de l'aperçu."
      />
      <p className="text-[0.8rem] text-muted mb-4">
        <Link href="/app/cv" className="text-mint hover:text-mint-strong">← Retour à CV intelligent</Link>
        {" · "}
        {data.originalCv?.text ? "chargé depuis ton CV original — corrige ce que le parseur a mal lu" : "espace vide — colle ton CV dans CV intelligent puis reviens"}
      </p>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_260px] gap-5 items-start">
        {/* ─── PANNEAU GAUCHE : IA + données ─── */}
        <div className="space-y-5 min-w-0">
          {/* IA */}
          <section className="glass-card p-5">
            <h2 className="font-display text-base font-semibold mb-3">Assistance IA</h2>
            {offers.length === 0 ? (
              <p className="text-[0.8rem] text-muted">Ajoute une offre dans Candidatures pour activer les suggestions.</p>
            ) : (
              <>
                <select className={input + " mb-3"} value={offer?.id ?? ""} onChange={(e) => setOfferId(e.target.value)}>
                  {offers.map((o) => (
                    <option key={o.id} value={o.id}>{o.company} — {o.title.slice(0, 40)}</option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-primary" onClick={runSuggestions} disabled={aiBusy}>
                    {aiBusy ? AI_LABEL.analyzeBusy : "✨ Suggestions IA"}
                  </button>
                  <button type="button" className="btn-line" onClick={runEntretien} disabled={entretienBusy}>
                    {entretienBusy ? "Préparation…" : "🎤 Questions d'entretien"}
                  </button>
                  <button type="button" className="btn-line" onClick={runEnrichAnalyze} disabled={enrichBusy}>
                    {enrichBusy ? (enrichStep === "generating" ? "Génération…" : "Analyse…") : "🔍 Enrichir mon CV"}
                  </button>
                  <button type="button" className="btn-line" onClick={runBoostAts} disabled={boostBusy}>
                    {boostBusy ? "Boost en cours…" : "⚡ Boost ATS"}
                  </button>
                  <button type="button" className="btn-line" onClick={runImprove} disabled={improveBusy}>
                    {improveBusy ? "Analyse…" : "🔧 Améliorer (diff)"}
                  </button>
                  <button type="button" className="btn-line" onClick={runTrim} disabled={trimBusy}>
                    {trimBusy ? "Analyse…" : "✂️ Ajuster 1 page"}
                  </button>
                  <button type="button" className="btn-line" onClick={runBatchCompare} disabled={batchBusy}>
                    {batchBusy ? "Comparaison…" : "📊 Comparer batch"}
                  </button>
                </div>
              </>
            )}

            {/* Score ATS pondéré */}
            {atsScore && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="mono-label mb-2">Score ATS pondéré</p>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl font-bold text-mint">{atsScore.score}</span>
                  <span className="text-[0.78rem] text-muted">/ 100</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[0.75rem]">
                  <div className="rounded-lg bg-cream p-2 text-center">
                    <p className="font-semibold">{atsScore.hardSkills.covered}/{atsScore.hardSkills.total}</p>
                    <p className="text-muted">Hard skills (×2)</p>
                  </div>
                  <div className="rounded-lg bg-cream p-2 text-center">
                    <p className="font-semibold">{atsScore.titleKeywords.covered}/{atsScore.titleKeywords.total}</p>
                    <p className="text-muted">Titre (×1.5)</p>
                  </div>
                  <div className="rounded-lg bg-cream p-2 text-center">
                    <p className="font-semibold">{atsScore.businessContext.covered}/{atsScore.businessContext.total}</p>
                    <p className="text-muted">Contexte (×1)</p>
                  </div>
                </div>
              </div>
            )}

            {/* Rapport anti-phrases IA */}
            {aiPhraseReport && aiPhraseReport.replaced > 0 && (
              <div className="mt-3 rounded-lg bg-amber/10 border border-amber/30 p-3 text-[0.78rem]">
                <p className="font-medium text-amber">{aiPhraseReport.replaced} expression(s) IA détectée(s) et remplacée(s)</p>
                <p className="text-muted mt-1">Expressions comme « spearheaded », « holistic », « scalable » ont été remplacées par des termes plus naturels.</p>
              </div>
            )}

            {/* Enrichment Wizard */}
            {enrichStep === "questions" && enrichQuestions.length > 0 && (
              <div className="mt-4 border-t border-line pt-4 space-y-3">
                <p className="mono-label">Enrichissement — question {enrichQIdx + 1}/{enrichQuestions.length}</p>
                {enrichSummary && <p className="text-[0.78rem] text-muted italic">{enrichSummary}</p>}
                {(() => {
                  const q = enrichQuestions[enrichQIdx];
                  const item = enrichItems.find((x) => x.itemId === q.itemId);
                  return (
                    <div key={q.questionId} className="space-y-2">
                      {item && <p className="text-[0.78rem] font-medium">Concernant : {item.title}</p>}
                      <p className="text-[0.82rem]">{q.question}</p>
                      <textarea
                        className={input}
                        rows={3}
                        placeholder={q.placeholder}
                        value={enrichAnswers[q.questionId] ?? ""}
                        onChange={(e) => setEnrichAnswers({ ...enrichAnswers, [q.questionId]: e.target.value })}
                      />
                    </div>
                  );
                })()}
                <div className="flex gap-2">
                  <button type="button" className="btn-line" onClick={() => setEnrichQIdx(Math.max(0, enrichQIdx - 1))} disabled={enrichQIdx === 0}>← Préc</button>
                  {enrichQIdx < enrichQuestions.length - 1 ? (
                    <button type="button" className="btn-line" onClick={() => setEnrichQIdx(enrichQIdx + 1)}>Suiv →</button>
                  ) : (
                    <button type="button" className="btn-primary" onClick={runEnrichGenerate} disabled={enrichBusy}>
                      {enrichBusy ? "Génération…" : "✨ Générer les suggestions"}
                    </button>
                  )}
                  <button type="button" className="btn-line text-muted" onClick={() => { setEnrichStep("idle"); setEnrichQuestions([]); }}>Annuler</button>
                </div>
              </div>
            )}

            {enrichStep === "done" && enrichSummary && !suggestions && (
              <div className="mt-4 border-t border-line pt-4 text-[0.82rem]">
                <p className="font-medium text-mint">Analyse terminée</p>
                <p className="text-muted mt-1">{enrichSummary}</p>
              </div>
            )}

            {/* Improve (diff-based) results */}
            {improveChanges.length > 0 && (
              <div className="mt-4 border-t border-line pt-4 space-y-2.5">
                <p className="mono-label">Améliorations ciblées ({improveChanges.length})</p>
                {improveWarnings.length > 0 && (
                  <div className="rounded-lg bg-amber/10 border border-amber/30 p-2 text-[0.76rem]">
                    {improveWarnings.map((w, i) => <p key={i} className="text-amber">⚠ {w}</p>)}
                  </div>
                )}
                {improveHeadline && (
                  <label className="flex items-start gap-2.5 text-[0.82rem]">
                    <input type="checkbox" checked={true} readOnly className="mt-1 accent-[#0b6b4f]" />
                    <span><b>Titre :</b> {improveHeadline}</span>
                  </label>
                )}
                {improveSummary && (
                  <label className="flex items-start gap-2.5 text-[0.82rem]">
                    <input type="checkbox" checked={true} readOnly className="mt-1 accent-[#0b6b4f]" />
                    <span><b>Profil :</b> {improveSummary.slice(0, 120)}…</span>
                  </label>
                )}
                {improveChanges.map((c, i) => (
                  <label key={i} className="flex items-start gap-2.5 text-[0.82rem]">
                    <input
                      type="checkbox"
                      checked={improveChecked.has(i)}
                      onChange={() => { const n = new Set(improveChecked); if (n.has(i)) n.delete(i); else n.add(i); setImproveChecked(n); }}
                      className="mt-1 accent-[#0b6b4f]"
                    />
                    <span>
                      <span className={`text-[0.7rem] px-1.5 py-0.5 rounded ${c.method === "KEYWORD_INSERT" ? "bg-mint/20 text-mint" : c.method === "VARIANT_FIX" ? "bg-sage/20 text-sage" : "bg-cream text-muted"}`}>{c.method}</span>
                      <span className="ml-1 text-muted">({c.impact})</span>
                      <span className="block text-text-dim mt-0.5">{c.original.slice(0, 60)}… → {c.rewritten.slice(0, 60)}…</span>
                      <span className="block text-muted text-[0.76rem] mt-0.5">{c.reason}</span>
                    </span>
                  </label>
                ))}
                {improveSkillsAdd.map((sa) => (
                  <p key={sa.sectionKey} className="text-[0.82rem] text-mint">+ Compétences : {sa.terms.join(", ")}</p>
                ))}
                {improveSkillsReorder.length > 0 && (
                  <p className="text-[0.82rem] text-sage">↻ Compétences réordonnées</p>
                )}
                <button type="button" className="btn-primary" onClick={applyImprove}>Appliquer les améliorations</button>
              </div>
            )}

            {/* Trim (1 page) results */}
            {trimCuts.length > 0 && (
              <div className="mt-4 border-t border-line pt-4 space-y-2.5">
                <p className="mono-label">Ajustement 1 page</p>
                {trimWords && (
                  <div className="flex items-center gap-3 text-[0.82rem]">
                    <span className="text-muted">Mots : {trimWords.total}</span>
                    <span className="text-muted">→</span>
                    <span className="font-semibold text-mint">{trimWords.target}</span>
                    <span className="text-muted">objectif</span>
                  </div>
                )}
                {trimRemove.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[0.76rem] text-muted font-medium">Sections à supprimer :</p>
                    {trimRemove.map((r, i) => (
                      <label key={i} className="flex items-start gap-2.5 text-[0.82rem]">
                        <input
                          type="checkbox"
                          checked={trimRemoveChecked.has(i)}
                          onChange={() => { const n = new Set(trimRemoveChecked); if (n.has(i)) n.delete(i); else n.add(i); setTrimRemoveChecked(n); }}
                          className="mt-1 accent-[#0b6b4f]"
                        />
                        <span><b>{r.section}</b> — <span className="text-muted">{r.reason}</span></span>
                      </label>
                    ))}
                  </div>
                )}
                {trimCuts.map((c, i) => (
                  <label key={i} className="flex items-start gap-2.5 text-[0.82rem]">
                    <input
                      type="checkbox"
                      checked={trimChecked.has(i)}
                      onChange={() => { const n = new Set(trimChecked); if (n.has(i)) n.delete(i); else n.add(i); setTrimChecked(n); }}
                      className="mt-1 accent-[#0b6b4f]"
                    />
                    <span>
                      <span className={`text-[0.7rem] px-1.5 py-0.5 rounded ${c.priority === "haute" ? "bg-amber/20 text-amber" : "bg-cream text-muted"}`}>-{c.wordsSaved} mots</span>
                      <span className="block text-text-dim mt-0.5">{c.original.slice(0, 80)}…</span>
                      <span className="block text-mint text-[0.76rem] mt-0.5">→ {c.trimmed.slice(0, 80)}…</span>
                    </span>
                  </label>
                ))}
                <button type="button" className="btn-primary" onClick={applyTrim}>Appliquer les coupes</button>
              </div>
            )}

            {/* Batch Compare results */}
            {batchResults.length > 0 && (
              <div className="mt-4 border-t border-line pt-4 space-y-2.5">
                <p className="mono-label">Comparaison batch — {batchResults.length} offres</p>
                {batchSummary && <p className="text-[0.82rem] text-muted italic">{batchSummary}</p>}
                {batchResults.sort((a, b) => b.match - a.match).map((b) => (
                  <div key={b.id} className="rounded-lg bg-cream/50 p-3 text-[0.82rem]">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{offers.find((o) => o.id === b.id)?.company ?? b.id}</span>
                      <span className={`font-bold ${b.match >= 75 ? "text-mint" : b.match >= 50 ? "text-sage" : "text-amber"}`}>{b.match}/100</span>
                    </div>
                    <p className="text-muted mt-1 text-[0.76rem]">{b.topRecommendation}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {b.missingKeywords.slice(0, 4).map((k) => (
                        <span key={k} className="text-[0.7rem] px-1.5 py-0.5 rounded bg-amber/10 text-amber">-{k}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[0.72rem] text-muted">
                      <span>Effort : {b.effortLevel}</span>
                      <span>•</span>
                      <span>+{b.estimatedBoost} pts ATS gagnables</span>
                    </div>
                  </div>
                ))}
                {batchQuickWins.length > 0 && (
                  <div className="rounded-lg bg-mint/5 border border-mint/20 p-2 text-[0.78rem]">
                    <p className="font-medium text-mint mb-1">Quick wins (plusieurs offres)</p>
                    {batchQuickWins.map((w, i) => <p key={i} className="text-text-dim">• {w}</p>)}
                  </div>
                )}
              </div>
            )}

            {suggestions && suggestions.length + skillsAdd.length + (headline ? 1 : 0) + (summary ? 1 : 0) > 0 && (
              <div className="mt-4 border-t border-line pt-4 space-y-2.5">
                {headline && (
                  <label className="flex items-start gap-2.5 text-[0.82rem]">
                    <input type="checkbox" checked={checked.has("__headline__")} onChange={(e) => { const n = new Set(checked); if (e.target.checked) { n.add("__headline__"); } else { n.delete("__headline__"); } setChecked(n); }} className="mt-1 accent-[#0b6b4f]" />
                    <span><b>Titre :</b> {headline}</span>
                  </label>
                )}
                {summary && (
                  <label className="flex items-start gap-2.5 text-[0.82rem]">
                    <input type="checkbox" checked={checked.has("__summary__")} onChange={(e) => { const n = new Set(checked); if (e.target.checked) { n.add("__summary__"); } else { n.delete("__summary__"); } setChecked(n); }} className="mt-1 accent-[#0b6b4f]" />
                    <span><b>Profil :</b> {summary.slice(0, 160)}…</span>
                  </label>
                )}
                {suggestions.map((s) => {
                  const item = cv.sections.find((x) => x.key === s.sectionKey)?.items.find((i) => i.id === s.itemId);
                  return (
                    <label key={s.itemId} className="flex items-start gap-2.5 text-[0.82rem]">
                      <input
                        type="checkbox"
                        checked={checked.has(s.itemId)}
                        disabled={s.risky}
                        onChange={(e) => { const n = new Set(checked); if (e.target.checked) { n.add(s.itemId); } else { n.delete(s.itemId); } setChecked(n); }}
                        className="mt-1 accent-[#0b6b4f]"
                      />
                      <span>
                        <b>{item?.title.slice(0, 40)}</b> — {s.reason}
                        <span className="block text-muted mt-0.5">→ {s.proposed.slice(0, 140)}…</span>
                        {s.risky && <span className="block text-amber mt-0.5">⚠ chiffre nouveau détecté — à vérifier avant d&apos;activer</span>}
                      </span>
                    </label>
                  );
                })}
                {skillsAdd.map((sa) => (
                  <p key={sa.sectionKey} className="text-[0.82rem] text-mint">+ Compétences à ajouter : {sa.terms.join(", ")}</p>
                ))}
                <button type="button" className="btn-primary" onClick={applySuggestions}>Appliquer la sélection</button>
              </div>
            )}

            {entretien && (
              <div className="mt-4 border-t border-line pt-4 space-y-3">
                {entretien.map((q, i) => (
                  <div key={i} className="text-[0.82rem]">
                    <p className="font-medium">{i + 1}. {q.q}</p>
                    <p className="text-text-dim mt-1 leading-snug">{q.a}</p>
                    {q.insight && <p className="text-muted mt-0.5 text-[0.76rem] italic">→ {q.insight}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Données */}
          <section className="glass-card p-5 space-y-4">
            <h2 className="font-display text-base font-semibold">En-tête</h2>
            <input className={input} value={cv.basics.name} onChange={(e) => persist({ ...cv, basics: { ...cv.basics, name: e.target.value } })} placeholder="Nom complet" />
            <input className={input} value={cv.basics.headline} onChange={(e) => persist({ ...cv, basics: { ...cv.basics, headline: e.target.value } })} placeholder="Titre professionnel" />
            <input className={input} value={cv.basics.contact} onChange={(e) => persist({ ...cv, basics: { ...cv.basics, contact: e.target.value } })} placeholder="Ville · e-mail · téléphone" />
            <textarea className={input} rows={3} value={cv.summary} onChange={(e) => persist({ ...cv, summary: e.target.value })} placeholder="Profil / résumé" />
          </section>

          {cv.sections.map((s) => (
            <section key={s.key} className="glass-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <input className={input + " font-semibold"} value={s.title} onChange={(e) => mutateSection(s.key, (x) => ({ ...x, title: e.target.value }))} />
                <button type="button" className="btn-line px-2!" onClick={() => moveSection(s.key, -1)} title="Monter">↑</button>
                <button type="button" className="btn-line px-2!" onClick={() => moveSection(s.key, 1)} title="Descendre">↓</button>
              </div>
              {s.kind === "text" ? (
                <textarea className={input} rows={3} value={s.text} onChange={(e) => mutateSection(s.key, (x) => ({ ...x, text: e.target.value }))} />
              ) : (
                <>
                  {s.items.map((i) => (
                    <div key={i.id} className="border border-line rounded-lg p-3 space-y-2">
                      <div className="flex gap-2">
                        <input className={input} value={i.title} onChange={(e) => mutateItem(s.key, i.id, (x) => ({ ...x, title: e.target.value }))} placeholder="Intitulé" />
                        <button type="button" className="btn-line px-2! opacity-60 hover:opacity-100" onClick={() => mutateSection(s.key, (x) => ({ ...x, items: x.items.filter((y) => y.id !== i.id) }))}>✕</button>
                      </div>
                      <input className={input} value={i.meta ?? ""} onChange={(e) => mutateItem(s.key, i.id, (x) => ({ ...x, meta: e.target.value }))} placeholder="Entreprise (période)" />
                      <textarea className={input} rows={3} value={i.detail} onChange={(e) => mutateItem(s.key, i.id, (x) => ({ ...x, detail: e.target.value }))} placeholder="Détail / réalisations" />
                    </div>
                  ))}
                  <button type="button" className="btn-line" onClick={() => mutateSection(s.key, (x) => ({ ...x, items: [...x.items, { id: uid(), title: "", meta: "", detail: "" }] }))}>＋ Ajouter un élément</button>
                </>
              )}
            </section>
          ))}
        </div>

        {/* ─── PANNEAU CENTRE : aperçu live = source du PDF ─── */}
        <div className="xl:sticky xl:top-6">
          <div className="glass-card p-4">
            <p className="mono-label mb-3">Aperçu live — identique au PDF</p>
            <style dangerouslySetInnerHTML={{ __html: cvStyles(design) }} />
            <div className="cvdoc bg-white rounded-lg shadow-lg p-8 min-h-[600px]" dangerouslySetInnerHTML={{ __html: cvBodyHtml(cv) }} />
          </div>
        </div>

        {/* ─── PANNEAU DROIT : design + exports ─── */}
        <div className="space-y-4 xl:sticky xl:top-6">
          <section className="glass-card p-5 space-y-4">
            <h2 className="font-display text-base font-semibold">Design</h2>
            <div className="space-y-2">
              {(["design", "ats", "compact"] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 text-[0.82rem]">
                  <input type="radio" name="tpl" checked={design.template === t} onChange={() => setDesign({ ...design, template: t })} className="accent-[#0b6b4f]" />
                  {t === "design" ? "Design (serif, accent)" : t === "ats" ? "ATS (sobre, robots)" : "Compact (dense)"}
                </label>
              ))}
            </div>
            <label className="flex items-center justify-between gap-3 text-[0.82rem]">
              Couleur
              <input type="color" value={design.accent} onChange={(e) => setDesign({ ...design, accent: e.target.value })} className="w-10 h-8 rounded cursor-pointer" />
            </label>
            <label className="flex items-center justify-between gap-3 text-[0.82rem]">
              Taille : {design.fontSize}pt
              <input type="range" min={9} max={13} step={0.5} value={design.fontSize} onChange={(e) => setDesign({ ...design, fontSize: Number(e.target.value) })} className="accent-[#0b6b4f] w-28" />
            </label>
          </section>

          <section className="glass-card p-5 space-y-2">
            <h2 className="font-display text-base font-semibold mb-1">Exports</h2>
            <button type="button" className="btn-primary w-full" onClick={printPdf}>🖨️ PDF (aperçu imprimable)</button>
            <button type="button" className="btn-line w-full" onClick={exportJson}>↓ Sauvegarde JSON</button>
            <button type="button" className="btn-line w-full" onClick={() => importRef.current?.click()}>↑ Importer un JSON</button>
            <input ref={importRef} type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ""; }} />
            <p className="text-[0.7rem] text-muted leading-snug pt-1">
              Tout est enregistré dans ton navigateur. L&apos;IA ne touche jamais au rendu : elle propose, tu appliques.
            </p>
          </section>
        </div>
      </div>

      {toast && (
        <div className="toast" role="status">
          <span className="w-2 h-2 rounded-full bg-mint inline-block" />
          {toast}
        </div>
      )}
    </>
  );
}
