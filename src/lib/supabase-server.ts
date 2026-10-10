/** Configuration réservée au serveur : aucune clé privilégiée côté navigateur. */
export function supabaseServerConfig(env: Record<string, string | undefined> = process.env) {
  const url = env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !key) return null;
  if (!/^https:\/\//i.test(url)) throw new Error("Supabase : URL serveur invalide.");
  if (/your_|placeholder|changeme/i.test(key)) throw new Error("Supabase : renseigne une vraie clé serveur privée.");
  if (!key.startsWith("sb_secret_")) {
    let role = "";
    try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role; } catch { /* clé invalide */ }
    if (role !== "service_role") throw new Error("Supabase : utilise une clé serveur secret ou service_role, pas une clé publique anon.");
  }
  return { url, key, bucket: env.SUPABASE_BUCKET?.trim() || "cible-gmail-storage" };
}

export function supabaseAuthHeaders(key: string): Record<string, string> {
  // Les nouvelles clés sont des API keys, pas des JWT.
  return { apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }) };
}

export function supabaseStorageError(status: number, message = ""): Error {
  if (status === 401 || /unregistered|invalid.*(?:jwt|jws|api.?key)|unauthorized/i.test(message)) return new Error("Supabase refuse la clé serveur. Mets à jour la clé privée du bon projet, puis réessaie.");
  if (status === 403) return new Error("Supabase refuse l’accès au stockage. Vérifie la clé serveur et les droits du bucket privé.");
  if (status === 404 || /bucket.*not found/i.test(message)) return new Error("Stockage Supabase introuvable : vérifie le nom et l’existence du bucket privé configuré.");
  return new Error(`Stockage Supabase indisponible (HTTP ${status}). Vérifie l’état du projet et sa configuration.`);
}
