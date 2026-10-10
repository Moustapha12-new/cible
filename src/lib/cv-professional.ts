import type { CvData, CvDesign, CvSection } from "./cv";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function professionalCvStyles(design: CvDesign, accent: string): string {
 return `.cvdoc{font-family:Arial,Helvetica,sans-serif;font-size:${design.fontSize}pt;line-height:1.42;max-width:210mm;padding:12mm;color:#182437;background:white}
.cvdoc .cv-professional-header{background:${accent};color:#fff;border-radius:2mm;padding:5mm 5mm 4mm;margin-bottom:3mm;break-inside:avoid}
.cvdoc .cv-professional-header h1{font-family:Arial,Helvetica,sans-serif;font-size:22pt;line-height:1.12;text-transform:uppercase;color:white;font-weight:700}
.cvdoc .cv-professional-headline{color:#a7e7cd;font-weight:600;margin:1.4mm 0 2mm;font-size:1.07em}
.cvdoc .cv-professional-target{border:1px solid #ffffff30;background:#ffffff18;border-radius:4mm;padding:1mm 3mm;font-weight:600;font-size:.88em;margin:2mm 0}
.cvdoc .cv-professional-contact{border-top:1px solid #ffffff40;padding-top:2mm;margin-top:2mm;font-size:.85em;white-space:pre-line;overflow-wrap:anywhere}
.cvdoc .cv-professional-layout{display:grid;grid-template-columns:minmax(0,32fr) minmax(0,68fr);gap:3.5mm}
.cvdoc .cv-professional-sidebar{background:#effbf4;border:1px solid #dcf5e6;border-radius:2mm;padding:3mm}
.cvdoc .cv-professional-main{min-width:0}
.cvdoc .cv-professional-layout h2{font-family:Arial,Helvetica,sans-serif;color:${accent};font-weight:700;letter-spacing:.025em;font-size:1.03em;border-bottom:1.4px solid #25a87b;margin:0 0 2mm;padding:0 0 1mm;line-height:1.25}
.cvdoc .cv-professional-section{margin-bottom:3mm}
.cvdoc .cv-professional-sidebar h2{border-bottom-color:#87dfb1}
.cvdoc .cv-professional-sidebar .cv-text,.cvdoc .cv-professional-sidebar .cv-summary{font-size:.91em;line-height:1.45;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.cvdoc .cv-professional-item{margin:0 0 3mm;break-inside:avoid}
.cvdoc .cv-professional-item-head{display:flex;justify-content:space-between;gap:2mm;align-items:baseline}
.cvdoc .cv-professional-item-head strong{font-size:.98em}
.cvdoc .cv-professional-item-head small{font-size:.83em;color:${accent};text-align:right;flex-shrink:0;max-width:35%;white-space:pre-line;font-weight:600}
.cvdoc .cv-professional-item p{margin:1mm 0;white-space:pre-wrap;font-size:.92em;line-height:1.4}
.cvdoc .cv-professional-item ul{margin:1mm 0 0;padding-left:3.5mm;list-style-type:square;font-size:.92em}
.cvdoc .cv-professional-item li{margin:1mm 0;line-height:1.4}
.cvdoc .cv-professional-tag{display:inline-block;background:#fff;border:1px solid #90dfb4;border-radius:3mm;padding:.3mm 1.5mm;margin:.5mm .5mm .5mm 0;font-size:.88em;line-height:1.3}
.cvdoc .cv-professional-item li::marker{color:#16a271}
.cvdoc .cv-professional-sidebar .cv-professional-item-head{display:block}
.cvdoc .cv-professional-sidebar .cv-professional-item-head small{max-width:none;text-align:left}
.cvdoc .cv-professional-sidebar .cv-professional-item{margin-bottom:2mm}
.cvdoc[data-fit] .cv-professional-header{padding-top:calc(5mm * var(--cv-density));padding-bottom:calc(4mm * var(--cv-density))}
.cvdoc[data-fit] .cv-professional-header h1{font-size:calc(22pt * max(.85,var(--cv-density)))}
.cvdoc[data-fit] .cv-professional-layout h2{margin-top:0;margin-bottom:calc(2mm * var(--cv-density))}
.cvdoc[data-fit] .cv-professional-section{margin-bottom:calc(3mm * var(--cv-density))}
.cvdoc[data-fit] .cv-professional-item{margin-bottom:calc(3mm * var(--cv-density))}
.cvdoc[data-fit] .cv-professional-item li{margin:calc(1mm * var(--cv-density)) 0}`;
}
export function professionalCvBody(data: CvData): string {
 const textHtml = (s: CvSection) => /logiciel|informatique|atout|qualité|qualite/i.test(s.title)
  ? s.text.split("\n").map(line => line.includes("·") || line.includes(",") || line.includes(";")
    ? line.split(/[·,;]/).filter(t=>t.trim()).map(t=>`<span class="cv-professional-tag">${esc(t.trim())}</span>`).join("")
    : `<div>${esc(line)}</div>`).join("")
  : esc(s.text);
 const section = (s: CvSection) => `<section class="cv-professional-section"><h2>${esc(s.title)}</h2>${s.kind === "text" ? `<div class="cv-text">${textHtml(s)}</div>` : s.items.map(i => {
  const lines=i.detail.split("\n").filter(Boolean);
  const details=lines.length && lines.every(l=>/^[-•]\s/.test(l)) ? `<ul>${lines.map(l=>`<li>${esc(l.replace(/^[-•]\s*/,""))}</li>`).join("")}</ul>` : i.detail ? `<p>${esc(i.detail)}</p>` : "";
  return `<article class="cv-professional-item"><div class="cv-professional-item-head"><strong>${esc(i.title)}</strong>${i.meta?`<small>${esc(i.meta)}</small>`:""}</div>${details}</article>`;
 }).join("")}</section>`;
 const sidebar=data.sections.filter(s=>/compétence|competence|skills|langue|logiciel|informatique|atout|qualité|qualite|centre|intérêt|interet|profil|présentation/i.test(s.title));
 const main=data.sections.filter(s=>!sidebar.includes(s));
 const rank=(s:CvSection)=>/expérience|experience|parcours/i.test(s.title)?0:/projet|réalisation|realisation/i.test(s.title)?1:/formation|éducation|education/i.test(s.title)?2:3;
 const ordered=main.map((s,i)=>({s,i})).sort((a,b)=>rank(a.s)-rank(b.s)||a.i-b.i);
 return `<header class="cv-professional-header"><h1>${esc(data.basics.name)}</h1>${data.basics.headline?`<p class="cv-professional-headline">${esc(data.basics.headline)}</p>`:""}${data.basics.target?`<p class="cv-professional-target">${esc(data.basics.target)}</p>`:""}${data.basics.contact?`<div class="cv-professional-contact">${esc(data.basics.contact)}</div>`:""}</header><div class="cv-professional-layout"><aside class="cv-professional-sidebar">${data.summary?`<section class="cv-professional-section"><h2>Profil</h2><p class="cv-summary">${esc(data.summary)}</p></section>`:""}${sidebar.map(section).join("")}</aside><main class="cv-professional-main">${ordered.map(({s})=>section(s)).join("")}</main></div>`;
}
