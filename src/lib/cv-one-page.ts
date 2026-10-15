import type { CvData } from "./cv";

type Candidate = { cv: CvData; change: string };

const words = (value: string) => value.toLocaleLowerCase("fr-FR").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9+#]{3,}/g) || [];

function shorten(value: string, limit: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]?/g)?.map(part => part.trim()).filter(Boolean) || [];
  let selected = "";
  for (const sentence of sentences) {
    if ((selected ? `${selected} ${sentence}` : sentence).length > limit) break;
    selected = selected ? `${selected} ${sentence}` : sentence;
  }
  if (selected) return selected;
  const clipped = clean.slice(0, limit + 1);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > limit * .6 ? boundary : limit).trimEnd().replace(/[,:;\-– ]+$/, "")}…`;
}

function compactDetail(value: string, limit: number, maxBullets: number, terms: Set<string>): string {
  const lines = value.split("\n").map(line => line.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every(line => /^[-•]\s/.test(line))) {
    const ranked = lines.map((line, index) => ({ line, index, score: words(line).filter(word => terms.has(word)).length }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, maxBullets).sort((a, b) => a.index - b.index);
    return ranked.map(({ line }) => shorten(line, limit)).join("\n");
  }
  return shorten(value, limit);
}

/** Progressive, adapted-copy-only candidates. The source CV and skill lines are preserved. */
export function onePageCandidates(source: CvData, offerText: string): Candidate[] {
  const terms = new Set(words(offerText));
  const levels = [
    { summary: 310, experience: 240, project: 190, other: 180, bullets: 3 },
    { summary: 240, experience: 185, project: 140, other: 140, bullets: 2 },
    { summary: 175, experience: 135, project: 100, other: 110, bullets: 1 },
  ];
  return levels.map((level, index) => {
    const cv = structuredClone(source);
    cv.summary = shorten(cv.summary, level.summary);
    for (const section of cv.sections) {
      if (section.kind !== "list") continue;
      const isExperience = /exp[ée]rience|stage|emploi/i.test(section.title);
      const isProject = /projet|r[ée]alisation/i.test(section.title);
      const limit = isExperience ? level.experience : isProject ? level.project : level.other;
      for (const item of section.items) {
        item.detail = compactDetail(item.detail, limit, level.bullets, terms);
      }
    }
    return {
      cv,
      change: index === 0
        ? "Descriptions secondaires condensées pour tenir sur une page A4 ; CV principal conservé"
        : `Descriptions secondaires davantage condensées pour une page A4 (niveau ${index + 1}) ; CV principal conservé`,
    };
  }).filter(candidate => JSON.stringify(candidate.cv) !== JSON.stringify(source));
}
