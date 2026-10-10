// Explicit local configuration only. Never embeds or prints credentials.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
if (!process.argv.includes("--write-local")) throw new Error("Ajoute --write-local pour modifier volontairement .env.local.");
const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_BUCKET"];
for (const key of keys) if (!process.env[key]?.trim() || /your_|placeholder|changeme/i.test(process.env[key])) throw new Error(`Variable valide requise : ${key}`);
const path = ".env.local";
let text = existsSync(path) ? readFileSync(path, "utf8") : "";
for (const key of keys) {
  const value = process.env[key].trim();
  if (/[\r\n]/.test(value)) throw new Error("Valeur invalide.");
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const entry = `${key}=${value}`;
  text = pattern.test(text) ? text.replace(pattern, () => entry) : text + (text.endsWith("\n") ? "" : "\n") + entry + "\n";
}
writeFileSync(path, text);
console.log("Configuration locale mise à jour sans affichage de secrets.");
