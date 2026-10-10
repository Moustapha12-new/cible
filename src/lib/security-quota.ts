import { authClient } from "./auth-server";

/** Atomic quota shared by all Vercel instances. No permissive fallback. */
export async function consumeQuota(userId: string, path: string): Promise<boolean> {
  const { data, error } = await authClient().rpc("cible_take_quota", {
    p_key: `${userId}:${path}`, p_limit: path === "/api/jobs" ? 30 : 12,
  });
  if (error) throw new Error("Protection des quotas indisponible. Réessaie plus tard.");
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
