import { NextResponse } from "next/server";
import { authClient, securedRoute } from "@/lib/auth-server";
export const dynamic = "force-dynamic";
export const GET = securedRoute(async (_req, auth) => {
  const { data, error } = await authClient().from("cible_user_data").select("data,version,updated_at").eq("user_id", auth.user.id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "Sauvegarde serveur indisponible. Les données de cet appareil sont conservées." }, { status: 503 });
  return NextResponse.json({ ok: true, record: data }, { headers: { "Cache-Control": "no-store" } });
});
export const POST = securedRoute(async (req, auth) => {
  const body = await req.json();
  if (!Number.isInteger(body.version) || body.version < 0 || !body.data?.profile || !Array.isArray(body.data.applications) || !Array.isArray(body.data.offers) || !Array.isArray(body.data.cvs)) return NextResponse.json({ ok: false, error: "Dossier invalide." }, { status: 400 });
  const { data, error } = await authClient().rpc("cible_save_user_data", { p_user_id: auth.user.id, p_version: body.version, p_data: body.data });
  if (error) return NextResponse.json({ ok: false, error: "Sauvegarde indisponible. Aucune donnée locale supprimée." }, { status: 503 });
  if (data === null) return NextResponse.json({ ok: false, error: "Le dossier a changé sur un autre appareil. Recharge la sauvegarde avant de réessayer." }, { status: 409 });
  return NextResponse.json({ ok: true, version: data }, { headers: { "Cache-Control": "no-store" } });
});
