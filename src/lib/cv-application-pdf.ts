import { cvDocumentHtml, type CvData, type CvDesign } from "./cv";
import { prepareApplicationCv } from "./cv-application";
import { onePageCandidates } from "./cv-one-page";
import { generatePdfAndHash } from "./pdf-generator";

/** Sélection et condensation de la copie, puis vérification réelle du PDF.
 * Le même CV retourné sert au comparateur et au téléchargement. */
export async function applicationPdf(source: CvData, design: CvDesign, offerText: string) {
  const prepared = prepareApplicationCv(source, offerText);
  const condensed = onePageCandidates(prepared, offerText).map(row => row.cv);
  const variants = JSON.stringify(source) === JSON.stringify(prepared)
    ? [prepared, ...condensed] : [...condensed, prepared];
  let lastError: unknown;
  for (const cv of variants) {
    try {
      const rendered = await generatePdfAndHash(cvDocumentHtml(cv, design, "CV cible", false), "CV-cible.pdf");
      return { cv, ...rendered };
    } catch (error) {
      if (!(error instanceof Error) || !/page A4|format A4/i.test(error.message)) throw error;
      lastError = error;
    }
  }
  throw lastError || new Error("La composition du CV sur une page A4 a échoué.");
}
