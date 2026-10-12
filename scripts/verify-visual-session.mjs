// Crée un compte de test synthétique + session locale pour la vérification visuelle.
// N'utilise AUCUNE donnée réelle de l'utilisateur. Compte jetable, emails @cible-test.local.
import fs from "node:fs";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const EMAIL = process.env.CIBLE_TEST_EMAIL;
const PASSWORD = process.env.CIBLE_TEST_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Définis CIBLE_TEST_EMAIL et CIBLE_TEST_PASSWORD (compte de test jetable, jamais un compte réel).");
  process.exit(1);
}

async function main() {
  // 1. Créer (ou réutiliser) l'utilisateur de test via l'API admin.
  const create = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { name: "Moustapha Verification" } }),
  });
  const created = await create.json();
  if (create.ok) console.log("utilisateur de test créé :", EMAIL);
  else if (String(created?.msg || created?.error_code || "").includes("exists")) console.log("utilisateur de test existant, réutilisé :", EMAIL);
  else console.log("création :", create.status, JSON.stringify(created).slice(0, 200));

  // 2. Se connecter via l'API réelle du site pour obtenir le cookie de session.
  const login = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const setCookies = login.headers.getSetCookie ? login.headers.getSetCookie() : [];
  const json = await login.json().catch(() => ({}));
  console.log("login status :", login.status, "ok :", json.ok);
  if (!login.ok) { console.log("erreur :", JSON.stringify(json).slice(0, 300)); process.exit(1); }

  const access = setCookies.map(c => c.split(";")[0]).find(c => c.startsWith("cible-access="));
  if (!access) { console.log("cookie de session absent"); process.exit(1); }
  fs.writeFileSync("session-cookie.txt", access.split("=").slice(1).join("="));
  console.log("cookie de session enregistré (compte de test uniquement).");
}
main().catch(e => { console.error("échec :", e.message); process.exit(1); });
