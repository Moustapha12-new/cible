/* Tests Module 4 — dashboard Alertes Gmail (helpers + render composants + API).
   Exécution : npx tsx src/lib/gmail-module4.test.ts
   Contrainte : ne modifie PAS gmail-core / gmail-enrich / sync route. */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSummary,
  emptySummary,
  emailVisualStatus,
  detectionMethodOf,
  formatLastSync,
  formatEmailDate,
  extractSender,
  senderLabel,
  progressPct,
  emailMetaRows,
  enrichBadge,
  humanizeReason,
  loadRunHist,
  saveRunHist,
  RUN_HIST_MAX,
  type RunHistEntry,
  parseSyncBody,
  parseDashboardQuery,
  stripHtml,
  shortUrl,
  extractLogoSrc,
  humanizeGmailError,
  loadLastRun,
  saveLastRun,
  etaMinutes,
  findVariantKeys,
  titleSimilarity,
  VARIANT_SIM_THRESHOLD,
  type LastRunStats,
  STATUS_GLYPH,
  STATUS_LABEL,
  METHOD_LABEL,
  type ProcessedEmail,
  slimOffers,
  loadPayloadCache,
  type RawOffer,
  analysisStateOf,
  analysisResultOf,
  stampAnalysis,
  isIndirectOfferUrl,
} from "./gmail-dashboard";
import { saveSnapshot, loadSnapshot, deleteSnapshot } from "./gmail-snapshot";
import StatusBadge from "@/components/alertes-gmail/StatusBadge";
import DetectionMethodBadge from "@/components/alertes-gmail/DetectionMethodBadge";
import LoadingState from "@/components/alertes-gmail/LoadingState";
import ErrorState from "@/components/alertes-gmail/ErrorState";
import EmptyState from "@/components/alertes-gmail/EmptyState";
import SyncSummaryCard from "@/components/alertes-gmail/SyncSummaryCard";
import OfferCard from "@/components/alertes-gmail/OfferCard";
import EmailDetail from "@/components/alertes-gmail/EmailDetail";
import EmailCard from "@/components/alertes-gmail/EmailCard";
import EmailList from "@/components/alertes-gmail/EmailList";
import RunHistory from "@/components/alertes-gmail/RunHistory";
import GmailConnectionStatus from "@/components/alertes-gmail/GmailConnectionStatus";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function assertEq(actual: unknown, expected: unknown, msg: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(
      `  ✗ ${msg}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
}

function makeOffer(over: Partial<RawOffer> = {}): RawOffer {
  return {
    title: "Stage Dev",
    company: "ACME",
    location: "Paris",
    contract: "Stage",
    duration: "6 mois",
    deadline: "2026-10-01",
    skills: ["TypeScript"],
    description: "Développement full-stack",
    applicationUrl: "https://example.com/job/1",
    source: "Indeed",
    sourceUrl: "https://example.com/src/1",
    anchorText: "Voir l'offre",
    snippet: "<div>Stage Dev…</div>",
    enrichStatus: "ok",
    ...over,
  };
}

function makeEmail(over: Partial<ProcessedEmail> = {}): ProcessedEmail {
  return {
    id: "em-1",
    subject: "Alerte stages du jour",
    from: "Jobs <jobs@linkedin.com>",
    receivedAt: "2026-09-23T10:00:00.000Z",
    isOffer: true,
    reason: "Extraction exhaustive par le code",
    finalStatus: "detected",
    offers: [makeOffer()],
    detectedByCode: 1,
    detectionMethod: "code",
    recoveryUsed: false,
    textLen: 1200,
    hasHtml: true,
    linksCount: 12,
    anchorsCount: 8,
    checkpoint: { status: "done", retries: 0, at: "2026-09-23T10:05:00.000Z" },
    ...over,
  };
}

async function main() {
  console.log("═".repeat(72));
  console.log("MODULE 4 — dashboard Alertes Gmail");
  console.log("═".repeat(72));

  /* ── M4-1 Helpers purs ─────────────────────────────────────── */

  console.log("\n[M4-1] Helpers — statuts, dates, progression");

  {
    const ok = makeEmail();
    const warn = makeEmail({ recoveryUsed: true });
    const err = makeEmail({
      finalStatus: "analyze_error",
      offers: [],
      error: "HTTP 503",
      checkpoint: { status: "error", retries: 1, at: "x" },
    });
    const empty = makeEmail({
      finalStatus: "no_offer",
      offers: [],
      isOffer: false,
      reason: "Aucune offre",
      checkpoint: { status: "done", retries: 0, at: "x" },
    });
    const pending = makeEmail({
      finalStatus: "no_offer",
      offers: [],
      checkpoint: { status: "pending", retries: 0, at: "" },
    });

    assertEq(emailVisualStatus(ok), "success", "détecté → success (✓)");
    assertEq(emailVisualStatus(warn), "success", "recoveryUsed → success (le chip recover porte l'alerte)");
    assertEq(emailVisualStatus(err), "error", "analyze_error → error (✖)");
    assertEq(emailVisualStatus(empty), "empty", "no_offer done → empty (○)");
    assertEq(emailVisualStatus(pending), "pending", "pending → pending (○)");
    const retry = makeEmail({
      finalStatus: "analyze_error",
      offers: [],
      error: "Gemini 429",
      checkpoint: { status: "pending_retry", retries: 2, at: "x" },
    });
    assertEq(emailVisualStatus(retry), "warning", "pending_retry → warning (⚠)");
    assertEq(STATUS_GLYPH.success, "✓", "glyphe succès");
    assertEq(STATUS_GLYPH.error, "✖", "glyphe erreur");
    /* P0-2 : les 5 états affichés. */
    assertEq(STATUS_LABEL.pending, "À synchroniser", "P0-2 libellé à synchroniser");
    assertEq(STATUS_LABEL.success, "Analysé — offre trouvée", "P0-2 libellé offre trouvée");
    assertEq(STATUS_LABEL.empty, "Analysé — aucune offre", "P0-2 libellé aucune offre");
    assertEq(STATUS_LABEL.warning, "À réessayer", "P0-2 libellé à réessayer");
    assertEq(STATUS_LABEL.error, "Erreur", "P0-2 libellé erreur");
  }

  /* P0-2 : analysisState (processus) distinct de analysisResult (contenu). */
  {
    const noCp = makeEmail({
      checkpoint: undefined,
      finalStatus: "no_offer",
      offers: [],
      isOffer: false,
    });
    assertEq(analysisStateOf(noCp), "to_sync", "sans checkpoint → to_sync");
    assertEq(analysisResultOf(noCp), null, "non analysé → résultat null");
    const pend = makeEmail({
      checkpoint: { status: "pending", retries: 0, at: "" },
      finalStatus: "no_offer",
      offers: [],
    });
    assertEq(analysisStateOf(pend), "to_sync", "pending → to_sync");
    assertEq(analysisResultOf(pend), null, "pending → résultat null (pas de faux résultat)");
    const rt = makeEmail({
      checkpoint: { status: "pending_retry", retries: 1, at: "x" },
      finalStatus: "analyze_error",
      offers: [],
      error: "429",
    });
    assertEq(analysisStateOf(rt), "retry", "pending_retry → retry (prioritaire sur analyze_error)");
    assertEq(analysisResultOf(rt), null, "retry → résultat null");
    const er = makeEmail({
      checkpoint: { status: "error", retries: 1, at: "x" },
      finalStatus: "analyze_error",
      offers: [],
      error: "boom",
    });
    assertEq(analysisStateOf(er), "error", "error → error");
    assertEq(analysisResultOf(er), null, "erreur → résultat null");
    const off = makeEmail();
    assertEq(analysisStateOf(off), "analyzed", "done → analyzed");
    assertEq(analysisResultOf(off), "offer", "détecté avec offres → offer");
    const none = makeEmail({
      checkpoint: { status: "done", retries: 0, at: "x" },
      finalStatus: "no_offer",
      offers: [],
      isOffer: false,
    });
    assertEq(analysisStateOf(none), "analyzed", "done → analyzed");
    assertEq(analysisResultOf(none), "none", "aucune offre → none");
    const stamped = stampAnalysis(noCp);
    assertEq(stamped.analysisState, "to_sync", "stampAnalysis attache analysisState");
    assertEq(stamped.analysisResult, null, "stampAnalysis attache analysisResult null");
    const explicit = makeEmail({ analysisState: "retry", analysisResult: null });
    assertEq(analysisStateOf(explicit), "retry", "champ explicite prioritaire sur la dérivation");
  }

  {
    assertEq(detectionMethodOf(makeEmail({ detectionMethod: undefined, detectedByCode: 2 })), "code", "method fallback code");
    assertEq(detectionMethodOf(makeEmail({ detectionMethod: "code+ia" })), "code+ia", "method explicite");
    assertEq(detectionMethodOf(makeEmail({ detectionMethod: undefined, detectedByCode: 0, offers: [makeOffer()] })), "ia", "method fallback ia");
    assert(METHOD_LABEL["code+ia"] === "Code + IA", "label Code + IA");
  }

  {
    assert(formatLastSync(null).includes("jamais"), "lastSync null → jamais");
    assert(formatLastSync("not-a-date").includes("jamais"), "lastSync invalide → jamais");
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 42).toISOString();
    assert(formatLastSync(today) === "Aujourd'hui à 16:42", `aujourd'hui 16:42 → ${formatLastSync(today)}`);
    const yesterday = new Date(now.getTime() - 86_400_000);
    yesterday.setHours(9, 14, 0, 0);
    assert(formatLastSync(yesterday.toISOString()).startsWith("Hier"), "hier → Hier à …");
    assert(formatEmailDate("2026-09-23T10:00:00Z").length >= 10, "formatEmailDate non vide");
    assertEq(extractSender("LinkedIn <jobs@linkedin.com>"), "jobs@linkedin.com", "extractSender angle brackets");
    assertEq(extractSender("plain@example.com"), "plain@example.com", "extractSender email nu");
    assertEq(senderLabel("Jobs <jobs@linkedin.com>"), "Linkedin", "senderLabel domaine → LinkedIn capitalisé");
  }

  {
    assertEq(progressPct(0, 0), 0, "progress 0/0 = 0");
    assertEq(progressPct(50, 100), 50, "progress 50/100 = 50");
    assertEq(progressPct(200, 100), 100, "progress plafond 100");
    assertEq(progressPct(-5, 100), 0, "progress plancher 0");
  }

  {
    const rows = emailMetaRows(makeEmail());
    assert(rows.some((r) => r.label === "detectionMethod" && r.value === "Code"), "meta detectionMethod=Code");
    assert(rows.some((r) => r.label === "recoveryUsed" && r.value === "non"), "meta recoveryUsed=non");
    assert(rows.some((r) => r.label === "checkpoint" && r.value.includes("done")), "meta checkpoint done");
    assertEq(enrichBadge("ok").label, "enrichie", "enrich badge ok → FR");
    assertEq(enrichBadge(undefined).label, "non enrichie", "enrich badge none → FR");
    assertEq(enrichBadge("partial").label, "enrichie (partielle)", "enrich badge partial → FR");
    assertEq(
      enrichBadge("blocked").label,
      "site protégé — réessai auto",
      "enrich badge blocked → FR"
    );
    assertEq(
      enrichBadge("skipped").label,
      "non enrichie (délai dépassé)",
      "enrich badge skipped → FR"
    );

    /* P2-1 : raison humanisée à l'affichage (le brut reste côté serveur). */
    assertEq(
      humanizeReason("Extraction code + IA (3 offre(s)) — JSON partiel récupéré"),
      "3 offres détectées avec l'aide de l'IA",
      "humanizeReason JSON partiel → phrase FR"
    );
    assertEq(
      humanizeReason("Extraction par le code (2 offre(s)) — analyse IA en échec"),
      "2 offres détectées sans l'IA (analyse en échec)",
      "humanizeReason échec IA → phrase FR"
    );
    assertEq(
      humanizeReason("Extraction par le code (1 offre(s))"),
      "Extraction par le code (1 offre(s))",
      "humanizeReason raison standard → inchangée"
    );
    assertEq(
      humanizeReason("Extraction code + IA (1 offre(s)) — JSON partiel récupéré"),
      "1 offre détectée avec l'aide de l'IA",
      "humanizeReason singulier"
    );
  }

  /* ── M4-2 buildSummary ─────────────────────────────────────── */

  console.log("\n[M4-2] buildSummary — agrégat résumé global");

  {
    const s0 = emptySummary();
    assertEq(s0.totalOffersDetected, 0, "emptySummary totalOffers=0");
    assertEq(s0.emailsProcessed, 0, "emptySummary emailsProcessed=0");

    const emails = [
      makeEmail({ offers: [makeOffer({ importStatus: "nouvelle" }), makeOffer({ importStatus: "doublon" })] }),
      makeEmail({
        id: "em-2",
        finalStatus: "no_offer",
        offers: [],
        isOffer: false,
        checkpoint: { status: "done", retries: 0, at: "x" },
      }),
      makeEmail({
        id: "em-3",
        finalStatus: "analyze_error",
        offers: [],
        error: "boom",
        checkpoint: { status: "error", retries: 1, at: "x" },
      }),
      makeEmail({
        id: "em-4",
        finalStatus: "analyze_error",
        offers: [],
        checkpoint: { status: "pending_retry", retries: 2, at: "x" },
      }),
      makeEmail({
        id: "em-5",
        finalStatus: "no_offer",
        offers: [],
        isOffer: false,
        checkpoint: { status: "pending", retries: 0, at: "" },
      }),
    ];
    const s = buildSummary(emails, "2026-09-23T12:00:00.000Z", 171);
    assertEq(s.emailsRead, 171, "summary.emailsRead = totalInLabel");
    assertEq(s.emailsProcessed, 2, "emailsProcessed = 2 done");
    assertEq(s.totalOffersDetected, 2, "totalOffers = 2");
    assertEq(s.newOffersImported, 1, "newOffersImported = 1");
    assertEq(s.duplicatesIgnored, 1, "duplicatesIgnored = 1");
    assertEq(s.noOfferVerified, 1, "noOfferVerified = 1");
    assertEq(s.errors, 1, "errors = 1 (checkpoint error)");
    assertEq(s.pendingRetry, 1, "pendingRetry = 1");
    assertEq(s.pending, 1, "pending = 1 (jamais traité, P0-2)");
    assert(s.lastSync.length > 0, "lastSync propagé");
  }

  /* ── M4-3 parseSyncBody / parseDashboardQuery (API contract) ─ */

  console.log("\n[M4-3] Contrat API — parseSyncBody + parseDashboardQuery");

  {
    const bad = parseSyncBody(null);
    assert(!bad.ok, "null → invalide");
    const noEmail = parseSyncBody({ action: "sync" });
    assert(!noEmail.ok && noEmail.status === 400, "sans email → 400");
    const ok = parseSyncBody({ email: " User@Example.COM ", action: "sync" });
    assert(ok.ok && ok.email === "user@example.com", "email trim lowercase");
    const re = parseSyncBody({ email: "a@b.c", action: "relaunch_errors" });
    assert(re.ok && re.action === "relaunch_errors", "relaunch_errors accepté");
    const one = parseSyncBody({ email: "a@b.c", action: "relaunch_email", emailId: "id-1" });
    assert(one.ok && one.action === "relaunch_email" && one.emailId === "id-1", "relaunch_email + id");
    const missId = parseSyncBody({ email: "a@b.c", action: "relaunch_email" });
    assert(!missId.ok, "relanche sans emailId → 400");
    const relOffer = parseSyncBody({
      email: "a@b.c",
      action: "relaunch_offer",
      emailId: "id-9",
    });
    assert(
      relOffer.ok && relOffer.action === "relaunch_offer" && relOffer.emailId === "id-9",
      "relaunch_offer + id accepté"
    );
    const missOfferId = parseSyncBody({ email: "a@b.c", action: "relaunch_offer" });
    assert(!missOfferId.ok, "relaunch_offer sans emailId → 400");
    const debug = parseSyncBody({ email: "a@b.c", debug: true, force: true });
    assert(debug.ok && debug.debug && debug.force, "debug + force");
  }

  {
    const q = parseDashboardQuery("?email=me@x.fr");
    assert(q.ok && q.email === "me@x.fr", "query email ok");
    const q2 = parseDashboardQuery("");
    assert(!q2.ok, "query sans email → erreur");
  }

  /* ── M4-4 Render composants ────────────────────────────────── */

  console.log("\n[M4-4] Render — composants du dashboard");

  {
    const html = renderToStaticMarkup(createElement(StatusBadge, { status: "success" }));
    assert(html.includes("✓") && html.includes("Analysé — offre trouvée"), "StatusBadge success");
    const html2 = renderToStaticMarkup(createElement(StatusBadge, { status: "error" }));
    assert(html2.includes("✖") && html2.includes("Erreur"), "StatusBadge error");
    const html3 = renderToStaticMarkup(createElement(StatusBadge, { status: "empty" }));
    assert(html3.includes("Analysé — aucune offre"), "StatusBadge empty = aucune offre");
    const html4 = renderToStaticMarkup(createElement(StatusBadge, { status: "pending" }));
    assert(html4.includes("À synchroniser"), "StatusBadge pending = à synchroniser");
    const html5 = renderToStaticMarkup(createElement(StatusBadge, { status: "warning" }));
    assert(html5.includes("À réessayer"), "StatusBadge warning = à réessayer");
  }

  {
    const c = renderToStaticMarkup(createElement(DetectionMethodBadge, { method: "code" }));
    assert(c.includes("Code"), "DetectionMethodBadge code");
    const i = renderToStaticMarkup(createElement(DetectionMethodBadge, { method: "ia" }));
    assert(i.includes("IA"), "DetectionMethodBadge ia");
    const b = renderToStaticMarkup(createElement(DetectionMethodBadge, { method: "code+ia" }));
    assert(b.includes("Code + IA"), "DetectionMethodBadge code+ia");
  }

  {
    const l = renderToStaticMarkup(createElement(LoadingState, null));
    assert(l.includes("animate-spin") && l.includes("data-testid=\"loading-state\""), "LoadingState présent");
    const e = renderToStaticMarkup(createElement(ErrorState, { message: "Boom" }));
    assert(e.includes("Boom") && e.includes("data-testid=\"error-state\""), "ErrorState message");
    const e2 = renderToStaticMarkup(
      createElement(ErrorState, { message: "Phrase FR.", detail: "Supabase PUT 500" })
    );
    assert(
      e2.includes("détails techniques") && e2.includes("Supabase PUT 500"),
      "ErrorState détail technique replié"
    );
    const emp = renderToStaticMarkup(createElement(EmptyState, null));
    assert(emp.includes("Aucun e-mail") || emp.includes("libellé"), "EmptyState texte");
  }

  {
    const s = renderToStaticMarkup(
      createElement(SyncSummaryCard, {
        summary: {
          emailsRead: 171,
          emailsProcessed: 142,
          totalOffersDetected: 489,
          newOffersImported: 300,
          duplicatesIgnored: 50,
          noOfferVerified: 90,
          errors: 4,
          pendingRetry: 2,
          pending: 3,
          lastSync: new Date().toISOString(),
        },
        totalInLabel: 171,
      })
    );
    assert(s.includes("data-testid=\"summary-card\""), "SyncSummaryCard card");
    assert(s.includes("data-testid=\"progress-bar\""), "SyncSummaryCard barre");
    assert(s.includes("171"), "SyncSummaryCard total 171");
    assert(s.includes("142"), "SyncSummaryCard traités 142");
    assert(s.includes("489"), "SyncSummaryCard offres 489");
    assert(s.includes("data-metric=\"errors\""), "métrique erreurs");
    assert(s.includes("data-metric=\"pending\""), "métrique pending");
    /* P0-2 : « En attente » = pending (3) + pending_retry (2) = 5. */
    const pendingTile = /data-metric="pending"[\s\S]{0,400}?tabular-nums[^>]*>(\d+)</.exec(s);
    assert(
      pendingTile !== null && pendingTile[1] === "5",
      `métrique En attente = pending+retry = 5 (obtenu ${pendingTile?.[1] ?? "n/a"})`
    );
    assert(s.includes("data-testid=\"cumul-scope\""), "métriques = total depuis le début");
    assert(!s.includes("data-testid=\"last-run-block\""), "sans lastRun → pas de bloc dernière synchro");
  }

  /* Étape 5 — humanize, dernière synchro persistée, ETA, progression run. */
  {
    const h1 = humanizeGmailError('Supabase PUT 500: {"error":"x"}');
    assert(
      h1.human.includes("stockage serveur") && h1.detail?.includes("Supabase PUT 500") === true,
      "humanize Supabase PUT"
    );
    const h2 = humanizeGmailError("KV HTTP 503");
    assert(h2.human.includes("cache serveur") && h2.detail === "KV HTTP 503", "humanize KV HTTP");
    const h3 = humanizeGmailError("HTTP 429 | réponse:{...}");
    assert(h3.human.includes("Limite de requêtes") && h3.detail !== undefined, "humanize 429");
    const h4 = humanizeGmailError(new Error("BLOB_READ_WRITE_TOKEN manquant"));
    assert(
      h4.human.includes("stockage serveur") && h4.detail?.includes("BLOB_READ_WRITE_TOKEN") === true,
      "humanize BLOB token"
    );
    const h5 = humanizeGmailError("fetch failed");
    assert(h5.human.includes("réseau") && h5.detail === "fetch failed", "humanize réseau");
    const h6 = humanizeGmailError("Gemini HTTP 503");
    assert(h6.human.includes("HTTP 503") && h6.detail === "Gemini HTTP 503", "humanize 503");
    const clean = "Une synchronisation est déjà en cours — réessaie dans quelques instants.";
    const h7 = humanizeGmailError(clean);
    assert(h7.human === clean && h7.detail === undefined, "déjà FR → pas de détail");
    const h8 = humanizeGmailError("");
    assert(h8.human.length > 0, "erreur vide → phrase par défaut");

    /* Étape 7 — quota IA : Gemini + 429 → phrase dédiée (P1-10). */
    const hq = humanizeGmailError("Gemini gemini-3.1-flash-lite HTTP 429 | réponse:{...}");
    assert(
      hq.human.includes("quota IA") && hq.detail?.includes("HTTP 429") === true,
      "humanize quota IA Gemini → phrase dédiée"
    );
    assert(
      humanizeGmailError("HTTP 429 | réponse:{...}").human.includes("Limite de requêtes"),
      "429 générique (hors Gemini) → texte conserve"
    );

    assert(etaMinutes(0, 100, 60_000) === null, "eta sans progression → null");
    assert(etaMinutes(50, 50, 60_000) === null, "eta run terminé → null");
    assert(etaMinutes(10, 100, 4_000) === null, "eta < 5 s → null");
    assert(etaMinutes(10, 110, 60_000) === 10, "eta extrapolation 10 min");

    const g = globalThis as { window?: unknown };
    const mem = new Map<string, string>();
    g.window = {
      localStorage: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
        removeItem: (k: string) => void mem.delete(k),
      },
    };
    const run: LastRunStats = {
      at: new Date().toISOString(),
      action: "sync",
      emailsRead: 10,
      processedThisRun: 4,
      totalOffersDetected: 9,
      newOffersImported: 6,
      duplicatesIgnored: 3,
      errors: 1,
      pendingRetry: 0,
      totalInLabel: 267,
      truncated: true,
      interrupted: false,
      remaining: 2,
    };
    saveLastRun("me@x.fr", run);
    const back = loadLastRun("me@x.fr");
    assert(
      back !== null && back.processedThisRun === 4 && back.truncated === true,
      "saveLastRun/loadLastRun roundtrip"
    );
    assert(loadLastRun("autre@x.fr") === null, "loadLastRun inconnu → null");
    delete g.window;
    assert(loadLastRun("me@x.fr") === null, "loadLastRun sans window → null");
  }

  {
    const base = {
      emailsRead: 171,
      emailsProcessed: 142,
      totalOffersDetected: 489,
      newOffersImported: 300,
      duplicatesIgnored: 50,
      noOfferVerified: 90,
      errors: 4,
      pendingRetry: 2,
      pending: 3,
      lastSync: new Date().toISOString(),
    };
    const withRun = renderToStaticMarkup(
      createElement(SyncSummaryCard, {
        summary: base,
        totalInLabel: 171,
        lastRun: {
          at: new Date().toISOString(),
          action: "sync",
          emailsRead: 10,
          processedThisRun: 4,
          totalOffersDetected: 9,
          newOffersImported: 6,
          duplicatesIgnored: 3,
          errors: 1,
          pendingRetry: 2,
          interrupted: true,
          remaining: 3,
          arrivedDuringRun: 1,
        } satisfies LastRunStats,
      })
    );
    assert(withRun.includes("data-testid=\"last-run-block\""), "SyncSummaryCard bloc dernière synchro");
    assert(withRun.includes("dernière synchro"), "étiquette dernière synchro");
    assert(withRun.includes("interrompu"), "chip run interrompu");
    assert(withRun.includes("+1 pendant la synchro"), "chip arrivés pendant le run");
    assert(withRun.includes("3 non traités"), "chip restants (pluriel réel)");

    const liveCard = renderToStaticMarkup(
      createElement(SyncSummaryCard, {
        summary: base,
        totalInLabel: 171,
        runProgress: { processed: 5, total: 100 },
        etaMin: 7,
      })
    );
    assert(liveCard.includes("data-testid=\"run-progress-line\""), "progression run N/M affichée");
    assert(liveCard.includes("5") && liveCard.includes("100"), "N sur M pendant le run");
    assert(liveCard.includes("≈ 7 min"), "ETA estimation affichée");
    assert(liveCard.includes("data-scope=\"run\""), "barre scopée au run en cours");
  }

  {
    const o = renderToStaticMarkup(createElement(OfferCard, { offer: makeOffer() }));
    assert(o.includes("Stage Dev"), "OfferCard titre");
    assert(o.includes("data-testid=\"btn-apply\""), "OfferCard bouton postuler");
    assert(o.includes("/app/adaptation"), "OfferCard Postuler → Module 03");
    assert(o.includes("data-testid=\"btn-detail\"") && o.includes("/app/alertes-gmail/offre"), "OfferCard Détail → page offre");
    assert(o.includes("data-testid=\"btn-external\""), "OfferCard lien externe secondaire");
    assert(o.includes("sourceUrl"), "OfferCard sourceUrl");
    assert(o.includes("anchorText"), "OfferCard anchorText");
    assert(o.includes("enrich"), "OfferCard enrich badge");
    assert(o.includes("TypeScript"), "OfferCard skills");
    assert(!o.includes("data-testid=\"indirect-badge\""), "OfferCard direct = pas de badge indirect");

    const indirectCard = renderToStaticMarkup(
      createElement(OfferCard, {
        offer: makeOffer({ applicationUrl: "https://engage.indeed.com/f/a/tok~~/x~/y" }),
      })
    );
    assert(
      indirectCard.includes("data-testid=\"indirect-badge\""),
      "OfferCard engage/cts → badge « Lien non direct »"
    );
    assert(indirectCard.includes("Lien non direct"), "OfferCard libellé indirect affiché");

    const flaggedCard = renderToStaticMarkup(
      createElement(OfferCard, {
        offer: makeOffer({ applicationUrl: "https://fr.indeed.com/pagead/clk?jrtk=x", indirect: true }),
      })
    );
    assert(
      flaggedCard.includes("data-testid=\"indirect-badge\""),
      "OfferCard champ indirect=true → badge affiché"
    );
  }

  {
    const withSummary = renderToStaticMarkup(
      createElement(OfferCard, {
        offer: makeOffer({
          summary: "Stage développement web 6 mois. Missions front React et API Node.",
          salary: "1 800 €/mois",
          keywords: ["react", "node"],
        }),
      })
    );
    assert(withSummary.includes("data-testid=\"offer-summary\""), "OfferCard résumé 3 phrases");
    assert(withSummary.includes("Stage développement web"), "OfferCard summary affiché");
    assert(withSummary.includes("1 800 €/mois"), "OfferCard salary affiché");
    assert(withSummary.includes("data-testid=\"offer-keywords\""), "OfferCard mots-clés ATS");
    assert(withSummary.includes("react"), "OfferCard keyword react");
  }

  /* Étape 4 — HTML brut → texte propre, logo, URL tronquée, aperçu 2-3 offres. */
  {
    const snippetOnly = renderToStaticMarkup(
      createElement(OfferCard, {
        offer: makeOffer({
          summary: "",
          description: "",
          snippet: "<table><tr><td>Stage <b>Dev</b> React</td></tr></table>",
        }),
      })
    );
    assert(
      snippetOnly.includes("data-testid=\"offer-snippet\""),
      "snippet rendu sous texte propre"
    );
    assert(snippetOnly.includes("Stage Dev React"), "tags retirés (texte lisible)");
    assert(snippetOnly.includes("origine"), "HTML brut conservé en accordéon technique");

    const logoOffer = renderToStaticMarkup(
      createElement(OfferCard, {
        offer: makeOffer({
          summary: "",
          description: "",
          snippet: '<img src="https://cdn.acme.com/logo.png" width="120"><div>Offre</div>',
        }),
      })
    );
    assert(
      logoOffer.includes("https://cdn.acme.com/logo.png"),
      "logo <img> extrait du HTML du mail"
    );
    assert(logoOffer.includes("alt=\"ACME\""), "logo alt = entreprise");

    assert(
      extractLogoSrc('<img src="https://x.com/logo.svg">') === "https://x.com/logo.svg",
      "extractLogoSrc accepte https"
    );
    assert(
      extractLogoSrc('<img src="https://t.com/pixel.gif?u=1">') === null,
      "extractLogoSrc refuse pixel de tracking"
    );
    assert(
      extractLogoSrc('<img src="data:image/png;base64,xx">') === null,
      "extractLogoSrc refuse data:"
    );
    assert(extractLogoSrc(undefined) === null, "extractLogoSrc undefined → null");

    assert(stripHtml("<div>Stage <b>Dev</b></div>") === "Stage Dev", "stripHtml retire les tags");
    assert(stripHtml("A&nbsp;&amp;&nbsp;B") === "A & B", "stripHtml décode les entités");
    assert(stripHtml("Ing&#xE9;nieur") === "Ingénieur", "stripHtml décode les entières hexa (P0-1)");
    assert(stripHtml("caf&#233;") === "café", "stripHtml décode les entières décimales (P0-1)");
    assert(stripHtml("") === "", "stripHtml vide → vide");

    const long =
      "https://www.linkedin.com/jobs/view/1234567890/?trk=email&utm_source=alerte&lipi=x%3Ay&refId=abcdef";
    assert(
      shortUrl(long).includes("…") && shortUrl(long).length < long.length,
      "shortUrl tronque les URLs longues"
    );
    assert(shortUrl("https://x.com/a") === "https://x.com/a", "shortUrl conserve les URLs courtes");

    const many = renderToStaticMarkup(
      createElement(EmailCard, {
        email: makeEmail({
          offers: [1, 2, 3, 4].map((i) =>
            makeOffer({ title: `Offre ${i}`, applicationUrl: `https://x.com/${i}` })
          ),
        }),
        expanded: false,
        onToggle: () => {},
      })
    );
    const items = (many.match(/offer-preview-item/g) || []).length;
    assert(items === 3, `aperçu plafonné à 3 offres, obtenu ${items}`);
    assert(many.includes("Voir les 4 offres"), "bouton « Voir les N » présent");
    assert(many.includes("Postuler ↗"), "aperçu Postuler → lien externe");
  }

  {
    const noUrl = renderToStaticMarkup(
      createElement(OfferCard, { offer: makeOffer({ applicationUrl: "" }) })
    );
    assert(noUrl.includes("data-testid=\"btn-apply\""), "OfferCard sans URL → CTA Module 03");
    assert(!noUrl.includes("data-testid=\"btn-external\""), "OfferCard sans URL → pas de Site ↗");
  }

  {
    const d = renderToStaticMarkup(createElement(EmailDetail, { email: makeEmail() }));
    assert(d.includes("data-testid=\"email-detail\""), "EmailDetail présent");
    assert(
      !d.includes("Alerte stages du jour"),
      "P2-2 : en-tête dupliqué supprimé (sujet vit dans EmailCard)"
    );
    assert(d.includes("data-testid=\"offer-card\""), "EmailDetail contient OfferCard");
    assert(d.includes("observabilité"), "EmailDetail métadonnées");
    assert(
      !d.includes("jobs@linkedin.com"),
      "P2-2 : expéditeur supprimé de EmailDetail (affiché par EmailCard)"
    );

    const empty = renderToStaticMarkup(
      createElement(EmailDetail, {
        email: makeEmail({ finalStatus: "no_offer", offers: [], reason: "Aucune offre de stage identifiée" }),
      })
    );
    assert(empty.includes("Aucune offre de stage identifiée"), "EmailDetail sans offre");
  }

  {
    const c = renderToStaticMarkup(
      createElement(EmailCard, {
        email: makeEmail(),
        expanded: false,
        onToggle: () => {},
      })
    );
    assert(c.includes("data-testid=\"email-card\""), "EmailCard présent");
    assert(c.includes("data-testid=\"btn-details\""), "EmailCard bouton Technique");
    assert(c.includes("data-testid=\"offer-count\""), "EmailCard badge offres");
    assert(c.includes("data-status=\"success\""), "EmailCard statut success");
    assert(
      !c.includes("data-testid=\"email-detail\""),
      "EmailCard repliée → détail masqué (aperçu à la place)"
    );
    assert(
      !c.includes("data-testid=\"offer-card\""),
      "EmailCard repliée → carte offre complète masquée"
    );
    assert(
      c.includes("data-testid=\"offer-preview\""),
      "EmailCard aperçu offres visible sans clic"
    );
    assert(
      c.includes("data-testid=\"btn-apply\""),
      "EmailCard aperçu Postuler visible sans clic"
    );
    assert(
      c.includes("Stage Dev") && c.includes("ACME"),
      "aperçu affiche titre · entreprise"
    );
    assert(!c.includes("observabilité"), "EmailCard masque observabilité tant que repliée");

    const errCard = renderToStaticMarkup(
      createElement(EmailCard, {
        email: makeEmail({
          finalStatus: "analyze_error",
          offers: [],
          error: "Gemini HTTP 503",
          checkpoint: { status: "error", retries: 1, at: "x" },
        }),
        expanded: false,
        onToggle: () => {},
        onRelaunch: () => {},
      })
    );
    assert(errCard.includes("Gemini HTTP 503"), "EmailCard affiche l'erreur (raw en détail)");
    assert(
      errCard.includes("Service momentanément indisponible"),
      "EmailCard erreur humanisée (phrase FR)"
    );
    assert(errCard.includes("détails techniques"), "EmailCard détail technique replié");
    assert(errCard.includes("btn-relaunch-email"), "EmailCard bouton relancer");

    const openCard = renderToStaticMarkup(
      createElement(EmailCard, {
        email: makeEmail(),
        expanded: true,
        onToggle: () => {},
      })
    );
    assert(openCard.includes("observabilité"), "EmailCard technique déplié → observabilité");
    assert(openCard.includes("data-testid=\"offer-card\""), "EmailCard offre visible avec technique");
  }

  /* Étape 6 — P1-4 : bouton de relance ciblée d'enrichissement. */
  {
    const retryCard = renderToStaticMarkup(
      createElement(EmailCard, {
        email: makeEmail({
          offers: [makeOffer({ enrichStatus: "blocked", enrichReason: "anti-robot" })],
        }),
        expanded: false,
        onToggle: () => {},
        onRelaunchOffer: () => {},
      })
    );
    assert(retryCard.includes("btn-relance-offer"), "offre blocked → bouton relance enrich.");
    assert(
      retryCard.includes("Relancer enrich. (1)"),
      "libellé porte le nombre d'offres à retenter"
    );

    const noCb = renderToStaticMarkup(
      createElement(EmailCard, {
        email: makeEmail({
          offers: [makeOffer({ enrichStatus: "blocked" })],
        }),
        expanded: false,
        onToggle: () => {},
      })
    );
    assert(
      !noCb.includes("btn-relance-offer"),
      "sans callback → pas de bouton relance enrich."
    );

    const okCard = renderToStaticMarkup(
      createElement(EmailCard, {
        email: makeEmail(),
        expanded: false,
        onToggle: () => {},
        onRelaunchOffer: () => {},
      })
    );
    assert(
      !okCard.includes("btn-relance-offer"),
      "enrichStatus ok → pas de relance proposée"
    );

    const partialCard = renderToStaticMarkup(
      createElement(EmailCard, {
        email: makeEmail({
          offers: [makeOffer({ enrichStatus: "partial" }), makeOffer({ enrichStatus: "skipped" })],
        }),
        expanded: false,
        onToggle: () => {},
        onRelaunchOffer: () => {},
      })
    );
    assert(
      partialCard.includes("Relancer enrich. (2)"),
      "partial + skipped comptés dans la relance"
    );
  }

  {
    const list = renderToStaticMarkup(
      createElement(EmailList, {
        emails: [makeEmail(), makeEmail({ id: "em-2", subject: "Deuxième" })],
        expandedId: null,
        onToggle: () => {},
      })
    );
    assert(list.includes("data-testid=\"email-list\""), "EmailList présent");
    assert((list.match(/data-testid=\"email-card\"/g) || []).length === 2, "EmailList 2 cartes");

    const emptyList = renderToStaticMarkup(
      createElement(EmailList, { emails: [], expandedId: null, onToggle: () => {} })
    );
    assert(emptyList.includes("data-testid=\"empty-state\"") || emptyList.includes("libellé"), "EmailList vide → EmptyState");
  }

  /* Étape 7 — P1-8/P1-9 : zone d'actions unique, primaire dynamique,
     spinner de vérification, Reconnecter / Déconnecter distincts. */
  {
    const btnOf = (html: string, testid: string) => {
      const m = new RegExp(
        `<button[^>]*data-testid="${testid}"[\\s\\S]*?<\\/button>`
      ).exec(html);
      return m ? m[0] : "";
    };
    const base = {
      checking: false,
      connected: true,
      configured: true,
      gmailAccount: "moustaled.53@gmail.com",
    };
    const noop = () => {};

    const withErr = renderToStaticMarkup(
      createElement(GmailConnectionStatus, {
        conn: base,
        lastSync: null,
        syncing: false,
        errorCount: 3,
        onConnect: noop,
        onSync: noop,
        onRelaunchErrors: noop,
        onDisconnect: noop,
      })
    );
    assert(
      withErr.includes("Relancer les 3 e-mails en erreur"),
      "primaire dynamique : libellé « Relancer les N e-mails en erreur »"
    );
    assert(
      btnOf(withErr, "btn-relaunch-errors").includes("btn-primary"),
      "erreurs > 0 → relance = primaire"
    );
    assert(btnOf(withErr, "btn-sync").includes("btn-line"), "erreurs > 0 → sync = secondaire");
    assert(
      withErr.includes("data-testid=\"btn-reconnect\"") &&
        withErr.includes("data-testid=\"btn-disconnect\""),
      "Reconnecter et Déconnecter = 2 boutons distincts (P1-9)"
    );
    assert(!withErr.includes("Déconnecter / relier"), "ancien libellé fourre-tout supprimé");
    assert(withErr.includes("data-testid=\"actions-zone\""), "zone d'actions unique balisée");

    const noErr = renderToStaticMarkup(
      createElement(GmailConnectionStatus, {
        conn: base,
        lastSync: null,
        syncing: false,
        errorCount: 0,
        onConnect: noop,
        onSync: noop,
        onRelaunchErrors: noop,
        onDisconnect: noop,
      })
    );
    assert(btnOf(noErr, "btn-sync").includes("btn-primary"), "0 erreur → sync = primaire");
    assert(
      btnOf(noErr, "btn-relaunch-errors").includes("disabled") &&
        noErr.includes("Aucune erreur à relancer"),
      "0 erreur → relance désactivée + libellé explicite"
    );

    const checking = renderToStaticMarkup(
      createElement(GmailConnectionStatus, {
        conn: { checking: true, connected: false, configured: true },
        lastSync: null,
        syncing: false,
        onConnect: noop,
        onSync: noop,
        onRelaunchErrors: noop,
      })
    );
    assert(
      checking.includes("data-state=\"checking\"") &&
        checking.includes("Vérification de la connexion"),
      "état vérification = spinner + libellé (trou visuel comblé)"
    );

    const off = renderToStaticMarkup(
      createElement(GmailConnectionStatus, {
        conn: { checking: false, connected: false, configured: true },
        lastSync: null,
        syncing: false,
        onConnect: noop,
        onSync: noop,
        onRelaunchErrors: noop,
      })
    );
    assert(
      (off.match(/data-testid="btn-connect"/g) || []).length === 1,
      "non connecté → 1 seul bouton Connecter (pas de doublon)"
    );
    assert(!off.includes("btn-sync"), "non connecté → pas de bouton Synchroniser");
  }

  /* ── M4-5 Fichiers page / route ────────────────────────────── */

  console.log("\n[M4-5] Structure fichiers Module 4");

  {
    const root = process.cwd();
    const files = [
      "src/app/app/alertes-gmail/page.tsx",
      "src/app/app/alertes-gmail/offre/page.tsx",
      "src/app/api/gmail/dashboard/route.ts",
      "src/lib/gmail-dashboard.ts",
      "src/lib/gmail-bridge.ts",
      "src/components/alertes-gmail/AlertesGmailDashboard.tsx",
      "src/components/alertes-gmail/GmailConnectionStatus.tsx",
      "src/components/alertes-gmail/SyncSummaryCard.tsx",
      "src/components/alertes-gmail/EmailList.tsx",
      "src/components/alertes-gmail/EmailCard.tsx",
      "src/components/alertes-gmail/EmailDetail.tsx",
      "src/components/alertes-gmail/OfferCard.tsx",
      "src/components/alertes-gmail/StatusBadge.tsx",
      "src/components/alertes-gmail/DetectionMethodBadge.tsx",
      "src/components/alertes-gmail/LoadingState.tsx",
      "src/components/alertes-gmail/ErrorState.tsx",
      "src/components/alertes-gmail/EmptyState.tsx",
    ];
    for (const f of files) {
      assert(existsSync(join(root, f)), `fichier présent — ${f}`);
    }
    const page = readFileSync(join(root, "src/app/app/alertes-gmail/page.tsx"), "utf8");
    assert(page.includes("AlertesGmailDashboard"), "page importe AlertesGmailDashboard");
    assert(page.includes("Metadata") || page.includes("metadata"), "page exporte metadata");
    const route = readFileSync(join(root, "src/app/api/gmail/dashboard/route.ts"), "utf8");
    assert(route.includes("export async function GET"), "route dashboard exporte GET");
    assert(!route.includes("processEmail("), "GET ne lance pas processEmail (lecture seule)");
    const pageClient = readFileSync(
      join(root, "src/components/alertes-gmail/AlertesGmailDashboard.tsx"),
      "utf8"
    );
    assert(pageClient.includes("\"use client\""), "dashboard = client component");
    assert(pageClient.includes("/api/gmail/dashboard"), "dashboard appelle GET dashboard");
    assert(pageClient.includes("/api/gmail/sync"), "dashboard appelle POST sync");
    assert(pageClient.includes("/api/gmail/progress"), "dashboard poll GET progress (P0-9)");
    assert(pageClient.includes("relaunch_errors"), "action relaunch_errors présente");
    assert(pageClient.includes("relaunch_email"), "action relaunch_email présente");
    assert(pageClient.includes("relaunch_offer"), "action relaunch_offer présente (P1-4)");
    assert(
      pageClient.includes("Enrichissement relancé"),
      "toast relance enrichissement avec compteur"
    );
    assert(
      existsSync(join(root, "src/app/api/gmail/progress/route.ts")),
      "fichier présent — src/app/api/gmail/progress/route.ts"
    );
    const coreSrc = readFileSync(join(root, "src/lib/gmail-core.ts"), "utf8");
    assert(coreSrc.includes("gmail:progress:"), "runSync écrit la clé de progression");
    assert(coreSrc.includes("beginCheckpointCache"), "cache checkpoints borné (P1-3)");
    assert(coreSrc.includes("retryOnly"), "relance enrichissement retryOnly (P1-4)");
    assert(coreSrc.includes("analyse IA en échec"), "échec IA partiel propagé (P1-5)");
    const syncRoute = readFileSync(join(root, "src/app/api/gmail/sync/route.ts"), "utf8");
    assert(syncRoute.includes("humanizeGmailError"), "route sync humanise les erreurs");
    assert(syncRoute.includes("relaunch_offer"), "route sync accepte relaunch_offer");
    assert(syncRoute.includes("enrichOnly"), "route sync bascule enrichOnly");

    /* Étape 7 — P1-8 : plus de doublons d'actions, bandeaux et états. */
    assert(!pageClient.includes("btn-sync-2"), "plus de 2e bouton Synchroniser (P1-8)");
    assert(!pageClient.includes("btn-relaunch-all"), "plus de 2e bouton Relancer (P1-8)");
    assert(
      !pageClient.includes("btn-connect-empty"),
      "carte connexion sans bouton Connecter en double (P1-8)"
    );
    assert(pageClient.includes("new-arrivals-banner"), "bandeau nouveaux e-mails (P1-10)");
    assert(pageClient.includes("btn-sync-arrivals"), "bandeau = CTA Synchroniser");
    assert(pageClient.includes("no-offers-global"), "état aucune offre globale (P1-10)");
    assert(pageClient.includes("Aucun nouvel e-mail"), "toast aucun nouvel e-mail (P1-10)");
    assert(pageClient.includes("onDisconnect"), "dashboard branche Déconnecter (P1-9)");
    assert(pageClient.includes("/api/gmail/disconnect"), "dashboard appelle DELETE disconnect");
    const connStatusSrc = readFileSync(
      join(root, "src/components/alertes-gmail/GmailConnectionStatus.tsx"),
      "utf8"
    );
    assert(
      connStatusSrc.includes('data-testid="btn-disconnect"'),
      "GmailConnectionStatus a un vrai bouton Déconnecter (P1-9)"
    );
    assert(
      connStatusSrc.includes("actions-zone"),
      "zone d'actions unique dans le header (P1-8)"
    );
    const disconnectRoute = readFileSync(
      join(root, "src/app/api/gmail/disconnect/route.ts"),
      "utf8"
    );
    assert(
      disconnectRoute.includes('searchParams.get("email")'),
      "disconnect accepte ?email= (plus de compte figé)"
    );
    assert(
      disconnectRoute.includes("deleteOauthConnection(email)"),
      "disconnect supprime le jeton du compte demandé"
    );
    const enrichSrc = readFileSync(join(root, "src/lib/gmail-enrich.ts"), "utf8");
    assert(
      enrichSrc.includes("relaunch_offer"),
      "isCacheableEnrichResult ne fige plus les blocked (P1-4)"
    );
  }

  /* Étape 8 — P1-6 : similarité titre + badge « variante probable » (UI). */
  {
    assertEq(VARIANT_SIM_THRESHOLD, 0.9, "seuil variante = 0.9");

    const same = titleSimilarity(
      "Stage Développeur Back-end (H/F)",
      "Stage Developpeur Back-end H/F"
    );
    assert(same >= 0.9, `titres accentués/parenthèses quasi identiques ≥ 0.9, obtenu ${same.toFixed(3)}`);
    const near = titleSimilarity(
      "Stage Développeur Back-end (H/F) - Paris",
      "Stage Développeur Back-end H/F"
    );
    assert(near >= 0.9, `variante mineure ≥ 0.9, obtenu ${near.toFixed(3)}`);
    const diff = titleSimilarity("Stage Marketing Digital", "Stage Développeur Frontend");
    assert(diff < 0.9, `titres différents < 0.9, obtenu ${diff.toFixed(3)}`);

    /* findVariantKeys : titres proches + URLs différentes → les 2 clés badgées. */
    const variants = findVariantKeys([
      {
        id: "emA",
        offers: [
          {
            title: "Stage Développeur Back-end (H/F)",
            applicationUrl: "https://www.linkedin.com/jobs/view/111/",
          },
        ],
      },
      {
        id: "emB",
        offers: [
          {
            title: "Stage Developpeur Back-end H/F",
            applicationUrl: "https://www.linkedin.com/jobs/view/222/",
          },
          { title: "Stage Marketing", applicationUrl: "https://other.com/m/9" },
        ],
      },
    ]);
    assert(variants.has("emA#0"), "variante 1 badgée");
    assert(variants.has("emB#0"), "variante 2 badgée");
    assert(!variants.has("emB#1"), "offre distincte non badgée");

    /* Même URL = même offre → jamais « variante ». */
    const sameUrl = findVariantKeys([
      { id: "e1", offers: [{ title: "Stage Dev Fullstack", applicationUrl: "https://x.com/j/1" }] },
      { id: "e2", offers: [{ title: "Stage Dev Fullstack", applicationUrl: "https://x.com/j/1" }] },
    ]);
    assert(sameUrl.size === 0, "même URL → jamais variante");

    /* Titres trop courts ignorés (faux positifs). */
    const short = findVariantKeys([
      { id: "e1", offers: [{ title: "Stage", applicationUrl: "https://x.com/j/1" }] },
      { id: "e2", offers: [{ title: "Stage", applicationUrl: "https://x.com/j/2" }] },
    ]);
    assert(short.size === 0, "titre court → pas de variante");

    /* Render : badge présent/absent selon isVariant. */
    const withBadge = renderToStaticMarkup(
      createElement(OfferCard, { offer: makeOffer(), isVariant: true })
    );
    assert(withBadge.includes("variant-badge"), "OfferCard badge variante (isVariant)");
    assert(withBadge.includes("variante probable"), "OfferCard libellé « variante probable »");
    const noBadge = renderToStaticMarkup(createElement(OfferCard, { offer: makeOffer() }));
    assert(!noBadge.includes("variant-badge"), "sans isVariant → pas de badge");

    /* EmailDetail propage la clé ${emailId}#${index} au bon OfferCard. */
    const detail = renderToStaticMarkup(
      createElement(EmailDetail, {
        email: makeEmail({ offers: [makeOffer({ title: "A" }), makeOffer({ title: "B" })] }),
        variantKeys: new Set(["em-1#1"]),
      })
    );
    const cards = detail.split("variant-badge");
    assertEq(cards.length, 2, "exactement 1 badge dans EmailDetail (2e offre)");
  }

  /* Étape 8 — P1-6 : clés gelées + ingestion dual-format (sources). */
  {
    const root = process.cwd();
    const coreSrc = readFileSync(join(root, "src/lib/gmail-core.ts"), "utf8");
    assert(coreSrc.includes("dedupUrlKey"), "gmail-core expose dedupUrlKey (RawOffer)");
    assert(coreSrc.includes("dedupTclKey"), "gmail-core expose dedupTclKey (RawOffer)");
    assert(
      coreSrc.includes("const urlKey = offer.dedupUrlKey || importUrlKey"),
      "classifyImportOffer préfère la clé gelée"
    );
    assert(
      coreSrc.includes("jk:${jobKey}"),
      "importUrlKey priorise l'identifiant plateforme (jk:)"
    );
    const clientSrc = readFileSync(join(root, "src/lib/gmail-client.ts"), "utf8");
    assert(clientSrc.includes("off.dedupUrlKey"), "ingest lit la clé URL gelée");
    assert(clientSrc.includes("legacyUrlKey"), "ingest garde la clé legacy (transition)");
    const listSrc = readFileSync(
      join(root, "src/components/alertes-gmail/EmailList.tsx"),
      "utf8"
    );
    assert(listSrc.includes("findVariantKeys"), "EmailList calcule les variantes (page visible)");
    assert(listSrc.includes("email-list-more"), "EmailList propose la pagination (P0-5)");
  }

  /* Étape 11 — P0-4/P0-5 : snapshot serveur, payload allégé, cache client,
     endpoints fusionnés, offres complètes régénérées à la demande. */
  {
    const root = process.cwd();
    const route = readFileSync(join(root, "src/app/api/gmail/dashboard/route.ts"), "utf8");
    assert(route.includes("loadSnapshot"), "dashboard sert le snapshot (P0-4)");
    assert(route.includes("saveSnapshot"), "dashboard persiste le snapshot (P0-4)");
    assert(route.includes('get("fresh")'), "dashboard lit ?fresh=1 (reconstruction post-sync)");
    assert(route.includes("slimOffers"), "dashboard allège le payload (P0-5)");
    assert(route.includes("Promise.allSettled"), "token + OAuth en parallèle (Promise.allSettled)");

    const snapPath = "src/lib/gmail-snapshot.ts";
    assert(existsSync(join(root, snapPath)), "gmail-snapshot.ts créé");
    const snapSrc = readFileSync(join(root, snapPath), "utf8");
    assert(snapSrc.includes("gmail:snapshot:"), "clé snapshot conforme à la spec (P0-4)");

    const detailPath = "src/app/api/gmail/offer-detail/route.ts";
    assert(existsSync(join(root, detailPath)), "route offer-detail créée (P0-5)");
    const detailSrc = readFileSync(join(root, detailPath), "utf8");
    assert(detailSrc.includes("loadCheckpoint"), "offer-detail relit le checkpoint");

    const disconnectSrc = readFileSync(
      join(root, "src/app/api/gmail/disconnect/route.ts"),
      "utf8"
    );
    assert(disconnectSrc.includes("deleteSnapshot"), "déconnexion purge le snapshot");

    const helpers = readFileSync(join(root, "src/lib/gmail-dashboard.ts"), "utf8");
    assert(helpers.includes("export function slimOffers"), "slimOffers exposé (P0-5)");
    assert(helpers.includes("cible:gmail:payload:v1:"), "clé cache client payload exposée (P0-4)");

    const clientSrc = readFileSync(
      join(root, "src/components/alertes-gmail/AlertesGmailDashboard.tsx"),
      "utf8"
    );
    assert(!clientSrc.includes("/api/gmail/status"), "plus d'appel /api/gmail/status (fusion)");
    assert(clientSrc.includes("loadPayloadCache"), "boot lit le cache local (affichage immédiat)");
    assert(clientSrc.includes("refreshDashboard(true)"), "post-sync force la reconstruction fresh");
    assert(clientSrc.includes("swr-refreshing"), "spinner de mise à jour en arrière-plan");

    const edSrc = readFileSync(join(root, "src/components/alertes-gmail/EmailDetail.tsx"), "utf8");
    assert(
      edSrc.includes("/api/gmail/offer-detail"),
      "EmailDetail régénère les offres complètes à l'ouverture"
    );
    const offSrc = readFileSync(
      join(root, "src/app/app/alertes-gmail/offre/page.tsx"),
      "utf8"
    );
    assert(offSrc.includes("/api/gmail/offer-detail"), "page offre régénère l'offre complète");

    /* slimOffers : snippet + sourceUrl sortis, le reste intact. */
    const slim = slimOffers([makeOffer()]);
    assert(
      slim[0].snippet === undefined && slim[0].sourceUrl === undefined,
      "slimOffers retire snippet + sourceUrl"
    );
    assert(
      slim[0].title === "Stage Dev" && slim[0].applicationUrl === "https://example.com/job/1",
      "slimOffers conserve le reste"
    );
    assert(Array.isArray(slim[0].skills) && slim[0].skills.length === 1, "slimOffers conserve les skills");

    /* Cache payload : sans localStorage (node), gracieusement absent. */
    assert(loadPayloadCache("p0-4@test.local") === null, "loadPayloadCache gracieux sans localStorage");

    /* Roundtrip snapshot sur le stockage réel (local en test). */
    const testEmail = `p0-4-snap-${Date.now()}@test.local`;
    await saveSnapshot(testEmail, {
      ok: true,
      labelFound: true,
      label: "Test",
      totalInLabel: 1,
      connected: true,
      configured: true,
      emails: [makeEmail()],
      summary: emptySummary(),
    });
    const back = await loadSnapshot(testEmail);
    assert(
      back !== null && back.fromSnapshot === true && back.emails.length === 1,
      "roundtrip snapshot : écrit puis relu"
    );
    await deleteSnapshot(testEmail);
    assertEq(await loadSnapshot(testEmail), null, "deleteSnapshot purge le snapshot");
  }

  /* Étape 9 — P2 : textes FR, doublons, états, CSS (renders + sources). */
  {
    const root = process.cwd();

    /* P2-5 : CTA première synchro sur l'état vide. */
    const es = renderToStaticMarkup(
      createElement(EmptyState, {
        action: { label: "Première synchro (~8 min)", onClick: () => {} },
      })
    );
    assert(es.includes("btn-first-sync"), "EmptyState accepte le CTA première synchro");
    assert(es.includes("Première synchro (~8 min)"), "EmptyState affiche le libellé du CTA");
    const esNoCta = renderToStaticMarkup(createElement(EmptyState, null));
    assert(!esNoCta.includes("btn-first-sync"), "sans action → pas de CTA");
    const listEmpty = renderToStaticMarkup(
      createElement(EmailList, {
        emails: [],
        expandedId: null,
        onToggle: () => {},
        onFirstSync: () => {},
      })
    );
    assert(listEmpty.includes("btn-first-sync"), "EmailList vide propage le CTA (P2-5)");

    /* P2-13 + P2-2 : EmailCard affiche le libellé expéditeur, plus le faux statut. */
    const card = renderToStaticMarkup(
      createElement(EmailCard, {
        email: makeEmail({ finalStatus: "no_offer", offers: [] }),
        expanded: false,
        onToggle: () => {},
      })
    );
    assert(card.includes("Linkedin"), "P2-13 : EmailCard affiche senderLabel");
    assert(card.includes("jobs@linkedin.com"), "P2-13 : adresse complète conservée (title)");
    assert(
      !card.includes("text-muted italic"),
      "P2-2 : ligne « Sans offre » doublon de StatusBadge supprimée"
    );

    /* P2-1 : chip enrich sans préfixe jargon. */
    const oc = renderToStaticMarkup(createElement(OfferCard, { offer: makeOffer() }));
    assert(oc.includes("enrichie"), "P2-1 : libellé enrich en français");
    assert(!oc.includes("enrich ·"), "P2-1 : préfixe « enrich · » supprimé");
    assert(!oc.includes("data-method"), "P2-2 : faux badge méthode supprimé de OfferCard");

    /* P2-1/P2-5 : dashboard + EmailDetail branchés. */
    const dashSrc = readFileSync(
      join(root, "src/components/alertes-gmail/AlertesGmailDashboard.tsx"),
      "utf8"
    );
    assert(dashSrc.includes("onFirstSync"), "P2-5 : dashboard branche le CTA première synchro");
    assert(dashSrc.includes("Synchro terminée"), "P2-1 : toast synthèse en français");
    assert(dashSrc.includes("nfr("), "P2-1 : pluriels réels dans les toasts");
    const detailSrc = readFileSync(
      join(root, "src/components/alertes-gmail/EmailDetail.tsx"),
      "utf8"
    );
    assert(detailSrc.includes("humanizeReason"), "P2-1 : EmailDetail humanise la raison");

    /* P2-4/P2-7/P2-10/P2-8/P2-5 : CSS. */
    const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
    assert(css.includes(".btn-line.btn-sm"), "P2-4 : variante btn-line échelle 42px");
    assert(css.includes("--muted: #736c5f"), "P2-10 : contraste muted relevé");
    assert(css.includes("--color-violet: var(--violet)"), "P2-8 : jeton violet = violet réel");
    assert(css.includes("--violet: #5f4fd6"), "P2-8 : racine --violet définie (Resources.tsx)");
    assert(css.includes("max-width: min(92vw, 44rem)"), "P2-5 : toast autorisé à retourner");
    assert(
      css.includes(".btn-primary:disabled") && css.includes("opacity: 0.55"),
      "P2-7 : état disabled visible"
    );

    /* P2-9 : états de chargement des pages (candidatures/adaptation interdites = non modifiées). */
    for (const p of [
      "src/app/app/lettres/page.tsx",
      "src/app/app/cv/page.tsx",
      "src/app/app/recruteurs/page.tsx",
      "src/app/app/cv/builder/page.tsx",
    ]) {
      const src = readFileSync(join(root, p), "utf8");
      assert(src.includes("<LoadingState />"), `P2-9 : ${p} rend <LoadingState />`);
    }
    const builderSrc = readFileSync(join(root, "src/app/app/cv/builder/page.tsx"), "utf8");
    assert(
      builderSrc.includes("if (!cv) return null;"),
      "P2-9 : builder garde null pour cv absent (data séparé)"
    );
    const candSrc = readFileSync(join(root, "src/app/app/candidatures/page.tsx"), "utf8");
    assert(
      !candSrc.includes("LoadingState"),
      "candidatures = page interdite, inchangée (rapportée)"
    );
  }

  /* Étape 10 — P2-11/P2-12/P3-1/P3-2 + suppression des orphelins. */
  {
    const root = process.cwd();

    /* P2-11 : NAV_LABEL source unique, plus de jargon « Module 0X ». */
    const shellSrc = readFileSync(join(root, "src/components/app/AppShell.tsx"), "utf8");
    assert(shellSrc.includes("export const NAV_LABEL"), "AppShell exporte NAV_LABEL");
    for (const [p, route] of [
      ["src/app/app/cv/page.tsx", "/app/cv"],
      ["src/app/app/lettres/page.tsx", "/app/lettres"],
      ["src/app/app/recruteurs/page.tsx", "/app/recruteurs"],
      ["src/app/app/cv/builder/page.tsx", "/app/cv"],
      ["src/app/app/offers/page.tsx", "/app/offers"],
    ] as const) {
      const src = readFileSync(join(root, p), "utf8");
      assert(src.includes(`NAV_LABEL["${route}"`), `P2-11 : ${p} aligné sur NAV_LABEL`);
      assert(!src.includes("Module 0"), `P2-11 : ${p} sans jargon « Module 0X »`);
    }
    const dashSrc = readFileSync(
      join(root, "src/components/alertes-gmail/AlertesGmailDashboard.tsx"),
      "utf8"
    );
    assert(
      dashSrc.includes('NAV_LABEL["/app/alertes-gmail"]'),
      "dashboard aligné sur NAV_LABEL"
    );
    const candSrc = readFileSync(join(root, "src/app/app/candidatures/page.tsx"), "utf8");
    assert(candSrc.includes("Module 04"), "candidatures interdite → eyebrow inchangé (rapporté)");

    /* P2-12 : glossaire AI_LABEL + plus de « Gemini » dans les pages modifiables. */
    const aiSrc = readFileSync(join(root, "src/lib/ai-labels.ts"), "utf8");
    assert(aiSrc.includes("export const AI_LABEL"), "AI_LABEL exporté");
    assert(
      aiSrc.includes("Geste 1") && aiSrc.includes("Geste 3"),
      "glossaire documente les 3 gestes (6 libellés)"
    );
    for (const p of [
      "src/app/app/lettres/page.tsx",
      "src/app/app/cv/page.tsx",
      "src/app/app/cv/builder/page.tsx",
      "src/app/app/offers/page.tsx",
      "src/app/app/alertes-gmail/offre/page.tsx",
    ]) {
      const src = readFileSync(join(root, p), "utf8");
      assert(!src.includes("Gemini"), `P2-12 : ${p} sans « Gemini » à l'écran`);
      assert(src.includes("AI_LABEL"), `P2-12 : ${p} passe par AI_LABEL`);
    }
    const matchSrc = readFileSync(join(root, "src/app/app/matching/page.tsx"), "utf8");
    assert(matchSrc.includes("Gemini"), "matching interdit → Gemini signalé non fait");

    /* P3-1 : historique des syncs (persistance bornée + liste cliquable). */
    const g = globalThis as { window?: unknown };
    const mem = new Map<string, string>();
    g.window = {
      localStorage: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
        removeItem: (k: string) => void mem.delete(k),
        get length() {
          return mem.size;
        },
        key: (i: number) => [...mem.keys()][i] ?? null,
      },
    };
    const mk = (at: string, over: Partial<RunHistEntry> = {}): RunHistEntry => ({
      at,
      action: "sync",
      emailsRead: 10,
      processed: 4,
      offers: 9,
      created: 6,
      errors: 0,
      durationMs: 12_000,
      ...over,
    });
    saveRunHist("me@x.fr", mk("2026-09-23T10:00:00.000Z"));
    saveRunHist("me@x.fr", mk("2026-09-24T09:00:00.000Z", { errors: 2 }));
    saveRunHist("autre@x.fr", mk("2026-09-24T11:00:00.000Z"));
    const hist = loadRunHist("me@x.fr");
    assertEq(hist.length, 2, "loadRunHist : 2 runs pour le compte");
    assert(hist[0].at.startsWith("2026-09-24"), "tri décroissant (plus récent d'abord)");
    assertEq(hist[0].errors, 2, "détail erreurs conservé");
    assertEq(loadRunHist("autre@x.fr").length, 1, "isolation par compte");
    for (let i = 0; i < RUN_HIST_MAX + 3; i++) {
      saveRunHist("me@x.fr", mk(`2026-09-25T${String(i).padStart(2, "0")}:00:00.000Z`));
    }
    assertEq(loadRunHist("me@x.fr").length, RUN_HIST_MAX, "bornage RUN_HIST_MAX");
    delete g.window;
    assertEq(loadRunHist("me@x.fr").length, 0, "sans window → []");

    const rh = renderToStaticMarkup(
      createElement(RunHistory, {
        entries: [
          mk("2026-09-24T09:00:00.000Z"),
          mk("2026-09-23T10:00:00.000Z", { errors: 2 }),
        ],
      })
    );
    assert(rh.includes("data-testid=\"run-history\""), "RunHistory rendu");
    assert(
      (rh.match(/data-testid="run-history-item"/g) || []).length === 2,
      "2 lignes d'historique"
    );
    assert(rh.includes("aria-expanded=\"false\""), "lignes cliquables repliées par défaut");
    assert(rh.includes("Historique des syncs"), "titre français");
    const rhEmpty = renderToStaticMarkup(createElement(RunHistory, { entries: [] }));
    assert(!rhEmpty.includes("run-history"), "liste vide → pas de section fantôme");
    assert(dashSrc.includes("saveRunHist"), "dashboard écrit l'historique après run");
    assert(dashSrc.includes("<RunHistory"), "dashboard affiche l'historique");

    /* P3-2 : EmailDetail = niveau normal (FR) / panneau technique replié. */
    const d2 = renderToStaticMarkup(
      createElement(EmailDetail, {
        email: makeEmail({
          error: "Gemini gemini-3.1-flash-lite HTTP 429 | réponse:{...}",
        }),
      })
    );
    assert(d2.includes("data-testid=\"tech-details\""), "panneau Détails techniques présent");
    assert(d2.includes("Détails techniques"), "libellé du panneau");
    assert(d2.includes("quota IA"), "erreur humanisée au niveau normal");
    assert(d2.includes("raison brute"), "raison brute repoussée dans le panneau");
    assert(d2.includes("observabilité"), "observabilité dans le panneau technique");
    assert(d2.includes("429"), "code brut visible dans le panneau technique");

    /* Suppression des orphelins (0 import avant effacement). */
    assert(
      !existsSync(join(root, "src/lib/gmail-pipeline.ts")),
      "gmail-pipeline.ts supprimé (orphelin, 256 lignes)"
    );
    assert(
      !existsSync(join(root, "src/lib/gmail-enricher.ts")),
      "gmail-enricher.ts supprimé (orphelin, 129 lignes)"
    );
    assert(
      !existsSync(join(root, "src/lib/gmail-api.ts")),
      "gmail-api.ts supprimé (orphelin, 174 lignes)"
    );
  }

  /* ── Résumé ────────────────────────────────────────────────── */

  /* P0-3 : isIndirectOfferUrl (miroir client, pur, sans zlib). */
  assert(isIndirectOfferUrl("https://engage.indeed.com/f/a/tok~~/x~/y"), "engage → indirect");
  assert(isIndirectOfferUrl("https://cts.indeed.com/v3/AAAA"), "cts → indirect");
  assert(isIndirectOfferUrl("https://fr.indeed.com/pagead/clk?jrtk=x"), "pagead → indirect");
  assert(!isIndirectOfferUrl("https://fr.indeed.com/viewjob?jk=f1e2d3c4b5a697"), "viewjob jk valide → direct");
  assert(!isIndirectOfferUrl("https://www.linkedin.com/jobs/view/123/"), "linkedin → direct");
  assert(!isIndirectOfferUrl(""), "URL vide → direct");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
