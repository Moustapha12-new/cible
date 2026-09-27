/* Contrôle anti-falsification : extrait les « faits durs » d'un texte de CV
   (e-mails, téléphones, années, montants/quantités, noms propres récurrents)
   puis vérifie qu'on les retrouve dans la version adaptée. 100 % local,
   déterministe, indépendant de l'IA.

   Module 2 — Blacklist anti-phrases IA : détecte et remplace les
   tournures typiquement générées par une IA (« génériques ») dans un texte
   de CV, au profit de formulations plus naturelles. */

export type FactKind = "e-mail" | "téléphone" | "année" | "chiffre" | "nom propre";

export type Fact = { fact: string; kind: FactKind };

export type FactsReport = {
  checked: number;
  preserved: number;
  lost: Fact[];
  invented: Fact[];
};

const fold = (s: string) =>
  s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

function uniq(a: string[]): string[] {
  return [...new Set(a.map((x) => x.trim()).filter(Boolean))];
}

const ORG_HINT =
  /(s\.a\.s|s\.a\.r\.l|group|groupe|universit[eé]|ecole|[ée]cole|institut|lyc[eé]e|agence|studio|solutions|technolog|consulting|industr)/i;

export function extractFacts(cv: string): { facts: Fact[]; properNouns: string[] } {
  const emails = uniq(cv.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []);
  const phonesRaw = uniq(
    cv.match(/(?:\+\d{1,3}[\s.-]?)?(?:0\d(?:[\s.-]?\d{2}){4})/g) ?? []
  );
  const phones = phonesRaw.map((p) => p.replace(/\D/g, ""));
  const years = uniq(cv.match(/\b(?:19|20)\d{2}\b/g) ?? []);
  const numbers = uniq(
    (cv.match(/\b\d{1,4}(?:[.,]\d+)?\s?(?:%|k\s?€|€|k\b|ans|mois|semaines|clients|projets|personnes|x)\b/gi) ?? []).map((m) =>
      fold(m)
    )
  );

  /* Noms propres : mots capitalisés ni en début de phrase ni vides de sens,
     gardés s'ils reviennent ou ressemblent à une organisation. */
  const caps = cv.match(/\b[A-ZÉÈÊÀÂÔÛ][a-zéèêàâôûîïüç]+(?:\s+[A-ZÉÈÊÀÂÔÛ][a-zéèêàâôûîïüç]+){0,3}\b/g) ?? [];
  const stop = new Set([
    "Le", "La", "Les", "Un", "Une", "Des", "Du", "De", "Et", "En", "Dans", "Pour",
    "Avec", "Sur", "Au", "Aux", "Ce", "Cette", "Ces", "Je", "J", "Master", "Bac",
    "Licence", "Stage", "Stagiaire", "Projet", "Projets", "Compétences",
  ]);
  const counts = new Map<string, number>();
  for (const c of caps) {
    if (stop.has(c.split(" ")[0])) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const proper = [...counts.entries()]
    .filter(([name, n]) => n >= 2 || ORG_HINT.test(name))
    .map(([name]) => name)
    .slice(0, 60);

  const facts: Fact[] = [
    ...emails.map((f) => ({ fact: f, kind: "e-mail" as FactKind })),
    ...phones.map((f) => ({ fact: f, kind: "téléphone" as FactKind })),
    ...years.map((f) => ({ fact: f, kind: "année" as FactKind })),
    ...numbers.map((f) => ({ fact: f, kind: "chiffre" as FactKind })),
  ];
  return { facts, properNouns: proper };
}

/* Compare original vs version adaptée (+ texte de l'offre pour autoriser
   les chiffres qui viennent légitimement de l'annonce). */
export function checkFacts(original: string, tailored: string, offerText = ""): FactsReport {
  const t = fold(tailored);
  const allowed = fold(original + " " + offerText);
  const { facts, properNouns } = extractFacts(original);

  const lost: Fact[] = [];
  for (const f of facts) {
    const hit =
      f.kind === "téléphone"
        ? t.replace(/\D/g, "").includes(f.fact)
        : t.includes(fold(f.fact));
    if (!hit) lost.push(f);
  }

  /* Noms propres : on ne signale que ceux qui ont totalement disparu. */
  for (const name of properNouns) {
    if (!t.includes(fold(name))) lost.push({ fact: name, kind: "nom propre" });
  }

  /* Inventions : chiffres présents dans la version finale mais absents
     du CV original ET du texte d'offre. */
  const newNumbers = uniq(
    (tailored.match(/\b\d{1,4}(?:[.,]\d+)?\s?(?:%|k\s?€|€|k\b|ans|mois|semaines|clients|projets|personnes|x)\b/gi) ?? []).map((m) =>
      fold(m)
    )
  );
  const invented: Fact[] = newNumbers
    .filter((n) => !allowed.includes(n))
    .map((n) => ({ fact: n, kind: "chiffre" as FactKind }));

  return {
    checked: facts.length + properNouns.length,
    preserved: facts.length + properNouns.length - lost.length,
    lost,
    invented,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Module 2 — Blacklist anti-phrases IA
   Inspiré de Resume-Matcher (prompts/refinement.py), adapté au français.
   L'objectif : repérer et remplacer localement les tournures typiquement
   « générées par IA » sans appel LLM — c'est un filtre post-traitement
   purement déterministe, exactement comme le reste de facts.ts.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Phrases / mots typiquement générés par IA dans un CV français. */
export const AI_PHRASE_BLACKLIST: string[] = [
  /* Verbes d'action surutilisés par les LLM */
  "piloté avec succès",
  "piloté avec brio",
  "orchestré",
  "spearheaded",
  "orchestrated",
  "championed",
  "synergized",
  "leveraged",
  "revolutionized",
  "pioneered",
  "catalyzed",
  "operationalized",
  "architected",
  "envisioned",
  "effectuated",
  "endeavored",
  "facilitated",
  "utilized",
  /* Buzzwords corporate / anglicismes */
  "synergie",
  "synergies",
  "paradigme",
  "best-in-class",
  "world-class",
  "cutting-edge",
  "bleeding-edge",
  "game-changer",
  "game-changing",
  "disruptif",
  "disruptive",
  "holistique",
  "holistic",
  "robuste",
  "robust",
  "scalable",
  "actionable",
  "impactful",
  "proactif",
  "proactive",
  "proactivement",
  "stakeholder",
  "deliverables",
  "bandwidth",
  "value-add",
  "mindset",
  "growth mindset",
  "go-to person",
  "key player",
  "team player",
  "fast-paced",
  "results-driven",
  "data-driven",
  "detail-oriented",
  "self-starter",
  "go-getter",
  "passionné par",
  "passionnée par",
  /* Phrases de remplissage / word-filling */
  "afin de",
  "dans le but de",
  "en vue de",
  "au final",
  "dans le cadre de",
  "dans un premier temps",
  "dans une seconde étape",
  "il convient de noter",
  "il est important de souligner",
  "il est à noter que",
  "il convient de préciser",
  "il convient de rappeler",
  "de manière significative",
  "de façon significative",
  "de manière proactive",
  "de façon proactive",
  "dans les meilleurs délais",
  "dans un délai raisonnable",
  "de la meilleure façon possible",
  "à ce jour",
  "à l'heure actuelle",
  "à titre indicatif",
  "en ce qui concerne",
  "en matière de",
  "en termes de",
  "en termes d'",
  "en ce sens que",
  "pour ce qui est de",
  "s'agissant de",
  "ce qui a permis de",
  "ce qui a conduit à",
  "ce qui permet de",
  "tout en assurant",
  "tout en garantissant",
  /* tirets longs abusifs (ém-dash) — souvent artificiels */
  "—",
  "---",
  "--",
];

/** Remplacement : phrase IA → version plus naturelle. */
export const AI_PHRASE_REPLACEMENTS: Record<string, string> = {
  /* Verbes */
  "piloté avec succès": "mené",
  "piloté avec brio": "mené",
  "orchestré": "coordonné",
  "spearheaded": "dirigé",
  "orchestrated": "coordonné",
  "championed": "défendu",
  "synergized": "collaboré",
  "leveraged": "utilisé",
  "revolutionized": "transformé",
  "pioneered": "introduit",
  "catalyzed": "initié",
  "operationalized": "mis en place",
  "architected": "conçu",
  "envisioned": "planifié",
  "effectuated": "mené à bien",
  "endeavored": "travaillé",
  "facilitated": "aidé",
  "utilized": "utilisé",
  /* Buzzwords */
  "synergie": "collaboration",
  "synergies": "collaborations",
  "paradigme": "approche",
  "best-in-class": "performant",
  "world-class": "de haute qualité",
  "cutting-edge": "moderne",
  "bleeding-edge": "moderne",
  "game-changer": "innovation",
  "game-changing": "innovant",
  "disruptif": "innovant",
  "disruptive": "innovant",
  "holistique": "global",
  "holistic": "global",
  "robuste": "solide",
  "robust": "solide",
  "scalable": "évolutif",
  "actionable": "pratico-pratique",
  "impactful": "efficace",
  "proactif": "actif",
  "proactive": "active",
  "proactivement": "activement",
  "stakeholder": "partie prenante",
  "deliverables": "livrables",
  "bandwidth": "capacité",
  "value-add": "valeur ajoutée",
  "mindset": "état d'esprit",
  "growth mindset": "envie de progresser",
  "go-to person": "référence",
  "key player": "acteur clé",
  "team player": "collaboratif",
  "fast-paced": "dynamique",
  "results-driven": "orienté résultats",
  "data-driven": "basé sur les données",
  "detail-oriented": "rigoureux",
  "self-starter": "autonome",
  "go-getter": "déterminé",
  "passionné par": "engagé dans",
  "passionnée par": "engagée dans",
  /* Phrases de remplissage */
  "afin de": "pour",
  "dans le but de": "pour",
  "en vue de": "pour",
  "au final": "finalement",
  "dans le cadre de": "pour",
  "dans un premier temps": "d'abord",
  "dans une seconde étape": "ensuite",
  "il convient de noter": "",
  "il est important de souligner": "",
  "il est à noter que": "",
  "il convient de préciser": "",
  "il convient de rappeler": "",
  "de manière significative": "",
  "de façon significative": "",
  "de manière proactive": "",
  "de façon proactive": "",
  "dans les meilleurs délais": "rapidement",
  "dans un délai raisonnable": "dans les temps",
  "de la meilleure façon possible": "",
  "à ce jour": "actuellement",
  "à l'heure actuelle": "actuellement",
  "à titre indicatif": "",
  "en ce qui concerne": "sur",
  "en matière de": "sur",
  "en termes de": "sur",
  "en termes d'": "sur ",
  "en ce sens que": "car",
  "pour ce qui est de": "sur",
  "s'agissant de": "sur",
  "ce qui a permis de": "permettant de",
  "ce qui a conduit à": "menant à",
  "ce qui permet de": "permettant de",
  "tout en assurant": "et assurant",
  "tout en garantissant": "et garantissant",
  /* Tirets longs → virgule */
  "—": ", ",
  "---": ", ",
  "--": ", ",
};

export type AiPhraseReport = {
  checked: number;
  replaced: number;
  details: { original: string; replacement: string }[];
};

/**
 * Supprime les phrases IA d'un texte de CV et renvoie un rapport.
 * Fonction locale, déterministe, sans appel IA.
 *
 * @param text       Texte du CV (une section ou tout le document)
 * @param jdText     Texte de l'offre ; si une phrase IA y figure, on la PROTÈGE
 *                   (car elle reflète le vocabulaire du recruteur).
 */
export function removeAiPhrases(text: string, jdText = ""): AiPhraseReport {
  const jdLower = jdText.toLowerCase();
  const jdProtected = new Set<string>();
  for (const phrase of AI_PHRASE_BLACKLIST) {
    if (jdLower.includes(phrase.toLowerCase())) {
      jdProtected.add(phrase.toLowerCase());
    }
  }

  let result = text;
  const details: { original: string; replacement: string }[] = [];

  for (const phrase of AI_PHRASE_BLACKLIST) {
    const lower = phrase.toLowerCase();
    if (jdProtected.has(lower)) continue;
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (!re.test(result)) continue;
    const replacement = AI_PHRASE_REPLACEMENTS[lower] ?? "";
    result = result.replace(re, replacement);
    details.push({ original: phrase, replacement });
  }

  /* Nettoyage : doubles espaces, espaces avant virgule/point, virgules vides. */
  result = result
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/^\s*,\s*/gm, "")
    .trim();

  return { checked: AI_PHRASE_BLACKLIST.length, replaced: details.length, details };
}
