import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

let browserInstance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

async function getBrowser() {
  if (browserInstance) return browserInstance;
  const windowsCandidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter((path): path is string => Boolean(path));
  const executablePath = process.platform === "win32"
    ? windowsCandidates.find(path => existsSync(path))
    : await chromium.executablePath().catch((error: unknown) => {
        /* Message d'erreur actionnable : sur un hébergement serverless, ce
           message signale presque toujours des binaires absents du bundle. */
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Chromium de rendu PDF indisponible sur ce serveur (${detail}). Vérifie que node_modules/@sparticuz/chromium/bin est inclus dans le déploiement (outputFileTracingIncludes dans next.config.ts).`);
      });
  if (!executablePath) throw new Error("Aucun navigateur compatible pour générer le PDF.");
  browserInstance = await puppeteer.launch({
    args: process.platform === "win32" ? ["--no-sandbox", "--disable-gpu"] : chromium.args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath,
    headless: true,
  });
  return browserInstance;
}

export async function generatePdfFromHtml(html: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const font = (weight: string) => readFileSync(join(process.cwd(), "public", "fonts", `carlito-${weight}.woff2`)).toString("base64");
    const withFonts = html.replaceAll("/fonts/carlito-400.woff2", `data:font/woff2;base64,${font("400")}`)
      .replaceAll("/fonts/carlito-700.woff2", `data:font/woff2;base64,${font("700")}`);
    await page.setContent(withFonts, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.dispatchEvent(new Event("load")));
    await page.waitForFunction(() => document.querySelector(".cvdoc")?.getAttribute("data-fit") === "true", { timeout: 5_000 });
    const fit = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>(".cvdoc");
      return Boolean(root && root.scrollHeight <= Math.ceil(297 * 96 / 25.4) && root.scrollWidth <= root.clientWidth + 1);
    });
    if (!fit) throw new Error("Le CV dépasse une page A4 lisible. Raccourcis-le avant de télécharger le PDF.");
    await page.emulateMediaType("print");
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
    });
    const bytes = new Uint8Array(pdfBuffer);
    const verification = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
    try {
      if (verification.numPages !== 1) throw new Error("Le PDF généré ne tient pas sur une page A4.");
      const printed = await verification.getPage(1);
      const size = printed.getViewport({ scale: 1 });
      if (Math.abs(size.width - 595.28) > 2 || Math.abs(size.height - 841.89) > 2) throw new Error("Le PDF généré n'est pas au format A4.");
      const contents = await printed.getTextContent();
      if (contents.items.length < 5) throw new Error("Le texte du PDF généré est incomplet.");
      /* La ligne de disponibilité verrouillée doit réellement figurer dans le
         PDF rendu (contrôle texte, indépendant du rendu visuel). */
      const printedText = contents.items.map(item => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ");
      if (html.includes("Stage de 6 mois") && !printedText.includes("Stage de 6 mois")) {
        throw new Error("La ligne de disponibilité « Stage de 6 mois » est absente du PDF généré.");
      }
      const links = await printed.getAnnotations();
      if (html.includes('href="mailto:') && !links.some(link => link.subtype === "Link" && link.url?.startsWith("mailto:"))) throw new Error("Le lien e-mail du PDF n'est pas actif.");
      if (html.includes('href="https://') && !links.some(link => link.subtype === "Link" && link.url?.startsWith("https://"))) throw new Error("Le lien portfolio du PDF n'est pas actif.");
    } finally { verification.cleanup(); }
    return bytes;
  } finally {
    await page.close();
  }
}

export async function computeSha256(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function generatePdfAndHash(html: string, filename: string): Promise<{ pdfBytes: Uint8Array; sha256: string }> {
  void filename;
  const pdfBytes = await generatePdfFromHtml(html);
  const sha256 = await computeSha256(pdfBytes);
  return { pdfBytes, sha256 };
}
