// Connexion réelle via le formulaire, puis captures des 3 pages cible.
// Compte de test synthétique (@cible-test.local) — aucune donnée réelle de l'utilisateur.
// Identifiants lus depuis l'environnement : CIBLE_TEST_EMAIL / CIBLE_TEST_PASSWORD.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2] || "captures";
fs.mkdirSync(OUT, { recursive: true });

const EMAIL = process.env.CIBLE_TEST_EMAIL;
const PASSWORD = process.env.CIBLE_TEST_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Définis CIBLE_TEST_EMAIL et CIBLE_TEST_PASSWORD (compte de test jetable, jamais un compte réel).");
  process.exit(1);
}

const PAGES = [
  { name: "offres-1440", url: "/app/offres", w: 1440, h: 900, full: false },
  { name: "offres-1440-full", url: "/app/offres", w: 1440, h: 900, full: true },
  { name: "cv-1440", url: "/app/cv", w: 1440, h: 900, full: true },
  { name: "candidatures-1440", url: "/app/candidatures", w: 1440, h: 900, full: true },
  { name: "offres-1920", url: "/app/offres", w: 1920, h: 1080, full: false },
  { name: "offres-mobile", url: "/app/offres", w: 390, h: 844, full: false },
  { name: "cv-mobile", url: "/app/cv", w: 390, h: 844, full: false },
  { name: "candidatures-mobile", url: "/app/candidatures", w: 390, h: 844, full: false },
];

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`); });
page.on("pageerror", e => errors.push(`pageerror: ${String(e).slice(0, 200)}`));

// ── Connexion via le vrai formulaire ──
await page.goto("http://localhost:3000/connexion", { waitUntil: "networkidle" });
await page.fill('input[type="email"], input[name="email"]', EMAIL);
await page.fill('input[type="password"], input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/app/, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
console.log("après connexion, URL =", page.url());

for (const p of PAGES) {
  await page.setViewportSize({ width: p.w, height: p.h });
  await page.goto(`http://localhost:3000${p.url}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1400);
  const file = path.join(OUT, `${p.name}.png`);
  await page.screenshot({ path: file, fullPage: p.full });
  const dims = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight }));
  const overflow = dims.sw > dims.cw ? "  <-- DEBORDEMENT HORIZONTAL" : "";
  console.log(`${p.name}: ${p.w}x${p.h} -> ${fs.statSync(file).size} o | page ${dims.cw}x${dims.h}${overflow}`);
}

await browser.close();
const unique = [...new Set(errors)];
if (unique.length) {
  console.log("\n=== ERREURS CONSOLE/PAGE ===");
  for (const e of unique.slice(0, 20)) console.log(e);
} else {
  console.log("\nAucune erreur console/page.");
}
