// ============================================================================
// CIBLE — Vérification installation Supabase
// Usage: npx tsx supabase/verify.ts
// ============================================================================

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Variables manquantes: SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function log(msg: string) { console.log(`\n🔷 ${msg}`); }
function success(msg: string) { console.log(`  ✅ ${msg}`); }
function errorMsg(msg: string) { console.error(`  ❌ ${msg}`); }
function warn(msg: string) { console.log(`  ⚠️  ${msg}`); }

async function run() {
  console.log("🔍 Vérification installation Supabase CIBLE\n");

  let allOk = true;

  // 1. Tables
  log("Tables requises");
  const tables = [
    "cible_user_data",
    "cible_catalog_offers",
    "cible_quotas",
    "cible_sync_leases",
    "cible_gmail_connections",
  ];
  for (const table of tables) {
    const { error } = await supabase.from(table).select("count", { count: "exact", head: true });
    if (error) { errorMsg(`Table ${table}: ${error.message}`); allOk = false; }
    else { success(`Table ${table} OK`); }
  }

  // 2. RPC functions
  log("Fonctions RPC");
  const rpcs = [
    { name: "cible_save_user_data", args: { p_user_id: "00000000-0000-0000-0000-000000000000", p_version: 0, p_data: {} } },
    { name: "cible_take_quota", args: { p_key: "test:verify", p_limit: 1 } },
    { name: "cible_take_sync_lease", args: { p_owner: "test:verify", p_token: "test:token" } },
    { name: "cible_release_sync_lease", args: { p_owner: "test:verify", p_token: "test:token" } },
    { name: "cible_import_catalog_batch", args: { p_user_id: "00000000-0000-0000-0000-000000000000", p_offers: [] } },
    { name: "cible_cleanup_expired", args: {} },
  ];
  for (const rpc of rpcs) {
    const { error } = await supabase.rpc(rpc.name, rpc.args);
    if (error && !error.message.includes("invalid input") && !error.message.includes("violates")) {
      errorMsg(`RPC ${rpc.name}: ${error.message}`);
      allOk = false;
    } else {
      success(`RPC ${rpc.name} OK`);
    }
  }

  // 3. Buckets Storage
  log("Buckets Storage");
  const buckets = ["cible-gmail-storage", "cible-documents"];
  for (const bucket of buckets) {
    const { error } = await supabase.storage.from(bucket).list("", { limit: 1 });
    if (error) { errorMsg(`Bucket ${bucket}: ${error.message} (à créer manuellement)`); allOk = false; }
    else { success(`Bucket ${bucket} OK`); }
  }

  // 4. RLS enabled
  log("RLS activé sur tables");
  const rlsTables = ["cible_user_data", "cible_catalog_offers", "cible_quotas", "cible_sync_leases", "cible_gmail_connections"];
  for (const table of rlsTables) {
    const { data, error } = await supabase
      .from("pg_class")
      .select("relrowsecurity")
      .eq("relname", table)
      .single();
    if (error || !data?.relrowsecurity) { errorMsg(`RLS ${table}: non activé`); allOk = false; }
    else { success(`RLS ${table} activé`); }
  }

  // 5. RPC functions exist
  log("Fonctions RPC existent");
  const rpcNames = [
    "cible_save_user_data",
    "cible_take_quota",
    "cible_take_sync_lease",
    "cible_release_sync_lease",
    "cible_import_catalog_batch",
    "cible_cleanup_expired",
  ];
  for (const name of rpcNames) {
    const { data, error } = await supabase
      .from("pg_proc")
      .select("proname")
      .eq("proname", name)
      .limit(1)
      .single();
    if (error || !data) { errorMsg(`Fonction ${name}: manquante`); allOk = false; }
    else { success(`Fonction ${name} existe`); }
  }

  // 6. Index critiques
  log("Index critiques");
  const indexes = [
    "idx_cible_user_data_updated_at",
    "idx_cible_catalog_offers_dedup",
    "idx_cible_catalog_offers_url_dedup",
    "idx_cible_catalog_offers_user_created",
    "idx_cible_catalog_offers_qualification",
    "idx_cible_catalog_offers_domain",
    "idx_cible_catalog_offers_location",
    "idx_cible_catalog_offers_enrich",
    "idx_cible_catalog_offers_shortlist",
    "idx_cible_quotas_expires",
    "idx_cible_sync_leases_expires",
  ];
  for (const idx of indexes) {
    const { data, error } = await supabase
      .from("pg_indexes")
      .select("indexname")
      .eq("indexname", idx)
      .limit(1)
      .single();
    if (error || !data) { errorMsg(`Index ${idx}: manquant`); allOk = false; }
    else { success(`Index ${idx} existe`); }
  }

  // Résumé
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║  RÉSUMÉ VÉRIFICATION                                             ║
╠═══════════════════════════════════════════════════════════════════╣
  Résultat: ${allOk ? "✅ TOUT OK" : "❌ ÉCHECS DÉTECTÉS"}
╚═══════════════════════════════════════════════════════════════════╝
  `);

  if (!allOk) {
    console.log(`
⚠️  Des problèmes ont été détectés. Vérifiez les erreurs ci-dessus.
   Relancez l'installation ou corrigez manuellement dans Supabase Dashboard.
  `);
    process.exit(1);
  } else {
    console.log(`
✅ TOUT EST OPÉRATIONNEL

Prochaines étapes:
1. Créer buckets Storage manuellement (si pas fait):
   - cible-gmail-storage (Privé, 10MB, JSON/text)
   - cible-documents (Privé, 8MB, PDF/DOCX/images)
2. Exécuter migration storage policies: supabase/migrations/20241011000003_storage_policies.sql
3. Configurer Auth Supabase (Site URL, Redirect URLs, SMTP, Google OAuth)
4. Configurer variables Vercel
4. Déployer et tester
  `);
  }
}

run().catch(e => {
  console.error("Erreur fatale:", e);
  process.exit(1);
});