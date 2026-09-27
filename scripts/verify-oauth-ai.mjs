/* Verify OAuth blob for 53 + probe AI API — never print secrets. */
import { readFileSync } from "node:fs";

function getEnv(key) {
  const text = readFileSync(".env.local", "utf8");
  const m = new RegExp(`^${key}=(.*)$`, "m").exec(text);
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const token = getEnv("BLOB_READ_WRITE_TOKEN");
const gem = getEnv("GEMINI_API_KEY");
const { get, list } = await import("@vercel/blob");

async function readBlob(pathname) {
  try {
    const res = await get(pathname, { access: "private", token, useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    return await new Response(res.stream).text();
  } catch {
    return null;
  }
}

const oauth53 = await readBlob("gmail/gmail:oauth:moustaled.53@gmail.com");
console.log("oauth53 present:", Boolean(oauth53), "len", oauth53?.length ?? 0, "enc", oauth53?.startsWith("enc:v1:") ?? false);

const l = await list({ prefix: "gmail/", token, access: "private" });
const paths = (l.blobs || []).map((b) => b.pathname);
console.log(
  "blobs total",
  paths.length,
  "enrich",
  paths.filter((p) => p.includes("enrich")).length,
  "processed",
  paths.filter((p) => p.includes("processed")).length,
  "oauth",
  paths.filter((p) => p.includes("oauth")).length
);
console.log("oauth paths", paths.filter((p) => p.includes("oauth")));

// AI match task smoke (same as app)
const profile = {
  firstName: "Moustapha",
  lastName: "Distallo",
  title: "Développeur web",
  email: "test@example.com",
  phone: "0600000000",
  city: "Paris",
  skills: ["JavaScript", "React", "HTML", "CSS"],
  experiences: [
    { title: "Dev", place: "Freelance", period: "2024-2026", detail: "Sites web" },
  ],
  educations: [{ degree: "Bac+3", school: "Université", period: "2020-2023" }],
};
const offerText =
  "Développeur Full-Stack React TypeScript Node.js CDI Paris — missions API REST, tests, déploiement cloud, méthodes agiles. Profil Bac+5, 3 ans d'expérience.";
try {
  const res = await fetch("http://localhost:3000/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: "match", profile, offerText }),
  });
  const j = await res.json();
  console.log("AI match HTTP", res.status, "ok", j.ok, "score", j.result?.score, "matched", (j.result?.matched || []).length, "missing", (j.result?.missing || []).length);
  if (!j.ok) console.log("AI match error", j.error);
} catch (e) {
  console.log("AI match fail", e.message);
}

// AI letter task smoke
try {
  const res = await fetch("http://localhost:3000/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: "letter",
      profile,
      offerText,
      company: "ACME",
      role: "Développeur Full-Stack",
    }),
  });
  const j = await res.json();
  console.log("AI letter HTTP", res.status, "ok", j.ok, "hasBody", Boolean(j.result?.body || j.result?.subject), "len", (j.result?.body || "").length);
  if (!j.ok) console.log("AI letter error", j.error);
} catch (e) {
  console.log("AI letter fail", e.message);
}

console.log("gemini key present in env file:", gem.length > 0, "len", gem.length);
