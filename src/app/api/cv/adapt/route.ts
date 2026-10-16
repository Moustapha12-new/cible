import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord } from "@/lib/candidature-server";
import { askJson } from "@/lib/ai";
import { analyzeAndPlan, validatePlan, validatePlanOperation, type PlanOperation } from "@/lib/cv-engine";
import { storeGet } from "@/lib/gmail-server";
import type { DiscoveredOffer } from "@/lib/discovery-offers";
import type { DetectedOffer } from "@/lib/data";
import { discoveryToDetectedOffer } from "@/lib/discovery-view";

export const dynamic = "force-dynamic";

const OFFER_TEXT_FIELDS = (offer: { title?: string; company?: string; description?: string; text?: string; profile?: string; missions?: string[]; skills?: string[]; prerequisites?: string[] }) =>
  [offer.title, offer.company, offer.description, offer.text, offer.profile,
    ...(offer.missions || []), ...(offer.skills || []), ...(offer.prerequisites || [])]
    .filter(Boolean).join("\n").slice(0, 12_000);

type AiChange = { original?: string; rewritten?: string; section?: string };

/**
 * POST /api/cv/adapt { offerId, rewrite? }
 * · 100 % déterministe : analyse de l'offre (catégories + 5 besoins),
 *   matrice exigence → preuves, stratégie, plan d'opérations, vérification.
 * · `rewrite: true` ajoute UNE passe Gemini de reformulation ciblée ; chaque
 *   opération IA est validée indépendamment (module E) et les refus sont
 *   renvoyés avec leur motif — jamais appliqués silencieusement.
 * · IA indisponible : plan conservé + `aiError` explicite (aucun faux succès).
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

    /* ── Module D/E : reformulation Gemini OPTIONNELLE, puis vérification ── */
    const aiOperations: PlanOperation[] = [];
    let aiError: string | undefined;
    if (body.rewrite === true && masterText && !plan.noChange) {
      try {
        const result = await askJson("adapt", {
          cvOriginal: masterText,
          offerText: OFFER_TEXT_FIELDS(offer),
          orientation: "electrical",
        });
        const changes = (result as { changes?: AiChange[] })?.changes;
        if (Array.isArray(changes)) {
          for (const [index, change] of changes.slice(0, 8).entries()) {
            const original = (change.original || "").trim();
            const rewritten = (change.rewritten || "").trim();
            if (!original || !rewritten || original === rewritten) continue;
            const zone = (change.section || "CV").slice(0, 80);
            const op: PlanOperation = {
              id: `op-ai-${index}`,
              op: /profil|r[eé]sum[ée]/i.test(zone) ? "rewrite_profile" : "rephrase_fact",
              zone,
              sourceFactIds: strategy.flagship ? [strategy.flagship.evidenceId] : [],
              before: original,
              after: rewritten,
              justification: `Reformulation ciblée proposée par l'IA pour cette offre (besoins : ${analysis.topNeeds.slice(0, 3).join(", ")}) — vérifiée contre le CV maître.`,
              proofType: "PARTIELLE",
              a4Impact: "léger",
              decision: "pending",
            };
            const issues = validatePlanOperation(op, masterText, plan.analysis, cvData);
            if (issues.length) rejected.push({ op, issues });
            else aiOperations.push(op);
          }
        }
      } catch (error) {
        /* Échec IA transparent : le plan déterministe est conservé tel quel. */
        aiError = `IA indisponible : ${error instanceof Error ? error.message : "erreur inconnue"}. Le plan de preuves est conservé ; le CV maître n'est pas modifié.`;
      }
    }

    return NextResponse.json({
      ok: true,
      analysis,
      strategy,
      plan: { ...plan, operations: [...accepted, ...aiOperations] },
      rejected,
      ...(aiError ? { aiError } : {}),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Analyse indisponible." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
});
