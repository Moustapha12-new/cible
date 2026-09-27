import { NextRequest, NextResponse } from "next/server";
import { askJson, type Body, type Task } from "@/lib/ai";

export const dynamic = "force-dynamic";

const TASKS: Task[] = [
  "match", "adapt", "letter", "offer", "cvScore", "rank", "keywords",
  "suggest", "entretien", "enrich", "boost-ats", "improve", "trim",
  "batch-compare", "gmail-offers", "gmail-recheck", "rank-gmail", "gmail-enrich",
];

/* Tâches qui exigent un texte d'offre assez long pour être analysé. */
const NEEDS_OFFER: Task[] = ["offer", "match", "adapt", "keywords", "entretien", "boost-ats", "improve", "trim"];

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Requête invalide" }, { status: 400 });
  }

  const task = body.task;
  if (!task || !(TASKS as string[]).includes(task)) {
    return NextResponse.json({ ok: false, error: "Tâche inconnue" }, { status: 400 });
  }
  if (NEEDS_OFFER.includes(task) && (!body.offerText || body.offerText.trim().length < 30)) {
    return NextResponse.json({ ok: false, error: "Texte d'offre trop court" }, { status: 400 });
  }
  if (task === "suggest" && (!body.cv || !body.offerText)) {
    return NextResponse.json({ ok: false, error: "CV structuré ou offre manquante" }, { status: 400 });
  }
  if (task === "enrich" && (!body.cv || !body.offerText)) {
    return NextResponse.json({ ok: false, error: "CV structuré ou offre manquante" }, { status: 400 });
  }
  if (task === "batch-compare" && (!body.cvOriginal && !body.profile)) {
    return NextResponse.json({ ok: false, error: "Aucun CV fourni" }, { status: 400 });
  }
  if (task === "batch-compare" && (!body.jobs || body.jobs.length === 0)) {
    return NextResponse.json({ ok: false, error: "Aucune offre à comparer" }, { status: 400 });
  }
  if (task === "boost-ats" && (!body.cvOriginal && !body.profile)) {
    return NextResponse.json({ ok: false, error: "Aucun CV fourni" }, { status: 400 });
  }
  if (task === "improve" && (!body.cvOriginal && !body.profile)) {
    return NextResponse.json({ ok: false, error: "Aucun CV fourni" }, { status: 400 });
  }
  if (task === "trim" && (!body.cvOriginal && !body.profile)) {
    return NextResponse.json({ ok: false, error: "Aucun CV fourni" }, { status: 400 });
  }
  if (task === "gmail-offers" && (!body.emails || body.emails.length === 0)) {
    return NextResponse.json({ ok: false, error: "Aucun e-mail à analyser" }, { status: 400 });
  }
  if (task === "gmail-enrich" && (!body.offers || body.offers.length === 0)) {
    return NextResponse.json({ ok: false, error: "Aucune offre à enrichir" }, { status: 400 });
  }
  if (task === "rank-gmail" && (!body.cvOriginal && !body.profile)) {
    return NextResponse.json({ ok: false, error: "Aucun CV fourni" }, { status: 400 });
  }
  if (task === "rank-gmail" && (!body.jobs || body.jobs.length === 0)) {
    return NextResponse.json({ ok: false, error: "Aucune offre à classer" }, { status: 400 });
  }
  if ((task === "match" || task === "adapt") && !body.cvOriginal && !body.profile) {
    return NextResponse.json({ ok: false, error: "Aucun CV fourni" }, { status: 400 });
  }
  if (task === "rank" && (!body.jobs || body.jobs.length === 0)) {
    return NextResponse.json({ ok: false, error: "Aucune offre à classer" }, { status: 400 });
  }

  try {
    const result = await askJson(task, body);
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}