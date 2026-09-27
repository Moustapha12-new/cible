"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { AppPageHead, NAV_LABEL } from "@/components/app/AppShell";
import {
  loadGmailStore,
  saveGmailStore,
  ingestSyncResults,
  GMAIL_LABEL,
  type GmailStore,
  type SyncEmailResult,
} from "@/lib/gmail-client";
import type {
  DashboardPayload,
  LastRunStats,
  ProcessedEmail,
  RunHistEntry,
  SyncSummaryGlobal,
  SyncAction,
} from "@/lib/gmail-dashboard";
import { clearPayloadCache, emptySummary, etaMinutes, humanizeGmailError, loadLastRun, loadPayloadCache, loadRunHist, saveLastRun, savePayloadCache, saveRunHist } from "@/lib/gmail-dashboard";
import GmailConnectionStatus, { type ConnState } from "./GmailConnectionStatus";
import SyncSummaryCard, { type LiveProgress } from "./SyncSummaryCard";
import RunHistory from "./RunHistory";
import EmailList from "./EmailList";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";

/** Erreur affichée : phrase FR + éventuel détail technique (replié). */
type ShownError = { msg: string; detail?: string };

function toShownError(e: unknown): ShownError {
  const h = humanizeGmailError(e);
  const extra = (e as { detail?: string } | null)?.detail;
  return { msg: h.human, detail: h.detail ?? extra };
}

export default function AlertesGmailDashboard() {
  const { user } = useAuth();
  const [conn, setConn] = useState<ConnState>({ checking: true, connected: false, configured: false });
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [store, setStore] = useState<GmailStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [relaunchingId, setRelaunchingId] = useState<string | null>(null);
  const [error, setError] = useState<ShownError | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [arrivalsDismissed, setArrivalsDismissed] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [exportReady, setExportReady] = useState(false);
  const [lastRun, setLastRun] = useState<LastRunStats | null>(null);
  const [runHist, setRunHist] = useState<RunHistEntry[]>([]);
  const [runProgress, setRunProgress] = useState<LiveProgress>(null);
  const [runEta, setRunEta] = useState<number | null>(null);
  const email = user?.email ?? "";
  const bootRef = useRef(false);
  const syncStartRef = useRef(0);

  /* Messages OAuth via URL — différé (timeout) pour satisfaire react-hooks/purity. */
  useEffect(() => {
    const id = window.setTimeout(() => {
      const qs = new URLSearchParams(window.location.search);
      const connected = qs.get("connected");
      const err = qs.get("error");
      if (connected) setBanner(`Connecté à Gmail. Libellé surveillé : « ${GMAIL_LABEL} ».`);
      else if (err) {
        if (err === "token") setBanner("Connexion Gmail interrompue (échec de l'échange de code). Réessaie.");
        else if (err === "config") setBanner("Connexion Gmail interrompue : config Google manquante côté serveur.");
        else if (err === "storage")
          setBanner(
            "Stockage serveur indisponible (Blob suspendu ou inaccessible) — la connexion Gmail ne peut pas enregistrer le token. Réactive le Blob Vercel, puis réessaie."
          );
        else if (err === "state") setBanner("Session OAuth expirée ou invalide — clique à nouveau sur Connecter Gmail.");
        else setBanner("Connexion Gmail interrompue — réessaie.");
      }
      if (connected || err) window.history.replaceState({}, "", "/app/alertes-gmail");
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);

  /* Store local (offres importées) — après hydratation */
  useEffect(() => {
    if (!user) return;
    const id = window.setTimeout(() => {
      setStore(loadGmailStore(user.email));
      setLastRun(loadLastRun(user.email));
      setRunHist(loadRunHist(user.email));
    }, 0);
    return () => window.clearTimeout(id);
  }, [user]);

  /* Progression du run en cours : poll léger toutes les 3 s (1 lecture
     stockage serveur) — l'UI affiche « N / M » au lieu d'un écran figé. */
  useEffect(() => {
    if (!syncing || !email) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/gmail/progress?email=${encodeURIComponent(email)}`, {
          cache: "no-store",
        });
        const j = (await r.json()) as {
          ok?: boolean;
          processed?: number;
          total?: number;
        };
        if (!stop && j.ok && Number(j.total) > 0) {
          const processed = Number(j.processed) || 0;
          const total = Number(j.total) || 0;
          setRunProgress({ processed, total });
          setRunEta(etaMinutes(processed, total, Date.now() - syncStartRef.current));
        }
      } catch {
        /* best-effort : la barre reste sur la dernière valeur connue */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      stop = true;
      window.clearInterval(id);
      setRunProgress(null);
      setRunEta(null);
    };
  }, [syncing, email]);

  /* P0-4 : un seul endpoint — le payload porte déjà connected / configured /
     gmailAccount / lastSync / reason (l'ancien endpoint de statut séparé
     n'est plus appelé côté client). `fresh` force la reconstruction (P0-4). */
  const refreshDashboard = useCallback(
    async (fresh?: boolean) => {
      if (!email) return;
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ email });
        if (fresh) qs.set("fresh", "1");
        const r = await fetch(`/api/gmail/dashboard?${qs.toString()}`, { cache: "no-store" });
        const j = (await r.json()) as DashboardPayload;
        if (!r.ok || !j.ok) {
          const err = new Error(j.error || j.reason || "Chargement impossible") as Error & {
            detail?: string;
          };
          err.detail = j.detail;
          throw err;
        }
        setPayload(j);
        savePayloadCache(email, j);
        setConn((c) => ({
          ...c,
          checking: false,
          connected: j.connected,
          configured: j.configured,
          gmailAccount: j.gmailAccount ?? c.gmailAccount,
          lastSync: j.lastSync ?? c.lastSync,
          reason: j.connected ? undefined : j.reason,
        }));
        setExportReady(true);
      } catch (e) {
        setError(toShownError(e));
      } finally {
        setLoading(false);
      }
    },
    [email]
  );

  /* Boot P0-4 : cache local d'abord (affichage immédiat type SWR), puis le
     snapshot réseau (~2 lectures) met à jour — le spinner « mise à jour »
     reste visible tant que ce refresh de fond tourne. Timeout 0 ms : même
     pattern que les autres effets de chargement (hydration). */
  useEffect(() => {
    if (!user || bootRef.current) return;
    bootRef.current = true;
    const id = window.setTimeout(() => {
      const cached = loadPayloadCache(email);
      if (cached) {
        setPayload(cached);
        setConn({
          checking: false,
          connected: cached.connected,
          configured: cached.configured,
          gmailAccount: cached.gmailAccount,
          reason: cached.connected ? undefined : cached.reason,
          lastSync: cached.lastSync ?? null,
        });
      }
      void refreshDashboard();
    }, 0);
    return () => window.clearTimeout(id);
  }, [user, email, refreshDashboard]);

  const runAction = useCallback(
    async (action: SyncAction, emailId?: string) => {
      if (syncing || !email) return;
      setSyncing(true);
      setError(null);
      setRunEta(null);
      syncStartRef.current = Date.now();
      try {
        const body: Record<string, unknown> = { email, action };
        if (emailId) body.emailId = emailId;
        const res = await fetch("/api/gmail/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          const err = new Error(json.error || "Synchronisation impossible") as Error & {
            detail?: string;
          };
          err.detail = json.detail;
          throw err;
        }
        if (json.labelFound === false) {
          setError({ msg: json.hint || `Libellé « ${GMAIL_LABEL} » introuvable.` });
          return;
        }
        /* Import des offres dans le store local (inchangé Modules 1-3) */
        if (store && Array.isArray(json.emails)) {
          const ingested = ingestSyncResults(store, json.emails as SyncEmailResult[]);
          const next = { ...ingested.store };
          if (user?.email) saveGmailStore(user.email, next);
          setStore(next);
        }
        const s = json.summary as SyncSummaryGlobal | undefined;
        /* P0-8 : la réponse du run est persistée → bloc « dernière synchro »
           qui survit au rechargement (distinct du cumul des checkpoints). */
        const lr: LastRunStats = {
          at: new Date().toISOString(),
          action,
          emailsRead: Number(json.emailsRead ?? s?.emailsRead ?? 0),
          processedThisRun: Number(
            json.checkpointStats?.processedThisRun ?? s?.emailsProcessed ?? 0
          ),
          totalOffersDetected: Number(s?.totalOffersDetected ?? 0),
          newOffersImported: Number(s?.newOffersImported ?? 0),
          duplicatesIgnored: Number(s?.duplicatesIgnored ?? 0),
          errors: Number(s?.errors ?? 0),
          pendingRetry: Number(s?.pendingRetry ?? 0),
          totalInLabel: Number(json.totalInLabel ?? payload?.totalInLabel ?? 0),
          truncated: json.truncated === true,
          interrupted: json.interrupted === true,
          remaining: Number(json.remaining ?? 0),
          ...(json.arrivedDuringRun !== undefined
            ? { arrivedDuringRun: Number(json.arrivedDuringRun) }
            : {}),
          enrichDeferred: json.enrichDeferred === true,
        };
        saveLastRun(email, lr);
        setLastRun(lr);
        /* P3-1 : chaque run réussit → ligne d'historique persistante. */
        saveRunHist(email, {
          at: lr.at,
          action,
          emailsRead: lr.emailsRead,
          processed: lr.processedThisRun,
          offers: lr.totalOffersDetected,
          created: lr.newOffersImported,
          errors: lr.errors,
          durationMs: Math.max(0, Date.now() - (syncStartRef.current || Date.now())),
        });
        setRunHist(loadRunHist(email));
        /* P0-4 : post-sync on reconstruit (fresh=1) → le snapshot est réécrit. */
        await refreshDashboard(true);
        /* Messages listés mais non lus (fetch échoué) : jamais silencieux. */
        const fetchSkipped = Number(json.fetchSkipped ?? 0);
        const er = json.enrichRetry as
          | { tried: number; okNow: number; stillBlocked: number }
          | undefined;
        const skipNote =
          fetchSkipped > 0
            ? ` · ⚠ ${fetchSkipped} e-mail${fetchSkipped > 1 ? "s" : ""} non lu${fetchSkipped > 1 ? "s" : ""}`
            : "";
        if (fetchSkipped > 0) {
          setBanner(
            `${fetchSkipped} e-mail${fetchSkipped > 1 ? "s" : ""} n'${fetchSkipped > 1 ? "ont" : "a"} pas pu être lu${fetchSkipped > 1 ? "s" : ""} — repris à la prochaine synchro.`
          );
        }
        const nfr = (n: number, s: string, p: string) => `${n} ${n > 1 ? p : s}`;
        const analyzed = lr.processedThisRun;
        const found = s?.totalOffersDetected ?? 0;
        const dupes = s?.duplicatesIgnored ?? 0;
        const syncNote =
          analyzed === 0
            ? "Aucun nouvel e-mail — tout est déjà à jour."
            : `Synchro terminée : ${nfr(analyzed, "e-mail analysé", "e-mails analysés")} → ${nfr(found, "offre trouvée", "offres trouvées")} → ${nfr(dupes, "déjà connue", "déjà connues")}`;
        const errLeft = s?.errors ?? 0;
        setToast(
          (action === "relaunch_errors"
            ? errLeft === 0
              ? "Erreurs relancées — plus aucune en erreur."
              : `Erreurs relancées — ${nfr(errLeft, "reste en erreur", "restent en erreur")}.`
            : action === "relaunch_email"
              ? "E-mail relancé."
              : action === "relaunch_offer"
                ? `Enrichissement relancé : ${nfr(er?.tried ?? 0, "tentative", "tentatives")} · ${nfr(er?.okNow ?? 0, "réussie", "réussies")} · ${nfr(er?.stillBlocked ?? 0, "bloquée", "bloquées")} (site protégé).`
                : syncNote) +
            skipNote
        );
      } catch (e) {
        setError(toShownError(e));
      } finally {
        setSyncing(false);
        setRelaunchingId(null);
      }
    },
    [email, store, syncing, refreshDashboard, user, payload]
  );

  const connect = () => {
    // Navigation OAuth full-page volontaire (quitte l'app vers Google) — pas un routeur Next interne.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/api/gmail/auth?email=${encodeURIComponent(email)}`;
  };

  /* P1-9 : la déconnexion supprime réellement le jeton OAuth (DELETE route). */
  const disconnect = async () => {
    if (!email || syncing) return;
    try {
      const r = await fetch(`/api/gmail/disconnect?email=${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || "Déconnexion impossible");
      setBanner("Compte Gmail déconnecté — le jeton d'accès a été supprimé.");
      clearPayloadCache(email);
      await refreshDashboard(true);
    } catch (e) {
      setError(toShownError(e));
    }
  };

  const relaunchOne = async (id: string) => {
    setRelaunchingId(id);
    await runAction("relaunch_email", id);
  };

  /* P1-4 : relance ciblée de l'enrichissement d'un e-mail (sans détection). */
  const relaunchOffers = async (id: string) => {
    setRelaunchingId(id);
    await runAction("relaunch_offer", id);
  };

  const exportReport = () => {
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alertes-gmail-rapport-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!user) {
    return (
      <div className="app-boot">
        <p className="mono-label">chargement de vos alertes…</p>
      </div>
    );
  }

  const summary = payload?.summary ?? emptySummary();
  const totalInLabel = payload?.totalInLabel ?? 0;
  const emails: ProcessedEmail[] = payload?.emails ?? [];
  const relaunchable = emails.filter(
    (e) => e.checkpoint?.status === "error" || e.checkpoint?.status === "pending_retry" || e.finalStatus === "analyze_error"
  );
  /* État « nouveaux e-mails » (P1-10) : watermark du dernier run synchronisé. */
  const newRunArrived =
    lastRun && lastRun.action === "sync" ? lastRun.arrivedDuringRun ?? 0 : 0;
  const showArrivals = newRunArrived > 0 && arrivalsDismissed !== (lastRun?.at ?? "");

  return (
    <>
      <AppPageHead
        eyebrow={NAV_LABEL["/app/alertes-gmail"]}
        title={NAV_LABEL["/app/alertes-gmail"]}
        sub={`Observabilité complète de la synchronisation : chaque e-mail, sa méthode de détection, ses preuves et ses erreurs. Libellé « ${GMAIL_LABEL} ».`}
      />

      {/* P0-4 : cache local affiché tout de suite, ce refresh de fond tourne. */}
      {loading && payload && (
        <p className="mono-label mb-3" data-testid="swr-refreshing">
          mise à jour en arrière-plan…
        </p>
      )}

      {banner && (
        <div className="glass-card p-5 mb-4 border-l-2! border-l-amber!">
          <p className="text-[0.85rem] text-text-dim leading-relaxed">{banner}</p>
        </div>
      )}

      {/* État « nouveaux e-mails » (P1-10) : visible, persistant, avec CTA. */}
      {showArrivals && (
        <div
          className="glass-card p-5 mb-4 border-l-2! border-l-mint!"
          data-testid="new-arrivals-banner"
        >
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[0.85rem] text-text-dim leading-relaxed flex-1 min-w-[14rem]">
              <b>
                {newRunArrived} nouveau{newRunArrived > 1 ? "x" : ""} e-mail
                {newRunArrived > 1 ? "s" : ""}
              </b>{" "}
              {newRunArrived > 1 ? "sont arrivés" : "est arrivé"} pendant la dernière
              synchronisation — relance pour le{newRunArrived > 1 ? "s" : ""} traiter.
            </p>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => runAction("sync")}
              disabled={syncing}
              data-testid="btn-sync-arrivals"
            >
              Synchroniser {newRunArrived > 1 ? `les ${newRunArrived}` : "l’e-mail"}
            </button>
            <button
              type="button"
              className="btn-line btn-sm"
              onClick={() => setArrivalsDismissed(lastRun?.at ?? "")}
              title="Masquer ce bandeau"
              data-testid="btn-dismiss-arrivals"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <GmailConnectionStatus
        conn={conn}
        lastSync={payload?.lastSync ?? summary.lastSync}
        syncing={syncing}
        errorCount={relaunchable.length}
        onConnect={connect}
        onSync={() => runAction("sync")}
        onRelaunchErrors={() => runAction("relaunch_errors")}
        onDisconnect={disconnect}
      />

      {error && (
        <ErrorState message={error.msg} detail={error.detail} onRetry={() => refreshDashboard()} />
      )}

      {loading && !payload ? (
        <LoadingState />
      ) : payload && payload.connected && payload.labelFound === false && emails.length === 0 ? (
        <div className="glass-card p-8" data-testid="label-missing">
          <p className="font-display text-lg font-semibold mb-2">Libellé Gmail introuvable</p>
          <p className="text-[0.88rem] text-text-dim leading-relaxed">
            {payload.hint ||
              `Crée un libellé nommé exactement « ${GMAIL_LABEL} » dans Gmail (tiret cadratin –), puis relance la synchronisation.`}
          </p>
        </div>
      ) : payload && !payload.connected ? (
        <div className="glass-card p-8" data-testid="need-connection">
          <p className="font-display text-lg font-semibold mb-2">Connexion Gmail requise</p>
          <p className="text-[0.88rem] text-text-dim leading-relaxed">
            {payload.reason ||
              "Relie ton compte Gmail pour afficher les e-mails du libellé et lancer la synchronisation."}
            {" "}
            (le bouton « Connecter Gmail » se trouve juste ci-dessus.)
          </p>
        </div>
      ) : payload ? (
        <>
          <SyncSummaryCard
            summary={summary}
            totalInLabel={totalInLabel}
            lastRun={lastRun}
            runProgress={syncing ? runProgress : null}
            etaMin={runEta}
          />

          {/* P3-1 : historique persistant des runs (liste cliquable). */}
          <RunHistory entries={runHist} />

          {/* Actions secondaires — Synchroniser / Relancer les erreurs sont
              uniquement dans la zone d'actions du header (P1-8). */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2 mb-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
              <label className="mono-label" htmlFor="relaunch-select">
                relancer un e-mail
              </label>
              <select
                id="relaunch-select"
                className="input h-9 text-[0.8rem] w-full sm:w-auto min-w-0 sm:min-w-[14rem]"
                value=""
                disabled={syncing || emails.length === 0}
                onChange={(ev) => {
                  const id = ev.target.value;
                  if (id) void relaunchOne(id);
                }}
                data-testid="relaunch-select"
              >
                <option value="">Choisir…</option>
                {emails.map((e) => (
                  <option key={e.id} value={e.id}>
                    {(e.subject || e.id).slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn-line btn-sm"
              onClick={exportReport}
              disabled={!exportReady}
              data-testid="btn-export"
            >
              Exporter le rapport
            </button>
          </div>

          <div className="flex items-baseline justify-between gap-4 mb-4">
            <h2 className="font-display text-xl font-semibold">
              E-mails du libellé{" "}
              <span className="mono-label text-muted!">({emails.length})</span>
            </h2>
            <span className="mono-label">transparence totale</span>
          </div>

          {/* État « aucune offre » global (P1-10) — distinct d'un e-mail vide. */}
          {!syncing &&
            emails.length > 0 &&
            summary.totalOffersDetected === 0 &&
            relaunchable.length === 0 && (
              <div className="glass-card p-5 mb-4" data-testid="no-offers-global">
                <p className="text-[0.85rem] text-text-dim leading-relaxed">
                  Aucune offre détectée pour l’instant — la prochaine synchronisation
                  surveillera les nouveaux e-mails du libellé.
                </p>
              </div>
            )}

          {syncing && <LoadingState label="synchronisation en cours…" />}

          <EmailList
            emails={emails}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
            onRelaunch={relaunchOne}
            onRelaunchOffer={relaunchOffers}
            relaunchingId={relaunchingId}
            onFirstSync={() => runAction("sync")}
            firstSyncDisabled={syncing}
          />
        </>
      ) : null}

      {toast && (
        <div className="toast" role="status">
          <span className="w-2 h-2 rounded-full bg-mint inline-block" />
          {toast}
        </div>
      )}
    </>
  );
}
