"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, saveData, type UserData } from "@/lib/data";
import { AppPageHead } from "@/components/app/AppShell";
import { AI_LABEL } from "@/lib/ai-labels";
import { enrichBadge, isIndirectOfferUrl, stripHtml, type DashboardPayload, type ProcessedEmail, type RawOffer } from "@/lib/gmail-dashboard";
import { analyzeOffer } from "@/lib/skills";
import {
  CANDIDATURE_STEPS,
  candidatureRank,
  getCandidature,
  offerBridgeKey,
  offerToDetectedOffer,
  offerToOfferText,
  saveCandidature,
  writeQuickAdapt,
  type CandidatureState,
  type CandidatureStatus,
} from "@/lib/gmail-bridge";

const R = 54;
const CIRC = 2 * Math.PI * R;
const uid = () => Math.random().toString(36).slice(2, 9);

type MatchResult = {
  score: number;
  matched: string[];
  missing: string[];
  strategy?: string;
};

type Found = {
  email: ProcessedEmail;
  offer: RawOffer;
  index: number;
};

function findOfferByKey(emails: ProcessedEmail[], key: string): Found | null {
  for (const e of emails) {
    for (let i = 0; i < e.offers.length; i++) {
      const o = e.offers[i];
      if (offerBridgeKey(o) === key) return { email: e, offer: o, index: i };
    }
  }
  return null;
}

function Pipeline({ status }: { status: CandidatureStatus }) {
  const cur = candidatureRank(status);
  return (
    <ol className="flex flex-wrap gap-2" data-testid="candidature-pipeline">
      {CANDIDATURE_STEPS.map((s, i) => {
        const done = i <= cur;
        const active = i === cur;
        return (
          <li
            key={s.status}
            className={`chip ${active ? "chip--mint" : done ? "chip--mint opacity-70" : "chip--muted"}`}
            data-step={s.status}
            data-active={active ? "true" : "false"}
          >
            {done ? "✓ " : `${i + 1}. `}
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

export default function OfferDetailPage() {
  const { user } = useAuth();
  const [data, setData] = useState<UserData | null>(null);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryKey, setQueryKey] = useState<string | null>(null);
  const [cand, setCand] = useState<CandidatureState | null>(null);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [gauge, setGauge] = useState(CIRC);
  const [matchBusy, setMatchBusy] = useState(false);
  const [letterBusy, setLetterBusy] = useState(false);
  const [letter, setLetter] = useState("");
  const [letterDirty, setLetterDirty] = useState(false);
  const [selMissing, setSelMissing] = useState<Set<string>>(new Set());
  const [cvSource, setCvSource] = useState<string>("original");
  const [toast, setToast] = useState<string | null>(null);

  const email = user?.email ?? "";

  /* Query key — différé (hydration), même pattern que le dashboard. */
  useEffect(() => {
    const id = window.setTimeout(() => {
      const qs = new URLSearchParams(window.location.search);
      setQueryKey((qs.get("k") || "").trim() || null);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  /* UserData + état de candidature */
  useEffect(() => {
    if (!user) return;
    const id = window.setTimeout(() => setData(getOrCreateData(user.name, user.email)), 0);
    return () => window.clearTimeout(id);
  }, [user]);

  /* Charge l'offre depuis le dashboard */
  const loadOffer = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/gmail/dashboard?email=${encodeURIComponent(email)}`, {
        cache: "no-store",
      });
      const j = (await r.json()) as DashboardPayload;
      if (!r.ok || !j.ok) throw new Error(j.error || j.reason || "Chargement impossible");
      setPayload(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    if (!email || !queryKey) return;
    const id = window.setTimeout(() => {
      void loadOffer();
    }, 0);
    return () => window.clearTimeout(id);
  }, [email, queryKey, loadOffer]);

  const found: Found | null = useMemo(() => {
    if (!payload || !queryKey) return null;
    return findOfferByKey(payload.emails, queryKey);
  }, [payload, queryKey]);

  /* P0-5 : le dashboard sert un payload allégé (snippet/sourceUrl sortis) —
     on régénère l'offre complète (1 lecture checkpoint) juste ici. Le détail
     est rattaché à sa clé : un changement de queryKey l'ignore proprement. */
  const [detail, setDetail] = useState<{ k: string; offer: RawOffer } | null>(null);
  useEffect(() => {
    if (!found || !queryKey) return;
    if (found.offer.snippet && found.offer.sourceUrl) return;
    let stop = false;
    void (async () => {
      try {
        const r = await fetch(
          `/api/gmail/offer-detail?id=${encodeURIComponent(found.email.id)}`
        );
        const j = (await r.json()) as { ok?: boolean; offers?: RawOffer[] };
        if (stop || !j.ok || !Array.isArray(j.offers)) return;
        const full = j.offers.find((o) => offerBridgeKey(o) === queryKey) ?? null;
        if (full) setDetail({ k: queryKey, offer: full });
      } catch {
        /* détail non critique : la page reste utilisable sans snippet */
      }
    })();
    return () => {
      stop = true;
    };
  }, [found, queryKey]);

  /* Restaure l'état de candidature dès que l'offre est trouvée,
     puis lance le matching ATS une fois (si aucun score déjà calculé). */
  const matchStarted = useRef(false);
  useEffect(() => {
    if (!email || !queryKey) return;
    const id = window.setTimeout(() => {
      const c = getCandidature(email, queryKey);
      setCand(c);
      if (c?.letter) {
        setLetter(c.letter);
        setLetterDirty(false);
      }
      if (c?.score != null && c.present && c.missing) {
        setMatch({
          score: c.score,
          matched: c.present,
          missing: c.missing,
          strategy: c.strategy,
        });
        setSelMissing(new Set(c.missing));
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [email, queryKey, found]);

  useEffect(() => {
    if (!match) return;
    const id = window.setTimeout(() => setGauge(CIRC * (1 - match.score / 100)), 60);
    return () => window.clearTimeout(id);
  }, [match]);

  const offer = detail && detail.k === queryKey ? detail.offer : (found?.offer ?? null);
  const offerKey = queryKey;
  const eb = offer ? enrichBadge(offer.enrichStatus) : null;
  const offerText = useMemo(() => (offer ? offerToOfferText(offer) : ""), [offer]);
  const status: CandidatureStatus = cand?.status ?? "none";

  const persistCand = useCallback(
    (patch: Partial<CandidatureState>) => {
      if (!email || !offerKey) return;
      const base: CandidatureState = cand ?? {
        key: offerKey,
        status: "none",
        updatedAt: new Date().toISOString(),
      };
      const next = saveCandidature(email, { ...base, ...patch, key: offerKey });
      setCand(next);
      return next;
    },
    [email, offerKey, cand]
  );

  const structuredCv = useMemo(() => {
    if (!data) return "";
    const p = data.profile;
    return [
      `${p.firstName} ${p.lastName}`,
      p.title,
      p.city,
      p.email,
      p.phone,
      `Compétences : ${p.skills.join(", ")}`,
      ...p.experiences.map((e) => `${e.title} — ${e.place} (${e.period}) : ${e.detail}`),
      ...p.educations.map((e) => `${e.degree} — ${e.school} (${e.period})`),
    ]
      .filter(Boolean)
      .join("\n");
  }, [data]);

  const origText = data?.originalCv?.text?.trim() || structuredCv;

  const cvOptions = useMemo(() => {
    if (!data) return [] as { id: string; name: string; text: string }[];
    const builder = data.cvData ? { id: "builder", name: "Mon CV (Builder)", text: "" } : null;
    const list: { id: string; name: string; text: string }[] = [];
    if (data.originalCv?.text) {
      list.push({ id: "original", name: data.originalCv.name || "CV original", text: data.originalCv.text });
    }
    if (builder && origText) list.push({ id: "profile", name: "Profil / Builder", text: origText });
    return list;
  }, [data, origText]);

  /* ── Matching ATS (task match — module existant) ─────────────── */
  const upsertOfferIntoData = useCallback(
    (score: number) => {
      if (!user || !offer || !data) return;
      const detected = offerToDetectedOffer(offer, score);
      const others = data.offers.filter((o) => o.id !== detected.id);
      const d = getOrCreateData(user.name, user.email);
      saveData(user.email, {
        ...d,
        offers: [detected, ...others].slice(0, 40),
      });
      setData(getOrCreateData(user.name, user.email));
    },
    [user, offer, data]
  );

  const runMatch = async () => {
    if (!data || !offer || !offerText || matchBusy || offerText.trim().length < 30) return;
    setMatchBusy(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "match",
          profile: data.profile,
          cvOriginal: data.originalCv?.text || origText || undefined,
          offerText,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const r = json.result as MatchResult;
      const score = Math.max(0, Math.min(100, Math.round(r.score)));
      const matched = r.matched ?? [];
      const missing = r.missing ?? [];
      setMatch({ ...r, score, matched, missing });
      setSelMissing(new Set(missing));
      persistCand({
        status: status === "none" ? "adaptation" : status,
        score,
        present: matched,
        missing,
        strategy: r.strategy,
      });
      upsertOfferIntoData(score);
      setToast(`Matching ATS — ${score}% de compatibilité`);
    } catch {
      /* Analyse locale de secours (même moteur que Matching ATS). */
      const local = analyzeOffer(offerText);
      const score = Math.max(0, Math.min(100, Math.round(local.score)));
      const matched = local.found.map((f) => f.key);
      const missing = local.missing.map((m) => m.key);
      setMatch({
        score,
        matched,
        missing,
        strategy: "IA indisponible — analyse locale des mots-clés de l'offre.",
      });
      setSelMissing(new Set(missing));
      persistCand({
        status: status === "none" ? "adaptation" : status,
        score,
        present: matched,
        missing,
        strategy: "IA indisponible — analyse locale des mots-clés de l'offre.",
      });
      upsertOfferIntoData(score);
      setToast("IA indisponible — matching local appliqué");
    } finally {
      setMatchBusy(false);
    }
  };

  /* Auto-matching ATS une fois l'offre chargée (si aucun score déjà calculé).
     Déféré pour éviter setState synchrone dans l'effet React. */
  useEffect(() => {
    if (matchStarted.current) return;
    if (!data || !offer || !offerText || offerText.trim().length < 30) return;
    if (match || matchBusy || cand?.score != null) return;
    matchStarted.current = true;
    const id = window.setTimeout(() => {
      void runMatch();
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, offer, offerText, match, matchBusy, cand?.score]);

  const toggleMissing = (key: string) => {
    setSelMissing((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /* ── Adaptation CV IA — pont cible:quick-adapt (module existant) ── */
  const openAdaptation = () => {
    if (!offer || offerText.trim().length < 30) {
      setToast("Texte d'offre trop court pour l'adaptation");
      return;
    }
    writeQuickAdapt(offerText, [...selMissing], {
      title: offer.title,
      company: offer.company,
      location: offer.location,
      salary: offer.salary,
      summary: offer.summary,
      keywords: offer.keywords,
      source: offer.source,
      url: offer.applicationUrl || offer.sourceUrl,
      match: match?.score,
      present: match?.matched,
      missing: match?.missing,
    });
    persistCand({ status: candidatureRank(status) < 1 ? "adaptation" : status });
    if (data) upsertOfferIntoData(match?.score ?? 0);
    // Navigation full-page volontaire après persistance locale.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/app/adaptation";
  };

/* ── Lettre de motivation (task letter — module existant) ─────── */
  const buildLocalLetter = (name: string): string => {
    const skills = data?.profile.skills.slice(0, 4).join(", ") || "mes compétences";
    return [
      `Objet : Candidature — ${offer?.title ?? "poste"} chez ${offer?.company ?? "votre entreprise"}`,
      "",
      `${offer?.company ?? "Madame, Monsieur"},`,
      "",
      `Je vous adresse ma candidature pour le poste de ${offer?.title ?? "cdi"} ${
        offer?.location ? `à ${offer.location}` : ""
      }.`,offer?.description?.trim()
        ? `Votre offre a retenu mon attention : ${offer.description.slice(0, 280)}${
            (offer.description?.length ?? 0) > 280 ? "…" : ""
          }`
        : "Votre annonce correspond à mon projet professionnel.",
      "",
      `Mon parcours me permet d'apporter ${skills}. Je serais ravi d'échanger sur la manière dont ces atouts peuvent servir vos objectifs.`,
      "",
      `Je reste à votre disposition pour un entretien.`,
      "",
      `Cordialement,`,
      `${name}`,
      data?.profile.email || "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const generateLetter = async () => {
    if (!user || !data || !offer || letterBusy) return;
    setLetterBusy(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "letter",
          profile: data.profile,
          cvOriginal: data.originalCv?.text || origText || undefined,
          offerText: offerText || `${offer.title} chez ${offer.company} (${offer.location})`,
          company: offer.company,
          role: offer.title,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const r = json.result as { subject?: string; body?: string };
      const draft = [r.subject, "", r.body].filter(Boolean).join("\n");
      setLetter(draft);
      setLetterDirty(false);
      persistCand({
        status: "letter_ready",
        letter: draft,
        letterSubject: r.subject,
      });
      const detected = offerToDetectedOffer(offer, match?.score ?? 0);
      const d = getOrCreateData(user.name, user.email);
      saveData(user.email, {
        ...d,
        offers: [detected, ...d.offers.filter((o) => o.id !== detected.id)].slice(0, 40),
        letters: [
          {
            id: uid(),
            applicationId: null,
            company: offer.company,
            role: offer.title,
            content: draft,
            date: new Date().toLocaleDateString("fr-FR"),
          },
          ...d.letters.filter((l) => !(l.company === offer.company && l.role === offer.title)),
        ],
      });
      setData(getOrCreateData(user.name, user.email));
      setToast("Lettre générée et enregistrée");
    } catch (e) {
      /* Brouillon local structuré si l'IA est en échec. */
      const draft = buildLocalLetter(
        [data.profile.firstName, data.profile.lastName].filter(Boolean).join(" ").trim() ||
          user.name
      );
      setLetter(draft);
      setLetterDirty(true);
      persistCand({ status: "letter_ready", letter: draft });
      setToast(
        e instanceof Error
          ? `IA indisponible — brouillon local créé (${e.message})`
          : "IA indisponible — brouillon local créé"
      );
    } finally {
      setLetterBusy(false);
    }
  };

  const saveLetterEdit = () => {
    if (!letter.trim()) return;
    persistCand({ status: candidatureRank(status) < 2 ? "letter_ready" : status, letter });
    setLetterDirty(false);
    setToast("Lettre enregistrée");
  };

  /* ── Marquer candidature envoyée (tableau de suivi existant) ─── */
  const markSent = () => {
    if (!user || !offer || !data) return;
    const d = getOrCreateData(user.name, user.email);
    const selected = cvOptions.find((c) => c.id === cvSource) ?? cvOptions[0];
    saveData(user.email, {
      ...d,
      applications: [
        {
          id: uid(),
          company: offer.company || "Entreprise non précisée",
          role: offer.title || "Offre Gmail",
          status: "sent",
          daysAgo: 0,
          source: offer.source ? `Alertes Gmail · ${offer.source}` : "Alertes Gmail",
          cvName: selected?.name,
          cvText: selected?.text || origText || undefined,
          letterText: (letterDirty ? letter : cand?.letter) || letter || undefined,
          date: new Date().toISOString(),
        },
        ...d.applications,
      ],
    });
    persistCand({ status: "sent", letter: letterDirty ? letter : cand?.letter || letter || undefined });
    setData(getOrCreateData(user.name, user.email));
    setToast("Candidature ajoutée au tableau de suivi");
  };

  /* ── UI ──────────────────────────────────────────────────────── */

  if (!user) {
    return (
      <div className="app-boot">
        <p className="mono-label">chargement de l&apos;offre…</p>
      </div>
    );
  }

  if (!queryKey) {
    return (
      <>
        <AppPageHead eyebrow="Alertes Gmail" title="Offre introuvable" />
        <div className="glass-card p-8" data-testid="offer-missing">
          <p className="text-[0.9rem] text-text-dim">
            Aucune offre sélectionnée. Reviens au{" "}
            <Link href="/app/alertes-gmail" className="text-mint underline underline-offset-2">
              dashboard Alertes Gmail
            </Link>{" "}
            et clique sur « Postuler ».
          </p>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <AppPageHead eyebrow="Alertes Gmail" title="Chargement de l'offre…" />
        <div className="glass-card p-8 animate-pulse" data-testid="offer-loading">
          <div className="h-4 w-1/3 bg-line rounded-full" />
          <div className="h-3 w-1/2 bg-line rounded-full mt-4" />
          <div className="h-3 w-2/3 bg-line rounded-full mt-3" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <AppPageHead eyebrow="Alertes Gmail" title="Erreur de chargement" />
        <div className="glass-card p-8 border-l-2! border-l-red-400!" data-testid="offer-error">
          <p className="text-[0.9rem] text-red mb-4">{error}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => void loadOffer()}>
              Réessayer
            </button>
            <Link href="/app/alertes-gmail" className="btn-line">
              ← Dashboard
            </Link>
          </div>
        </div>
      </>
    );
  }

  if (!offer || !found) {
    return (
      <>
        <AppPageHead eyebrow="Alertes Gmail" title="Offre introuvable" />
        <div className="glass-card p-8" data-testid="offer-missing">
          <p className="text-[0.9rem] text-text-dim mb-4">
            Cette offre n&apos;est plus dans les checkpoints (re-sync ou offre expirée).
          </p>
          <Link href="/app/alertes-gmail" className="btn-primary">
            ← Retour aux alertes
          </Link>
        </div>
      </>
    );
  }

  const enriched = offer.enrichStatus === "ok";
  const hasDetail =
    enriched ||
    Boolean(offer.description?.trim()) ||
    Boolean(offer.missions?.length) ||
    Boolean(offer.snippet?.trim());

  return (
    <>
      <AppPageHead
        eyebrow="Alertes Gmail · Candidature"
        title={offer.title || "Sans titre"}
        sub={[offer.company, offer.location].filter(Boolean).join(" · ") || undefined}
      />

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Link href="/app/alertes-gmail" className="btn-line" data-testid="btn-back-dashboard">
          ← Alertes Gmail
        </Link>
        {offer.applicationUrl && (
          <a
            href={offer.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-line"
            data-testid="btn-external-apply"
          >
            {offer.searchFallback ? "Ouvrir la recherche ↗" : "Postuler sur le site ↗"}
          </a>
        )}
        {offer.sourceUrl && offer.sourceUrl !== offer.applicationUrl && (
          <a
            href={offer.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-line opacity-70"
            data-testid="btn-source-proof"
          >
            Lien source (mail) ↗
          </a>
        )}
      </div>

      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-4 items-start">
        {/* ── Détails de l'offre ─────────────────────────────────── */}
        <section className="glass-card p-6" data-testid="offer-detail">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <p className="mono-label">{[offer.source, found.email.subject].filter(Boolean).join(" · ")}</p>
            {eb && (
              <span className={eb.cls} data-enrich={offer.enrichStatus || "none"}>
                enrich · {eb.label}
              </span>
            )}
          </div>

          {!enriched && (
            <p
              className="text-[0.78rem] text-amber mb-4 border-l-2! border-l-amber! pl-3"
              data-testid="enrich-warning"
            >
              Offre non enrichie — affichage des données extraites de l&apos;e-mail
              {offer.enrichReason ? ` (${offer.enrichReason})` : ""}.
            </p>
          )}

          <div className="flex flex-wrap gap-1.5 mb-4">
            {offer.contract && <span className="chip chip--mint">{offer.contract}</span>}
            {offer.duration && <span className="chip">{offer.duration}</span>}
            {offer.deadline && <span className="chip chip--amber">limite {offer.deadline}</span>}
            {offer.salary && <span className="chip chip--mint">{offer.salary}</span>}
            {offer.searchFallback && <span className="chip">lien (recherche)</span>}
            {(offer.indirect ?? isIndirectOfferUrl(offer.applicationUrl)) && (
              <span
                className="chip chip--amber"
                data-testid="indirect-badge"
                title="Redirection Indeed opaque non résoluble hors ligne — le lien ouvre Indeed puis l'offre"
              >
                Lien non direct
              </span>
            )}
          </div>

          {(offer.skills?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {offer.skills.map((s) => (
                <span key={s} className="kw-chip is-added text-[0.68rem]">
                  {s}
                </span>
              ))}
            </div>
          )}

          {offer.summary && (
            <div className="mb-4">
              <p className="mono-label mb-1.5">Résumé (3 phrases)</p>
              <p className="text-[0.88rem] text-text-dim leading-relaxed" data-testid="offer-summary">
                {offer.summary}
              </p>
            </div>
          )}

          {offer.description && (
            <div className="mb-4">
              <p className="mono-label mb-1.5">Description</p>
              <p className="text-[0.88rem] text-text-dim leading-relaxed" data-testid="offer-description">
                {offer.description}
              </p>
            </div>
          )}

          {(offer.missions?.length ?? 0) > 0 && (
            <div className="mb-4">
              <p className="mono-label mb-1.5">Missions</p>
              <ul className="space-y-1">
                {(offer.missions ?? []).map((m, i) => (
                  <li key={i} className="text-[0.84rem] text-text-dim leading-relaxed">
                    • {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(offer.prerequisites?.length ?? 0) > 0 && (
            <div className="mb-4">
              <p className="mono-label mb-1.5">Prérequis</p>
              <ul className="space-y-1">
                {(offer.prerequisites ?? []).map((p, i) => (
                  <li key={i} className="text-[0.84rem] text-text-dim leading-relaxed">
                    • {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {offer.profile && (
            <div className="mb-4">
              <p className="mono-label mb-1.5">Profil recherché</p>
              <p className="text-[0.86rem] text-text-dim leading-relaxed">{offer.profile}</p>
            </div>
          )}

          {(offer.keywords?.length ?? 0) > 0 && (
            <div className="mb-4">
              <p className="mono-label mb-1.5">Mots-clés ATS</p>
              <div className="flex flex-wrap gap-1.5">
                {(offer.keywords ?? []).map((k) => (
                  <span key={k} className="kw-chip is-added">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}

          {offer.applicationInfo && (
            <div className="mb-4">
              <p className="mono-label mb-1.5">Modalités de candidature</p>
              <p className="text-[0.84rem] text-text-dim leading-relaxed">{offer.applicationInfo}</p>
            </div>
          )}

          {!hasDetail && (
            <p className="text-[0.8rem] text-muted" data-testid="no-detail-hint">
              Peu de détails dans ce mail — lance le Matching puis l&apos;Adaptation IA pour travailler
              avec ce qu&apos;il y a.
            </p>
          )}

          {offer.snippet && (
            <details className="mt-2">
              <summary className="text-mint text-[0.8rem] cursor-pointer hover:text-mint-strong">
                Extrait de l&apos;e-mail →
              </summary>
              <p
                className="text-[0.82rem] text-text-dim leading-relaxed mt-1.5"
                data-testid="offer-snippet"
              >
                {stripHtml(offer.snippet)}
              </p>
              <details className="mt-1.5">
                <summary className="text-[0.72rem] text-muted cursor-pointer hover:text-mint">
                  HTML d&apos;origine (preuve technique)
                </summary>
                <pre className="text-[0.68rem] font-mono text-muted bg-surface-2/70 rounded p-3 mt-1.5 overflow-x-auto max-h-40 whitespace-pre-wrap break-words">
                  {offer.snippet}
                </pre>
              </details>
            </details>
          )}

          {offer.anchorText && (
            <p className="text-[0.7rem] text-muted mt-3 truncate">
              <span className="mono-label mr-1">anchorText</span>
              « {offer.anchorText} »
            </p>
          )}

          <p className="text-[0.68rem] text-muted mt-4 border-t border-line pt-3 break-all">
            <span className="mono-label mr-1">e-mail</span>
            {found.email.id} · offre #{found.index + 1}
            {found.email.from && (
              <>
                {" · "}
                <span className="mono-label mr-1">de</span>
                {found.email.from}
              </>
            )}
          </p>
        </section>

        {/* ── Section Candidature ────────────────────────────────── */}
        <section className="glass-card p-6 lg:sticky lg:top-24" data-testid="candidature-section">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h2 className="font-display text-lg font-semibold">Candidature</h2>
            <span className="mono-label" data-testid="candidature-status">
              {CANDIDATURE_STEPS.find((s) => s.status === status)?.label ?? "Pas encore"}
            </span>
          </div>

          <div className="mb-6">
            <Pipeline status={status} />
          </div>

          {/* 1 · Matching ATS */}
          <div className="border-t border-line pt-4 mb-4" data-testid="block-matching">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="mono-label">1 · Matching ATS</p>
              <button
                type="button"
                className="btn-primary text-[0.8rem]!"
                onClick={() => void runMatch()}
                disabled={matchBusy || offerText.trim().length < 30}
                data-testid="btn-run-match"
              >
                {matchBusy ? (
                  <>
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Analyse…
                  </>
                ) : match ? (
                  "Re-analyser"
                ) : (
                  "Analyser mon CV"
                )}
              </button>
            </div>

            {!data?.originalCv?.text && !structuredCv && (
              <p className="text-[0.78rem] text-amber mb-2">
                Colle ton CV dans{" "}
                <Link href="/app/cv" className="underline">
                  CV intelligent
                </Link>{" "}
                pour un score réel.
              </p>
            )}

            {match ? (
              <div data-testid="match-result">
                <div className="flex items-center gap-4 mb-3">
                  <div className="relative w-fit">
                    <svg width="84" height="84" viewBox="0 0 128 128" aria-hidden="true">
                      <circle cx="64" cy="64" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
                      <circle
                        cx="64"
                        cy="64"
                        r={R}
                        fill="none"
                        stroke="var(--emerald)"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={CIRC}
                        strokeDashoffset={gauge}
                        transform="rotate(-90 64 64)"
                        style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1)" }}
                      />
                    </svg>
                    <div className="absolute inset-0 grid place-items-center">
                      <p className="font-display text-xl font-semibold tabular-nums">
                        {match.score}
                        <span className="text-sm text-muted">%</span>
                      </p>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.78rem] text-muted">compatibilité CV ↔ offre</p>
                    {match.strategy && (
                      <p className="text-[0.8rem] text-text-dim leading-relaxed mt-1 line-clamp-4">
                        {match.strategy}
                      </p>
                    )}
                  </div>
                </div>

                {match.matched.length > 0 && (
                  <div className="mb-3">
                    <p className="mono-label mb-1.5">Présents dans ton CV ({match.matched.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {match.matched.map((k) => (
                        <span key={k} className="kw-chip is-added" data-testid="kw-present">
                          {k} ✓
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {match.missing.length > 0 && (
                  <div className="mb-2">
                    <p className="mono-label mb-1.5">
                      Manquants · clique pour les forcer en adaptation
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {match.missing.map((k) => {
                        const on = selMissing.has(k);
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => toggleMissing(k)}
                            aria-pressed={on}
                            className={`kw-chip cursor-pointer ${on ? "border-mint/60! bg-mint/10! text-mint!" : "border-amber/40! text-amber!"}`}
                            data-testid="kw-missing"
                          >
                            {on ? "✓ " : ""}
                            {k}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[0.78rem] text-muted">
                Score, mots-clés présents et manquants — même moteur que Matching ATS.
              </p>
            )}
          </div>

          {/* 2 · Adaptation CV IA */}
          <div className="border-t border-line pt-4 mb-4" data-testid="block-adaptation">
            <p className="mono-label mb-2">2 · Adaptation CV IA</p>
            <p className="text-[0.78rem] text-muted mb-3 leading-relaxed">
              Passe à Adaptation IA avec cette offre pré-chargée
              {selMissing.size > 0 ? ` (+${selMissing.size} mot-clé(s) forcé(s))` : ""} — matching,
              réécriture chirurgicale et contrôle des faits.
            </p>
            <button
              type="button"
              className="btn-primary w-full justify-center"
              onClick={openAdaptation}
              disabled={offerText.trim().length < 30}
              data-testid="btn-open-adaptation"
            >
              Optimiser mon CV pour cette offre →
            </button>
          </div>

          {/* 3 · Lettre de motivation */}
          <div className="border-t border-line pt-4 mb-4" data-testid="block-letter">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="mono-label">3 · Lettre de motivation</p>
              <button
                type="button"
                className="btn-primary text-[0.8rem]!"
                onClick={() => void generateLetter()}
                disabled={letterBusy}
                data-testid="btn-generate-letter"
              >
                {letterBusy ? (
                  <>
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    {AI_LABEL.writeBusy}
                  </>
                ) : letter ? (
                  "Régénérer"
                ) : (
                  "✨ Générer ma lettre"
                )}
              </button>
            </div>
            {letter ? (
              <div data-testid="letter-result">
                <textarea
                  className="input text-[0.82rem]"
                  rows={9}
                  value={letter}
                  onChange={(e) => {
                    setLetter(e.target.value);
                    setLetterDirty(true);
                  }}
                  aria-label="Lettre de motivation"
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  <button type="button" className="btn-line text-[0.78rem]!" onClick={saveLetterEdit} disabled={!letterDirty}>
                    {letterDirty ? "Enregistrer les mods" : "Enregistrée"}
                  </button>
                  <button
                    type="button"
                    className="btn-line text-[0.78rem]!"
                    onClick={() => {
                      void navigator.clipboard?.writeText(letter).then(
                        () => setToast("Lettre copiée"),
                        () => setToast("Copie impossible")
                      );
                    }}
                  >
                    Copier
                  </button>
                </div>
                {letterDirty && <p className="text-[0.7rem] text-amber mt-1">modifié — non enregistré</p>}
              </div>
            ) : (
              <p className="text-[0.78rem] text-muted">
                Lettre calquée sur ton CV et le vocabulaire de l&apos;offre (module Lettres existant).
              </p>
            )}
          </div>

          {/* 4 · Envoyer */}
          <div className="border-t border-line pt-4" data-testid="block-send">
            <p className="mono-label mb-2">4 · Finaliser</p>
            {cvOptions.length > 1 && (
              <select
                className="input h-9 text-[0.8rem] mb-2"
                value={cvSource}
                onChange={(e) => setCvSource(e.target.value)}
                aria-label="CV à archiver"
              >
                {cvOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <div className="flex flex-col gap-2">
              {status !== "sent" ? (
                <button
                  type="button"
                  className="btn-primary w-full justify-center"
                  onClick={markSent}
                  data-testid="btn-mark-sent"
                >
                  ✓ J&apos;ai postulé — ajouter au suivi
                </button>
              ) : (
                <p className="text-[0.8rem] text-mint" data-testid="sent-confirmation">
                  Candidature enregistrée dans le tableau de suivi.
                </p>
              )}
              <Link href="/app/candidatures" className="btn-line w-full justify-center text-[0.85rem]!">
                Voir le tableau de suivi →
              </Link>
              <Link href="/app/lettres" className="btn-line w-full justify-center text-[0.85rem]!">
                Mes lettres →
              </Link>
            </div>
          </div>
        </section>
      </div>

      {toast && (
        <div className="toast" role="status">
          <span className="w-2 h-2 rounded-full bg-mint inline-block" />
          {toast}
        </div>
      )}
    </>
  );
}
