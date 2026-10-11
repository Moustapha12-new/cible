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

export const GET = securedRoute(async (req, auth) => {
  beginCheckpointCache();
  try {
    return await handleDashboard(req, auth.user.email);
  } finally {
    endCheckpointCache();
  }
});

async function handleDashboard(req: NextRequest, owner: string) {
  beginCheckpointCache();
  try {
    return await handleDashboardInner(req, owner);
  } finally {
    endCheckpointCache();
  }
}

async function handleDashboardInner(req: NextRequest, owner: string) {
  const url = new URL(req.url);
  const query = new URLSearchParams(req.url);
  query.set("email", owner);
  const q = parseDashboardQuery(query.toString());
  if (!q.ok) {
    return NextResponse.json({ ok: false, error: q.error }, { status: 400 });
  }
  const email = owner;
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";

  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (!configured) {
    const payload = {
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

  const [snapR, tokR, connR] = await Promise.allSettled([
    loadSnapshot(email),
    getAccessToken(email),
    getOauthConnection(email),
  ]);
  if (snapR.status === "rejected") throw snapR.reason;

  let accessToken: string | null = null;
  let connected = true;
  let reason: string | undefined;
  let detail: string | undefined;

  if (tokR.status === "rejected") {
    const h = humanizeGmailError(tokR.reason);
    const basePayload = {
      ok: true,
      labelFound: false,
      label: GMAIL_LABEL,
      totalInLabel: 0,
      connected: false,
      configured: true,
      reason: h.human,
      detail: h.detail,
      emails: [],
      summary: emptySummary(),
    };

    if (snapR.status === "fulfilled" && snapR.value) {
      return NextResponse.json({
        ...snapR.value,
        connected: false,
        configured: true,
        reason: `Session Gmail expirée : ${h.human}. Vos offres existantes restent accessibles.`,
        detail: h.detail,
      });
    }
    return NextResponse.json({
      ...{ ok: true, labelFound: false, label: GMAIL_LABEL, totalInLabel: 0, connected: false, configured: true, reason: h.human, detail: h.detail, emails: [], summary: emptySummary() },
      reason: `Session Gmail expirée : ${h.human}. Connectez votre compte pour synchroniser.`,
      detail: h.detail,
    });
  }

  const conn = connR.status === "fulfilled" ? connR.value : null;
  const lastSync = conn?.lastSync ?? null;
  const gmailAccount = pickGmailDisplayAddress(conn?.gmailEmail, email) ?? email;
  const snap = snapR.status === "fulfilled" ? snapR.value : null;
  if (snap && !fresh) {
    return NextResponse.json({ ...snap, connected: true, configured: true,
      gmailAccount: pickGmailDisplayAddress(snapR.value?.gmailAccount ?? "", email) ?? email, lastSync: lastSync ?? snap.lastSync ?? null, fromSnapshot: true });
  }

  let label: { id: string; name: string } | null = null;
  try {
    label = await findLabel(accessToken!, GMAIL_LABEL);
  } catch {
    label = null;
  }

  if (!label) {
    const snap = snapR.status === "fulfilled" ? snapR.value : null;
    const payload = {
      ok: true,
      labelFound: false,
      label: GMAIL_LABEL,
      totalInLabel: 0,
      connected: true,
      configured: true,
      gmailAccount: pickGmailDisplayAddress(accessToken ? "" : "", email) ?? email,
      lastSync,
      emails: snap?.emails ?? [],
      summary: emptySummary(lastSync ?? ""),
      hint: `Crée un libellé Gmail nommé exactement « ${GMAIL_LABEL} », puis synchronise.`,
    };
    if (snap) return NextResponse.json({ ...snap, connected: true, configured: true, gmailAccount, lastSync, hint: "Crée un libellé Gmail nommé exactement « " + GMAIL_LABEL + " », puis synchronise." });
    return NextResponse.json(payload);
  }

  let labelFound = true;
  const labelInfo = { id: label!.id, name: label!.name };

  let fetched: any;
  try {
    const fetched = await fetchLabelEmails(accessToken!, label!, {
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

    const emails: any[] = [];
    for (const em of fetched.emails) {
      const cp = await loadCheckpoint(em.id);
      if (cp?.status === "done" || cp?.status === "error" || cp?.status === "pending_retry") {
        const co = slimOffers(canonicalizeOffers(cp.offers ?? []));
        const finalStatus = cp.isOffer ? "detected" : (cp.error ? "analyze_error" : "no_offer");
        const detectionMethod = ((cp.detectedByCode ?? 0) > 0) ? "code" : (((cp.offers?.length ?? 0) > 0) ? "ia" : "none");
        const analysisResult = stampAnalysis({
          id: em.id,
          subject: em.subject,
          from: em.from,
          receivedAt: em.receivedAt,
          isOffer: cp.isOffer === true,
          reason: cp.reason ?? (cp.isOffer ? "Traité (checkpoint)" : "Aucune offre de stage identifiée"),
          finalStatus: cp.isOffer ? "detected" : (cp.error ? "analyze_error" : "no_offer"),
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
          detectionMethod: ((cp.detectedByCode ?? 0) > 0) ? "code" : (((cp.offers?.length ?? 0) > 0) ? "ia" : "none"),
          error: cp.error,
          checkpoint: {
            status: cp.status,
            retries: cp.retries ?? 0,
            at: cp.at,
            recoveryUsed: cp.recoveryUsed,
          },
        });
        emails.push(stampAnalysis(analysisResult));
      }
    }

    const catalogue = mergeCatalogue(snapR.status === "fulfilled" ? snapR.value?.emails ?? [] : [], emails);
    const summary = buildSummary(catalogue, null, fetched.total);
    const payload = {
      ok: true,
      labelFound: true,
      label: GMAIL_LABEL,
      totalInLabel: fetched.total,
      connected: true,
      configured: true,
      gmailAccount: pickGmailDisplayAddress(accessToken!, email),
      lastSync: null,
      emails: catalogue,
      summary,
      truncated: fetched.truncated === true,
    };
    await saveSnapshot(email, payload);
    return NextResponse.json(payload);
  } catch (e) {
    const h = humanizeGmailError(e);
    return NextResponse.json({
      ok: false,
      error: h.human,
      emails: [],
      labelFound: true,
      label: GMAIL_LABEL,
      totalInLabel: 0,
      connected: true,
      configured: true,
    }, { status: 502 });
  }
}