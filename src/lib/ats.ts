/* Score ATS déterministe : chaque point vient d'une règle vérifiable.
   Aucun aléatoire, aucune IA — le même texte donne toujours la même note,
   et le détail des règles est affiché à l'utilisateur. */

export type AtsBreakdown = { label: string; got: number; max: number; detail: string };

const ACTION_VERBS = [
  "pilot", "réalis", "realis", "dévelop", "develop", "gestion", "gér", "ger ",
  "anim", "coordon", "condui", "optimis", "analys", "conception", "particip",
  "organis", "négoci", "negoci", "automatis", "modélis", "modelis", "calcul",
];

export function atsScore(text: string): { score: number; breakdown: AtsBreakdown[] } {
  const t = (text ?? "").trim();
  const low = t.toLowerCase();
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const words = t.split(/\s+/).filter(Boolean);
  const bd: AtsBreakdown[] = [];

  /* Coordonnées */
  const hasMail = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(t);
  const hasTel = /(?:\+\d{1,3}[\s.-]?)?(?:0\d(?:[\s.-]?\d{2}){4})/.test(t);
  bd.push({
    label: "Coordonnées lisibles",
    got: (hasMail ? 6 : 0) + (hasTel ? 6 : 0),
    max: 12,
    detail: `${hasMail ? "e-mail trouvé" : "e-mail absent"} · ${hasTel ? "téléphone trouvé" : "téléphone absent"}`,
  });

  /* Sections repérables */
  const secs = ["expérience", "experience", "formation", "compétence", "competence", "projet", "langue", "certification"]
    .filter((s) => low.includes(s)).length;
  bd.push({
    label: "Sections repérables",
    got: Math.min(18, secs * 5),
    max: 18,
    detail: `${secs} intitulé(s) reconnu(s) par les robots`,
  });

  /* Longueur */
  const lenPts =
    words.length === 0 ? 0 :
    words.length < 150 ? 5 :
    words.length < 250 ? 9 :
    words.length <= 1200 ? 14 :
    words.length <= 1800 ? 11 : 8;
  bd.push({
    label: "Longueur adaptée",
    got: lenPts,
    max: 14,
    detail: `${words.length} mots (l'idéal : 250 à 1200)`,
  });

  /* Structure en puces */
  const bullets = lines.filter((l) => /^[-•*·]|^\d+[.)]/.test(l)).length;
  const ratio = lines.length ? bullets / lines.length : 0;
  bd.push({
    label: "Structure en puces",
    got: Math.round(12 * Math.min(1, ratio / 0.25)),
    max: 12,
    detail: `${bullets} ligne(s) à puce sur ${lines.length}`,
  });

  /* Résultats chiffrés */
  const nums = t.match(/\d+(?:[.,]\d+)?\s?(?:%|k\s?€|€|k\b|ans|mois|semaines|clients|projets|personnes|articles|x)/gi) ?? [];
  bd.push({
    label: "Résultats chiffrés",
    got: Math.round(14 * Math.min(1, nums.length / 4)),
    max: 14,
    detail: `${nums.length} résultat(s) quantifié(s) repéré(s)`,
  });

  /* Verbes d'action */
  const verbs = ACTION_VERBS.filter((v) => low.includes(v));
  bd.push({
    label: "Verbes d'action",
    got: Math.round(12 * Math.min(1, verbs.length / 6)),
    max: 12,
    detail: `${verbs.length} verbe(s) d'action courant(s)`,
  });

  /* Dates exploitables */
  const years = new Set(t.match(/\b(?:19|20)\d{2}\b/g) ?? []);
  bd.push({
    label: "Dates exploitables",
    got: years.size >= 2 ? 8 : years.size === 1 ? 4 : 0,
    max: 8,
    detail: `${years.size} année(s) différente(s)`,
  });

  /* Liste de compétences */
  const commaList = lines.some((l) => (l.match(/,/g) ?? []).length >= 3);
  const kwSection = /compétences?\s*:|skills?\s*:/i.test(t);
  bd.push({
    label: "Compétences isolées",
    got: kwSection && commaList ? 12 : kwSection || commaList ? 7 : 3,
    max: 12,
    detail: kwSection ? "section « compétences » détectée" : commaList ? "liste à virgules détectée" : "aucune liste de compétences claire",
  });

  const score = Math.max(0, Math.min(100, bd.reduce((s, b) => s + b.got, 0)));
  return { score, breakdown: bd };
}
