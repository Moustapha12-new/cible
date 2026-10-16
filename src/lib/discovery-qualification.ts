/** Extract only explicit facts from the public posting; unknown stays unknown. */
export type StartFit = "compatible" | "incompatible" | "unknown";
export type DegreeFit = "compatible" | "other_specialty" | "unknown";

const months = "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre";

export function qualifyDiscoveryText(description: string, title: string): {
  startEvidence: string | null; startFit: StartFit;
  degreeEvidence: string | null; degreeFit: DegreeFit;
  technicalSkills: string[];
} {
  const text = `${title}\n${description}`;
  const dates = [
    ...text.matchAll(new RegExp(`(?:d[ée]marrage|d[ée]but|[àa] partir|[àa] compter|p[ée]riode du stage|stage de 6 mois bas[ée]|dur[ée]e du stage)[^.!?\\n]{0,85}(?:${months})[^.!?\\n]{0,35}(?:20\\d{2})`, "gi")),
    ...text.matchAll(/(?:1er|premier)\s+trimestre\s+20\d{2}/gi),
  ].map(m => m[0].replace(/\s+/g, " ").trim());
  const startEvidence = dates[0] || null;
  const years = startEvidence?.match(/20\d{2}/g)?.map(Number) || [];
  const startFit: StartFit = !years.length ? "unknown" : years.some(y => y >= 2027) ? "compatible" : "incompatible";
  const degreePatterns = [
    /(?:[ée]tudiant\(?e?\)?|[ée]l[èe]ve|vous [êe]tes|vous pr[ée]parez|formation)[^.!?\n]{0,150}(?:bac\s*\+\s*[345]|master\s*2|derni[èe]re ann[ée]e|[ée]cole d.ing[ée]nieurs?|cycle ing[ée]nieur)[^.!?\n]{0,140}/i,
    /(?:bac\s*\+\s*[345]|master\s*2|derni[èe]re ann[ée]e|[ée]cole d.ing[ée]nieurs?|cycle ing[ée]nieur)[^.!?\n]{0,150}/i,
  ];
  const degreeEvidence = degreePatterns.map(p => description.match(p)?.[0]?.replace(/\s+/g, " ").trim()).find(Boolean) || null;
  const degreeFit: DegreeFit = !degreeEvidence ? "unknown" : /affaires publiques|relations institutionnelles|b[âa]timent et en thermique|g[ée]nie climatique/i.test(degreeEvidence)
    ? "other_specialty" : "compatible";
  const skillPatterns = [/Python/i, /Matlab/i, /Excel|VBA/i, /PLEIADES|Pl[ée]iades/i, /AutoCAD/i, /REVIT/i, /EMTP/i, /[ée]lectrotechnique/i, /r[ée]seaux? [ée]lectriques?/i, /contr[ôo]le.commande/i, /HTB/i, /[ée]olien/i, /photovolta[iï]que|solaire/i];
  const technicalSkills = skillPatterns.flatMap(p => text.match(p)?.[0] ? [text.match(p)![0]] : []);
  return { startEvidence, startFit, degreeEvidence, degreeFit, technicalSkills };
}
