import type { CvDesign } from "./cv";

export type CvFit = { fits: boolean; fontSize: number; density: number; height: number; limit: number };

/** Même contrôle géométrique pour l'aperçu et chaque export imprimable. */
export function fitCvPage(root: HTMLElement, design: CvDesign): CvFit {
  const limit = 297 * 96 / 25.4;
  const start = Math.max(8.5, Math.min(13, Number(design.fontSize) || 9.5));
  let result: CvFit = { fits: false, fontSize: start, density: 1, height: 0, limit };
  root.dataset.fit = "true";
  for (let font = start; font >= 8.5 - 0.001; font -= 0.25) {
    for (const density of [1, 0.92, 0.84, 0.76]) {
      root.style.fontSize = `${font}pt`;
      root.style.setProperty("--cv-density", String(density));
      // scrollHeight comprend tout le contenu ; aucune hauteur fixe ni découpe.
      const height = root.scrollHeight;
      result = { fits: height <= Math.ceil(limit) && root.scrollWidth <= root.clientWidth + 1, fontSize: font, density, height, limit };
      if (result.fits) return result;
    }
  }
  return result;
}
