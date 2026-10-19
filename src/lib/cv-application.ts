import type { CvData, CvItem, CvSection } from "./cv";
import { chronologicalExperiences } from "./career-cv-checks";

const tokens = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9+#]{3,}/g) || [];
const uncertain = /[àa] confirmer|[àa] v[ée]rifier|[ée]voqu[ée]|selon les [ée]l[ée]ments ant[ée]rieurs|avant diffusion externe/i;
const internal = /r[ée]f[ée]rence interne|dossier ma[îi]tre|statut.*document|CV ma[îi]tre(?:\s*[•·]|\s+interne)|attest[ée] dans CV r[ée]cent|biblioth[èe]ques list[ée]es dans le CV|selon le projet d[ée]crit/i;
const categories = ["Génie électrique", "Énergies & performance", "Données, statistiques et reporting", "Programmation", "Logiciels CAO et simulation", "Systèmes embarqués", "Mathématiques", "Réseaux informatiques"];

/** Compose la copie de candidature depuis le dossier long, sans toucher au maître.
 * Les mentions internes ne sont pas des réalisations à envoyer au recruteur. */
export function prepareApplicationCv(source: CvData, offerText: string, priorityTerms: string[] = []): CvData {
  const cv = chronologicalExperiences(source);
  const sourceText = JSON.stringify(source);
  if (!internal.test(sourceText) && !uncertain.test(sourceText)
    && sourceText.split(/\s+/).length < 480) return cv;
  const terms = new Set(tokens(offerText));
  const priorities = new Set(tokens(priorityTerms.join(" ")));
  const rank = (value: string) => tokens(value).reduce((sum, token) => sum + (terms.has(token) ? 1 : 0) + (priorities.has(token) ? 3 : 0), 0);
  const clean = (value: string) => value
    .replace(/\s*[·—–-]?\s*attest[ée] dans CV r[ée]cent/gi, "")
    .replace(/\s*\((?:pratiqu[ée]|d[ée]clar[ée])\)/gi, "")
    .replace(/Biblioth[èe]ques list[ée]es dans le CV\s*:/gi, "Bibliothèques :")
    .trim();
  cv.summary = cv.summary.split(/\n/).filter(line => !internal.test(line) && !uncertain.test(line)).map(clean).join(" ");
  cv.basics.contact = cv.basics.contact.split("\n").filter(line => !internal.test(line)).join("\n");
  if (/Stage de 6 mois/i.test(cv.basics.target || "")) {
    cv.basics.target = "Stage de 6 mois · à partir de début 2027 · Mobilité France";
  }
  const projects: CvItem[] = [];
  const sections: CvSection[] = [];
  for (const section of cv.sections) {
    if (/r[ée]f[ée]rence interne|dossier ma[îi]tre|statut.*document/i.test(section.title)) continue;
    if (/^profil/i.test(section.title) && section.kind === "text") {
      cv.summary = clean(section.text.replace(/\s+/g, " "));
      continue;
    }
    if (section.kind === "list") {
      section.items = section.items.filter(item => !uncertain.test(`${item.meta || ""} ${item.detail}`)).map(item => ({
        ...item, meta: clean(item.meta || ""),
        detail: item.detail.split("\n").filter(line => !uncertain.test(line)).map(clean).join("\n"),
      }));
      if (/projet|travaux acad[ée]miques/i.test(section.title)) {
        projects.push(...section.items);
        continue;
      }
    } else if (/comp[ée]tence|logiciel|informatique/i.test(section.title)) {
      let text = section.text;
      for (const category of categories) text = text.replace(new RegExp(`${category}\\s*:?\\s*`, "g"), `\n${category} : `);
      const lines = text.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
        const colon = line.indexOf(":");
        const label = colon >= 0 ? line.slice(0, colon).trim() : "";
        const values = (colon >= 0 ? line.slice(colon + 1) : line).split(/[·;]/)
          .map(clean).filter(value => value && !uncertain.test(value));
        const selected = values.map((value, index) => ({ value, index, score: rank(value) }))
          .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 4).map(row => row.value);
        return { text: `${label ? label + " : " : ""}${selected.join(" · ")}`, score: rank(selected.join(" ")), count: selected.length };
      }).filter(row => row.count);
      section.title = "Compétences techniques";
      section.text = lines.map((row, index) => ({ ...row, index })).sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, 5).map(row => row.text).join("\n");
    } else if (/qualit[ée]|langue/i.test(section.title)) {
      const languages = section.text.match(/Langues\s*:\s*([^\n]+)/i)?.[1];
      section.title = "Langues";
      section.text = languages || section.text.split("\n").filter(line => !/qualit[ée]s d[ée]clar[ée]es|les mettre en valeur|exemples lorsque/i.test(line)).join("\n");
    }
    if (section.kind === "text" ? section.text.trim() : section.items.length) sections.push(section);
  }
  if (projects.length) {
    const selected = projects.map((item, index) => ({ item, index, score: rank(`${item.title} ${item.detail}`) }))
      .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2).map(row => row.item);
    const position = sections.findIndex(section => /formation|comp[ée]tence/i.test(section.title));
    sections.splice(position < 0 ? sections.length : position, 0, { key: "application-projects", title: "Projets techniques", kind: "list", text: "", items: selected });
  }
  cv.sections = sections;
  return cv;
}
