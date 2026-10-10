import { securedRoute } from "@/lib/auth-server";
import { NextRequest, NextResponse } from "next/server";
import {
  getAccessToken,
  getOauthConnection,
  findLabel,
  fetchLabelEmails,
  pickGmailDisplayAddress,
  GMAIL_LABEL,
  type FetchLabelEmailsResult,
} from "@/lib/gmail-server";
import {
  loadCheckpoint,
  saveCheckpoint,
  beginCheckpointCache,
  endCheckpointCache,
  canonicalizeOffers,
  stampAnalysis,
  type ProcessedEmail,
} from "@/lib/gmail-core";
import {
  buildSummary,
  mergeCatalogue,
  emptySummary,
  humanizeGmailError,
  parseDashboardQuery,
  slimOffers,
  type DashboardPayload,
} from "@/lib/gmail-dashboard";
import { loadSnapshot, saveSnapshot } from "@/lib/gmail-snapshot";

export const dynamic = "force-dynamic";

/** GET /api/gmail/dashboard?email=<email>[&fresh=1]
 * Lecture seule (pas de processEmail / IA) : liste les e-mails du libellé
 * et reconstruit l'état depuis les checkpoints Module 1.
 * P0-4 : sans `fresh=1`, sert le snapshot persisté (~2 lectures stockage) ;
 * `?fresh=1` (post-sync) reconstruit puis réécrit le snapshot.
 * P0-5 : le payload est allégé (snippet/sourceUrl → GET /api/gmail/offer-detail).
 * Cache checkpoints borné à la requête (P1-3) : try/finally → endCheckpointCache
 * garanti sur tous les chemins de sortie.
 */
export const GET = securedRoute(async (req, auth) => {
  beginCheckpointCache();
  try {
    return await handleDashboard(req, auth.user.email);
  } finally {
    endCheckpointCache();
  }
});

async function handleDashboard(req: NextRequest, owner: string) {
  const url = new URL(req.url);
  const query = new URLSearchParams(url.search);
  query.set("email", owner);
  const q = parseDashboardQuery(query.toString());
  if (!q.ok) {
    return NextResponse.json({ ok: false, error: q.error }, { status: 400 });
  }
  const email = owner;
  const fresh = url.searchParams.get("fresh") === "1";

  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (!configured) {
    const payload: DashboardPayload = {
      ok: true,
      labelFound: false,
      label: GMAIL_LABEL,
      totalInLabel: 0,
      connected: false,
      configured: false,
      reason: "Configuration Google OAuth manquante (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)",
      emails: [],
      summary: emptySummary(),
    };
    return NextResponse.json(payload);
  }

  // Snapshot et informations OAuth lus ensemble : pas de round-trip série.
  const [snapR, tokR, connR] = await Promise.allSettled([
    loadSnapshot(email),
    getAccessToken(email),
    getOauthConnection(email),
  ]);
  if (snapR.status === "rejected") throw snapR.reason;
  if (tokR.status === "rejected") {
    const h = humanizeGmailError(tokR.reason);
    if (snapR.status === "fulfilled" && snapR.value) {
      return NextResponse.json({ ...snapR.value, connected: false, configured: true, reason: h.human, detail: h.detail });
    }
    return NextResponse.json({ ok: true, labelFound: false, label: GMAIL_LABEL, totalInLabel: 0,
      connected: false, configured: true, reason: h.human, detail: h.detail,
      emails: [], summary: emptySummary() });
  }
  const accessToken = tokR.value;
  const conn = connR.status === "fulfilled" ? connR.value : null;
  const lastSync = conn?.lastSync ?? null;
  const gmailAccount = pickGmailDisplayAddress(conn?.gmailEmail, email) ?? email;
  const snap = snapR.status === "fulfilled" ? snapR.value : null;
  if (snap && !fresh) {
    return NextResponse.json({ ...snap, connected: true, configured: true,
      gmailAccount, lastSync: lastSync ?? snap.lastSync ?? null, fromSnapshot: true });
  }

  let label: { id: string; name: string } | null = null;
  try {
    label = await findLabel(accessToken, GMAIL_LABEL);
  } catch {
    label = null;
  }

  if (!label) {
    const payload: DashboardPayload = {
      ok: true,
      labelFound: false,
      label: GMAIL_LABEL,
      totalInLabel: 0,
      connected: true,
      configured: true,
      gmailAccount,
      lastSync,
      emails: [],
      summary: emptySummary(lastSync ?? ""),
      hint: `Crée un libellé Gmail nommé exactement « ${GMAIL_LABEL} », puis synchronise.`,
    };
    if (snap) return NextResponse.json({ ...snap, connected: true, configured: true, gmailAccount, lastSync, hint: payload.hint });
    return NextResponse.json(payload);
  }

  let fetched: FetchLabelEmailsResult;
  try {
    /* Quota : jamais de messages.get full ici — checkpoint meta ou headers seuls. */
    fetched = await fetchLabelEmails(accessToken, label, {
      resolveMode: async (id) => {
        const cp = await loadCheckpoint(id);
        return cp?.subject ? "skip" : "meta";
      },
      metaFor: async (id) => {
        const cp = await loadCheckpoint(id);
        if (!cp?.subject) return null;
        return {
          subject: cp.subject,
          from: cp.from ?? "",
          receivedAt: cp.receivedAt ?? cp.at,
        };
      },
    });
    for (const em of fetched.emails) {
      const cp = await loadCheckpoint(em.id);
      if (cp && !cp.subject && em.subject) {
        await saveCheckpoint(em.id, {
          ...cp,
          subject: em.subject,
          from: em.from,
          receivedAt: em.receivedAt,
        });
      }
    }
  } catch (e) {
    const h = humanizeGmailError(e);
    return NextResponse.json(
      {
        ok: false,
        error: h.human,
        ...(h.detail ? { detail: h.detail } : {}),
      },
      { status: 502 }
    );
  }

  const emails: ProcessedEmail[] = [];
  for (const em of fetched.emails) {
    const cp = await loadCheckpoint(em.id);
    if (cp?.status === "done" || cp?.status === "error" || cp?.status === "pending_retry") {
      /* P0-5 : offres allégées (snippet/sourceUrl → offer-detail à la demande). */
      const co = slimOffers(canonicalizeOffers(cp.offers ?? []));
      emails.push(
        stampAnalysis({
        id: em.id,
        subject: em.subject,
        from: em.from,
        receivedAt: em.receivedAt,
        isOffer: cp.isOffer === true,
        reason: cp.reason ?? (cp.isOffer ? "Traité (checkpoint)" : "Aucune offre de stage identifiée"),
        finalStatus: cp.isOffer ? "detected" : cp.error ? "analyze_error" : "no_offer",
        recoveryUsed: cp.recoveryUsed,
        detectedByCode: cp.detectedByCode,
        detSummary: cp.summary,
        offers: co,
        fromCheckpoint: true,
        anchorsCount: cp.summary?.anchorsTotal,
        detectedOffers: co.map((o) => ({
          title: o.title,
          company: o.company,
          applicationUrl: o.applicationUrl,
        })),
        detectionMethod: (cp.detectedByCode ?? 0) > 0 ? "code" : cp.offers?.length ? "ia" : "none",
        error: cp.error,
        checkpoint: {
          status: cp.status,
          retries: cp.retries ?? 0,
          at: cp.at,
          recoveryUsed: cp.recoveryUsed,
        },
        })
      );
    } else {
      /* Pas encore traité : on affiche l'e-mail sans inventer de résultat.
         cp absent + reçu après le dernier sync = normal (pas une anomalie). */
      const afterLastSync =
        !cp && !!em.receivedAt && !!lastSync && em.receivedAt > lastSync;
      emails.push(
        stampAnalysis({
          id: em.id,
          subject: em.subject,
          from: em.from,
          receivedAt: em.receivedAt,
          isOffer: false,
          reason: cp?.reason ??
            (afterLastSync
              ? "Reçu après le dernier sync — lance la synchronisation"
              : "Non traité — lance la synchronisation"),
          finalStatus: "no_offer",
          offers: [],
          detectionMethod: "none",
          checkpoint: cp
            ? { status: cp.status, retries: cp.retries ?? 0, at: cp.at }
            : { status: "pending", retries: 0, at: "" },
        })
      );
    }
  }

  const catalogue = mergeCatalogue(snap?.emails ?? [], emails);
  const summary = buildSummary(catalogue, lastSync, fetched.total);
  const payload: DashboardPayload = {
    ok: true,
    labelFound: true,
    label: GMAIL_LABEL,
    totalInLabel: fetched.total,
    connected: true,
    configured: true,
    gmailAccount,
    lastSync,
    emails: catalogue,
    summary,
    truncated: fetched.truncated === true,
  };
  /* P0-4 : la construction (post-sync ou premier passage) alimente le
     snapshot — les prochains GET le servent sans reconstruire. */
  await saveSnapshot(email, payload);
  return NextResponse.json(payload);
}
