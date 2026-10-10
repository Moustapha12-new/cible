import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function testRpcViaClient() {
  console.log("Testing via Supabase client...");
  const { data, error } = await supabase.rpc("cible_take_quota", { p_key: "test:rpc:verify", p_limit: 1 });
  console.log("Client RPC Result:", { data, error });
}

async function testRpcViaRest() {
  console.log("\nTesting via REST API directly...");
  const url = `${process.env.SUPABASE_URL}/rest/v1/rpc/cible_take_quota`;
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  const body = JSON.stringify({ p_key: "test:rest:verify", p_limit: 1 });

  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/cible_take_quota`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ p_key: "test:rest:verify", p_limit: 1 }),
    });
    
    console.log("REST Status:", response.status);
    console.log("REST StatusText:", response.statusText);
    const text = await response.text();
    console.log("REST Body:", text);
  } catch (e) {
    console.error("REST Error:", e);
  }
}

async function main() {
  await testRpcViaClient();
  await testRpcViaRest();
}

main().catch(console.error);