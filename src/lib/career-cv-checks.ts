import type { CvData } from "./cv";

const normalized = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** Diagnostic textuel du document final. Ni certification de maîtrise, ni note ATS. */
export function careerKeywordAudit(text: string, terms: string[]) {
  const aliases: Record<string, string[]> = { matlab: ["matlab"], python: ["python", "python3", "python 3"], "c++": ["c++"], "c#": ["c#"], autocad: ["autocad", "auto cad"] };
  const has = (term: string) => (aliases[normalized(term)] || [term]).some(alias => {
    const escaped = normalized(alias).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !!escaped && new RegExp(`(^|[^\\p{L}\\p{N}+#])${escaped}($|[^\\p{L}\\p{N}+#])`, "u").test(normalized(text));
  });
  const unique = [...new Set(terms.map(t => t.trim()).filter(Boolean))];
  return { present: unique.filter(has), missing: unique.filter(t => !has(t)) };
}

/** Réordonne uniquement les expériences avec dates identifiables ; aucune date créée. */
export function chronologicalExperiences(source: CvData): CvData {
  const cv = structuredClone(source);
  const date = (meta: string) => {
    const text = normalized(meta);
    if (/present|aujourd|en cours|current/.test(text)) return 999999;
    const years = [...text.matchAll(/\b(19\d{2}|20\d{2})\b/g)];
    if (!years.length) return null;
    const last = years[years.length - 1];
    const prefix = text.slice(Math.max(0, last.index! - 15), last.index).trim();
    const months = [/jan/, /fev|feb/, /mar/, /avr|apr/, /mai|may/, /juin|jun/, /juil|jul/, /aou|aug/, /sep/, /oct/, /nov/, /dec/];
    const lastWord = prefix.match(/([a-z]+)[\s.-]*$/)?.[1] || "";
    const named = months.findIndex(m => m.test(lastWord));
    const numeric = prefix.match(/(\d{1,2})[\/.-]$/);
    const month = named >= 0 ? named + 1 : numeric ? Number(numeric[1]) : 0;
    return Number(last[1]) * 100 + month;
  };
  for (const section of cv.sections) {
    if (section.kind !== "list" || !/exp[ée]rience|professional|employment/i.test(section.title)) continue;
    const ranked = section.items.map((item, index) => ({ item, index, date: date(item.meta || "") }));
    // Une date inconnue reste à sa place ; les autres sont triées dans leurs emplacements.
    const known = ranked.filter(r => r.date !== null).sort((a, b) => b.date! - a.date! || a.index - b.index);
    let cursor = 0;
    section.items = ranked.map(r => r.date === null ? r.item : known[cursor++].item);
  }
  return cv;
}
