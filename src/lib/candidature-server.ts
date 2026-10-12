import "server-only";
import { authClient, type VerifiedUser } from "@/lib/auth-server";
import { emptyData, type UserData } from "@/lib/data";

export async function loadUserRecord(user: VerifiedUser): Promise<{ data: UserData; version: number }> {
  const { data, error } = await authClient().from("cible_user_data")
    .select("data,version").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error("Le dossier serveur est indisponible.");
  return data
    ? { data: data.data as UserData, version: data.version as number }
    : { data: emptyData(user.name, user.email), version: 0 };
}

export async function saveUserRecord(user: VerifiedUser, record: { data: UserData; version: number }): Promise<void> {
  const { data, error } = await authClient().rpc("cible_save_user_data", {
    p_user_id: user.id, p_version: record.version, p_data: record.data,
  });
  if (error) throw new Error("Enregistrement indisponible. Réessaie sans supprimer tes données.");
  if (data === null) throw new Error("Le dossier a changé ailleurs. Recharge avant de réessayer.");
}
