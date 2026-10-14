const puppeteer = require("puppeteer-core");
const path = require("path");

async function main() {
  const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const outputDir = "C:\\Users\\ROKI\\.gemini\\antigravity\\brain\\a217d01d-b9f9-4fa8-b397-9ed1c9a1f91d";

  console.log("Launching Edge...");
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
    ],
  });

  const page = await browser.newPage();

  // Test at reference resolution: 1024 x 682
  console.log("Setting viewport 1024x682...");
  await page.setViewport({ width: 1024, height: 682, deviceScaleFactor: 1 });

  console.log("Navigating to http://localhost:3000/app/offres...");
  await page.goto("http://localhost:3000/app/offres", {
    waitUntil: "networkidle0",
    timeout: 30000,
  });

  // Small delay for rendering transitions/fonts
  await new Promise((r) => setTimeout(r, 2000));

  const screenshotPath1024 = path.join(outputDir, "screenshot-offres-1024x682.png");
  await page.screenshot({ path: screenshotPath1024, fullPage: false });
  console.log("Saved screenshot:", screenshotPath1024);

  // Also capture full page or HD desktop at 1440x960
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 1000));
  const screenshotPath1440 = path.join(outputDir, "screenshot-offres-1440x960.png");
  await page.screenshot({ path: screenshotPath1440, fullPage: false });
  console.log("Saved HD screenshot:", screenshotPath1440);

  // Resolution 1600 x 900 requested by user in Mission 2
  console.log("Setting viewport 1600x900...");
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 1000));
  const screenshotPath1600 = path.join(outputDir, "screenshot-offres-1600x900.png");
  await page.screenshot({ path: screenshotPath1600, fullPage: false });
  console.log("Saved 1600x900 screenshot:", screenshotPath1600);

  const screenshotPathFull = path.join(outputDir, "screenshot-offres-full.png");
  await page.screenshot({ path: screenshotPathFull, fullPage: true });
  console.log("Saved Full Page screenshot:", screenshotPathFull);

  // Capture Mon CV at 1600x900
  console.log("Navigating to http://localhost:3000/app/cv...");
  await page.goto("http://localhost:3000/app/cv", {
    waitUntil: "networkidle0",
    timeout: 30000,
  });
  await new Promise((r) => setTimeout(r, 1500));
  const screenshotPathCv = path.join(outputDir, "screenshot-cv-1600x900.png");
  await page.screenshot({ path: screenshotPathCv, fullPage: false });
  console.log("Saved Mon CV screenshot:", screenshotPathCv);

  const screenshotPathCvFull = path.join(outputDir, "screenshot-cv-full.png");
  await page.screenshot({ path: screenshotPathCvFull, fullPage: true });
  console.log("Saved Mon CV Full Page screenshot:", screenshotPathCvFull);

  // Capture Mes candidatures at 1600x900
  console.log("Navigating to http://localhost:3000/app/candidatures...");
  await page.goto("http://localhost:3000/app/candidatures", {
    waitUntil: "networkidle0",
    timeout: 30000,
  });
  await new Promise((r) => setTimeout(r, 1500));
  const screenshotPathCandidatures = path.join(outputDir, "screenshot-candidatures-1600x900.png");
  await page.screenshot({ path: screenshotPathCandidatures, fullPage: false });
  console.log("Saved Mes candidatures screenshot:", screenshotPathCandidatures);

  const screenshotPathCandidaturesFull = path.join(outputDir, "screenshot-candidatures-full.png");
  await page.screenshot({ path: screenshotPathCandidaturesFull, fullPage: true });
  console.log("Saved Mes candidatures Full Page screenshot:", screenshotPathCandidaturesFull);

  // Mobile check at 390x844 (iPhone 14)
  console.log("Setting mobile viewport 390x844...");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  await page.goto("http://localhost:3000/app/offres", { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1000));
  const screenshotMobile = path.join(outputDir, "screenshot-mobile-offres.png");
  await page.screenshot({ path: screenshotMobile, fullPage: false });
  console.log("Saved Mobile screenshot:", screenshotMobile);

  await browser.close();
  console.log("Done!");
}

main().catch((err) => {
  console.error("Error taking screenshot:", err);
  process.exit(1);
});
