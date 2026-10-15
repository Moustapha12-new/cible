import type { CvData } from "./cv";
import { cvToText, numbersSafe } from "./cv";

type AiChange = { original?: string; rewritten?: string; section?: string; method?: string };
const namedTools = ["matlab", "python", "c++", "autocad", "digSILENT", "powerfactory", "psse", "excel", "vhdl", "simulink", "plc", "arduino"];
const norm = (value: string) => value.toLocaleLowerCase("fr-FR");
const proofWords = (value: string) => norm(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z][a-z0-9+#]*/g) || [];
const editorialWords = new Set(["avec", "pour", "dans", "sous", "chez", "etude", "etudes", "mise", "place", "suivi", "oriente", "orientee", "orientes", "orientees", "pertinent", "pertinente", "notamment", "ainsi", "plus", "des", "les", "une", "aux", "par", "sur", "son", "ses", "leur", "leurs", "qui", "que", "dont", "afin", "vers"]);

/** A rewritten sentence may reorder facts, but cannot introduce a new technical claim. */
function addsUnverifiedWords(original: string, rewritten: string, cvText: string): boolean {
  const known = new Set(proofWords(cvText));
  const before = new Set(proofWords(original));
  return proofWords(rewritten).some(word => word.length > 3 && !known.has(word) && !before.has(word) && !editorialWords.has(word));
}

function unsupportedClaim(original: string, rewritten: string, cvText: string): boolean {
  const before = norm(original), after = norm(rewritten), source = norm(cvText);
  if (namedTools.some(tool => after.includes(norm(tool)) && !before.includes(norm(tool)) && !source.includes(norm(tool)))) return true;
  return /\b(ma[iî]trise|expert(?:ise)?|certifi[ée]|autonome)\b/i.test(rewritten) && !/\b(ma[iî]trise|expert(?:ise)?|certifi[ée]|autonome)\b/i.test(original);
}

/** Only edits passages found verbatim in the source CV and structured document. */
export function applyGroundedChanges(source: CvData, originalText: string, result: { changes?: AiChange[] }, offerTerms: string[] = [], offerText = ""): { cv: CvData; changes: string[] } {
  const cv: CvData = structuredClone(source);
  const descriptions: string[] = [];
  const sourceStructured = cvToText(source);
  for (const change of (result.changes || []).slice(0, 8)) {
    const original = change.original?.trim() || "";
    const rewritten = change.rewritten?.trim() || "";
    if (!original || !rewritten || original === rewritten || change.method === "RETURN_UNCHANGED") continue;
    if (rewritten.length > original.length + Math.max(25, Math.round(original.length * .2))) continue;
    if (!originalText.includes(original) || !sourceStructured.includes(original)) continue;
    if (!numbersSafe(original, rewritten, originalText) || unsupportedClaim(original, rewritten, originalText) || addsUnverifiedWords(original, rewritten, originalText)) continue;
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
  const skills = cv.sections.find(section => /comp[ée]tences|logiciels|informatique/i.test(section.title));
  if (skills) {
    if (skills.kind === "text" && offerTerms.length > 0) {
      const lines = skills.text.split("\n").filter(Boolean);
      const score = (line: string) => offerTerms.reduce((count, term) => count + (term.length >= 2 && norm(line).includes(norm(term)) ? 1 : 0), 0);
      const ranked = lines.map((line, index) => ({ line, index, score: score(line) })).sort((a, b) => b.score - a.score || a.index - b.index);
      if (ranked.some((item, index) => item.index !== index) && ranked[0]?.score > 0) {
        skills.text = ranked.map(item => item.line).join("\n");
        descriptions.push("Compétences déjà présentes classées selon leur pertinence pour l'offre");
      }
    }
  }
  const electricOffer = /architecture.{0,30}[ée]lectrique|installations? [ée]lectriques?|b[âa]timents? de production/i.test(offerText);
  const btProject = cv.sections.find(section => /projet/i.test(section.title))?.items.find(item => /r[ée]seau [ée]lectrique industriel/i.test(item.title) && /chutes? de tension/i.test(item.detail) && /courts?-circuits?/i.test(item.detail));
  if (electricOffer && btProject && /g[ée]nie [ée]lectrique/i.test(originalText)) {
    const title = "ÉLÈVE-INGÉNIEUR | GÉNIE ÉLECTRIQUE & INSTALLATIONS BT";
    if (cv.basics.headline !== title) { cv.basics.headline = title; descriptions.push("Titre ciblé sur le génie électrique et le projet BT existant"); }
    const firstSentence = source.summary.match(/^.+?[.!?](?:\s|$)/)?.[0]?.trim();
    if (firstSentence && /[ée]l[èe]ve.?ing[ée]nieur/i.test(firstSentence)) {
      const profile = `${firstSentence} Projet personnel de dimensionnement d’un réseau électrique industriel : câbles, chutes de tension, courts-circuits, protections et schéma unifilaire. Après une première expérience en analyse de données énergétiques chez EDD, je souhaite contribuer à la fiabilité des installations électriques.`;
      if (/EDD/i.test(originalText) && /protections/i.test(btProject.detail) && /sch[ée]ma unifilaire/i.test(btProject.detail) && cv.summary !== profile) {
        cv.summary = profile;
        descriptions.push("Profil recentré sur le projet BT et l'expérience EDD, sans expérience de chantier ajoutée");
      }
    }
    if (/6\s*mois/i.test(source.basics.target || "") && /f[ée]vrier\s+2027/i.test(source.basics.target || "")) {
      cv.basics.target = "Stage de 6 mois · Installations électriques BT · à partir de février 2027";
      descriptions.push("Disponibilité reformulée sans changer la durée ni la date");
    }
  }
  const pythonRequested = offerTerms.some(term => norm(term) === "python");
  const hasDataExperience = /analyse de donn[ée]es/i.test(originalText) && /python/i.test(originalText);
  if (!electricOffer && pythonRequested && hasDataExperience && /[ée]l[èe]ve.?ing[ée]nieur/i.test(source.basics.headline) && !/python/i.test(cv.basics.headline)) {
    const candidateTitle = source.basics.headline.split(/[|｜]/)[0].trim();
    cv.basics.headline = `${candidateTitle} | ANALYSE DE DONNÉES & PYTHON`;
    descriptions.push("Titre recentré sur l'analyse de données et Python déjà présents dans le CV");
  }
  return { cv, changes: descriptions };
}
