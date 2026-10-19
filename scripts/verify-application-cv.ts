import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseCvText, cvToText, DEFAULT_CV_DESIGN } from "../src/lib/cv";
import { applicationPdf } from "../src/lib/cv-application-pdf";
import { prepareApplicationCv } from "../src/lib/cv-application";

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("Usage: tsx scripts/verify-application-cv.ts source.pdf output.pdf");
  const source = await getDocument({ data: new Uint8Array(await readFile(input)), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= source.numPages; i++) {
    const page = await source.getPage(i);
    const contents = await page.getTextContent();
    pages.push(contents.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join(""));
  }
  const cv = parseCvText(pages.join("\n\n"));
  const before = JSON.stringify(cv);
  const rendered = await applicationPdf(cv, DEFAULT_CV_DESIGN, "Stage R&D optimisation de réseaux, Python, théorie des graphes, analyse de sensibilité", ["Python", "CompétenceInventéeXYZ"]);
  assert.ok(rendered.keywordAudit.present.includes("Python"), "Python présent dans le texte du PDF rendu");
  assert.ok(rendered.keywordAudit.missing.includes("CompétenceInventéeXYZ"), "Mot absent signalé sans l'injecter dans le CV");
  assert.equal(JSON.stringify(cv), before, "Le CV maître reste intact");
  const text = cvToText(rendered.cv);
  assert.ok(!/référence interne|dossier maître|à confirmer|avant diffusion externe|attesté dans CV récent/i.test(text));
  assert.ok(!/^CV maître/i.test(rendered.cv.basics.name));
  assert.ok(rendered.cv.basics.name.length > 5);
  assert.match(text, /Python/);
  assert.deepEqual(prepareApplicationCv(rendered.cv, "Python optimisation de réseaux"), rendered.cv, "La composition reste identique lors du téléchargement");
  const pdf = await getDocument({ data: rendered.pdfBytes.slice(), useSystemFonts: true }).promise;
  assert.equal(pdf.numPages, 1);
  await writeFile(output, rendered.pdfBytes);
  console.log(JSON.stringify({ sourcePages: source.numPages, outputPages: pdf.numPages, nameRecovered: true, outputWords: text.split(/\s+/).length, sections: rendered.cv.sections.map(section => ({ title: section.title, items: section.items.length })), output }, null, 2));
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
