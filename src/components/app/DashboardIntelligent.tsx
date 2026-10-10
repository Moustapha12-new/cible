"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, type UserData, type DetectedOffer, STATUS_META, type AppStatus } from "@/lib/data";
import { AppPageHead } from "@/components/app/AppShell";
import { generateNextActions, getTopOpportunities, getApplicationsPipeline, computeMetrics, type NextAction, type OpportunityScore, type DashboardMetrics } from "@/lib/dashboard-prioritization";

const PRIORITY_STYLE: Record<NextAction["priority"], { bg: string; border: string; icon: string }> = {
  critical: { bg: "bg-red-50 border-red-200", border: "border-l-3 border-red-500", icon: "⚠" },
  high: { bg: "bg-amber-50 border-amber-200", border: "border-l-3 border-amber-500", icon: "▲" },
  medium: { bg: "bg-blue-50 border-blue-200", border: "border-l-3 border-blue-500", icon: "●" },
  low: { bg: "bg-gray-50 border-gray-200", border: "border-l-3 border-gray-400", icon: "○" },
};

const CATEGORY_LABEL: Record<NextAction["category"], string> = {
  offer: "Offre à qualifier",
  dossier: "Dossier à finaliser",
  cv: "CV à valider",
  followup: "Relance à préparer",
  deadline: "Échéance proche",
};

const CATEGORY_ICON: Record<NextAction["category"], string> = {
  offer: "🔍",
  dossier: "📁",
  cv: "📄",
  followup: "🔁",
  deadline: "⏰",
};

function formatDateFR(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Date invalide";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function daysLabel(days: number | undefined): string {
  if (days === undefined) return "";
  if (days > 0) return `dans ${days} jour${days > 1 ? "s" : ""}`;
  if (days === 0) return "aujourd'hui";
  return `il y a ${Math.abs(days)} jour${Math.abs(days) > 1 ? "s" : ""}`;
}

function EligibilityBadge({ status }: { status: "eligible" | "verify" | "excluded" }) {
  const config = {
    eligible: { label: "Éligible PFE", cls: "pill pill--ok" },
    verify: { label: "À vérifier", cls: "pill pill--wait" },
    excluded: { label: "Incompatible", cls: "pill" },
  }[status];
  return <span className={config.cls}>{config.label}</span>;
}

function RelevanceBadge({ level }: { level: "forte" | "à examiner" | "faible" }) {
  const config = {
    forte: { label: "Pertinence forte", cls: "pill pill--ok" },
    "à examiner": { label: "À examiner", cls: "pill pill--wait" },
    faible: { label: "Pertinence faible", cls: "pill" },
  }[level];
  return <span className={config.cls}>{config.label}</span>;
}

function PriorityActions({ actions }: { actions: NextAction[] }) {
  if (!actions.length) return null;
  
  return (
    <section className="glass-card p-6 space-y-4" aria-labelledby="actions-heading">
      <div className="flex items-center justify-between">
        <h2 id="actions-heading" className="font-display text-xl font-semibold">Tes 3-5 prochaines actions</h2>
        <span className="chip chip--mint">{actions.length} action(s) prioritaire(s)</span>
      </div>
      <div className="space-y-3">
        {actions.map((action, index) => {
          const style = PRIORITY_STYLE[action.priority];
          const days = action.metadata.daysUntilDeadline;
          return (
            <Link
              key={action.id}
              href={action.href}
              className={`group flex items-start gap-4 p-4 rounded-xl border ${style.bg} ${style.border} hover:bg-opacity-80 transition-colors`}
              aria-label={`${index + 1}. ${action.title}`}
            >
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-white/70 border border-line flex items-center justify-center text-lg font-mono">{index + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg">{CATEGORY_ICON[action.category]}</span>
                  <strong className="text-text-main">{action.title}</strong>
                  <span className={`chip ${action.priority === "critical" ? "chip--amber" : action.priority === "high" ? "" : "chip--muted"}`}>{CATEGORY_LABEL[action.category]}</span>
                </div>
                <p className="text-sm text-text-dim mt-1">{action.description}</p>
                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
                  {action.metadata.company && <span className="font-mono text-muted">{action.metadata.company}</span>}
                  {action.metadata.role && <span className="text-text-dim">{action.metadata.role}</span>}
                  {action.metadata.eligibility && <EligibilityBadge status={action.metadata.eligibility} />}
                  {action.metadata.relevance && <RelevanceBadge level={action.metadata.relevance} />}
                  {days !== undefined && (
                    <span className={`pill ${days <= 0 ? "pill--ok" : days <= 3 ? "pill--wait" : "pill--info"}`}>
                      {days <= 0 ? "Échéance dépassée" : `Échéance ${daysLabel(days)}`}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-mint font-medium hidden sm:inline">→</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function MetricsBar({ metrics }: { metrics: DashboardMetrics }) {
  const items = [
    { label: "Offres Gmail", value: metrics.totalOffers, note: `${metrics.eligibleOffers} éligibles PFE`, href: "/app/alertes-gmail" },
    { label: "À analyser", value: metrics.offersToAnalyze, note: "non qualifiées", href: "/app/matching" },
    { label: "Dossiers en cours", value: metrics.draftsInProgress, note: "à finaliser", href: "/app/candidatures" },
    { label: "Candidatures envoyées", value: metrics.applicationsSent, note: `${metrics.applicationsToFollowUp} relance${metrics.applicationsToFollowUp > 1 ? "s" : ""} nécessaire${metrics.applicationsToFollowUp > 1 ? "s" : ""}`, href: "/app/candidatures" },
    { label: "Entretiens", value: metrics.interviews, note: "prochaine étape", href: "/app/candidatures" },
    { label: "Offres reçues", value: metrics.offersReceived, note: "félicitations", href: "/app/candidatures" },
    { label: "CV approuvés", value: metrics.cvApprovedCount, note: `${metrics.cvToValidate} à valider`, href: "/app/cv" },
    { label: "Échéances ≤ 14j", value: metrics.upcomingDeadlines, note: "surveille les dates", href: "/app/candidatures" },
  ];
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3" role="list" aria-label="Indicateurs clés">
      {items.map(item => (
        <Link key={item.label} href={item.href} className="glass-card p-4 rounded-xl border border-line hover:border-line-strong transition-colors" role="listitem">
          <p className="mono-label text-[0.58rem]">{item.label}</p>
          <p className="font-display text-3xl font-semibold mt-1 tabular-nums">{item.value}</p>
          <p className="text-xs text-muted mt-2">{item.note}</p>
        </Link>
      ))}
    </div>
  );
}

function TopOpportunities({ opportunities, offers }: { opportunities: OpportunityScore[]; offers: DetectedOffer[] }) {
  if (!opportunities.length) return null;
  
  return (
    <section className="glass-card p-6 space-y-4" aria-labelledby="opportunities-heading">
      <div className="flex items-center justify-between">
        <h2 id="opportunities-heading" className="font-display text-xl font-semibold">Meilleures opportunités PFE</h2>
        <Link href="/app/alertes-gmail" className="text-sm text-mint underline">Toutes les offres →</Link>
      </div>
      <div className="space-y-3">
        {opportunities.map((opp) => {
          const offer = offers.find(o => o.id === opp.offerId);
          if (!offer) return null;
          
          return (
            <article key={opp.offerId} className="group p-4 rounded-xl border border-line hover:border-line-strong transition-colors bg-white/50">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-semibold">{offer.title}</span>
                    <span className="text-sm text-text-dim">{offer.company}</span>
                    <EligibilityBadge status={opp.eligibility} />
                    <RelevanceBadge level={opp.relevance} />
                  </div>
                  {offer.location && <p className="text-sm text-muted mt-1">{offer.location}</p>}
                  <div className="flex flex-wrap gap-2 mt-3 text-xs">
                    {opp.reasons.slice(0, 2).map((reason, i) => (
                      <span key={i} className="pill chip--mint text-[0.55rem]">{reason}</span>
                    ))}
                    {opp.infoToVerify.length > 0 && (
                      <span className="pill chip--amber text-[0.55rem]">{opp.infoToVerify.length} info à vérifier</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  {opp.deadline && (
                    <span className={`pill ${opp.daysUntilDeadline !== undefined && opp.daysUntilDeadline <= 7 ? "pill--wait" : "pill--info"}`}>
                      Début ~ {formatDateFR(opp.deadline)}
                    </span>
                  )}
                  <Link href={`/app/dossier?offer=${encodeURIComponent(offer.id)}`} className="text-sm text-mint font-medium hover:underline">Ouvrir le dossier →</Link>
                </div>
              </div>
              {opp.infoToVerify.length > 0 && (
                <details className="mt-3 group-open:block">
                  <summary className="text-xs text-muted cursor-pointer flex items-center gap-1">
                    <span>▸</span> Informations à vérifier
                  </summary>
                  <ul className="list-disc pl-5 text-xs text-text-dim mt-2 space-y-1">
                    {opp.infoToVerify.slice(0, 4).map((info, i) => (
                      <li key={i}>{info}</li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ApplicationPipeline({ pipeline }: { pipeline: ReturnType<typeof getApplicationsPipeline> }) {
  const router = useRouter();
  const { byStatus, followups, upcomingInterviews } = pipeline;
  const statusOrder: AppStatus[] = ["sent", "interview", "offer", "rejected"];
  
  return (
    <section className="space-y-6" aria-labelledby="pipeline-heading">
      <h2 id="pipeline-heading" className="font-display text-xl font-semibold">Pipeline de candidatures</h2>
      
      <div className="grid lg:grid-cols-4 gap-4">
        {statusOrder.map(status => {
          const { applications } = byStatus[status];
          const meta = STATUS_META[status];
          return (
            <div key={status} className="glass-card p-4 rounded-xl border border-line">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <span className={`pill ${meta.cls}`}>{meta.label}</span>
                  <span className="font-mono text-muted">{applications.length}</span>
                </h3>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {applications.length === 0 ? (
                  <p className="text-sm text-muted text-center py-4">Aucune candidature</p>
                ) : (
                  applications.slice(0, 5).map(app => (
                    <button
                      key={app.id}
                      onClick={() => router.push(`/app/candidatures?open=${app.id}`)}
                      className="block w-full text-left p-3 rounded-lg border border-line hover:border-line-strong transition-colors"
                    >
                      <p className="font-medium text-sm truncate">{app.company}</p>
                      <p className="text-xs text-muted truncate">{app.role}</p>
                      <div className="flex items-center justify-between mt-2 text-xs">
                        <span className="text-muted">{app.date ? formatDateFR(app.date) : "Date ?"}</span>
                        {app.status === "sent" && app.date && (
                          <span className="pill chip--amber text-[0.5rem]">Relance dans {Math.max(0, 7 - (Date.now() - new Date(app.date).getTime()) / 86400000).toFixed(0)}j</span>
                        )}
                      </div>
                    </button>
                  ))
                )}
                {applications.length > 5 && (
                  <Link href="/app/candidatures" className="text-xs text-mint underline block text-center mt-2">+ {applications.length - 5} autre(s)</Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {(followups.length > 0 || upcomingInterviews.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          {followups.length > 0 && (
            <section className="glass-card p-5 rounded-xl border border-line">
              <h3 className="font-semibold flex items-center gap-2 mb-3">
                <span className="pill chip--amber">Relances</span>
                <span className="font-mono text-muted">{followups.length}</span>
              </h3>
              <ul className="space-y-2">
                {followups.slice(0, 5).map(item => (
                  <li key={item.application.id} className="p-3 rounded-lg border border-line bg-amber-50/50">
                    <p className="font-medium text-sm">{item.application.company}</p>
                    <p className="text-xs text-muted">{item.application.role}</p>
                    <p className="text-xs text-amber-deep mt-1">Sans réponse depuis {item.daysSinceSent} jours</p>
                    <Link href={`/app/candidatures?open=${encodeURIComponent(item.application.id)}`} className="text-xs text-mint underline mt-1 inline-block">Préparer la relance →</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {upcomingInterviews.length > 0 && (
            <section className="glass-card p-5 rounded-xl border border-line">
              <h3 className="font-semibold flex items-center gap-2 mb-3">
                <span className="pill pill--ok">Entretiens à venir</span>
                <span className="font-mono text-muted">{upcomingInterviews.length}</span>
              </h3>
              <ul className="space-y-2">
                {upcomingInterviews.slice(0, 5).map(item => (
                  <li key={item.application.id} className="p-3 rounded-lg border border-line bg-emerald-50/50">
                    <p className="font-medium text-sm">{item.application.company}</p>
                    <p className="text-xs text-muted">{item.application.role}</p>
                    <p className="text-xs text-emerald-deep mt-1">Dans {item.daysUntil} jour(s)</p>
                    <Link href={`/app/candidatures?open=${encodeURIComponent(item.application.id)}`} className="text-xs text-mint underline mt-1 inline-block">Voir le dossier →</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </section>
  );
}

function DeadlinesTracking({ opportunities }: { opportunities: OpportunityScore[] }) {
  const withDeadlines = opportunities
    .filter(o => o.daysUntilDeadline !== undefined)
    .sort((a, b) => (a.daysUntilDeadline ?? 999) - (b.daysUntilDeadline ?? 999))
    .slice(0, 8);
  
  if (!withDeadlines.length) return null;
  
  return (
    <section className="glass-card p-6 space-y-4" aria-labelledby="deadlines-heading">
      <h2 id="deadlines-heading" className="font-display text-xl font-semibold">Suivi des échéances et relances</h2>
      <div className="space-y-2">
        {withDeadlines.map(opp => {
          const offer = opp;
          const days = offer.daysUntilDeadline!;
          const isUrgent = days <= 7;
          const isOverdue = days < 0;
          return (
            <div key={offer.offerId} className={`flex items-center justify-between p-3 rounded-lg border ${isOverdue ? "bg-red-50 border-red-200" : isUrgent ? "bg-amber-50 border-amber-200" : "border-line bg-white/50"}`}>
              <div className="flex items-center gap-3">
                <span className={`font-display text-xl ${isOverdue ? "text-red" : isUrgent ? "text-amber" : "text-emerald"}`}>{isOverdue ? "⚠" : isUrgent ? "⏰" : "📅"}</span>
                <div>
                  <p className="font-medium text-sm">{offer.reasons[0] || "Offre PFE"}</p>
                  <p className="text-xs text-muted">{offer.deadline ? `Début visé : ${formatDateFR(offer.deadline)}` : "Date à confirmer"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`pill font-mono ${isOverdue ? "pill--ok" : isUrgent ? "pill--wait" : "pill--info"}`}>
                  {isOverdue ? `Dépassée de ${Math.abs(days)}j` : days === 0 ? "Aujourd'hui" : `Dans ${days}j`}
                </span>
                <Link href={`/app/dossier?offer=${encodeURIComponent(offer.offerId)}`} className="btn-sm btn-line">Agir</Link>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">Basé exclusivement sur les dates enregistrées dans les offres (startDate) et les candidatures (date d&apos;envoi).</p>
    </section>
  );
}

export default function DashboardIntelligent() {
  const { user } = useAuth();
  const [data, setData] = useState<UserData | null>(null);
  
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => setData(getOrCreateData(user.name, user.email)), 0);
    return () => clearTimeout(timer);
  }, [user]);
  
  const metrics = useMemo(() => data ? computeMetrics(data) : null, [data]);
  const actions = useMemo(() => data ? generateNextActions(data) : [], [data]);
  const opportunities = useMemo(() => data ? getTopOpportunities(data, 5) : [], [data]);
  const pipeline = useMemo(() => data ? getApplicationsPipeline(data) : { byStatus: { sent: { applications: [] }, interview: { applications: [] }, offer: { applications: [] }, rejected: { applications: [] } }, followups: [], upcomingInterviews: [] }, [data]);
  
  if (!data || !user) return <div className="app-boot"><p className="mono-label">Chargement de ton tableau de bord…</p></div>;
  
  return (
    <>
      <AppPageHead
        eyebrow="Mission PFE · février 2027"
        title="Ton centre de pilotage"
        sub="Priorités, pipeline, échéances et meilleures opportunités — tout ce qu'il faut pour avancer."
      />
      
      <PriorityActions actions={actions} />
      {metrics && <MetricsBar metrics={metrics} />}
      <TopOpportunities opportunities={opportunities} offers={data.offers || []} />
      <ApplicationPipeline pipeline={pipeline} />
      <DeadlinesTracking opportunities={opportunities} />
      
      {!data.offers?.length && (
        <section className="glass-card p-8 text-center mt-8">
          <h3 className="font-display text-xl">Moins de dispersion. Plus d&apos;opportunités.</h3>
          <p className="text-sm text-muted mt-3">Connecte Gmail pour retrouver les offres de tes alertes, ou explore les sites d&apos;emploi.</p>
          <Link href="/app/alertes-gmail" className="btn-line mt-5">Connecter mes alertes →</Link>
        </section>
      )}
    </>
  );
}
