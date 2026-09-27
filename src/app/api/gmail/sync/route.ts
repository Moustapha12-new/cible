import { NextRequest, NextResponse } from "next/server";
import {
  getAccessToken,
  findLabel,
  updateOauthConnection,
  acquireSyncLock,
  releaseSyncLock,
  GMAIL_LABEL,
} from "@/lib/gmail-server";
import { runSync, type ProcessedEmail } from "@/lib/gmail-core";
import { humanizeGmailError } from "@/lib/gmail-dashboard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* Deadline murale du run (P0-5) : on s'arrête ~65 s avant maxDuration pour
   laisser la place à l'enrichissement, la sérialisation et la réponse.
   GMAIL_RUN_DEADLINE_MS permet de tester / ajuster sans redéployer. */
const RUN_DEADLINE_MS = Math.max(10_000, Number(process.env.GMAIL_RUN_DEADLINE_MS) || 235_000);

/** Réponse compatible avec SyncEmailResult de gmail-client.ts (ingestSyncResults). */
type ClientEmail = ProcessedEmail;

type SyncBody = {
  email?: string;
  debug?: boolean;
  force?: boolean;
  /** Relance sélective Module 2. */
  action?: "sync" | "relaunch_errors" | "relaunch_email" | "relaunch_offer";
  emailId?: string;
};

export async function POST(req: NextRequest) {
  let email = "";
  let debug = false;
  let force = false;
  let action: NonNullable<SyncBody["action"]> = "sync";
  let emailId = "";
  try {
    const body = (await req.json()) as SyncBody;
    email = (body.email || "").trim().toLowerCase();
    debug = body.debug === true;
    force = body.force === true;
    emailId = (body.emailId || "").trim();
    if (
      body.action === "relaunch_errors" ||
      body.action === "relaunch_email" ||
      body.action === "relaunch_offer"
    ) {
      action = body.action;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Requête invalide" }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json({ ok: false, error: "Compte utilisateur manquant" }, { status: 400 });
  }
  if ((action === "relaunch_email" || action === "relaunch_offer") && !emailId) {
    return NextResponse.json(
      { ok: false, error: `emailId manquant pour ${action}` },
      { status: 400 }
    );
  }

  /* 1 — Token Gmail (chiffré, serveur uniquement). */
  let accessToken: string;
  try {
    accessToken = await getAccessToken(email);
  } catch (e) {
    const h = humanizeGmailError(e);
    return NextResponse.json(
      { ok: false, error: h.human, ...(h.detail ? { detail: h.detail } : {}) },
      { status: 401 }
    );
  }

  /* 2 — Libellé surveillé. */
  let label: { id: string; name: string } | null = null;
  let syncError: { human: string; detail?: string } | null = null;
  try {
    label = await findLabel(accessToken, GMAIL_LABEL);
  } catch (e) {
    syncError = humanizeGmailError(e);
  }

  /* lastSync n'est écrit qu'APRÈS un run réussi (plus bas) — l'écrire ici
     ferait afficher « synchronisé à HH:MM » alors que rien n'a été traité. */
  await updateOauthConnection(email, {
    labelId: label ? label.id : null,
    labelName: label ? label.name : null,
  }).catch(() => {});

  if (syncError) {
    return NextResponse.json(
      { ok: false, error: syncError.human, ...(syncError.detail ? { detail: syncError.detail } : {}) },
      { status: 502 }
    );
  }

  if (!label) {
    return NextResponse.json({
      ok: true,
      labelFound: false,
      label: GMAIL_LABEL,
      emailsRead: 0,
      totalInLabel: 0,
      emails: [],
      detected: 0,
      summary: {
        emailsRead: 0,
        emailsProcessed: 0,
        totalOffersDetected: 0,
        newOffersImported: 0,
        duplicatesIgnored: 0,
        noOfferVerified: 0,
        errors: 0,
        pendingRetry: 0,
        pending: 0,
        lastSync: new Date().toISOString(),
      },
      hint: "Crée d'abord un libellé Gmail nommé exactement « Stages – Alertes offres » dans la boîte concernée, puis relance la synchronisation.",
    });
  }

  /* 3 — Verrou anti-double-run (P1-2, TTL 300 s best-effort) : deux onglets
     qui cliquent « Synchroniser » ne lancent jamais 2 runs concurrents. */
  const lockToken = await acquireSyncLock(email);
  if (!lockToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "Une synchronisation est déjà en cours — réessaie dans quelques instants.",
      },
      { status: 409 }
    );
  }

  /* 3–4 — Fetch + traitement email-unique avec checkpoints (gmail-core).
     Relance sélective : resetErrors repasse les cp error → pending (resolveMode
     full les re-filtre) — PAS de force global qui re-fetcherait tout le libellé. */
  let outcome;
  try {
    outcome = await runSync({
      accessToken,
      label,
      force,
      resetErrors: action === "relaunch_errors" || action === "relaunch_email",
      onlyEmailIds:
        action === "relaunch_email" || action === "relaunch_offer" ? [emailId] : undefined,
      /* P1-4 : relance d'enrichissement seule (aucune détection IA). */
      enrichOnly: action === "relaunch_offer",
      userKey: email,
      deadlineMs: RUN_DEADLINE_MS,
    });
  } catch (e) {
    const h = humanizeGmailError(e);
    return NextResponse.json(
      { ok: false, error: h.human, ...(h.detail ? { detail: h.detail } : {}) },
      { status: 502 }
    );
  } finally {
    await releaseSyncLock(email, lockToken);
  }

  /* Run réussi → on valide la date de synchronisation. */
  await updateOauthConnection(email, { lastSync: new Date().toISOString() }).catch(() => {});

  if (outcome.emailsRead === 0 && outcome.totalInLabel === 0) {
    return NextResponse.json({
      ok: true,
      labelFound: true,
      label: outcome.label,
      emailsRead: 0,
      totalInLabel: 0,
      emails: [],
      detected: 0,
      summary: outcome.summary,
    });
  }

  const emails: ClientEmail[] = outcome.emails;

  const mailDebug = debug
    ? emails.map((e) => ({
        id: e.id,
        subject: e.subject,
        from: e.from,
        fromCheckpoint: e.fromCheckpoint === true,
        detected: e.offers.length,
        detectedByCode: e.detectedByCode ?? 0,
        anchors: e.detSummary?.anchorsTotal ?? e.anchorsCount ?? 0,
        markers: e.detSummary?.markers ?? 0,
        verifyOk: e.detSummary?.verifyOk ?? null,
        finalStatus: e.finalStatus,
        recoveryUsed: e.recoveryUsed,
        detectionMethod: e.detectionMethod ?? "none",
        textLen: e.textLen ?? 0,
        hasHtml: e.hasHtml === true,
        linksCount: e.linksCount ?? 0,
        anchorsCount: e.anchorsCount ?? 0,
        error: e.error ?? null,
        checkpoint: e.checkpoint ?? null,
        detectedOffers: e.detectedOffers ?? [],
        offerProofs: e.offers.map((o) => ({
          applicationUrl: o.applicationUrl,
          sourceUrl: o.sourceUrl ?? null,
          anchorText: o.anchorText ?? null,
          snippetLen: o.snippet?.length ?? 0,
          enrichStatus: o.enrichStatus ?? "none",
          searchFallback: o.searchFallback === true,
          importStatus: o.importStatus ?? null,
          importReason: o.importReason ?? null,
        })),
      }))
    : undefined;

  return NextResponse.json({
    ok: true,
    labelFound: true,
    action,
    label: outcome.label,
    emailsRead: outcome.emailsRead,
    totalInLabel: outcome.totalInLabel,
    detected: outcome.detected,
    emails,
    checkpointStats: outcome.checkpointStats,
    truncated: outcome.truncated === true,
    interrupted: outcome.interrupted === true,
    remaining: outcome.remaining ?? 0,
    ...(outcome.arrivedDuringRun !== undefined
      ? { arrivedDuringRun: outcome.arrivedDuringRun }
      : {}),
    ...(outcome.enrichDeferred ? { enrichDeferred: true } : {}),
    ...(outcome.enrichRetry
      ? { enrichRetry: outcome.enrichRetry }
      : {}),
    ...((outcome.fetchSkipped ?? 0) > 0
      ? { fetchSkipped: outcome.fetchSkipped, fetchErrors: outcome.fetchErrors ?? [] }
      : {}),
    summary: outcome.summary,
    ...(mailDebug ? { mailDebug } : {}),
  });
}
