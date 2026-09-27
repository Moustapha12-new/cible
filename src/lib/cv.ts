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
  basics: { name: string; headline: string; contact: string };
  summary: string;
  sections: CvSection[];
};

export type CvDesign = {
  template: "design" | "ats" | "compact";
  accent: string;
  fontSize: number;
};

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "").slice(0, 12);

const SECTION_HINTS = [
  "profil", "expérience", "experience", "formation", "compétence", "competence",
  "projet", "certification", "langue", "centre", "interet", "intérêt", "atout",
  "qualité", "qualite", "hobbie", "divers", "informatique", "logiciels", "skills",
  "parcours", "réalisations", "realisations",
];

const TEXT_SECTIONS = ["compétence", "competence", "langue", "interet", "intérêt", "centre", "hobbie", "divers", "qualité", "qualite", "atout"];

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
  if (nonEmpty[idx] && /@|\b0\d(?:[\s.-]?\d{2}){4}\b/.test(nonEmpty[idx])) {
    contact = nonEmpty[idx];
    idx++;
  }

  const sections: CvSection[] = [];
  const summaryLines: string[] = [];
  let current: CvSection | null = null;

  for (; idx < nonEmpty.length; idx++) {
    const l = nonEmpty[idx];
    if (isHeaderLine(l)) {
      const title = l.replace(/:\s*$/, "");
      current = { key: uid(), title, kind: sectionKind(title), items: [], text: "" };
      sections.push(current);
      continue;
    }
    if (!current) {
      summaryLines.push(l);
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
    } else if (/^[a-zà-ÿ]/.test(l) && current.items.length > 0) {
      const last = current.items[current.items.length - 1];
      last.detail += (last.detail ? " " : "") + l;
    } else {
      current.items.push({ id: uid(), title: l.slice(0, 90), detail: l.length > 90 ? l.slice(90).trim() : "" });
    }
  }

  return {
    basics: { name, headline: "", contact },
    summary: summaryLines.join(" ").trim(),
    sections,
  };
}

/* Convertit les données structurées → texte brut (aperçu copiable, trace par candidature). */
export function cvToText(data: CvData): string {
  return [
    data.basics.name,
    data.basics.headline,
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
  return `${base}\n${variants[design.template]}`;
}

export function cvBodyHtml(data: CvData): string {
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

export function cvDocumentHtml(data: CvData, design: CvDesign, filename: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(filename)}</title><style>${cvStyles(design)}@page{margin:14mm}body{margin:32px auto}</style></head><body><div class="cvdoc">${cvBodyHtml(data)}</div></body></html>`;
}

/* Garde-fou anti-invention au niveau item : les chiffres proposés doivent
   exister dans l'original ou déjà ailleurs dans le CV. */
export function numbersSafe(original: string, proposed: string, wholeCv: string): boolean {
  const nums = (s: string) => s.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const allowed = new Set([...nums(original), ...nums(wholeCv)]);
  return nums(proposed).every((n) => allowed.has(n));
}
