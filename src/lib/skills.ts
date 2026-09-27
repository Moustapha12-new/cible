/* Moteur de matching — 100 % côté client, transparent et déterministe.
   Chaque mot-clé détecté est réellement présent dans le texte de l'offre. */

type SkillDef = {
  key: string;
  aliases: string[];
  weight: number;
};

const DICTIONARY: SkillDef[] = [
  { key: "SEO", aliases: ["seo", "référencement", "search engine"], weight: 9 },
  { key: "Google Analytics", aliases: ["google analytics", "ga4", "analytics"], weight: 8 },
  { key: "Rédaction web", aliases: ["rédaction", "contenu web", "content", "rédiger des articles"], weight: 7 },
  { key: "Réseaux sociaux", aliases: ["réseaux sociaux", "instagram", "linkedin", "tiktok", "community management"], weight: 6 },
  { key: "CRM", aliases: ["crm", "salesforce", "hubspot"], weight: 8 },
  { key: "Reporting", aliases: ["reporting", "reporter", "kpi", "tableaux de bord"], weight: 6 },
  { key: "E-commerce", aliases: ["e-commerce", "ecommerce", "shopify", "fiches produits"], weight: 7 },
  { key: "Data", aliases: ["data", "analyse de données", "données"], weight: 6 },
  { key: "Marketing digital", aliases: ["marketing digital", "growth", "acquisition"], weight: 7 },
  { key: "Communication", aliases: ["communication"], weight: 5 },
  { key: "Événementiel", aliases: ["événementiel", "evenementiel", "événements", "organisation d'événements"], weight: 4 },
  { key: "Gestion de projet", aliases: ["gestion de projet", "chef de projet", "pilotage", "coordination"], weight: 6 },
  { key: "Relation client", aliases: ["relation client", "service client", "satisfaction client"], weight: 5 },
  { key: "Travail en équipe", aliases: ["travail en équipe", "esprit d'équipe", "équipe", "cross-team"], weight: 3 },
  { key: "Rigueur", aliases: ["rigueur", "organisé", "organisation"], weight: 3 },
  { key: "Autonomie", aliases: ["autonomie", "autonome", "proactif"], weight: 3 },
  { key: "Anglais", aliases: ["anglais", "english"], weight: 5 },
  { key: "Pack Office", aliases: ["pack office", "excel", "powerpoint", "word"], weight: 4 },
  { key: "Canva", aliases: ["canva", "figma", "photoshop"], weight: 4 },
  { key: "Emailing", aliases: ["emailing", "newsletter", "mailchimp"], weight: 5 },
];

export type Analysis = {
  found: { key: string; weight: number }[];
  missing: SkillDef[];
  score: number;
  wordCount: number;
};

export function analyzeOffer(text: string): Analysis {
  const t = text.toLowerCase();
  const found: { key: string; weight: number }[] = [];
  const missing: SkillDef[] = [];

  for (const def of DICTIONARY) {
    const hit = def.aliases.some((a) => t.includes(a));
    if (hit) found.push({ key: def.key, weight: def.weight });
    else missing.push(def);
  }

  /* Score déterministe : base + poids des compétences trouvées, plafonné. */
  const raw = 34 + found.reduce((sum, f) => sum + f.weight, 0) * 1.35;
  const bonus = Math.min(text.length / 900, 1) * 4; /* offre détaillée */
  const score = Math.max(42, Math.min(97, Math.round(raw + bonus)));

  return {
    found,
    missing: missing.slice(0, 6),
    score,
    wordCount: text.trim().split(/\s+/).filter(Boolean).length,
  };
}

/* Vérifie si une compétence figure dans le profil utilisateur. */
export function profileHas(profileSkills: string[], skillKey: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const target = norm(skillKey);
  return profileSkills.some(
    (s) => norm(s).includes(target) || target.includes(norm(s))
  );
}
