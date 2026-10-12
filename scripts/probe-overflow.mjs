// Diagnostic des débordements horizontaux en mobile (390px).
// Identifiants de test lus depuis l'environnement : CIBLE_TEST_EMAIL / CIBLE_TEST_PASSWORD.
import { chromium } from "playwright";

const EMAIL = process.env.CIBLE_TEST_EMAIL;
const PASSWORD = process.env.CIBLE_TEST_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Définis CIBLE_TEST_EMAIL et CIBLE_TEST_PASSWORD (compte de test jetable, jamais un compte réel).");
  process.exit(1);
}

const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/connexion", { waitUntil: "networkidle" });
await p.fill('input[type="email"], input[name="email"]', EMAIL);
await p.fill('input[type="password"], input[name="password"]', PASSWORD);
await p.click('button[type="submit"]');
await p.waitForURL(/\/app/, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(1500);

for (const url of ["/app/offres", "/app/cv", "/app/candidatures"]) {
  await p.goto("http://localhost:3000" + url, { waitUntil: "networkidle" });
  await p.waitForTimeout(1000);
  const res = await p.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > cw + 1 || r.left < -1)) {
        const cs = getComputedStyle(el);
        if (cs.position === "fixed") continue;
        out.push({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 80), right: Math.round(r.right), w: Math.round(r.width), sw: el.scrollWidth });
      }
    }
    return { cw, sw: document.documentElement.scrollWidth, out: out.slice(0, 14) };
  });
  console.log(`=== ${url} | client=${res.cw} scroll=${res.sw} ===`);
  for (const w of res.out) console.log(`   ${w.tag} | ${w.cls} | right=${w.right} w=${w.w}`);
}

await b.close();
