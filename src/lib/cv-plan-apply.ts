/* ═══════════ Application déterministe d'un plan d'adaptation ═══════════
   Reçoit UNIQUEMENT des opérations déjà validées par le serveur
   (cv-engine.validatePlanOperation). Aucun contenu n'est inventé ici : on
   remplace, réordonne ou retire — rien de plus.

   Fichier partagé client/serveur : n'importe JAMAIS candidate-dossier
   (données personnelles, code serveur uniquement). */

import type { CvData, CvSection } from "./cv";

export type ApplicableOperation = {
  op: string;
  zone: string;
  before?: string;
  after?: string;
  decision?: string;
};

export type ApplyPlanResult = { cv: CvData; applied: string[]; skipped: string[] };

const replaceOnce = (value: string, before: string, after: string, counter: { done: boolean }): string => {
  if (counter.done || !before.trim()) return value;
  if (value.includes(before)) {
    counter.done = true;
    return value.replace(before, after);
  }
  /* L'extraction du PDF peut joindre ou couper une phrase différemment du
     texte source envoyé à Gemini. Tolère seulement des espaces/newlines
     différents ; les mots et la ponctuation de la citation restent exacts. */
  const pattern = before.trim().split(/\s+/)
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = new RegExp(pattern, "i").exec(value);
  if (!match || match.index === undefined) return value;
  counter.done = true;
  return value.slice(0, match.index) + after + value.slice(match.index + match[0].length);
};

/** Applique les opérations acceptées, dans l'ordre, sans jamais créer de texte. */
export function applyPlanToCv(source: CvData, operations: ApplicableOperation[]): ApplyPlanResult {
  const cv: CvData = structuredClone(source);
  const applied: string[] = [], skipped: string[] = [];
  for (const op of operations) {
    if (op.decision === "rejected") { skipped.push(op.zone); continue; }
    switch (op.op) {
      case "set_headline":
        if (op.after?.trim()) { cv.basics.target = op.after.trim(); applied.push(op.zone); }
        else skipped.push(op.zone);
        break;
      case "rewrite_profile":
      case "rephrase_fact": {
        const before = (op.before || "").trim();
        const after = (op.after || "").trim();
        if (!before || !after || before === after) { skipped.push(op.zone); break; }
        const counter = { done: false };
        cv.basics.headline = replaceOnce(cv.basics.headline, before, after, counter);
        cv.summary = replaceOnce(cv.summary, before, after, counter);
        for (const section of cv.sections) {
          section.text = replaceOnce(section.text, before, after, counter);
          for (const item of section.items) {
            item.title = replaceOnce(item.title, before, after, counter);
            item.detail = replaceOnce(item.detail, before, after, counter);
            if (item.meta) item.meta = replaceOnce(item.meta, before, after, counter);
          }
        }
        (counter.done ? applied : skipped).push(op.zone);
        break;
      }
      case "reorder_projects":
      case "reorder_skills": {
        const before = (op.before || "").split("\n").map(line => line.trim()).filter(Boolean);
        const after = (op.after || "").split("\n").map(line => line.trim()).filter(Boolean);
        const section = cv.sections.find(row => row.title === op.zone);
        if (!section || before.length !== after.length || after.some(line => !before.includes(line))) { skipped.push(op.zone); break; }
        if (section.kind === "text") {
          const lines = section.text.split("\n");
          const kept = lines.filter(line => !before.includes(line.trim()));
          /* On réinsère les lignes déplacées à la position de la première ligne déplacée. */
          const firstIndex = lines.findIndex(line => before.includes(line.trim()));
          section.text = firstIndex < 0
            ? [...kept, ...after].join("\n")
            : [...lines.slice(0, firstIndex), ...after, ...kept].join("\n");
        } else {
          const rank = new Map(after.map((title, index) => [title, index]));
          section.items = [...section.items].sort((a, b) => (rank.get(a.title) ?? after.length + 1) - (rank.get(b.title) ?? after.length + 1));
        }
        applied.push(op.zone);
        break;
      }
      case "omit_optional_fact": {
        const index = cv.sections.findIndex(row => row.title === op.zone);
        if (index < 0) { skipped.push(op.zone); break; }
        cv.sections.splice(index, 1);
        applied.push(op.zone);
        break;
      }
      case "keep":
        break;
      default:
        skipped.push(op.zone);
    }
  }
  return { cv, applied, skipped };
}

/** Nombre de mots — indicateur de tenue de page (la vérification A4 réelle
    reste le contrôle du générateur PDF). */
export function cvWordCount(cv: CvData): number {
  const text = [cv.basics.name, cv.basics.headline, cv.basics.target, cv.summary,
    ...cv.sections.flatMap((section: CvSection) => [section.title, section.text,
      ...section.items.flatMap(item => [item.title, item.detail, item.meta || ""])])].join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}
