// ============================================================================
// CIBLE — Test de connexion Supabase local
// Exécuter : npx tsx supabase/test_connection.ts
// Nécessite .env.local avec les variables Supabase
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "cible-gmail-storage";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Variables manquantes : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis");
  process.exit(1);
}

console.log("🔗 Connexion à Supabase...");
console.log(`   URL: ${SUPABASE_URL}`);
console.log(`   Bucket: ${SUPABASE_BUCKET}`);
console.log(`   Key format: ${SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_secret_") ? "sb_secret_ (nouveau format)" : "JWT legacy"}`);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
});

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, detail?: string) {
    if (condition) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
      failed++;
    }
  }

  // 1. Health check API
  console.log("\n📋 Test 1: Connexion API REST");
  try {
    const { data, error } = await supabase.from("cible_user_data").select("count", { count: "exact", head: true });
    assert("Table cible_user_data accessible", !error, error?.message);
  } catch (e) {
    assert("Table cible_user_data accessible", false, e instanceof Error ? e.message : String(e));
  }

  // 2. Vérifier tables existantes
  console.log("\n📋 Test 2: Tables requises");
  const tables = ["cible_user_data", "cible_catalog_offers", "cible_quotas", "cible_sync_leases", "cible_gmail_connections"];
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select("count", { count: "exact", head: true });
      assert(`Table ${table}`, !error, error?.message);
    } catch (e) {
      assert(`Table ${table}`, false, e instanceof Error ? e.message : String(e));
    }
  }

  // 3. Test RPC functions
  console.log("\n📋 Test 3: Fonctions RPC");
  const rpcTests = [
    { name: "cible_take_quota", fn: () => supabase.rpc("cible_take_quota", { p_key: "test:quota", p_limit: 5 }) },
    { name: "cible_take_sync_lease", fn: () => supabase.rpc("cible_take_sync_lease", { p_owner: "test:owner", p_token: "test:token" }) },
    { name: "cible_release_sync_lease", fn: () => supabase.rpc("cible_release_sync_lease", { p_owner: "test:owner", p_token: "test:token" }) },
  ];

  for (const test of rpcTests) {
    try {
      const { data, error } = await test.fn();
      assert(test.name, !error, error?.message);
    } catch (e) {
      assert(test.name, false, e instanceof Error ? e.message : String(e));
    }
  }

  // 4. Test Storage
  console.log("\n📋 Test 4: Buckets Storage");
  const buckets = ["cible-gmail-storage", "cible-documents"];
  for (const bucket of buckets) {
    try {
      const { data, error } = await supabase.storage.from(bucket).list("", { limit: 1 });
      assert(`Bucket ${bucket} accessible`, !error, error?.message);
    } catch (e) {
      assert(`Bucket ${bucket} accessible`, false, e instanceof Error ? e.message : String(e));
    }
  }

  // 5. Test Auth Admin (vérifier config)
  console.log("\n📋 Test 5: Auth Admin");
  try {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    assert("Auth Admin accessible", !error, error?.message);
  } catch (e) {
    assert("Auth Admin accessible", false, e instanceof Error ? e.message : String(e));
  }

  // 6. Test Email Template (vérifier config)
  console.log("\n📋 Test 6: Configuration Email (optionnel)");
  try {
    // @ts-ignore - getAuthSettings peut ne pas être typé
    const getAuthSettings = supabase.auth.admin.getAuthSettings;
    if (typeof getAuthSettings === "function") {
      const { data: config, error } = await getAuthSettings();
      if (config && config.email) {
        assert("SMTP configuré", !!config.email.smtp_host, "SMTP non configuré");
        assert("Sender email défini", !!config.email.smtp_admin_email || !!config.email.mailer_autoconfirm, "Sender email manquant");
      } else {
        console.log("  ℹ️ getAuthSettings: config vide");
      }
    } else {
      console.log("  ℹ️ getAuthSettings non disponible");
    }
  } catch (e) {
    console.log("  ℹ️ getAuthSettings erreur:", e instanceof Error ? e.message : String(e));
  }

  // Résumé
  console.log(`\n📊 Résultats: ${passed} passés, ${failed} échoués`);
  if (failed > 0) {
    console.error("❌ Certains tests ont échoué. Vérifiez la configuration Supabase.");
    process.exit(1);
  } else {
    console.log("✅ Tous les tests passent ! Configuration Supabase prête.");
  }
}

runTests().catch(e => {
  console.error("Erreur fatale:", e);
  process.exit(1);
});