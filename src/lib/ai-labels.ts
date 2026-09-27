/* P2-12 : glossaire unique « IA » à l'écran.
   3 gestes, 6 libellés — plus jamais le jargon « Gemini » dans l'UI
   (le nom du modèle reste réservé aux erreurs techniques et aux logs,
   humanisées en aval par humanizeGmailError).

   Geste 1 — ANALYSER : noter un CV, proposer des suggestions, comparer.
   Geste 2 — RÉDIGER : produire une lettre de motivation.
   Geste 3 — LIRE : ouvrir une page publique d'offre et la résumer. */
export const AI_LABEL = {
  /** Geste 1 — libellé au repos. */
  analyzeCta: "✨ Analyser avec l’IA",
  /** Geste 1 — état occupé (spinner). */
  analyzeBusy: "Analyse IA en cours…",
  /** Geste 2 — libellé au repos. */
  writeCta: "✨ Rédiger avec l’IA",
  /** Geste 2 — état occupé (spinner). */
  writeBusy: "Rédaction IA en cours…",
  /** Geste 3 — état occupé (lecture d'une page). */
  pageBusy: "Lecture de la page par l’IA…",
  /** Repli commun quand l'API IA ne répond pas. */
  unavailable: "IA indisponible — réessaie dans un instant",
} as const;
