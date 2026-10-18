import { professionalCvBody, professionalCvStyles } from "./cv-professional";
import { fitCvPage } from "./cv-fit";

/* Couche « données structurées du CV », inspirée de l'architecture de
   Reactive Resume : le CV vit en JSON typé, l'IA ne fait que PROPOSER des
   modifications sur ces données, et un seul moteur de rendu alimente
   l'aperçu live ET le PDF — fidélité garantie par construction. */

export type CvItem = { id: string; title: string; meta?: string; detail: string };

export type CvSection = {
  key: string;
  title: string;
  kind: "list" | "text";
  items: CvItem[];
  text: string;
};

export type CvData = {
  basics: { name: string; headline: string; contact: string; target?: string };
  summary: string;
  sections: CvSection[];
};

export type CvDesign = {
  template: "professional" | "grey" | "design" | "ats" | "compact";
  accent: string;
  fontSize: number;
};

export const DEFAULT_CV_DESIGN: CvDesign = { template: "professional", accent: "#246753", fontSize: 9.5 };

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "").slice(0, 12);

const SECTION_HINTS = [
  "profil", "expérience", "experience", "formation", "compétence", "competence",
  "projet", "certification", "langue", "centre", "interet", "intérêt", "atout",
  "qualité", "qualite", "hobbie", "divers", "informatique", "logiciels", "skills",
  "parcours", "réalisations", "realisations",
];

const TEXT_SECTIONS = ["profil", "présentation", "presentation", "objectif", "logiciel", "informatique", "compétence", "competence", "langue", "interet", "intérêt", "centre", "hobbie", "divers", "qualité", "qualite", "atout"];

function isHeaderLine(l: string): boolean {
  if (l.length > 70 || l.length < 3) return false;
  const low = l.toLowerCase();
  const allCaps = /[A-ZÀ-Ý]/.test(l) && !/[a-zà-ÿ]/.test(l) && l === l.toUpperCase();
  const trailingColon = /:\s*$/.test(l) && l.split(" ").length <= 6;
  const shortClean = l.length <= 28 && !/\d/.test(l);
  const known = shortClean && SECTION_HINTS.some((w) => {
    const base = w.replace(/s$/, "");
    return low === base || low === `${base}s` ||
      ["professionnelle", "professionnelles", "technique", "techniques", "personnel", "personnels"].some(suffix => low === `${base} ${suffix}` || low === `${base}s ${suffix}`);
  });
  return allCaps || trailingColon || known;
}

function sectionKind(title: string): "list" | "text" {
  const low = title.toLowerCase();
  return TEXT_SECTIONS.some((w) => low.startsWith(w.replace(/s$/, ""))) ? "text" : "list";
}

/* Ligne de disponibilité / candidature : elle porte la formulation verrouillée
   « Stage de 6 mois · à partir de début 2027 » et ne doit jamais être avalée
   par le contact ni fusionnée dans le titre. */
function isAvailabilityLine(value: string): boolean {
  if (/^candidature\s*[—:–-]/i.test(value)) return true;
  return /\b6\s*mois\b/i.test(value)
    && /\b(?:d[ée]but|f[ée]vrier|à partir de|disponib|dès|debut)\b/i.test(value)
    && /\b20\d{2}\b/.test(value)
    && !/^[ée]l[èe]ve|ing[ée]nieur|étudiant/i.test(value);
}

/* Convertit un CV collé en texte libre → données structurées éditables.
   Déterministe et local : l'utilisateur peut corriger chaque champ ensuite. */
export function parseCvText(text: string): CvData {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const nonEmpty = lines.filter(Boolean);
  const name = nonEmpty[0] ?? "";
  let idx = 1;
  let contact = "";
  let headline = "";
  let target = "";
  if (nonEmpty[idx] && /@|\b0\d(?:[\s.-]?\d{2}){4}\b/.test(nonEmpty[idx])) {
    contact = nonEmpty[idx];
    idx++;
  }

  const sections: CvSection[] = [];
  const summaryLines: string[] = [];
  let current: CvSection | null = null;

  for (; idx < nonEmpty.length; idx++) {
    const l = nonEmpty[idx];
    const projectMeta = current && /projet/i.test(current.title) && /^projet (personnel|d[’'])/i.test(l);
    if (isHeaderLine(l) && !projectMeta && !(current === null && /[ée]l[èe]ve|ing[ée]nieur/i.test(l))) {
      const title = l.replace(/:\s*$/, "");
      current = { key: uid(), title, kind: sectionKind(title), items: [], text: "" };
      sections.push(current);
      continue;
    }    if (!current) {
      if (isAvailabilityLine(l)) target = target || l;
      else if (/@|(?:\+33|\(\+33\)|\b0[1-9])\s*\d|mobilité|permis|\(\d{2}\)|^portfolio\s*:/i.test(l)) contact += (contact ? "\n" : "") + l;
      else if (!headline && l.length < 140 && /ingénieur|étudiant|élève|commercial|développeur|technicien/i.test(l)) headline = l;
      else if (headline && l.length < 140 && /stage|alternance|disponib/i.test(l)) headline += " · " + l;
      else summaryLines.push(l);
      continue;
    }
    if (current.kind === "text") {
      current.text += (current.text ? "\n" : "") + l;
      continue;
    }
    const bullet = l.match(/^[-•*·–]\s+(.*)$/);
    if (bullet) {
      const last = current.items[current.items.length - 1];
      if (last) last.detail += (last.detail ? "\n- " : "- ") + bullet[1];
      else current.items.push({ id: uid(), title: bullet[1].slice(0, 80), detail: "" });
      continue;
    }
    /* Nouvel item : « Titre — Entreprise (Période) : détail » ou variantes. */
    const full = l.match(/^(.{3,90}?)\s+[—–-]\s+(.+?)\s*\(([^)]+)\)\s*:?\s*(.*)$/);
    const withParen = l.match(/^(.{3,90}?)\s*\(([^)]+)\)\s*:?\s*(.*)$/);
    if (full) {
      current.items.push({ id: uid(), title: full[1].trim(), meta: `${full[2]} (${full[3]})`, detail: full[4].trim() });
    } else if (withParen) {
      current.items.push({ id: uid(), title: withParen[1].trim(), meta: withParen[2], detail: withParen[3].trim() });
    } else if (current.items.length > 0 && (/^(?:janv|févr|mars|avr|mai |juin|juil|août|sept|oct|nov|déc|\d{4})/i.test(l) || /·.*\d{4}/.test(l) || projectMeta)) {
      const last = current.items[current.items.length - 1];
      last.meta = [last.meta, l].filter(Boolean).join("\n");
    } else if (current.items.length > 0 && (/^[a-zà-ÿ]/.test(l) || /[.!?]$/.test(l) || /^(?:outils|compétences|principaux enseignements|spécialisation|domaines|objectif|mathématiques)/i.test(l))) {
      const last = current.items[current.items.length - 1];
      last.detail += (last.detail ? " " : "") + l;
    } else {
      current.items.push({ id: uid(), title: l, detail: "" });
    }
  }

  const profileIndex = sections.findIndex(section => /^profil$/i.test(section.title));
  if (profileIndex >= 0) {
    const [profile] = sections.splice(profileIndex, 1);
    if (profile.text.trim()) summaryLines.push(profile.text.trim());
  }

  return normalizeCvData({
    basics: { name, headline, contact, ...(target ? { target } : {}) },
    summary: summaryLines.join(" ").trim(),
    sections,
  });
}

/** Repairs PDF extraction artifacts without changing the candidate's facts. */
export function normalizeCvData(input: CvData): CvData {
  const data: CvData = structuredClone(input);
  const contactLines = data.basics.contact.split("\n");
  const targetLine = contactLines.find(line => /^stage\s+.*\b6\s*mois\b.*(?:f[ée]vrier|d[ée]but)\s+2027/i.test(line.trim()));
  if (targetLine) {
    if (!data.basics.target) data.basics.target = targetLine.trim();
    data.basics.contact = contactLines.filter(line => line !== targetLine).join("\n");
  }
  data.summary = data.summary.replace(/\s+/g, " ").trim();
  for (const section of data.sections) {
    if (section.kind === "text" && /comp[ée]tences|logiciels|informatique/i.test(section.title)) {
      const grouped: string[] = [];
      for (const line of section.text.split("\n").map(value => value.trim()).filter(Boolean)) {
        if (/^[^:]{2,48}\s*:\s*\S/.test(line) || !grouped.length) grouped.push(line);
        else grouped[grouped.length - 1] += ` ${line}`;
      }
      section.text = grouped.join("\n");
    }
    if (/formation/i.test(section.title) && section.kind === "list") {
      const grouped: CvItem[] = [];
      for (const item of section.items) {
        const line = item.title.trim();
        const previous = grouped[grouped.length - 1];
        if (previous && line.length <= 60 && !/[—–]/.test(line.split("|")[0]) && /\|\s*\d{4}\s*[–-]\s*\d{4}/.test(line)) {
          previous.meta = line;
          if (item.detail) previous.detail += `${previous.detail ? " " : ""}${item.detail}`;
        } else if (previous && !/\s+[—–-]\s+/.test(line) && (previous.meta || (line.match(/,/g)?.length || 0) >= 2)) {
          previous.detail += `${previous.detail ? " " : ""}${line}${item.detail ? ` ${item.detail}` : ""}`;
        } else grouped.push(item);
      }
      section.items = grouped;
    }
  }

  return data;
}

/* Convertit les données structurées → texte brut (aperçu copiable, trace par candidature). */
export function cvToText(data: CvData): string {
  return [
    data.basics.name,
    data.basics.headline,
    data.basics.target,
    data.basics.contact,
    data.summary,
    ...data.sections.map((s) =>
      s.kind === "text"
        ? `${s.title}\n${s.text}`
        : `${s.title}\n${s.items
            .map((i) => `${i.title}${i.meta ? ` — ${i.meta}` : ""}${i.detail ? ` : ${i.detail}` : ""}`)
            .join("\n")}`
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* ─── Rendu unique : alimente l'aperçu live ET la fenêtre PDF ─── */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function cvStyles(design: CvDesign): string {
  const chosen = /^#[0-9a-fA-F]{6}$/.test(design.accent) ? design.accent : "#246753";
  const accent = design.template === "ats" ? "#202a26" : design.template === "grey" ? "#52615a" : chosen;
  const compact = design.template === "compact"
    ? ".cvdoc{line-height:1.32}.cvdoc .cv-professional-section{margin-bottom:3mm}.cvdoc .cv-professional-item{margin-bottom:2mm}"
    : "";
  return `${professionalCvStyles(design, accent)}\n${compact}`;
}

export function cvBodyHtml(data: CvData, _design?: CvDesign): string {
  void _design;
  return professionalCvBody(normalizeCvData(data));
}
export function cvDocumentHtml(data: CvData, design: CvDesign, filename: string, autoPrint = false): string {
  const config = JSON.stringify(design).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(filename)}</title><style>${cvStyles(design)}@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}.cv-print-page{width:210mm;min-height:297mm;padding:0;margin:0 auto}.cv-export-toolbar{font:14px Arial,sans-serif;display:flex;gap:20px;justify-content:center;align-items:center;padding:16px;background:#eee}.cv-export-toolbar button{padding:10px 16px;cursor:pointer}.cv-export-toolbar button:disabled{cursor:not-allowed}@media screen{.cv-print-page{margin:24px auto;box-shadow:0 3px 18px #0002}}@media print{.cvdoc{max-width:none}.cv-export-toolbar{display:none}}</style></head><body><nav class="cv-export-toolbar"><span id="cv-fit-status">Vérification du format A4…</span><button id="cv-print-button" disabled>Imprimer / enregistrer en PDF</button></nav><div class="cv-print-page"><div class="cvdoc">${cvBodyHtml(data, design)}</div></div><script>
window.addEventListener('load',function(){
 const root=document.querySelector('.cvdoc');
 const check=()=>(${fitCvPage.toString()})(root,${config});
 const button=document.getElementById('cv-print-button');
 const status=document.getElementById('cv-fit-status');
 const result=check();
 status.textContent=result.fits?'✓ Une page A4 vérifiée · texte intégral conservé':'Contenu trop long pour une page lisible. Raccourcis le CV dans l’éditeur avant l’export.';
 button.disabled=!result.fits;
 button.onclick=()=>{if(check().fits)window.print()};
 window.addEventListener('beforeprint',check);
 if(result.fits && ${autoPrint})window.print();
});</script></body></html>`;
}

/* Garde-fou anti-invention au niveau item : les chiffres proposés doivent
   exister dans l'original ou déjà ailleurs dans le CV. */
export function numbersSafe(original: string, proposed: string, wholeCv: string): boolean {
  const nums = (s: string) => s.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const allowed = new Set([...nums(original), ...nums(wholeCv)]);
  return nums(proposed).every((n) => allowed.has(n));
}
