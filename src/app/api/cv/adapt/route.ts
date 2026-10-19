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
import { parseCvText, DEFAULT_CV_DESIGN } from "@/lib/cv";
import { applyPlanToCv } from "@/lib/cv-plan-apply";
import { applicationPdf } from "@/lib/cv-application-pdf";
import { evaluateAndSaveCareer } from "@/lib/career-evaluation-server";
import { currentCareerReport } from "@/lib/career-evaluation";

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
  let body: {
    offerId?: string;
    rewrite?: boolean;
    offerSnapshot?: {
      id?: string; title?: string; company?: string; location?: string;
      keywords?: unknown; text?: string; description?: string; url?: string;
      contract?: string; source?: string;
    };
  };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 }); }
  if (!body.offerId || typeof body.offerId !== "string") {
    return NextResponse.json({ ok: false, error: "Identifiant d'offre manquant — sélectionne une offre extraite de tes alertes." }, { status: 400 });
  }
  try {
    const record = await loadUserRecord(user);
    const data = record.data;
    if (data.originalCv?.text?.trim()) data.cvData = parseCvText(data.originalCv.text);
    let offer: DetectedOffer | undefined = data.offers.find(row => row.id === body.offerId);
    if (!offer && body.offerId.startsWith("web:smartrecruiters:")) {
      const raw = await storeGet("discovery:offers:v1");
      const stored = raw ? JSON.parse(raw) as { offers?: DiscoveredOffer[] } : null;
      const found = stored?.offers?.find(row => row.id === body.offerId && row.profileCompatible);
      if (found) offer = discoveryToDetectedOffer(found);
    }
    /* Une offre affichée dans l'espace local peut précéder sa synchronisation
       Supabase. Dans ce cas, analyse la fiche effectivement sélectionnée par
       l'utilisateur ; n'accepte le snapshot que si son identifiant concorde. */
    const snapshot = body.offerSnapshot;
    if (!offer && snapshot?.id === body.offerId
      && typeof snapshot.title === "string" && snapshot.title.trim()
      && typeof snapshot.company === "string" && snapshot.company.trim()) {
      const text = [snapshot.description, snapshot.text].filter((value): value is string => typeof value === "string")
        .map(value => value.trim()).filter(Boolean).join("\n").slice(0, 12_000);
      const keywords = Array.isArray(snapshot.keywords)
        ? snapshot.keywords.filter((value): value is string => typeof value === "string").map(value => value.trim()).filter(Boolean).slice(0, 40)
        : [];
      offer = {
        id: body.offerId,
        title: snapshot.title.trim().slice(0, 200),
        company: snapshot.company.trim().slice(0, 120),
        location: typeof snapshot.location === "string" ? snapshot.location.trim().slice(0, 180) : "",
        salary: "",
        match: 0,
        keywords,
        skills: keywords,
        text,
        url: typeof snapshot.url === "string" && /^https:\/\//i.test(snapshot.url) ? snapshot.url.slice(0, 1_000) : undefined,
        contract: typeof snapshot.contract === "string" ? snapshot.contract.slice(0, 100) : undefined,
        source: "Fiche sélectionnée dans Mon CV",
      };
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
    let careerReport = currentCareerReport(offer, data);
    if (body.rewrite === true && masterText && !plan.noChange) {
      try { careerReport = await evaluateAndSaveCareer(user, offer, data); }
      catch (error) { aiError = `Évaluation détaillée indisponible : ${error instanceof Error ? error.message : "erreur inconnue"}.`; }
      try {
        const aiBody: Body = {
          careerContext: JSON.stringify(careerReport),
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

    const changed = applyPlanToCv(cvData || parseCvText(masterText), operations).cv;
    if (recruiter?.headline) changed.basics.headline = recruiter.headline;
    const { cv: preparedCv, keywordAudit } = await applicationPdf(changed, data.cvDesign || DEFAULT_CV_DESIGN, offerText, careerReport?.requirements.map(r => r.term) || analysis.topNeeds, careerReport?.requirements.filter(r => r.importance === "critical" || r.importance === "high").map(r => r.term) || analysis.topNeeds);
    return NextResponse.json({
      ok: true,
      preparedCv,
      analysis,
      strategy,
      careerReport,
      keywordAudit,
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
