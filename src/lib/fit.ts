/* Score de pré-fit : couverture déterministe des mots-clés de l'offre par le
   CV, calculée AVANT tout passage IA. Sert d'alerte "offre hors profil" et de
   base au calcul du plafond de gain par reformulation. */

const fold = (s: string) =>
  s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

export type KwItem = { term: string; importance?: string; type?: string };

export type PreFit = {
  total: number;
  present: string[];
  absent: string[];
  score: number;
};

export function preFit(kws: KwItem[], cvText: string): PreFit {
  const t = fold(cvText ?? "");
  const present: string[] = [];
  const absent: string[] = [];
  for (const k of kws) {
    const term = (k.term ?? "").trim();
    if (!term) continue;
    const words = fold(term).split(/\s+/).filter((w) => w.length > 3);
    /* Un terme multi-mots est compté présent si au moins la moitié de ses
       mots significatifs figure dans le CV — le lexical strict ratait les
       correspondances partielles légitimes (ex : « études de faisabilité »
       quand le CV dit « études technico-économiques »). */
    const hits = words.filter((w) => t.includes(w)).length;
    const hit = words.length > 0 ? hits >= Math.ceil(words.length / 2) : t.includes(fold(term));
    (hit ? present : absent).push(term);
  }
  const total = present.length + absent.length;
  return { total, present, absent, score: total ? Math.round((present.length / total) * 100) : 0 };
}

/* Plafond : couverture atteignable si TOUTES les reformulations légitimes
   (mots-clés absents mais intégrés par l'IA car prouvés ailleurs dans le CV)
   étaient appliquées. Au-delà → c'est le profil à développer, pas le CV. */
export function ceilingScore(fit: PreFit, integratedTerms: string[]): number {
  if (fit.total === 0) return 0;
  const gained = integratedTerms.filter((term) =>
    fit.absent.some((a) => fold(a) === fold(term))
  ).length;
  return Math.round(((fit.present.length + gained) / fit.total) * 100);
}
