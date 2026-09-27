import { NextRequest, NextResponse } from "next/server";
import { fetchOfferPage } from "@/lib/scrape";

export const dynamic = "force-dynamic";

/* Télécharge une annonce publique (LinkedIn job view, WTTJ, HelloWork…) et
   renvoie son texte brut : le client l'enchaîne ensuite sur /api/ai tâche
   « offer » pour le résumé, les compétences et le niveau attendu. */
export async function POST(req: NextRequest) {
  let url = "";
  try {
    const b = (await req.json()) as { url?: string };
    url = (b.url ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "Requête invalide" }, { status: 400 });
  }
  if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 2000) {
    return NextResponse.json(
      { ok: false, error: "Lien invalide — colle une URL complète commençant par https://" },
      { status: 400 }
    );
  }

  const r = await fetchOfferPage(url);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.reason }, { status: 502 });
  }
  return NextResponse.json(
    { ok: true, url, text: r.text },
    { headers: { "Cache-Control": "no-store" } }
  );
}
