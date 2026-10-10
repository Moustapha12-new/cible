/** Diagnostic par défaut ; installation distante sous accord explicite. */
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

config({ path: ".env.local", quiet: true });
const PROJECT = "ucgetwemaxigkblzvndo";
const EXPECTED_URL = `https://${PROJECT}.supabase.co`;
const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();

function stop(reason: string): never {
  throw new Error(reason);
}
function cli(...args: string[]) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  return spawnSync(command, ["supabase", ...args], {
    encoding: "utf8", shell: process.platform === "win32", timeout: 60_000, env: process.env,
  });
}

async function main() {
if (url !== EXPECTED_URL) stop("SUPABASE_URL ne correspond pas au projet cible.");
if (!key || /your_|placeholder|changeme/i.test(key)) stop("clé serveur privée absente ou provisoire.");
if (!readFileSync("supabase/config.toml", "utf8").includes(`project_id = "${PROJECT}"`)) stop("supabase/config.toml vise un autre projet.");
console.log(`Projet vérifié : ${PROJECT}. Aucun secret affiché.`);

const check = await fetch(`${EXPECTED_URL}/rest/v1/cible_user_data?select=user_id&limit=0`, {
  headers: { apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }) },
  signal: AbortSignal.timeout(10_000), cache: "no-store",
}).catch(() => null);
if (!check) stop("réseau Supabase inaccessible.");
if (check.status === 401 || check.status === 403) stop("la clé serveur est refusée par le nouveau projet. Révoque l'ancienne clé exposée et configure la clé de ce projet localement.");
console.log(`Lecture seule Supabase : HTTP ${check.status}${check.status === 404 ? " (tables à installer)" : ""}.`);

const projects = cli("projects", "list");
if (projects.status !== 0) stop("CLI non authentifiée. Lance npx supabase login sur ton ordinateur, puis réessaie.");
if (!`${projects.stdout}`.includes(PROJECT)) stop("le compte Supabase CLI n'a pas accès au projet cible.");
console.log("CLI authentifiée et projet cible accessible.");

if (!process.argv.includes("--apply")) {
  console.log("Précontrôle terminé. Aucune modification distante. Attendre la confirmation explicite du propriétaire avant installation.");
  return;
}
if (process.env.CIBLE_INSTALL_APPROVED_PROJECT_REF !== PROJECT) stop("accord d'installation distant manquant pour ce projet exact.");
if (cli("link", "--project-ref", PROJECT).status !== 0) stop("liaison CLI échouée ; aucune migration lancée.");
const migrations = cli("migration", "list");
if (migrations.status !== 0) stop("état des migrations distant illisible ; aucune migration lancée.");
let remoteVersions: string[];
try {
  const raw = `${migrations.stdout}`;
  const report = JSON.parse(raw.slice(raw.indexOf("{"))) as { migrations?: Array<{ remote?: string }> };
  if (!Array.isArray(report.migrations)) throw new Error("format inattendu");
  remoteVersions = report.migrations.map(item => item.remote || "");
} catch { stop("format de l'historique des migrations inconnu ; inspection manuelle requise."); }
if (remoteVersions.some(version => /^2024101100000[123]$/.test(version))) stop("migration de cette série déjà présente à distance : inspection manuelle nécessaire avant reprise.");
if (cli("db", "push", "--dry-run").status !== 0) stop("prévisualisation des migrations échouée ; aucune migration lancée.");
if (cli("db", "push", "--yes").status !== 0) stop("installation distante échouée ; vérifier l'historique avant reprise.");
console.log("Migrations appliquées. Vérifier tables, RPC, RLS, buckets et comptes de test avant de déclarer le service opérationnel.");
}
main().catch(error => {
  console.error(`Installation arrêtée : ${error instanceof Error ? error.message : "précontrôle interrompu"}`);
  process.exitCode = 1;
});
