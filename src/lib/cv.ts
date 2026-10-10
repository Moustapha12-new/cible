import { professionalCvBody, professionalCvStyles } from "./cv-professional";
import { cvFitStyles, fitCvPage } from "./cv-fit";

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

export const DEFAULT_CV_DESIGN: CvDesign = { template: "professional", accent: "#075b46", fontSize: 9.5 };

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
  const known =
    shortClean &&
    SECTION_HINTS.some((w) => {
      const base = w.replace(/s$/, "");
      return (
        low === base || low === base + "s" ||
        low.startsWith(base + " ") || low.startsWith(base + "s ") ||
        low.startsWith(base + " :") || low.startsWith(base + "s :") || low.startsWith(base + ":")
      );
    });
  return allCaps || trailingColon || known;
}

function sectionKind(title: string): "list" | "text" {
  const low = title.toLowerCase();
  return TEXT_SECTIONS.some((w) => low.startsWith(w.replace(/s$/, ""))) ? "text" : "list";
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
    if (isHeaderLine(l) && !projectMeta) {
      const title = l.replace(/:\s*$/, "");
      current = { key: uid(), title, kind: sectionKind(title), items: [], text: "" };
      sections.push(current);
      continue;
    }
    if (!current) {
      if (/@|(?:\+33|\(\+33\)|\b0[1-9])\s*\d|mobilité|permis|\(\d{2}\)/i.test(l)) contact += (contact ? "\n" : "") + l;
      else if (/^candidature\s*[—:–-]/i.test(l)) target = l;
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

  return {
    basics: { name, headline, contact, ...(target ? { target } : {}) },
    summary: summaryLines.join(" ").trim(),
    sections,
  };
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
  const accent = /^#[0-9a-fA-F]{6}$/.test(design.accent) ? design.accent : "#0b6b4f";
  const base = `.cvdoc{color:#111;max-width:760px;margin:0 auto}
.cvdoc h1{margin:0;font-size:1.7em}
.cvdoc .cv-head-sub{margin:4px 0 0;color:#555}
.cvdoc h2{margin:22px 0 8px;font-size:1em;text-transform:uppercase;letter-spacing:.07em;border-bottom:1.5px solid ${accent};padding-bottom:4px;color:${accent}}
.cvdoc .cv-summary{margin:10px 0 0}
.cvdoc .cv-item{margin:12px 0}
.cvdoc .cv-item-title{font-weight:bold}
.cvdoc .cv-item-meta{color:#666;font-size:.92em}
.cvdoc .cv-item-detail{margin:4px 0 0;white-space:pre-wrap}
.cvdoc ul{margin:6px 0 0;padding-left:18px}
.cvdoc li{margin:3px 0}
.cvdoc .cv-text{white-space:pre-wrap;margin:6px 0 0}`;
  const variants: Record<CvDesign["template"], string> = {
    professional: professionalCvStyles(design, accent),
    grey: `.cvdoc{font-family:Arial,Helvetica,sans-serif;font-size:${design.fontSize}pt;line-height:1.5;max-width:210mm;color:#222;background:#fff;padding:0!important;border-radius:0!important}
.cvdoc .cv-grey-layout{display:grid;grid-template-columns:32.5% 67.5%;min-height:297mm}
.cvdoc .cv-sidebar{background:#eee;padding:12mm 9mm;display:flex;flex-direction:column;gap:16mm}
.cvdoc .cv-cap{width:30mm;height:30mm;border:2px solid #111;border-radius:50%;margin:0 auto 3mm;display:grid;place-items:center}
.cvdoc .cv-cap svg{width:22mm;height:22mm}
.cvdoc .cv-main{padding:12mm 10mm 14mm}
.cvdoc .cv-main h1{font-weight:400;font-size:30pt;line-height:1.1;overflow-wrap:anywhere}
.cvdoc .cv-main h1.cv-name-long{font-size:23pt}
.cvdoc .cv-headline{text-transform:uppercase;letter-spacing:.26em;font-size:11pt;margin:3mm 0 0;color:#444}
.cvdoc .cv-grey-layout h2{border:0;letter-spacing:.27em;font-size:11pt;font-weight:400;color:${accent};padding:0;margin:0 0 6mm;line-height:1.5}
.cvdoc .cv-grey-layout h2:after{content:'';display:block;width:18mm;height:1.4mm;background:${accent};margin-top:3mm}
.cvdoc .cv-sidebar h2{text-align:center;color:#444}
.cvdoc .cv-sidebar h2:after{margin:3mm auto 0}
.cvdoc .cv-sidebar .cv-summary{margin:0;text-align:center}
.cvdoc .cv-contact-line{display:flex;gap:3mm;margin-bottom:3mm;overflow-wrap:anywhere;font-size:.94em}
.cvdoc .cv-contact-dot{flex:none;width:4mm;height:4mm;margin-top:1mm;border:1px solid #666;border-radius:2px}
.cvdoc .cv-main-section{margin-bottom:10mm;break-inside:auto}
.cvdoc .cv-item{margin:0 0 5mm;break-inside:avoid}
.cvdoc .cv-timeline > .cv-item{display:grid;grid-template-columns:25mm minmax(0,1fr);gap:3mm}
.cvdoc .cv-timeline .cv-item .cv-item{margin:0}
.cvdoc .cv-main-section:not(.cv-timeline) .cv-item{margin-bottom:2mm}
.cvdoc .cv-timeline .cv-item-meta{font-size:.85em;font-weight:600;white-space:pre-line}
.cvdoc .cv-timeline .cv-item-title{text-transform:uppercase;font-size:.88em;letter-spacing:.07em}
.cvdoc .cv-item-detail{font-size:.92em}
.cvdoc .cv-skills-grid{display:grid;grid-template-columns:1fr 1fr;gap:7mm}
.cvdoc .cv-skills-grid .cv-item{margin-bottom:3mm}
.cvdoc .cv-text{margin:0;overflow-wrap:anywhere}
.cvdoc li{font-size:.92em;margin:1mm 0}
.cvdoc h2{break-after:avoid}
.cvdoc .cv-main header{break-inside:avoid;margin-bottom:10mm}
.cvdoc *{box-sizing:border-box}
.cvdoc .cv-main{min-width:0}`,
    design: `.cvdoc{font-family:Georgia,'Times New Roman',serif;line-height:1.55;font-size:${design.fontSize}pt}
.cvdoc h1{font-size:2em}
.cvdoc h2{font-size:.9em;border-bottom-width:2px}`,
    ats: `.cvdoc{font-family:Arial,Helvetica,sans-serif;line-height:1.45;font-size:${design.fontSize}pt;color:#000}
.cvdoc h1{font-size:16pt}
.cvdoc h2{color:#000;border-bottom:1px solid #000;letter-spacing:.05em}
.cvdoc .cv-item-meta{color:#333;font-style:italic}
.cvdoc .cv-head-sub{color:#333}`,
    compact: `.cvdoc{font-family:Arial,Helvetica,sans-serif;line-height:1.35;font-size:${Math.max(9, design.fontSize - 1)}pt}
.cvdoc h2{margin:14px 0 6px}
.cvdoc .cv-item{margin:8px 0}`,
  };
  return `${base}\n${variants[design.template]}\n${cvFitStyles}`;
}

export function cvBodyHtml(data: CvData, design?: CvDesign): string {
  if (design?.template === "professional") return professionalCvBody(data);
  const itemHtml = (it: CvItem) => {
    const detail = it.detail.trim();
    const bullets = detail.split("\n").filter((x) => x.trim());
    const asList = bullets.length > 1 && bullets.every((x) => x.startsWith("-"));
    const detailHtml = asList
      ? `<ul>${bullets.map((b) => `<li>${esc(b.replace(/^-\s*/, ""))}</li>`).join("")}</ul>`
      : detail
        ? `<p class="cv-item-detail">${esc(detail)}</p>`
        : "";
    return `<div class="cv-item"><span class="cv-item-title">${esc(it.title)}</span>${it.meta ? ` <span class="cv-item-meta">— ${esc(it.meta)}</span>` : ""}${detailHtml}</div>`;
  };
  if (design?.template === "grey") {
    const section = (s: CvSection, timeline = false) => `<section class="cv-main-section${timeline ? ' cv-timeline' : ''}"><h2>${esc(s.title)}</h2>${s.kind === 'text' ? `<div class="cv-text">${esc(s.text)}</div>` : s.items.map(it => timeline ? `<div class="cv-item"><div class="cv-item-meta">${esc(it.meta || '')}</div><div>${itemHtml({ ...it, meta: undefined })}</div></div>` : itemHtml(it)).join('')}</section>`;
    const interests = data.sections.filter(s => /centre|intérêt|interet|loisir|hobbie/i.test(s.title));
    const profiles = data.sections.filter(s => /^(profil|présentation|presentation|objectif|résumé|resume)$/i.test(s.title));
    const skills = data.sections.filter(s => /compétence|competence|langue|logiciel|informatique|skills/i.test(s.title));
    const main = data.sections.filter(s => !interests.includes(s) && !skills.includes(s) && !profiles.includes(s));
    const cap = `<div class="cv-cap" aria-hidden="true"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 36 50 24 95 36 50 48Z M24 43v23q26 15 52 0V43 M88 38v25 M84 63h8"/></svg></div>`;
    const contacts = data.basics.contact.split(/\n|\s*[|·]\s*/).filter(x => x.trim()).map(x => `<div class="cv-contact-line"><span class="cv-contact-dot" aria-hidden="true"></span><span>${esc(x.trim())}</span></div>`).join('');
    return `<div class="cv-grey-layout"><aside class="cv-sidebar">${cap}${data.summary ? `<section><h2>Profil</h2><p class="cv-summary">${esc(data.summary)}</p></section>` : ''}${profiles.map(s => section(s)).join('')}${contacts ? `<section><h2>Contact</h2>${contacts}</section>` : ''}${interests.map(s => section(s)).join('')}</aside><main class="cv-main"><header><h1${data.basics.name.length > 22 ? ' class="cv-name-long"' : ''}>${esc(data.basics.name)}</h1>${data.basics.headline ? `<p class="cv-headline">${esc(data.basics.headline)}</p>` : ''}</header>${main.map(s => section(s, /expérience|experience|parcours/i.test(s.title))).join('')}${skills.length ? `<div class="cv-skills-grid">${skills.map(s => section(s)).join('')}</div>` : ''}</main></div>`;
  }
  const sectionsHtml = data.sections
    .map((s) => {
      const inner =
        s.kind === "text"
          ? `<div class="cv-text">${esc(s.text)}</div>`
          : s.items.map(itemHtml).join("");
      return `<h2>${esc(s.title)}</h2>${inner}`;
    })
    .join("");
  return `<h1>${esc(data.basics.name)}</h1>
<p class="cv-head-sub">${data.basics.headline ? `${esc(data.basics.headline)}<br/>` : ""}${esc(data.basics.contact)}</p>
${data.summary ? `<p class="cv-summary">${esc(data.summary)}</p>` : ""}
${sectionsHtml}`;
}

export function cvDocumentHtml(data: CvData, design: CvDesign, filename: string, autoPrint = false): string {
  const config = JSON.stringify(design).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(filename)}</title><style>${cvStyles(design)}@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}.cv-print-page{width:210mm;min-height:297mm;padding:${["grey", "professional"].includes(design.template) ? "0" : "14mm"};margin:0 auto}.cv-export-toolbar{font:14px Arial,sans-serif;display:flex;gap:20px;justify-content:center;align-items:center;padding:16px;background:#eee}.cv-export-toolbar button{padding:10px 16px;cursor:pointer}.cv-export-toolbar button:disabled{cursor:not-allowed}@media screen{.cv-print-page{margin:24px auto;box-shadow:0 3px 18px #0002}}@media print{.cvdoc{max-width:none}.cv-export-toolbar{display:none}a{color:inherit}}</style></head><body><nav class="cv-export-toolbar"><span id="cv-fit-status">Vérification du format A4…</span><button id="cv-print-button" disabled>Imprimer / enregistrer en PDF</button></nav><div class="cv-print-page"><div class="cvdoc">${cvBodyHtml(data, design)}</div></div><script>
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
