import { cvDocumentHtml, type CvData, type CvDesign } from "./cv";
import { prepareApplicationCv } from "./cv-application";
import { onePageCandidates } from "./cv-one-page";
import { generatePdfAndHash } from "./pdf-generator";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { careerKeywordAudit } from "./career-cv-checks";

/** Sélection et condensation de la copie, puis vérification réelle du PDF.
 * Le même CV retourné sert au comparateur et au téléchargement. */
export async function applicationPdf(source: CvData, design: CvDesign, offerText: string, auditTerms: string[] = [], priorityTerms: string[] = []) {
  const prepared = prepareApplicationCv(source, offerText, priorityTerms);
  const condensed = onePageCandidates(prepared, offerText).map(row => row.cv);
  const variants = JSON.stringify(source) === JSON.stringify(prepared)
    ? [prepared, ...condensed] : [...condensed, prepared];
  let lastError: unknown;
  for (const cv of variants) {
    try {
      const rendered = await generatePdfAndHash(cvDocumentHtml(cv, design, "CV cible", false), "CV-cible.pdf");
      if (!auditTerms.length) return { cv, ...rendered, keywordAudit: { present: [], missing: [] } };
      const document = await getDocument({ data: rendered.pdfBytes.slice(), useSystemFonts: true }).promise;
      let text = "";
      try {
        const content = await (await document.getPage(1)).getTextContent();
        text = content.items.map(item => "str" in item ? item.str : "").join(" ");
      } finally { document.cleanup(); }
      return { cv, ...rendered, keywordAudit: careerKeywordAudit(text, auditTerms) };
    } catch (error) {
      if (!(error instanceof Error) || !/page A4|format A4/i.test(error.message)) throw error;
      lastError = error;
    }
  }
  throw lastError || new Error("La composition du CV sur une page A4 a échoué.");
}
