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
export async function GET(req: NextRequest) {
  beginCheckpointCache();
  try {
    return await handleDashboard(req);
  } finally {
    endCheckpointCache();
  }
}

async function handleDashboard(req: NextRequest) {
  const url = new URL(req.url);
  const q = parseDashboardQuery(url.search);
  if (!q.ok) {
    return NextResponse.json({ ok: false, error: q.error }, { status: 400 });
  }
  const email = q.email;
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

  /* ── P0-4 : lecture directe du snapshot (pas de rebuild) ───────── */
  if (!fresh) {
    const snap = await loadSnapshot(email);
    if (snap) {
      const [tokR, connR] = await Promise.allSettled([
        getAccessToken(email),
        getOauthConnection(email),
      ]);
      if (tokR.status === "rejected") {
        const h = humanizeGmailError(tokR.reason);
        const payload: DashboardPayload = {
          ok: true,
          labelFound: false,
          label: GMAIL_LABEL,
          totalInLabel: 0,
          connected: false,
          configured: true,
          ...(h.detail ? { reason: h.human, detail: h.detail } : { reason: h.human }),
          emails: [],
          summary: emptySummary(),
        };
        return NextResponse.json(payload);
      }
      const conn = connR.status === "fulfilled" ? connR.value : null;
      return NextResponse.json({
        ...snap,
        connected: true,
        configured: true,
        gmailAccount: pickGmailDisplayAddress(conn?.gmailEmail, email) ?? snap.gmailAccount ?? email,
        lastSync: conn?.lastSync ?? snap.lastSync ?? null,
        fromSnapshot: true,
      });
    }
  }

  /* ── Reconstruction (?fresh=1 ou premier passage) ─────────────────
     Token + métadonnées OAuth en parallèle (Promise.allSettled : la perte
     des métadonnées reste non bloquante, l'échec du token reste fatal). */
  let lastSync: string | null = null;
  let oauthEmail: string | undefined;
  const [tokR, connR] = await Promise.allSettled([
    getAccessToken(email),
    getOauthConnection(email),
  ]);
  if (tokR.status === "rejected") {
    const h = humanizeGmailError(tokR.reason);
    const payload: DashboardPayload = {
      ok: true,
      labelFound: false,
      label: GMAIL_LABEL,
      totalInLabel: 0,
      connected: false,
      configured: true,
      ...(h.detail ? { reason: h.human, detail: h.detail } : { reason: h.human }),
      emails: [],
      summary: emptySummary(),
    };
    return NextResponse.json(payload);
  }
  const accessToken = tokR.value;
  if (connR.status === "fulfilled" && connR.value) {
    lastSync = connR.value.lastSync;
    oauthEmail = connR.value.gmailEmail;
  }
  const gmailAccount = pickGmailDisplayAddress(oauthEmail, email) ?? email;

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
    /* État de vérité (connecté, libellé retiré) : aussi mis en snapshot. */
    await saveSnapshot(email, payload);
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

  const summary = buildSummary(emails, lastSync, fetched.total);
  const payload: DashboardPayload = {
    ok: true,
    labelFound: true,
    label: GMAIL_LABEL,
    totalInLabel: fetched.total,
    connected: true,
    configured: true,
    gmailAccount,
    lastSync,
    emails,
    summary,
    truncated: fetched.truncated === true,
  };
  /* P0-4 : la construction (post-sync ou premier passage) alimente le
     snapshot — les prochains GET le servent sans reconstruire. */
  await saveSnapshot(email, payload);
  return NextResponse.json(payload);
}
