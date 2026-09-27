"use client";

/* Table dédiée « Alertes Gmail » — totalement séparée des Offres réelles. */

export type GmailOfferStatus = "nouvelle" | "analysée" | "ignorée" | "expirée" | "doublon";
export type GmailApplied = "none" | "preparation" | "envoyée";

export type GmailOffer = {
  id: string;
  gmailMessageId: string;
  title: string;
  company: string;
  location: string;
  contract: string;
  duration: string;
  deadline: string;
  skills: string[];
  description: string;
  applicationUrl: string;
  source: string;
  /** Preuves d'extraction : URL d'origine dans le mail, texte visible du lien,
      fragment HTML du bloc — affichées en debug, jamais inventées. */
  sourceUrl?: string;
  anchorText?: string;
  snippet?: string;
  /** Fiche enrichie (page d'annonce ouverte par le serveur + synthèse IA). */
  salary?: string;
  missions?: string[];
  /** Mots-clés techniques (ATS) extraits de la page d'annonce. */
  keywords?: string[];
  /** Prérequis exigés (formation, expérience, langues…). */
  prerequisites?: string[];
  /** Modalités de candidature (email, formulaire, étapes…). */
  applicationInfo?: string;
  profile?: string;
  enrichStatus?: EnrichStatus;
  enrichReason?: string;
  enrichedAt?: string;
  emailSubject: string;
  emailFrom: string;
  receivedAt: string;
  addedAt: string;
  status: GmailOfferStatus;
  applied: GmailApplied;
  /** Lien de recherche généré (aucune URL réelle dans l'e-mail) : pas
      d'enrichissement de page possible, bouton = recherche. */
  searchFallback?: boolean;
  /** Score de matching (déterminé par Gemini au classement quotidien). */
  score?: number;
  scoreReasons?: string[];
  present?: string[];
  missing?: string[];
  /** CV adapté généré À LA DEMANDE — jamais automatiquement. */
  cvDraft?: string;
  /** Lettre générée À LA DEMANDE. */
  letterDraft?: { subject: string; body: string };
  /** Clés d'anti-doublon. */
  urlKey: string;
  titleCompanyKey: string;
};

export type EnrichStatus = "none" | "ok" | "partial" | "blocked" | "skipped";

/** Une fiche est « incomplète » quand la page d'annonce n'a pas pu être lue
    (page bloquée / connexion exigée / budget de sync dépassé). Dans ce cas
    l'offre garde les informations de l'e-mail, clairement marquées. */
export function isIncomplete(offer: GmailOffer): boolean {
  return (
    offer.enrichStatus === "blocked" ||
    offer.enrichStatus === "skipped" ||
    offer.enrichStatus === "partial"
  );
}

export type SyncSummary = {
  emailsRead: number;
  detected: number;
  added: number;
  duplicates: number;
  /** E-mails déclarés « sans offre » APRÈS vérification dédiée par l'IA. */
  rejected: number;
  /** E-mails dont l'analyse a échoué (erreur) : à relancer, pas « sans offre ». */
  errors: number;
  at: string;
};

export type GmailStore = {
  v: number;
  label: string;
  offers: GmailOffer[];
  lastSync: string | null;
  lastSummary: SyncSummary | null;
  /** Top 10 du jour : ids classés + date du jour où ils ont été calculés. */
  daily: { date: string; ids: string[] } | null;
  connectedEmail?: string;
};

export const GMAIL_LABEL = "Stages – Alertes offres";
const STORE_VERSION = 1;
const uid = () => Math.random().toString(36).slice(2, 9);

const keyFor = (email: string) => `cible:gmail:v${STORE_VERSION}:${email.toLowerCase()}`;

export function emptyGmailStore(): GmailStore {
  return { v: STORE_VERSION, label: GMAIL_LABEL, offers: [], lastSync: null, lastSummary: null, daily: null };
}

export function loadGmailStore(email: string): GmailStore {
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    if (!raw) return emptyGmailStore();
    const parsed = JSON.parse(raw) as GmailStore;
    return { ...emptyGmailStore(), ...parsed, offers: Array.isArray(parsed.offers) ? parsed.offers : [] };
  } catch {
    return emptyGmailStore();
  }
}

export function saveGmailStore(email: string, store: GmailStore) {
  try {
    window.localStorage.setItem(keyFor(email), JSON.stringify(store));
  } catch {
    /* quota dépassé — sans conséquences pour la démo */
  }
}

export function clearGmailStore(email: string) {
  try {
    window.localStorage.removeItem(keyFor(email));
  } catch {
    /* ignore */
  }
}

/* ── Anti-doublon ─────────────────────────────────────────── */

/** Normalise une URL de candidature : retire UTM/trackers, garde l'essentiel. */
export function normalizeUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    u.hash = "";
    const keep: string[] = [];
    for (const [k, v] of u.searchParams.entries()) {
      if (!/^(utm_.*|fbclid|gclid|msclkid|mc_[a-z]+|igsh|si|ref|ref_|spm|hs_.*|woosmap)$/i.test(k)) {
        keep.push(`${k}=${v}`);
      }
    }
    u.search = keep.length ? `?${keep.join("&")}` : "";
    return u.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function parseDeadline(deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  const m = deadline.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getTime();
  }
  const d = new Date(deadline);
  return isNaN(d.getTime()) ? null : d.getTime();
}

export function isExpired(offer: GmailOffer): boolean {
  const t = parseDeadline(offer.deadline);
  return t !== null && t < Date.now();
}

/* ── Import brut → offres dédupées ─────────────────────────── */

export type SyncEmailResult = {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  isOffer: boolean;
  reason: string;
  finalStatus?: "detected" | "no_offer" | "analyze_error";
  recoveryUsed?: boolean;
  fromCache?: boolean;
  offers: {
    title: string;
    company: string;
    location: string;
    contract: string;
    duration: string;
    deadline: string;
    salary?: string;
    skills: string[];
    missions?: string[];
    keywords?: string[];
    prerequisites?: string[];
    applicationInfo?: string;
    profile?: string;
    description: string;
    applicationUrl: string;
    source: string;
    sourceUrl?: string;
    anchorText?: string;
    snippet?: string;
    enrichStatus?: EnrichStatus;
    enrichReason?: string;
    enrichedAt?: string;
    searchFallback?: boolean;
    /** Anti-doublon tardif (import) — renvoyé par le serveur Module 2. */
    importStatus?: "nouvelle" | "doublon";
    importReason?: string;
    /** P1-6 : clés anti-doublon gelées serveur avant enrichissement. */
    dedupUrlKey?: string;
    dedupTclKey?: string;
  }[];
};

/** Fusionne les résultats serveur dans le store : dédup par message Gmail,
    par URL normalisée puis par titre+entreprise+localisation. */
export function ingestSyncResults(
  store: GmailStore,
  emails: SyncEmailResult[]
): { store: GmailStore; summary: SyncSummary } {
  /* NOTE : PAS de déduplication par message Gmail (byMsg). Un e-mail d'alerte
     contient plusieurs offres ; marquer le message dès sa première offre, c'est
     transformer les offres 2..N du même mail en faux « doublons », et au sync
     suivant verrouiller le message entier même si des offres manquaient au
     premier passage. La dédup se fait par URL normalisée puis par
     titre+entreprise+localisation : ça suffit et ça ne perd rien. */
  const next: GmailStore = { ...store, offers: [...store.offers] };
  /* P1-6 : double format de clé URL — jk:… (identifiant plateforme) ET URL
     normalisée legacy — pour matcher aussi les stores créés avant le
     changement de format de importUrlKey. */
  const byUrl = new Set<string>();
  for (const o of next.offers) {
    if (o.urlKey) byUrl.add(o.urlKey);
    const legacy = normalizeUrl(o.applicationUrl || "");
    if (legacy) byUrl.add(legacy);
  }
  const byKey = new Set(next.offers.map((o) => o.titleCompanyKey));

  let added = 0;
  let duplicates = 0;
  let rejected = 0;
  let errors = 0;

  for (const em of emails) {
    if (!em.isOffer || em.offers.length === 0) {
      if (em.finalStatus === "analyze_error") errors += 1;
      else rejected += 1; // vérifié par l'IA (passe principale + récupération)
      continue;
    }
    for (const off of em.offers) {
      const legacyUrlKey = normalizeUrl(off.applicationUrl || "");
      const urlKey = off.dedupUrlKey || legacyUrlKey;
      const tck =
        `${(off.title || "").trim().toLowerCase()}|${(off.company || "").trim().toLowerCase()}|${(off.location || "").trim().toLowerCase()}`;
      /* Doublon si la clé gelée OU la clé legacy matche (transition formats),
         puis sur le titre+entreprise+localité gelé (avant enrich) ou actuel. */
      const urlDup =
        (!!urlKey && byUrl.has(urlKey)) ||
        (!!legacyUrlKey && byUrl.has(legacyUrlKey));
      const tckDup =
        byKey.has(tck) || (!!off.dedupTclKey && byKey.has(off.dedupTclKey));
      if (urlDup || tckDup) {
        duplicates += 1;
        continue;
      }
      const offer: GmailOffer = {
        id: uid(),
        gmailMessageId: em.id,
        title: (off.title || "").trim(),
        company: (off.company || "").trim() || "Entreprise non précisée",
        location: (off.location || "").trim() || "Localisation non précisée",
        contract: (off.contract || "").trim(),
        duration: (off.duration || "").trim(),
        deadline: (off.deadline || "").trim(),
        skills: Array.isArray(off.skills) ? off.skills.filter(Boolean).slice(0, 8) : [],
        description: (off.description || "").trim(),
        applicationUrl: (off.applicationUrl || "").trim(),
        source: (off.source || "Autre").trim(),
        sourceUrl: off.sourceUrl?.trim() || undefined,
        anchorText: off.anchorText?.trim() || undefined,
        snippet: off.snippet || undefined,
        salary: off.salary ? (off.salary || "").trim() : undefined,
        missions: Array.isArray(off.missions)
          ? off.missions.map((m) => String(m).trim()).filter(Boolean).slice(0, 8)
          : undefined,
        keywords: Array.isArray(off.keywords)
          ? off.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 12)
          : undefined,
        prerequisites: Array.isArray(off.prerequisites)
          ? off.prerequisites.map((p) => String(p).trim()).filter(Boolean).slice(0, 8)
          : undefined,
        applicationInfo: off.applicationInfo ? (off.applicationInfo || "").trim() : undefined,
        profile: off.profile ? (off.profile || "").trim() : undefined,
        enrichStatus: off.enrichStatus,
        enrichReason: off.enrichReason,
        enrichedAt: off.enrichedAt,
        searchFallback: off.searchFallback === true,
        emailSubject: em.subject,
        emailFrom: em.from,
        receivedAt: em.receivedAt,
        addedAt: new Date().toISOString(),
        status: "nouvelle",
        applied: "none",
        urlKey,
        titleCompanyKey: off.dedupTclKey || tck,
      };
      next.offers.push(offer);
      added += 1;
      if (urlKey) byUrl.add(urlKey);
      if (legacyUrlKey && legacyUrlKey !== urlKey) byUrl.add(legacyUrlKey);
      byKey.add(off.dedupTclKey || tck);
      if (off.dedupTclKey && off.dedupTclKey !== tck) byKey.add(tck);
    }
  }

  const summary: SyncSummary = {
    emailsRead: emails.length,
    /* Invariant : detected === added + duplicates (chaque offre détectée est
       soit ajoutée, soit un doublon — jamais les deux, jamais autre chose). */
    detected: added + duplicates,
    added,
    duplicates,
    rejected,
    errors,
    at: new Date().toISOString(),
  };
  next.lastSync = summary.at;
  next.lastSummary = summary;
  return { store: next, summary };
}

/* ── Statuts dérivés ───────────────────────────────────────── */

export function offerBadges(o: GmailOffer, recommendedIds: Set<string>): string[] {
  const badges: string[] = [];
  if (recommendedIds.has(o.id)) badges.push("recommandée aujourd'hui");
  if (o.cvDraft) badges.push("CV prêt");
  if (o.letterDraft) badges.push("lettre prête");
  return badges;
}

/* ── Pool du Top 10 quotidien ──────────────────────────────── */

export function dailyPool(store: GmailStore): GmailOffer[] {
  return store.offers.filter(
    (o) =>
      o.status !== "ignorée" &&
      o.status !== "expirée" &&
      o.status !== "doublon" &&
      o.applied !== "envoyée" &&
      o.applicationUrl &&
      !isExpired(o)
  );
}

export const todayKey = () => new Date().toISOString().slice(0, 10);