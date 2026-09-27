/* Sync Vercel env via node vc.js (no shell/stdin issues). Never prints secrets. */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const VC = "C:\\Users\\ROKI\\AppData\\Roaming\\npm\\node_modules\\vercel\\dist\\vc.js";

function getEnv(key) {
  const text = readFileSync(".env.local", "utf8");
  const m = new RegExp(`^${key}=(.*)$`, "m").exec(text);
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "");
}

function vercel(args, input) {
  try {
    const out = execFileSync(process.execPath, [VC, ...args], {
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ""}${e.stderr || ""}${e.message || ""}` };
  }
}

const secrets = {
  BLOB_READ_WRITE_TOKEN: getEnv("BLOB_READ_WRITE_TOKEN"),
  GEMINI_API_KEY: getEnv("GEMINI_API_KEY"),
  GMAIL_ENC: getEnv("GMAIL_ENC"),
  GOOGLE_CLIENT_ID: getEnv("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: getEnv("GOOGLE_CLIENT_SECRET"),
  SUPABASE_URL: getEnv("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  SUPABASE_BUCKET: getEnv("SUPABASE_BUCKET") || "cible-gmail-storage",
};

for (const [k, v] of Object.entries(secrets)) {
  console.log(k, "len", v.length, "prefix", v.slice(0, 8));
}

function ensure(name, value, env) {
  const ls = vercel(["env", "ls", env]);
  const present = new RegExp(`\\b${name}\\b`).test(ls.out);
  if (present) {
    // Force refresh storage secrets; skip others if present
    if (name !== "BLOB_READ_WRITE_TOKEN" && name !== "SUPABASE_URL" && name !== "SUPABASE_SERVICE_ROLE_KEY" && name !== "SUPABASE_BUCKET") {
      console.log(`skip ${name} @ ${env}`);
      return;
    }
    console.log(`rm+add ${name} @ ${env}`);
    vercel(["env", "rm", name, env, "--yes"]);
  } else {
    console.log(`add ${name} @ ${env}`);
  }
  const add = vercel(["env", "add", name, env], value);
  if (add.ok) console.log(`  OK ${name} @ ${env}`);
  else console.log(`  FAIL ${name} @ ${env}:`, add.out.split("\n").slice(0, 6).join(" | "));
}

for (const env of ["production", "preview", "development"]) {
  for (const [name, value] of Object.entries(secrets)) {
    ensure(name, value, env);
  }
}

const final = vercel(["env", "ls"]);
console.log("=== final ===");
console.log(final.out);
