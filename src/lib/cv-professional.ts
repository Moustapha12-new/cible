import type { CvData, CvDesign, CvSection } from "./cv";

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function stageLine(value?: string): string {
  const target = (value || "").replace(/\s+/g, " ").trim();
  if (/\b6\s*mois\b/i.test(target) && /\bf[ée]vrier\s+2027\b/i.test(target)) {
    const specialty = target.match(/^Stage de 6 mois\s*[·|]\s*(.+?)\s*[·|]\s*à partir de f[ée]vrier 2027/i)?.[1];
    return `Stage de 6 mois${specialty ? ` · ${specialty}` : ""} · à partir de février 2027`;
  }
  return target;
}

function contactHtml(value: string): string {
  return value.split("\n").map(line => {
    const clean = line.trim();
    const token = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
    let html = "", cursor = 0;
    for (const match of clean.matchAll(token)) {
      const start = match.index || 0, value = match[0];
      html += esc(clean.slice(cursor, start));
      html += value.includes("@")
        ? `<a href="mailto:${esc(value)}">${esc(value)}</a>`
        : `<a href="${esc(value.startsWith("http") ? value : `https://${value}`)}">${esc(value)}</a>`;
      cursor = start + value.length;
    }
    html += esc(clean.slice(cursor));
    return `<div>${html.replace(/^(Portfolio\s*:)\s*/i, "<strong>$1</strong> ")}</div>`;
  }).join("");
}

export function professionalCvStyles(design: CvDesign, accent: string): string {
  return `@font-face{font-family:CarlitoCV;src:url('/fonts/carlito-400.woff2') format('woff2');font-weight:400;font-style:normal}
@font-face{font-family:CarlitoCV;src:url('/fonts/carlito-700.woff2') format('woff2');font-weight:700;font-style:normal}
.cvdoc{box-sizing:border-box;font-family:CarlitoCV,Carlito,Arial,sans-serif;font-size:${design.fontSize}pt;line-height:1.33;width:210mm;max-width:210mm;padding:16mm 17mm;color:#20302b;background:#fff;overflow-wrap:break-word}
.cvdoc .cv-professional-header{margin-bottom:5mm;break-inside:avoid}
.cvdoc .cv-professional-header h1{font:700 18.5pt/1.12 CarlitoCV,Carlito,Arial,sans-serif;text-transform:uppercase;letter-spacing:-.025em;color:#20302b;margin:0}
.cvdoc .cv-professional-headline{color:${accent};font-weight:700;text-transform:uppercase;font-size:1.03em;line-height:1.25;margin:1.4mm 0 1.2mm}
.cvdoc .cv-professional-target{font-size:.94em;margin:0 0 2.5mm;color:#37463f}
.cvdoc .cv-professional-contact{border-top:1.4px solid ${accent};padding-top:2.4mm;font-size:.9em;line-height:1.45}
.cvdoc .cv-professional-contact a{color:${accent};text-decoration:underline;text-underline-offset:1px}
.cvdoc .cv-professional-contact strong{font-weight:700}
.cvdoc .cv-professional-layout{display:block}
.cvdoc .cv-professional-section{margin:0 0 4mm;break-inside:auto}
.cvdoc .cv-professional-section h2{font:400 1.03em/1.25 CarlitoCV,Carlito,Arial,sans-serif;text-transform:uppercase;letter-spacing:.015em;color:${accent};border-bottom:1px solid #c5d5ce;padding:0 0 1.1mm;margin:0 0 2.1mm;break-after:avoid}
.cvdoc .cv-professional-section .cv-text,.cvdoc .cv-professional-section .cv-summary{margin:0;white-space:normal;line-height:1.4}
.cvdoc .cv-skill-line{margin:0 0 .4mm;line-height:1.35}
.cvdoc .cv-skill-line strong{font-weight:700}
.cvdoc .cv-professional-item{margin:0 0 2.8mm;break-inside:avoid}
.cvdoc .cv-professional-item-head{display:flex;justify-content:space-between;gap:3mm;align-items:baseline}
.cvdoc .cv-professional-item-head strong{font-weight:700;min-width:0}
.cvdoc .cv-professional-item-head small{font-size:.85em;color:#64736c;text-align:right;flex-shrink:0;max-width:31%;white-space:nowrap}
.cvdoc .cv-professional-item p{margin:.7mm 0 0;white-space:normal;line-height:1.38}
.cvdoc .cv-professional-item ul{margin:.6mm 0 0;padding-left:4mm;list-style-type:disc}
.cvdoc .cv-professional-item li{margin:.5mm 0;line-height:1.38}
.cvdoc .cv-professional-item li::marker{color:${accent}}
.cvdoc[data-fit] .cv-professional-header{margin-bottom:calc(5mm * var(--cv-density))}
.cvdoc[data-fit] .cv-professional-header h1{font-size:calc(18.5pt * max(.9,var(--cv-density)))}
.cvdoc[data-fit] .cv-professional-section{margin-bottom:calc(4mm * var(--cv-density))}
.cvdoc[data-fit] .cv-professional-section h2{margin-bottom:calc(2.1mm * var(--cv-density))}
.cvdoc[data-fit] .cv-professional-item{margin-bottom:calc(2.8mm * var(--cv-density))}
.cvdoc[data-fit] .cv-professional-item li{margin:calc(.5mm * var(--cv-density)) 0}`;
}

export function professionalCvBody(data: CvData): string {
  const section = (entry: CvSection) => {
    const content = entry.kind === "text"
      ? `<div class="cv-text">${entry.text.split("\n").filter(Boolean).map(line => {
        const match = line.match(/^([^:]{2,48}:)\s*(.*)$/);
        return `<p class="cv-skill-line">${match ? `<strong>${esc(match[1])}</strong> ${esc(match[2])}` : esc(line)}</p>`;
      }).join("")}</div>`
      : entry.items.map(item => {
        const lines = item.detail.split("\n").map(line => line.trim()).filter(Boolean);
        const bullets = lines.length > 0 && lines.every(line => /^[-•]\s/.test(line));
        const detail = bullets
          ? `<ul>${lines.map(line => `<li>${esc(line.replace(/^[-•]\s*/, ""))}</li>`).join("")}</ul>`
          : item.detail ? `<p>${esc(item.detail.replace(/\s+/g, " "))}</p>` : "";
        return `<article class="cv-professional-item"><div class="cv-professional-item-head"><strong>${esc(item.title)}</strong>${item.meta ? `<small>${esc(item.meta)}</small>` : ""}</div>${detail}</article>`;
      }).join("");
    return `<section class="cv-professional-section"><h2>${esc(entry.title)}</h2>${content}</section>`;
  };
  const target = stageLine(data.basics.target);
  return `<header class="cv-professional-header"><h1>${esc(data.basics.name)}</h1>${data.basics.headline ? `<p class="cv-professional-headline">${esc(data.basics.headline)}</p>` : ""}${target ? `<p class="cv-professional-target">${esc(target)}</p>` : ""}${data.basics.contact ? `<div class="cv-professional-contact">${contactHtml(data.basics.contact)}</div>` : ""}</header><main class="cv-professional-layout">${data.summary ? `<section class="cv-professional-section"><h2>Profil</h2><p class="cv-summary">${esc(data.summary)}</p></section>` : ""}${data.sections.map(section).join("")}</main>`;
}
