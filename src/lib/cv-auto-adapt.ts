import type { CvData } from "./cv";
import { cvToText, numbersSafe } from "./cv";

type AiChange = { original?: string; rewritten?: string; section?: string; method?: string };
const namedTools = ["matlab", "python", "c++", "autocad", "digSILENT", "powerfactory", "psse", "excel", "vhdl", "simulink", "plc", "arduino"];
const norm = (value: string) => value.toLocaleLowerCase("fr-FR");

function unsupportedClaim(original: string, rewritten: string, cvText: string): boolean {
  const before = norm(original), after = norm(rewritten), source = norm(cvText);
  if (namedTools.some(tool => after.includes(norm(tool)) && !before.includes(norm(tool)) && !source.includes(norm(tool)))) return true;
  return /\b(ma[iî]trise|expert(?:ise)?|certifi[ée]|autonome)\b/i.test(rewritten) && !/\b(ma[iî]trise|expert(?:ise)?|certifi[ée]|autonome)\b/i.test(original);
}

/** Only edits passages found verbatim in the source CV and structured document. */
export function applyGroundedChanges(source: CvData, originalText: string, result: { changes?: AiChange[] }): { cv: CvData; changes: string[] } {
  const cv: CvData = structuredClone(source);
  const descriptions: string[] = [];
  const sourceStructured = cvToText(source);
  for (const change of (result.changes || []).slice(0, 8)) {
    const original = change.original?.trim() || "";
    const rewritten = change.rewritten?.trim() || "";
    if (!original || !rewritten || original === rewritten || change.method === "RETURN_UNCHANGED") continue;
    if (!originalText.includes(original) || !sourceStructured.includes(original)) continue;
    if (!numbersSafe(original, rewritten, originalText) || unsupportedClaim(original, rewritten, originalText) || /f[ée]vrier\s+2027/i.test(rewritten)) continue;
    let replacements = 0;
    const replaceOnce = (value: string) => {
      if (replacements || !value.includes(original)) return value;
      replacements++;
      return value.replace(original, rewritten);
    };
    cv.basics.headline = replaceOnce(cv.basics.headline);
    cv.summary = replaceOnce(cv.summary);
    for (const section of cv.sections) {
      section.text = replaceOnce(section.text);
      for (const item of section.items) {
        item.title = replaceOnce(item.title);
        item.detail = replaceOnce(item.detail);
        if (item.meta) item.meta = replaceOnce(item.meta);
      }
    }
    if (replacements) descriptions.push(change.section?.slice(0, 80) || "Reformulation ciblée");
  }
  return { cv, changes: descriptions };
}
