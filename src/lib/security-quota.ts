import { authClient } from "./auth-server";

/** Atomic quota shared by all Vercel instances. No permissive fallback. */
export async function consumeQuota(userId: string, path: string): Promise<boolean> {
  const { data, error } = await authClient().rpc("cible_take_quota", {
    p_key: `${userId}:${path}`,
    p_limit: path === "/api/jobs" ? 30 : 12,
  });
  if (error) {
    const code = /^[A-Z0-9]{3,12}$/.test(error.code || "") ? error.code : "unknown";
    console.error("[quota] cible_take_quota failed", { code, message: error.message });
    throw new Error(`Protection des quotas indisponible (${code}). Réessaie plus tard.`);
  }
  if (typeof data !== "boolean") {
    console.error("[quota] cible_take_quota returned a non-boolean result");
    throw new Error("Protection des quotas indisponible. Réessaie plus tard.");
  }
  return data === true;
}
export async function takeSyncLease(owner: string, token: string): Promise<boolean> {
  const { data, error } = await authClient().rpc("cible_take_sync_lease", { p_owner: owner, p_token: token });
  if (error) throw new Error("Verrou de synchronisation indisponible : aucune opération lancée.");
  return data === true;
}
export async function releaseSyncLease(owner: string, token: string): Promise<void> {
  const { error } = await authClient().rpc("cible_release_sync_lease", { p_owner: owner, p_token: token });
  if (error) throw new Error("Libération du verrou indisponible ; expiration automatique dans six minutes.");
}