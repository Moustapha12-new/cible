import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("Testing RPC call...");
  const { data, error } = await supabase.rpc("cible_take_quota", { p_key: "test:rest:verify", p_limit: 1 });
  console.log("Data:", data);
  console.log("Error:", error);
}

main().catch(console.error);