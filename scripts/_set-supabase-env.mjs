import { readFileSync, writeFileSync, existsSync } from "node:fs";

const path = ".env.local";
let text = existsSync(path) ? readFileSync(path, "utf8") : "";
const pairs = {
  SUPABASE_URL: "https://vboqdabqemmyyisjaazl.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_FoZ-uLIBaOZN8wfwAruV9Q_byeq2RbU",
  SUPABASE_BUCKET: "cible-gmail-storage",
};
for (const [k, v] of Object.entries(pairs)) {
  const re = new RegExp(`^${k}=.*$`, "m");
  if (re.test(text)) text = text.replace(re, `${k}=${v}`);
  else text += (text.endsWith("\n") || text === "" ? "" : "\n") + `${k}=${v}\n`;
}
writeFileSync(path, text);
const final = readFileSync(path, "utf8");
for (const k of Object.keys(pairs)) {
  const m = new RegExp(`^${k}=(.*)$`, "m").exec(final);
  console.log(k, m ? `present len=${m[1].length}` : "MISSING");
}
