"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  getOrCreateData,
  saveData,
  type DetectedOffer,
  type UserData,
} from "@/lib/data";
import { AppPageHead } from "@/components/app/AppShell";
import { atsScore, type AtsBreakdown } from "@/lib/ats";
import { checkFacts, type FactsReport } from "@/lib/facts";
import { preFit, ceilingScore, type PreFit } from "@/lib/fit";
import type { Tailoring } from "@/lib/data";

/* Surligne dans `text` toutes les occurrences des mots-clés de l'offre. */
function Highlight({ text, keys }: { text: string; keys: string[] }) {
  const nodes: ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest.length > 0) {
    let hitAt = -1;
    let hitKey = "";
    for (const key of keys) {
      if (!key) continue;
      const at = rest.toLowerCase().indexOf(key.toLowerCase());
      if (at !== -1 && (hitAt === -1 || at < hitAt)) {
        hitAt = at;
        hitKey = key;
      }
    }
    if (hitAt === -1) {
      nodes.push(rest);
      break;
    }
    if (hitAt > 0) nodes.push(rest.slice(0, hitAt));
    nodes.push(<mark key={k++} className="add">{rest.slice(hitAt, hitAt + hitKey.length)}</mark>);
    rest = rest.slice(hitAt + hitKey.length);
  }
  return <>{nodes}</>;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Kw = { term: string; importance?: string; type?: string };
type Change = { section: string; original: string; rewritten: string };
type AiResult = {
  headline?: string;
  changes?: Change[];
  integrated?: { keyword: string; where?: string; reason?: string }[];
  refused?: { keyword: string; reason?: string }[];
  stillMissing?: { item: string; howToGet?: string }[];
  tips?: string[];
};
type CvBlock = { kind: "h2" | "p" | "li"; text: string };
type FinalContent = {
  name: string;
  contact: string;
  headline: string;
  blocks: CvBlock[];
  rawText: string;
  words: number;
  editsApplied: number;
};

/* Mise en page déterministe du CV final : le texte original (avec ses quelques
   phrases remplacées) est découpé en blocs — titres de section, puces,
   paragraphes. Aucune IA ici : rien ne peut être perdu. */
const SECTION_HINTS = [
  "profil", "expérience", "experience", "formation", "compétence", "competence",
  "projet", "certification", "langue", "centre", "interet", "intérêt", "atout",
  "qualité", "qualite", "hobbie", "divers", "informatique", "logiciels", "skills",
  "parcours", "réalisations", "realisations",
];

function looksLikeHeader(l: string): boolean {
  if (l.length > 70 || l.length < 3) return false;
  const low = l.toLowerCase();
  const allCaps = /[A-ZÀ-Ý]/.test(l) && !/[a-zà-ÿ]/.test(l) && l === l.toUpperCase();
  const trailingColon = /:\s*$/.test(l) && l.split(" ").length <= 6;
  /* Une ligne « connue » n'est un titre que si elle est courte et sans
     chiffres — sinon c'est du contenu (ex : « Certification Google… (2024) »). */
  const shortClean = l.length <= 28 && !/\d/.test(l);
  const knownSection =
    shortClean &&
    SECTION_HINTS.some((w) => {
      const base = w.replace(/s$/, "");
      return low === base || low === base + "s" || low.startsWith(base + " ") || low.startsWith(base + "s ") || low.startsWith(base + " :") || low.startsWith(base + "s :") || low.startsWith(base + ":");
    });
  return allCaps || trailingColon || knownSection;
}

function parseCvBlocks(text: string): { name: string; contact: string; blocks: CvBlock[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const nonEmpty = lines.filter(Boolean);
  const name = nonEmpty[0] ?? "";
  const contact =
    nonEmpty.slice(1, 5).find((l) => /@|\b0\d(?:[\s.-]?\d{2}){4}\b/.test(l)) ?? "";
  const blocks: CvBlock[] = [];
  for (const l of nonEmpty) {
    if (l === name || l === contact) continue;
    const bulletMatch = l.match(/^[-•*·–]\s+(.*)$/);
    if (bulletMatch) blocks.push({ kind: "li", text: bulletMatch[1] });
    else if (looksLikeHeader(l)) blocks.push({ kind: "h2", text: l.replace(/:\s*$/, "") });
    else blocks.push({ kind: "p", text: l });
  }
  return { name, contact, blocks };
}
type Stage = "idle" | "kws" | "rewrite" | "verify" | "done";

const STAGES: { key: Stage; label: string }[] = [
  { key: "kws", label: "Extraction des mots-clés décisifs de l'offre" },
  { key: "rewrite", label: "Réécriture chirurgicale phrase par phrase" },
  { key: "verify", label: "Contrôle anti-falsification des faits" },
];
const PCT: Record<Stage, number> = { idle: 0, kws: 12, rewrite: 58, verify: 88, done: 100 };

const nowIso = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 9);

export default function AdaptationPage() {
  const { user } = useAuth();
  const [data, setData] = useState<UserData | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [quick, setQuick] = useState<{
    offerText: string;
    selected: string[];
    meta?: {
      title?: string;
      company?: string;
      location?: string;
      salary?: string;
      summary?: string;
      keywords?: string[];
      source?: string;
      url?: string;
      match?: number;
    };
  } | null>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [kwList, setKwList] = useState<Kw[]>([]);
  const [res, setRes] = useState<AiResult | null>(null);
  const [facts, setFacts] = useState<FactsReport | null>(null);
  const [skippedEdits, setSkippedEdits] = useState<number>(0);
  const [showFormula, setShowFormula] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [prefit, setPrefit] = useState<PreFit | null>(null);

  /* Marque les phrases réécrites directement dans le texte final. */
  function MarkedText({ text, phrases, keys }: { text: string; phrases: string[]; keys: string[] }) {
    const nodes: ReactNode[] = [];
    let rest = text;
    let k = 0;
    while (rest.length > 0) {
      let hitAt = -1;
      let hitLen = 0;
      for (const ph of phrases) {
        if (!ph) continue;
        const at = rest.indexOf(ph);
        if (at !== -1 && (hitAt === -1 || at < hitAt)) { hitAt = at; hitLen = ph.length; }
      }
      if (hitAt === -1) { nodes.push(<Highlight key={k++} text={rest} keys={keys} />); break; }
      if (hitAt > 0) nodes.push(<Highlight key={k++} text={rest.slice(0, hitAt)} keys={keys} />);
      nodes.push(<mark key={k++} className="add">{rest.slice(hitAt, hitAt + hitLen)}</mark>);
      rest = rest.slice(hitAt + hitLen);
    }
    return <>{nodes}</>;
  }

  useEffect(() => {
    if (!user) return;
    const id = window.setTimeout(() => {
      const d = getOrCreateData(user.name, user.email);
      setData(d);
      let q: {
        offerText: string;
        selected: string[];
        meta?: {
          title?: string;
          company?: string;
          location?: string;
          salary?: string;
          summary?: string;
          keywords?: string[];
          source?: string;
          url?: string;
          match?: number;
        };
      } | null = null;
      try {
        const raw = window.localStorage.getItem("cible:quick-adapt");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.offerText === "string" && parsed.offerText.trim().length >= 30) {
            q = {
              offerText: parsed.offerText,
              selected: Array.isArray(parsed.selected) ? parsed.selected.filter((s: unknown) => typeof s === "string" && s) : [],
              meta: parsed.meta && typeof parsed.meta === "object" ? parsed.meta : undefined,
            };
          }
        }
      } catch {
        q = null;
      }
      setQuick(q);
      setSelId((cur) => cur ?? (q ? "quick" : [...d.offers].sort((a, b) => b.match - a.match)[0]?.id ?? null));
    }, 0);
    return () => window.clearTimeout(id);
  }, [user]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!data) return null;

  const offers = [...data.offers].sort((a, b) => b.match - a.match);
  const quickMeta = quick?.meta;
  const quickOffer: DetectedOffer | null = quick
    ? {
        id: "quick",
        title: quickMeta?.title || "Offre collée — Matching ATS",
        company: quickMeta?.company || "Matching ATS",
        location: quickMeta?.location || "",
        salary: quickMeta?.salary || "",
        match: typeof quickMeta?.match === "number" ? Math.max(0, Math.min(100, Math.round(quickMeta.match))) : 0,
        keywords: (quickMeta?.keywords?.length ? quickMeta.keywords : quick.selected).slice(0, 10),
        text: quick.offerText,
        summary: quickMeta?.summary,
        url: quickMeta?.url,
        source: quickMeta?.source || "Alertes Gmail",
      }
    : null;
  const offer: DetectedOffer | undefined =
    selId === "quick" && quickOffer
      ? quickOffer
      : offers.find((o) => o.id === selId) ?? offers[0];
  const p = data.profile;

  /* Texte de référence : le CV original collé, sinon le profil structuré. */
  const structuredCv = [
    `${p.firstName} ${p.lastName}`,
    p.title, p.city, p.email, p.phone,
    `Compétences : ${p.skills.join(", ")}`,
    ...p.experiences.map((e) => `${e.title} — ${e.place} (${e.period}) : ${e.detail}`),
    ...p.educations.map((e) => `${e.degree} — ${e.school} (${e.period})`),
  ].filter(Boolean).join("\n");
  const origText = data.originalCv?.text?.trim() || structuredCv;

  /* Applique les modifications IA au texte original, uniquement si la citation
     « original » existe mot pour mot dans le CV — sinon on écarte l'édition. */
  const assemble = (changes: Change[]) => {
    let out = origText;
    let skipped = 0;
    for (const c of changes) {
      const needle = c.original?.trim();
      if (needle && needle.length > 8 && out.includes(needle)) {
        out = out.replace(needle, c.rewritten ?? "");
      } else {
        skipped += 1;
      }
    }
    return { text: out, skipped };
  };

  const before = atsScore(origText);
  const finalAssembled = res?.changes ? assemble(res.changes) : null;
  const after = atsScore(finalAssembled?.text ?? origText);
  const kwTerms = [...kwList.map((k) => k.term), ...(res?.integrated ?? []).map((i) => i.keyword)];

  /* Contenu final unique : TON CV intégral (texte original + seules les
     phrases vérifiées remplacées). L'IA ne réécrit jamais le CV entier —
     impossible qu'il perde des sections. */
  const final: FinalContent | null =
    stage === "done" && finalAssembled
      ? (() => {
          const parsed = parseCvBlocks(finalAssembled.text);
          const words = finalAssembled.text.split(/\s+/).filter(Boolean).length;
          return {
            name: parsed.name || `${p.firstName} ${p.lastName}`,
            contact: parsed.contact,
            headline: res?.headline || p.title || "",
            blocks: parsed.blocks,
            rawText: finalAssembled.text,
            words,
            editsApplied: (res?.changes?.length ?? 0) - skippedEdits,
          };
        })()
      : null;

  const run = async () => {
    if (!offer || !user || stage === "kws" || stage === "rewrite" || stage === "verify") return;
    setRunError(null);
    try {
      const isQuick = selId === "quick" && quickOffer;
      const forceKw = isQuick ? (quick?.selected ?? []) : [];
      let offerFull = `${offer.title} — ${offer.company} — ${offer.location}. ${offer.text}`;
      if (forceKw.length > 0) {
        offerFull += `\n\nMots-clés que le candidat a choisi d'intégrer en priorité : ${forceKw.join(", ")}`;
        setToast(`${forceKw.length} mot(s)-clé(s) choisi(s) intégrés en priorité : ${forceKw.join(", ")}`);
      }
      setStage("kws");
      const kwRes = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "keywords", offerText: offerFull }),
      });
      const kwJson = await kwRes.json();
      if (!kwJson.ok) throw new Error(kwJson.error);
      const kws: Kw[] = kwJson.result.keywords ?? [];
      setKwList(kws);
      /* Score de pré-fit AVANT tout le reste : alerte si l'offre hors profil. */
      const pf = preFit(kws, origText);
      setPrefit(pf);
      console.info("[tailoring] étape 1 ok —", kws.length, "mots-clés · pré-fit", pf.score + "%");

      setStage("rewrite");
      const aiRes = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "adapt",
          profile: data.profile,
          cvOriginal: origText,
          offerText: offerFull,
          keywords: kwJson.result.keywords ?? [],
          forceKeywords: forceKw,
        }),
      });
      const aiJson = await aiRes.json();
      if (!aiJson.ok) throw new Error(aiJson.error);
      const r = aiJson.result as AiResult;
      console.info("[tailoring] étape 2 ok —", {
        changes: r.changes?.length ?? 0,
        intégrés: r.integrated?.length ?? 0,
        refusés: r.refused?.length ?? 0,
        manques: r.stillMissing?.length ?? 0,
      });
      setRes(r);

      setStage("verify");
      const asm = assemble(r.changes ?? []);
      setSkippedEdits(asm.skipped);
      const fr = checkFacts(origText, asm.text, offerFull);
      setFacts(fr);
      setStage("done");

      /* Historique : trace de chaque tailoring pour retrouver ce qui a été
         modifié, offre par offre. */
      const applied = (r.changes ?? []).length - asm.skipped;
      const fitAfter = ceilingScore(pf ?? { total: 0, present: [], absent: [], score: 0 }, (r.integrated ?? []).map((i) => i.keyword));
      const entry: Tailoring = {
        id: uid(),
        company: offer.company,
        title: offer.title,
        date: nowIso(),
        words: asm.text.split(/\s+/).filter(Boolean).length,
        edits: applied,
        fitBefore: pf?.score ?? 0,
        fitAfter,
        factsChecked: fr.checked,
        factsPreserved: fr.preserved,
        headline: r.headline ?? "",
      };
      const next: UserData = { ...data, tailorings: [entry, ...(data.tailorings ?? [])].slice(0, 8) };
      setData(next);
      saveData(user.email, next);
    } catch (e) {
      setStage("idle");
      setRunError(e instanceof Error ? e.message : "Le tailoring a échoué — réessaie dans un instant");
    } finally {
    }
  };

  /* ─── Exports ─────────────────────────────────────────────── */

  const buildHtml = (mode: "design" | "ats") => {
    if (!final) return "";
    const factsLine =
      facts && facts.checked > 0
        ? `Faits contrôlés : ${facts.preserved}/${facts.checked} conservés${facts.lost.length === 0 && facts.invented.length === 0 ? " — aucune altération." : "."}`
        : "";
    const css =
      mode === "design"
        ? `body{font-family:Georgia,'Times New Roman',serif;color:#17150f;line-height:1.55;margin:40px auto;max-width:760px;padding:0 28px}
h1{font-size:2rem;margin:0}h2{color:#0b6b4f;text-transform:uppercase;letter-spacing:.09em;font-size:.85rem;border-bottom:2px solid #d9f5e8;padding-bottom:5px;margin:30px 0 10px}
.sub{color:#555}.kw{color:#0b6b4f;font-weight:bold}ul{margin:6px 0;padding-left:18px}li{margin:3px 0}p{margin:8px 0}`
        : `body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#000;line-height:1.45;margin:32px auto;max-width:760px;padding:0 24px}
h1{font-size:16pt;margin:0 0 2pt}h2{font-size:11pt;text-transform:uppercase;border-bottom:1px solid #000;padding-bottom:2pt;margin:16pt 0 6pt}
.sub{margin:0 0 8pt}.kw{font-weight:bold}ul{margin:6px 0;padding-left:16px}li{margin:3px 0}p{margin:7px 0}`;
    /* Blocs → HTML, puces consécutives regroupées en listes. */
    let body = "";
    let openList = false;
    for (const b of final.blocks) {
      if (b.kind === "li") {
        if (!openList) { body += "<ul>"; openList = true; }
        body += `<li>${esc(b.text)}</li>`;
      } else {
        if (openList) { body += "</ul>"; openList = false; }
        body += b.kind === "h2" ? `<h2>${esc(b.text)}</h2>` : `<p>${esc(b.text)}</p>`;
      }
    }
    if (openList) body += "</ul>";
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(final.name)} — CV${offer ? ` ${esc(offer.company)}` : ""}</title><style>${css}@page{margin:14mm}</style></head><body>
<h1>${esc(final.name)}</h1>
<p class="sub">${esc(final.headline)}${offer ? ` · ciblé : ${esc(offer.title)} — ${esc(offer.company)}` : ""}${final.contact ? `<br/>${esc(final.contact)}` : ""}</p>
${body}
<p style="margin-top:34px;color:#888;font-size:.72rem">Adapté avec cible. — ${final.editsApplied} phrase(s) ajustée(s) sur un CV de ${final.words} mots, le reste est ton texte original. ${esc(factsLine)}</p></body></html>`;
  };

  const printOrSave = (html: string, filename: string) => {
    const w = window.open("", "_blank", "width=880,height=1000");
    if (!w) {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename.replace(/\.pdf$/i, ".html");
      a.click();
      URL.revokeObjectURL(url);
      setToast("Pop-up bloqué — version HTML téléchargée (imprimable en PDF)");
      return;
    }
    w.document.write(html + "<script>window.onload=()=>setTimeout(()=>window.print(),250)</script>");
    w.document.close();
  };

  const downloadTxt = () => {
    if (!res) return;
    const lines = [
      `RAPPORT DE TRANSPARENCE — Adaptation « ${offer?.company} »`,
      "",
      `Fit avant tailoring : ${prefit?.score ?? "?"}% · plafond par reformulation : ${ceiling ?? "?"}%`,
      "",
      `Mots-clés traités : ${kwList.length}`,
      ...kwList.map((k) => {
        const ok = res.integrated?.find((i) => i.keyword.toLowerCase() === k.term.toLowerCase());
        const no = res.refused?.find((i) => i.keyword.toLowerCase() === k.term.toLowerCase());
        return `- ${k.term} (${k.importance}) : ${ok ? `INTÉGRÉ — ${ok.reason ?? ok.where ?? ""}` : no ? `REFUSÉ — ${no.reason ?? ""}` : "non traité"}`;
      }),
      "",
      `Contrôle des faits : ${facts ? `${facts.preserved}/${facts.checked} conservés` : "non exécuté"}`,
      ...(facts?.lost.length ? ["Perdus :", ...facts.lost.map((f) => `- ${f.kind} : ${f.fact}`)] : []),
      ...(facts?.invented.length ? ["Inventions bloquées :", ...facts.invented.map((f) => `- ${f.fact}`)] : []),
      ...(res.stillMissing?.length
        ? ["", "Il te manque vraiment :", ...res.stillMissing.map((m) => `- ${m.item} → ${m.howToGet ?? ""}`)]
        : []),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport_tailoring_${(offer?.company ?? "offre").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("Rapport téléchargé");
  };

  /* Rapport de transparence imprimable en PDF (même contenu que le .txt). */
  const buildReportHtml = () => {
    const row = (l: string) => `<p style="margin:4px 0">${esc(l)}</p>`;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport de transparence — ${esc(offer?.company ?? "")}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#111;line-height:1.5;max-width:720px;margin:36px auto;padding:0 24px}
h1{font-size:16pt}h2{font-size:11pt;text-transform:uppercase;border-bottom:1px solid #999;padding-bottom:3pt;margin:18pt 0 6pt}.ok{color:#0b6b4f;font-weight:bold}.ko{color:#b45309;font-weight:bold}</style></head><body>
<h1>Rapport de transparence</h1>
<p>Offre : <b>${esc(offer?.title ?? "")}</b> — ${esc(offer?.company ?? "")}<br/>
Fit avant tailoring : ${prefit?.score ?? "?"}% · plafond par reformulation : ${ceiling ?? "?"}%<br/>
Contrôle des faits : <span class="${facts && facts.lost.length === 0 && facts.invented.length === 0 ? "ok" : "ko"}">${facts ? `${facts.preserved}/${facts.checked} conservés` : "non exécuté"}</span></p>
<h2>Mots-clés intégrés</h2>${(res?.integrated ?? []).map((i) => row(`✓ ${i.keyword} — ${i.where ?? ""} : ${i.reason ?? ""}`)).join("") || row("Aucun.")}
<h2>Mots-clés refusés (gaps structurels)</h2>${(res?.refused ?? []).map((i) => row(`✕ ${i.keyword} : ${i.reason ?? ""}`)).join("") || row("Aucun.")}
<h2>Il te manque vraiment</h2>${(res?.stillMissing ?? []).map((m) => row(`→ ${m.item} : ${m.howToGet ?? ""}`)).join("") || row("Rien de bloquant.")}
<h2>Phrases modifiées (${res?.changes?.length ?? 0})</h2>${(res?.changes ?? []).map((c) => row(`[${c.section}] « ${c.original} » → « ${c.rewritten} »`)).join("") || row("Aucune modification.")}
<p style="margin-top:26pt;color:#888;font-size:.75rem">Généré par cible. — vérification des faits indépendante de l'IA.</p></body></html>`;
  };

  const busy = stage === "kws" || stage === "rewrite" || stage === "verify";

  /* Plafond de gain : couverture max atteignable par reformulation seule. */
  const ceiling = res && prefit ? ceilingScore(prefit, (res.integrated ?? []).map((i) => i.keyword)) : null;
  /* Anti sur-optimisation : part des phrases du CV touchées par le tailoring. */
  const sentences = origText.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 15).length;
  const editRatio = sentences > 0 ? (final?.editsApplied ?? 0) / sentences : 0;
  const overOptimized = editRatio > 0.3;
  /* Phrases réécrites réellement présentes dans le texte final → surlignage. */
  const appliedRewrites = (res?.changes ?? [])
    .filter((c) => c.rewritten && finalAssembled?.text.includes(c.rewritten))
    .map((c) => c.rewritten);

  return (
    <>
      <AppPageHead
        eyebrow="Module 03"
        title="Adaptation IA"
        sub="Ton CV, ajusté phrase par phrase dans le vocabulaire de l'offre — jamais réécrit, jamais trahi. Chaque modification est vérifiée et justifiée."
      />

      {/* Sélecteur d'offre */}
      {(offers.length > 0 || quick) && (
        <div className="mb-6">
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" role="tablist" aria-label="Choisir l'offre cible">
            {quick && (
              <button
                role="tab"
                aria-selected={selId === "quick"}
                type="button"
                onClick={() => { if (!busy) { setSelId("quick"); setRes(null); setFacts(null); setKwList([]); setStage("idle"); } }}
                className={`shrink-0 rounded-xl border px-4 py-2.5 text-left transition-all duration-300 ${
                  selId === "quick" ? "border-mint/60 bg-mint/8" : "border-line bg-surface text-muted hover:text-text-dim hover:border-line-strong"
                }`}
              >
                <span className="block text-[0.82rem] font-medium leading-tight">📝 Offre collée</span>
                <span className={`mono-label mt-0.5 block ${selId === "quick" ? "text-mint" : ""}`}>
                  {quick.selected.length > 0 ? `${quick.selected.length} mot(s)-clé(s) sélectionné(s)` : "depuis Matching ATS"}
                </span>
              </button>
            )}
            {offers.map((o) => (
              <button
                key={o.id}
                role="tab"
                aria-selected={o.id === selId}
                type="button"
                onClick={() => { if (!busy) { setSelId(o.id); setRes(null); setFacts(null); setKwList([]); setStage("idle"); } }}
                className={`shrink-0 rounded-xl border px-4 py-2.5 text-left transition-all duration-300 ${
                  o.id === selId ? "border-mint/60 bg-mint/8" : "border-line bg-surface text-muted hover:text-text-dim hover:border-line-strong"
                }`}
              >
                <span className="block text-[0.82rem] font-medium leading-tight">{o.company}</span>
                <span className={`mono-label mt-0.5 block ${o.id === selId ? "text-mint" : ""}`}>
                  {o.title.length > 26 ? o.title.slice(0, 26) + "…" : o.title}
                </span>
              </button>
            ))}
          </div>
          {quick && (
            <p className="text-[0.72rem] text-muted mt-1.5 px-1">
              Offre analysée dans Matching ATS
              {quick.selected.length > 0 && <> · <span className="text-mint">{quick.selected.length} mot(s)-clé(s) choisi(s) intégrés en priorité</span></>}
              {" "}·
              <button
                type="button"
                className="underline underline-offset-2 text-muted hover:text-amber"
                onClick={() => {
                  try { window.localStorage.removeItem("cible:quick-adapt"); } catch {}
                  setQuick(null);
                  setSelId([...data.offers].sort((a, b) => b.match - a.match)[0]?.id ?? null);
                  setRes(null); setFacts(null); setKwList([]); setStage("idle");
                }}
              >
                retirer
              </button>
            </p>
          )}
        </div>
      )}

      {!offer ? (
        <div className="glass-card p-7 max-w-2xl">
          <p className="font-display text-lg font-semibold mb-2">Aucune offre à calibrer pour l&apos;instant</p>
          <p className="text-[0.88rem] text-text-dim leading-relaxed">
            Trouve des offres réelles qui collent à ton CV, ou colle le texte d&apos;une annonce :
            elle apparaîtra ici et le tailoring travaillera dessus.
          </p>
          <div className="flex flex-wrap gap-2 mt-5">
            <Link href="/app/candidatures" className="btn-primary">Aller dans Candidatures</Link>
            <Link href="/app/offers" className="btn-line">Explorer les offres réelles</Link>
          </div>
        </div>
      ) : (
        <>
          {/* Lancement + progression */}
          <section className="glass-card p-7 mb-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <div className="min-w-0 mr-auto">
                <h2 className="font-display text-lg font-semibold">
                  Cible : <span className="text-mint">{offer.title}</span> — {offer.company}
                </h2>
                <p className="text-[0.78rem] text-muted mt-1">
                  Source : {data.originalCv?.text ? `« ${data.originalCv.name} » (${origText.split(/\s+/).length} mots)` : "profil structuré — colle ton vrai CV dans CV intelligent pour un tailoring complet"}
                </p>
                {offer.summary && (
                  <p className="text-[0.8rem] text-text-dim leading-relaxed mt-2 max-w-2xl" data-testid="adapt-offer-summary">
                    {offer.summary}
                  </p>
                )}
                {selId === "quick" && typeof quickMeta?.match === "number" && (
                  <p className="text-[0.78rem] mt-2" data-testid="adapt-ats-badge">
                    ATS Matching :{" "}
                    <b className="text-mint tabular-nums">{quickMeta.match}%</b>
                    <span className="text-muted"> · compatibilité CV ↔ offre</span>
                  </p>
                )}
              </div>
              {!busy && (
                <button type="button" onClick={run} className="btn-primary">
                  {stage === "done" ? "↻ Relancer le tailoring" : "✨ Lancer le tailoring vérifié"}
                </button>
              )}
            </div>

            {busy && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="mono-label">Traitement en cours — tu peux naviguer, ça continue</span>
                  <span className="mono-label tabular-nums">{PCT[stage]}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full rounded-full bg-mint transition-all duration-700" style={{ width: `${PCT[stage]}%` }} />
                </div>
                <ul className="mt-4 space-y-2">
                  {STAGES.map((s) => {
                    const idx = STAGES.findIndex((x) => x.key === stage);
                    const myIdx = STAGES.findIndex((x) => x.key === s.key);
                    const state = myIdx < idx ? "ok" : myIdx === idx ? "run" : "wait";
                    return (
                      <li key={s.key} className="flex items-center gap-2.5 text-[0.85rem]">
                        {state === "ok" && <span className="text-mint">✓</span>}
                        {state === "run" && <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-mint border-t-transparent animate-spin" />}
                        {state === "wait" && <span className="opacity-30">○</span>}
                        <span className={state === "wait" ? "text-muted" : state === "ok" ? "text-text-dim" : ""}>{s.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {runError && (
              <div className="mt-5 border-l-2! border-l-red-400! pl-4 py-2">
                <p className="text-[0.85rem] text-text-dim">{runError}</p>
              </div>
            )}
          </section>

          {/* Indicateur neutre pendant le traitement */}
          {busy && prefit && (
            <p className="text-[0.78rem] text-muted -mt-2 mb-4">
              Couverture initiale des mots-clés de l&apos;offre : <b className="tabular-nums">{prefit.score}%</b> —
              le plafond de gain sera calculé à la fin du tailoring.
            </p>
          )}

          {/* Alerte gap structurel : plafond bas même après reformulation */}
          {!busy && ceiling !== null && ceiling < 50 && (
            <section className="glass-card p-6 mb-6 border-l-2! border-l-amber!">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h2 className="font-display text-lg font-semibold mr-auto">
                  Cette offre ne correspond pas à ton profil actuel
                </h2>
                <span className="score-pill border-amber/50!"><b className="text-amber tabular-nums">{ceiling}</b><span className="text-muted text-[0.68rem]">%</span></span>
              </div>
              <p className="text-[0.85rem] text-text-dim leading-relaxed mt-2">
                Même en réécrivant tout ce qui est légitime, le plafond de couverture des mots-clés
                décisifs reste à <b>{ceiling}%</b>. Le problème n&apos;est pas ton CV mais l&apos;écart de
                profil : regarde « Il te manque vraiment » ci-dessous pour combler l&apos;écart par la
                formation, ou cible des offres plus proches. Une candidature reste possible — en
                assumant l&apos;écart (la lettre saura le faire honnêtement).
              </p>
            </section>
          )}

          {stage === "done" && res && finalAssembled && (
            <>
              {/* Scores réels : couverture mots-clés (métrique principale) + ATS */}
              <section className="glass-card px-6 py-5 mb-6">
                {prefit && ceiling !== null && (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-4">
                    <span className="score-pill"><b className="tabular-nums">{prefit.score}</b><span className="text-muted text-[0.68rem]">% mots-clés avant</span></span>
                    <span className="text-mint font-display font-semibold">→</span>
                    <span className="score-pill border-mint/50!"><b className="text-mint tabular-nums">{ceiling}</b><span className="text-muted text-[0.68rem]">% après tailoring</span></span>
                    <span className={`pill ${ceiling - prefit.score > 0 ? "pill--ok" : "pill--wait"}`}>
                      {ceiling - prefit.score > 0 ? `+${ceiling - prefit.score} pts de couverture gagnés` : "vocabulaire déjà aligné"}
                    </span>
                    <span className="text-[0.72rem] text-muted">part des {prefit.total} mots-clés décisifs de l&apos;offre présents dans ton CV</span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-4">
                  <span className="score-pill"><b className="tabular-nums">{before.score}</b><span className="text-muted text-[0.68rem]">ATS avant</span></span>
                  <span className="text-mint font-display font-semibold">→</span>
                  <span className="score-pill border-mint/50!"><b className="text-mint tabular-nums">{after.score}</b><span className="text-muted text-[0.68rem]">ATS après</span></span>
                  <span className={`pill ${after.score >= before.score ? "pill--ok" : "pill--wait"}`}>
                    {after.score >= before.score ? "+" : ""}{after.score - before.score} pts ATS
                  </span>
                  <p className="text-[0.72rem] text-muted flex-1 min-w-[18rem]">
                    Le score ATS mesure la <b>structure</b> (coordonnées, sections, puces, chiffres) : il bouge peu
                    par design — le tailoring aligne le <b>vocabulaire</b>, mesuré par la couverture ci-dessus.
                  </p>
                  <button type="button" className="btn-line ml-auto" onClick={() => setShowFormula((v) => !v)}>
                    Détail du calcul
                  </button>
                </div>
                {prefit && ceiling !== null && (
                  <p className="text-[0.78rem] text-text-dim leading-relaxed mt-3 w-full border-t border-line pt-3">
                    Couverture des <b>{prefit.total}</b> mots-clés décisifs de l&apos;offre :{" "}
                    <b>{prefit.score}%</b> déjà prouvés → <b className="text-mint">{ceiling}%</b> après
                    reformulation légitime. {ceiling < 65
                      ? "Ce plafond reste bas : le blocage n'est pas le CV mais le profil — regarde « Il te manque vraiment » pour combler l'écart par la formation."
                      : "Le tailoring peut tirer l'essentiel de cette offre de ton CV actuel."}
                  </p>
                )}
                {overOptimized && (
                  <p className="text-[0.78rem] text-amber leading-relaxed mt-2 w-full">
                    ⚠ Sur-optimisation : {Math.round(editRatio * 100)}% des phrases du CV ont été modifiées.
                    Relis chaque changement ci-dessous — un CV qui s&apos;écarte trop de ton profil réel se voit en entretien.
                  </p>
                )}
                {showFormula && (
                  <div className="mt-5 grid md:grid-cols-2 gap-x-8 gap-y-2 border-t border-line pt-4">
                    {after.breakdown.map((b: AtsBreakdown) => (
                      <div key={b.label} className="flex items-baseline justify-between gap-3 text-[0.8rem]">
                        <span className="text-text-dim">{b.label} <span className="text-muted">— {b.detail}</span></span>
                        <span className="mono-label shrink-0 tabular-nums">{b.got}/{b.max}</span>
                      </div>
                    ))}
                    <p className="md:col-span-2 text-[0.72rem] text-muted leading-relaxed mt-2">
                      Score déterministe : somme de 8 règles mesurées sur le texte final. Aucune IA, aucun hasard —
                      le même texte donne toujours le même score.
                    </p>
                  </div>
                )}
              </section>

              {/* Contrôle des faits */}
              {facts && (
                <section className={`glass-card p-6 mb-6 border-l-2! ${facts.lost.length === 0 && facts.invented.length === 0 ? "border-l-mint!" : "border-l-amber!"}`}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <h2 className="font-display text-lg font-semibold mr-auto">
                      Contrôle des faits : {facts.preserved}/{facts.checked} conservés
                    </h2>
                    <span className={`mono-label ${facts.lost.length === 0 && facts.invented.length === 0 ? "text-mint!" : "text-amber!"}`}>
                      {facts.lost.length === 0 && facts.invented.length === 0 ? "aucun fait changé, perdu ou inventé ✓" : "à corriger avant d'envoyer"}
                    </span>
                  </div>
                  {(facts.lost.length > 0 || facts.invented.length > 0) && (
                    <div className="grid md:grid-cols-2 gap-4 mt-4">
                      {facts.lost.length > 0 && (
                        <div>
                          <p className="mono-label mb-2 text-amber!">Disparus du CV final</p>
                          <ul className="space-y-1 text-[0.82rem] text-text-dim list-disc pl-4">
                            {facts.lost.map((f, i) => <li key={i}><b>{f.kind}</b> : {f.fact}</li>)}
                          </ul>
                        </div>
                      )}
                      {facts.invented.length > 0 && (
                        <div>
                          <p className="mono-label mb-2 text-amber!">Chiffres inconnus du CV (bloqués du rapport)</p>
                          <ul className="space-y-1 text-[0.82rem] text-text-dim list-disc pl-4">
                            {facts.invented.map((f, i) => <li key={i}>{f.fact}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-[0.72rem] text-muted mt-4">
                    Vérification locale : e-mails, téléphones, années, montants, quantifiés et noms propres du CV original
                    sont recherchés tels quels dans la version finale — indépendamment de l&apos;IA.
                    {skippedEdits > 0 && ` ${skippedEdits} modification(s) proposée(s) par l'IA ont été écartées car leur texte source n'existait pas mot pour mot.`}
                  </p>
                </section>
              )}

              {/* Modifications ciblées */}
              {(res.changes?.length ?? 0) > 0 && (
                <section className="mb-6">
                  <div className="flex items-baseline justify-between gap-4 mb-5">
                    <h2 className="font-display text-xl font-semibold">Modifications ciblées</h2>
                    <span className="mono-label">{res.changes!.length} passage(s), le reste est intact</span>
                  </div>
                  <div className="space-y-4">
                    {res.changes!.map((c, i) => (
                      <article key={i} className="glass-card p-6">
                        <p className="mono-label mb-4">{c.section}</p>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="rounded-lg bg-surface-2/60 p-4">
                            <p className="mono-label text-muted! mb-2">Avant</p>
                            <p className="text-[0.84rem] text-muted leading-relaxed line-through decoration-line-strong/60">{c.original}</p>
                          </div>
                          <div className="rounded-lg bg-mint/5 border border-mint/20 p-4">
                            <p className="mono-label text-mint! mb-2">Après</p>
                            <p className="text-[0.84rem] text-text-dim leading-relaxed">
                              <Highlight text={c.rewritten} keys={kwTerms} />
                            </p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {/* Rapport de transparence */}
              <section className="mb-6">
                <div className="flex items-baseline justify-between gap-4 mb-5">
                  <h2 className="font-display text-xl font-semibold">Rapport de transparence</h2>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => printOrSave(buildReportHtml(), "rapport_transparence.pdf")} className="btn-line">🖨️ PDF</button>
                    <button type="button" onClick={downloadTxt} className="btn-line">↓ .txt</button>
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="glass-card p-6 border-t-2! border-t-mint!">
                    <p className="mono-label text-mint! mb-4">✓ Intégrés ({res.integrated?.length ?? 0})</p>
                    <ul className="space-y-3">
                      {(res.integrated ?? []).map((it, i) => (
                        <li key={i}>
                          <span className="chip chip--mint">{it.keyword}</span>
                          <p className="mt-1.5 text-[0.78rem] text-text-dim leading-snug">{it.where ? `dans ${it.where} — ` : ""}{it.reason}</p>
                        </li>
                      ))}
                      {(res.integrated?.length ?? 0) === 0 && <li className="text-[0.8rem] text-muted">Aucun mot-clé intégré.</li>}
                    </ul>
                  </div>
                  <div className="glass-card p-6 border-t-2! border-t-amber!">
                    <p className="mono-label text-amber! mb-4">✕ Refusés ({res.refused?.length ?? 0})</p>
                    <ul className="space-y-3">
                      {(res.refused ?? []).map((it, i) => (
                        <li key={i}>
                          <span className="kw-chip border-amber/40! text-amber!">{it.keyword}</span>
                          <p className="mt-1.5 text-[0.78rem] text-text-dim leading-snug">{it.reason}</p>
                        </li>
                      ))}
                      {(res.refused?.length ?? 0) === 0 && <li className="text-[0.8rem] text-muted">Rien été refusé.</li>}
                    </ul>
                  </div>
                  <div className="glass-card p-6 border-t-2! border-t-violet!">
                    <p className="mono-label mb-4">🧭 Il te manque vraiment ({res.stillMissing?.length ?? 0})</p>
                    <ul className="space-y-3">
                      {(res.stillMissing ?? []).map((m, i) => (
                        <li key={i}>
                          <p className="text-[0.82rem] font-medium leading-snug">{m.item}</p>
                          <p className="mt-1 text-[0.76rem] text-muted leading-snug">→ {m.howToGet}</p>
                        </li>
                      ))}
                      {(res.stillMissing?.length ?? 0) === 0 && <li className="text-[0.8rem] text-muted">Rien de bloquant identifié.</li>}
                    </ul>
                  </div>
                </div>
                {res.headline && (
                  <p className="mt-5 text-[0.85rem] text-text-dim">
                    Titre professionnel proposé : <b className="text-mint">{res.headline}</b>
                  </p>
                )}
              </section>

              {/* Aperçu du CV final = contenu exact des PDF */}
              {final && (
                <section className="glass-card p-7 mb-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
                    <h2 className="font-display text-lg font-semibold">Aperçu du CV final</h2>
                    <span className="mono-label">
                      {final.editsApplied} phrase(s) ajustée(s) · {final.words} mots · ton intégral conservé
                    </span>
                  </div>
                  <div className="cv-paper p-8">
                    <h3 className="font-display text-2xl font-semibold">{final.name}</h3>
                    <p className="text-[0.82rem] text-muted mt-1">
                      {final.headline}{offer ? ` · ciblé : ${offer.title} — ${offer.company}` : ""}
                      {final.contact && <><br />{final.contact}</>}
                    </p>
                    <div className="mt-5">
                      {final.blocks.map((b, i) =>
                        b.kind === "h2" ? (
                          <p key={i} className="doc-sec-label mt-6">{b.text}</p>
                        ) : b.kind === "li" ? (
                          <p key={i} className="doc-text text-text-dim flex gap-2 mt-1.5">
                            <span className="text-mint shrink-0">–</span>
                            <span><MarkedText text={b.text} phrases={appliedRewrites} keys={kwTerms} /></span>
                          </p>
                        ) : (
                          <p key={i} className="doc-text text-text-dim mt-1.5 leading-relaxed">
                            <MarkedText text={b.text} phrases={appliedRewrites} keys={kwTerms} />
                          </p>
                        )
                      )}
                    </div>
                  </div>
                  <p className="text-[0.72rem] text-muted mt-3">
                    Surligné <mark className="add px-1">en vert</mark> = phrase ajustée par le tailoring, directement dans ton CV.
                    Cet aperçu est exactement le contenu des deux PDF : ton CV original intégral, rien de perdu.
                  </p>
                </section>
              )}

              {/* Exports */}
              <section className="glass-card p-7 mb-6">
                <h2 className="font-display text-lg font-semibold mb-1">Exporter la version finale</h2>
                <p className="text-[0.78rem] text-muted mb-5">
                  Les deux versions s&apos;ouvrent en aperçu imprimable : choisis « Enregistrer en PDF » — le texte reste sélectionnable.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-primary" onClick={() => printOrSave(buildHtml("design"), `cv_design.pdf`)}>
                    🖨️ Version design (PDF)
                  </button>
                  <button type="button" className="btn-primary" onClick={() => printOrSave(buildHtml("ats"), "cv_ats.pdf")}>
                    🖨️ Version ATS (PDF)
                  </button>
                  <button
                    type="button"
                    className="btn-line"
                    onClick={() => {
                      const blob = new Blob([buildHtml("design")], { type: "text/html;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `cv_${(offer?.company ?? "final").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.html`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    ↓ Fichier .html
                  </button>
                </div>
              </section>

              {/* Conseils */}
              {(res.tips?.length ?? 0) > 0 && (
                <section className="glass-card p-6 max-w-3xl mb-6">
                  <p className="mono-label mb-3">Conseils de Gemini</p>
                  <ul className="space-y-2 text-[0.86rem] text-text-dim leading-relaxed list-disc pl-4">
                    {res.tips!.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </section>
              )}
            </>
          )}

          {/* Historique des tailoring */}
          {(data.tailorings?.length ?? 0) > 0 && (
            <section className="glass-card p-7 mb-6">
              <h2 className="font-display text-lg font-semibold mb-4">Historique des tailoring</h2>
              <ul className="divide-y divide-line">
                {data.tailorings!.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5 text-[0.85rem]">
                    <span className="font-medium min-w-0 truncate">{t.company}</span>
                    <span className="text-muted text-[0.8rem] min-w-0 truncate flex-1">{t.title}</span>
                    <span className="mono-label tabular-nums">fit {t.fitBefore}→{t.fitAfter}%</span>
                    <span className="mono-label tabular-nums">{t.edits} phrase(s)</span>
                    <span className={`mono-label tabular-nums ${t.factsPreserved === t.factsChecked ? "text-mint!" : "text-amber!"}`}>
                      faits {t.factsPreserved}/{t.factsChecked}
                    </span>
                    <span className="mono-label text-muted!">
                      {new Date(t.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {toast && (
        <div className="toast" role="status">
          <span className="w-2 h-2 rounded-full bg-mint inline-block" />
          {toast}
        </div>
      )}
    </>
  );
}
