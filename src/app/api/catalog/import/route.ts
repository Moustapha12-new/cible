import { createHash } from "node:crypto";
import { authClient, securedRoute } from "@/lib/auth-server";
import { gmailImportRecords, localImportRecords, validateImportBatch } from "@/lib/catalog-import";
import type { UserData } from "@/lib/data";
import { loadSnapshot } from "@/lib/gmail-snapshot";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = securedRoute(async (_req, auth) => {
  const { count, error } = await authClient().from("cible_catalog_offers").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id);
  if (error) return NextResponse.json({ ok: false, error: "Schéma P4-A indisponible sur ce projet." }, { status: 503 });
  return NextResponse.json({ ok: true, catalogCount: count ?? 0 }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = securedRoute(async (req, auth) => {
  const body = await req.json().catch(() => null);
  if (!body || !["local", "server", "gmail"].includes(body.source)) return NextResponse.json({ ok: false, error: "Source invalide." }, { status: 400 });
  let records;
  let nextCursor: number | null = null;
  if (body.source === "gmail" || body.source === "server") {
    if (!Number.isInteger(body.cursor) || body.cursor < 0) return NextResponse.json({ ok: false, error: "Curseur invalide." }, { status: 400 });
    let all;
    if (body.source === "gmail") {
      const snapshot = await loadSnapshot(auth.user.email);
      if (!snapshot) return NextResponse.json({ ok: false, error: "Aucun snapshot Gmail accessible ; lance d'abord la synchronisation existante." }, { status: 409 });
      all = gmailImportRecords(snapshot.emails);
    } else {
      const { data: stored, error: readError } = await authClient().from("cible_user_data").select("data").eq("user_id", auth.user.id).maybeSingle();
      if (readError) return NextResponse.json({ ok: false, error: "Lecture du dossier serveur indisponible." }, { status: 503 });
      all = stored ? localImportRecords(stored.data as UserData) : [];
    }
    records = all.slice(body.cursor, body.cursor + 50);
    nextCursor = body.cursor + records.length < all.length ? body.cursor + records.length : null;
    if (!records.length) return NextResponse.json({ ok: true, saved: 0, skipped: 0, nextCursor: null, totalSource: all.length });
  } else {
    records = body.records;
  }
  if (!validateImportBatch(records)) return NextResponse.json({ ok: false, error: "Lot d'offres invalide ou trop volumineux." }, { status: 400 });
  const batchId = createHash("sha256").update(`${body.source}:`).update(JSON.stringify(records)).digest("hex");
  const { data, error } = await authClient().rpc("cible_import_catalog_batch", {
    p_user_id: auth.user.id, p_batch_id: batchId, p_source: body.source, p_records: records,
  });
  if (error) return NextResponse.json({ ok: false, error: "Import interrompu. Les anciennes données restent intactes ; relance le même lot." }, { status: 503 });
  return NextResponse.json({ ok: true, ...data, nextCursor }, { headers: { "Cache-Control": "no-store" } });
});
