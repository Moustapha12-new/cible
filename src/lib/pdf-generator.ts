import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

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
    : await chromium.executablePath();
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
    await page.setContent(html, { waitUntil: "load" });
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
    return new Uint8Array(pdfBuffer);
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
