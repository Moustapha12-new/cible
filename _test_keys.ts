/* Test 3 clés Gemini (sans afficher les valeurs) */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const paths = [
  join(process.cwd(), ".env.local"),
  join(process.cwd(), "_backup_secrets_20260923_212546", ".env.local"),
  join(process.cwd(), "_backup_secrets_AVVANT_RESET", ".env.local"),
];

function getKey(path: string): string | null {
  try {
    const m = readFileSync(path, "utf8").match(/^GEMINI_API_KEY=(.+)$/m);
    return m?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

async function testKey(label: string, key: string): Promise<void> {
  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "OK" }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 8 },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    if (res.ok) console.log(`${label}: VALID`);
    else {
      const t = await res.text();
      const msg = t.includes("API key not valid") ? "INVALID_KEY" : `HTTP ${res.status}`;
      console.log(`${label}: ${msg}`);
    }
  } catch (e) {
    console.log(`${label}: ERR ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  for (const p of paths) {
    const label = p.includes("AVVANT") ? "backup_AVVANT" : p.includes("20260923") ? "backup_212546" : "current";
    const key = getKey(p);
    if (!key) {
      console.log(`${label}: no key`);
      continue;
    }
    await testKey(label, key);
  }
}

main().catch(console.error);
