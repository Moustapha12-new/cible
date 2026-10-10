import type { CvDesign } from "./cv";

export type CvFit = { fits: boolean; fontSize: number; density: number; height: number; limit: number };

/** Même contrôle géométrique pour l'aperçu et chaque export imprimable. */
export function fitCvPage(root: HTMLElement, design: CvDesign): CvFit {
  const limit = (["grey", "professional"].includes(design.template) ? 297 : 269) * 96 / 25.4;
  const start = Math.max(8, Math.min(13, Number(design.fontSize) || 9.5));
  let result: CvFit = { fits: false, fontSize: start, density: 1, height: 0, limit };
  root.dataset.fit = "true";
  // Les rubriques courtes peuvent rejoindre la colonne grise : même contenu,
  // meilleure répartition, avant de demander de raccourcir le texte.
  for (const placement of [0, 1, 2]) {
    if (placement > 0) {
      const sidebar = root.querySelector('.cv-sidebar');
      const pattern = placement === 1 ? /langue|language/i : /logiciel|informatique|software/i;
      const section = [...root.querySelectorAll('.cv-skills-grid > section')].find(s => pattern.test(s.querySelector('h2')?.textContent || ''));
      if (!sidebar || !section) continue;
      sidebar.appendChild(section);
    }
  for (let font = start; font >= 8 - 0.001; font -= 0.25) {
    for (const density of [1, 0.9, 0.8, 0.7, 0.6]) {
      root.style.fontSize = `${font}pt`;
      root.style.setProperty("--cv-density", String(density));
      root.style.setProperty("--cv-title-size", `${(root.querySelector('.cv-name-long') ? 23 : 30) * Math.max(0.8, density)}pt`);
      // scrollHeight comprend tout le contenu ; aucune hauteur fixe ni découpe.
      const height = root.scrollHeight;
      result = { fits: height <= Math.ceil(limit) && root.scrollWidth <= root.clientWidth + 1, fontSize: font, density, height, limit };
      if (result.fits) return result;
    }
  }
  }
  return result;
}

export const cvFitStyles = `
.cvdoc[data-fit] h2{margin-top:calc(22px * var(--cv-density));margin-bottom:calc(8px * var(--cv-density))}
.cvdoc[data-fit] .cv-item{margin-top:calc(12px * var(--cv-density));margin-bottom:calc(12px * var(--cv-density))}
.cvdoc[data-fit] li{margin-top:calc(3px * var(--cv-density));margin-bottom:calc(3px * var(--cv-density))}
.cvdoc[data-fit] .cv-main{padding-top:calc(12mm * var(--cv-density));padding-bottom:calc(14mm * var(--cv-density))}
.cvdoc[data-fit] .cv-sidebar{padding-top:calc(12mm * var(--cv-density));padding-bottom:calc(12mm * var(--cv-density));gap:calc(16mm * var(--cv-density))}
.cvdoc[data-fit] .cv-main h1{font-size:var(--cv-title-size)}
.cvdoc[data-fit] .cv-main header{margin-bottom:calc(10mm * var(--cv-density))}
.cvdoc[data-fit] .cv-grey-layout h2{margin-top:0;margin-bottom:calc(6mm * var(--cv-density))}
.cvdoc[data-fit] .cv-grey-layout h2:after{margin-top:calc(3mm * var(--cv-density))}
.cvdoc[data-fit] .cv-main-section{margin-bottom:calc(10mm * var(--cv-density))}
.cvdoc[data-fit] .cv-grey-layout .cv-item{margin:0 0 calc(5mm * var(--cv-density))}
.cvdoc[data-fit] .cv-main-section:not(.cv-timeline) .cv-item{margin-bottom:calc(2mm * var(--cv-density))}
.cvdoc[data-fit] .cv-timeline .cv-item .cv-item{margin:0}
.cvdoc[data-fit] .cv-grey-layout li{margin:calc(1mm * var(--cv-density)) 0}
.cvdoc[data-fit] .cv-cap{width:calc(30mm * var(--cv-density));height:calc(30mm * var(--cv-density));margin-bottom:calc(3mm * var(--cv-density))}
.cvdoc[data-fit] .cv-cap svg{width:75%;height:75%}
`;
