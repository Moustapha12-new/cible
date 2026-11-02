// Diagnostic : reproduit exactement ce que fait /api/auth/login en production.
// N'affiche AUCUNE clé — uniquement statuts et messages d'erreur.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const EMAIL = "moustaleddistallo@gmail.com";

// Lit .env.local sans imprimer les valeurs.
const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
}
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
console.log("SUPABASE_URL host:", url ? new URL(url).host : "ABSENT");
console.log("clé serveur présente:", key ? `oui (${key.slice(0, 3)}…, longueur ${key.length})` : "NON");

if (!url || !key) { console.log("→ configuration absente"); process.exit(0); }

// 1) Mauvais mot de passe sur un compte qui n'existe pas : quel message GoTrue ?
async function probe(email, password, label) {
  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    console.log(`\n[${label}] HTTP ${res.status}`);
    console.log("  message:", JSON.stringify(body.msg ?? body.message ?? body.error_description ?? body.error ?? null));
    console.log("  code:", JSON.stringify(body.code ?? body.error_code ?? null));
    return { res, body };
  } catch (e) { console.log(`[${label}] exception:`, e.message); }
}

await probe("compte-inexistant-diag-42@example.com", "mauvais", "compte inexistant");
await probe(EMAIL, "mauvais-mot-de-passe-diag", "vrai email / mauvais mdp");

// 2) Le compte existe-t-il ? Confirmé ?
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) { console.log("\nlistUsers erreur:", error.message); }
else {
  const found = (data.users || []).find((u) => (u.email || "").toLowerCase() === EMAIL);
  console.log("\nCompte", EMAIL, "→", found
    ? { id: found.id, email_confirmed_at: found.email_confirmed_at, created_at: found.created_at, last_sign_in_at: found.last_sign_in_at ?? null, banned_until: found.banned_until ?? null }
    : "ABSENT de ce projet Supabase");
  console.log("Total users:", data.users.length);
}
