import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord } from "@/lib/candidature-server";
import { askJson, type Body } from "@/lib/ai";
import { analyzeAndPlan, validatePlan, type PlanOperation } from "@/lib/cv-engine";
import { dossierExtract } from "@/lib/candidate-dossier";
import { integrateAiResult, offerPromptText, type AiAdaptResult, type RecruiterReport } from "@/lib/cv-recruiter";
import { storeGet } from "@/lib/gmail-server";
import type { DiscoveredOffer } from "@/lib/discovery-offers";
import type { DetectedOffer } from "@/lib/data";
import { discoveryToDetectedOffer } from "@/lib/discovery-view";

export const dynamic = "force-dynamic";

/**
 * POST /api/cv/adapt { offerId, rewrite? }
 * · Modules A–D déterministes : analyse de l'offre, matrice exigence → preuve
 *   (croisée avec le registre de preuves du dossier maître), stratégie, plan.
 * · `rewrite: true` : UNE passe « recruteur technique » Gemini. Chaque ligne
 *   revient est revalidée indépendamment (citation dans l'offre, IDs de preuves
 *   réels, interdits du dossier, non-invention) — voir cv-recruiter.
 * · IA indisponible : plan déterministe conservé + aiError explicite.
 */
export const POST = securedRoute(async (req, { user }) => {
  let body: { offerId?: string; rewrite?: boolean };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 }); }
  if (!body.offerId || typeof body.offerId !== "string") {
    return NextResponse.json({ ok: false, error: "Identifiant d'offre manquant — sélectionne une offre extraite de tes alertes." }, { status: 400 });
  }
  try {
    const record = await loadUserRecord(user);
    const data = record.data;
    let offer: DetectedOffer | undefined = data.offers.find(row => row.id === body.offerId);
    if (!offer && body.offerId.startsWith("web:smartrecruiters:")) {
      const raw = await storeGet("discovery:offers:v1");
      const stored = raw ? JSON.parse(raw) as { offers?: DiscoveredOffer[] } : null;
      const found = stored?.offers?.find(row => row.id === body.offerId && row.profileCompatible);
      if (found) offer = discoveryToDetectedOffer(found);
    }
    if (!offer) {
      return NextResponse.json({ ok: false, error: "Offre introuvable dans ton dossier (l'analyse exige la même fiche que la sélection)." }, { status: 404 });
    }
    if (!data.originalCv?.text?.trim() && !data.cvData) {
      return NextResponse.json({ ok: false, error: "Aucun CV maître confirmé — importe d'abord ton vrai CV (page Mon CV)." }, { status: 400 });
    }

    /* ── Modules A–D : intégralement déterministes, aucun appel IA ─── */
    const { analysis, strategy, plan, masterText, cvData } = analyzeAndPlan(offer, data);
    const { accepted, rejected } = validatePlan(plan, masterText, cvData);

    /* ── Passe recruteur Gemini OPTIONNELLE, puis validation indépendante ── */
    const offerText = offerPromptText(offer);
    let operations: PlanOperation[] = accepted;
    let recruiter: RecruiterReport | undefined;
    let aiError: string | undefined;
    if (body.rewrite === true && masterText && !plan.noChange) {
      try {
        const aiBody: Body = {
          cvOriginal: masterText,
          offerText,
          orientation: "electrical",
          dossier: dossierExtract(),
          keywords: analysis.topNeeds.map(term => ({ term })),
        };
        const result = await askJson<AiAdaptResult>("adapt", aiBody, { temperature: 0.3 });
        recruiter = integrateAiResult(result, { masterText, cvData, analysis, offerText, data });
        operations = [...accepted, ...recruiter.accepted];
        rejected.push(...recruiter.rejected);
      } catch (error) {
        /* Échec IA transparent : le plan déterministe est conservé tel quel. */
        aiError = `IA indisponible : ${error instanceof Error ? error.message : "erreur inconnue"}. Le plan de preuves est conservé ; le CV maître n'est pas modifié.`;
      }
    }

    return NextResponse.json({
      ok: true,
      analysis,
      strategy,
      plan: { ...plan, operations },
      rejected,
      ...(recruiter ? { recruiter } : {}),
      ...(aiError ? { aiError } : {}),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Analyse indisponible." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
});
