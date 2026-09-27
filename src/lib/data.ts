"use client";

/* ══════════════════ Types ══════════════════ */

export type CvVersion = {
  id: string;
  name: string;
  file: string;
  /** Score ATS calculé — absent tant qu'aucun texte n'a été fourni pour le calculer. */
  score?: number;
  date: string;
};

export type AppStatus = "sent" | "interview" | "offer" | "rejected";

export type Application = {
  id: string;
  company: string;
  role: string;
  status: AppStatus;
  daysAgo: number;
  source: string;
  /** Nom du CV envoyé pour cette candidature (trace : savoir quel CV est parti). */
  cvName?: string;
  /** Texte complet du CV au moment de l'envoi — relisible à tout moment. */
  cvText?: string;
  /** Lettre de motivation envoyée. */
  letterText?: string;
  /** Date ISO de la dernière action (postulation, réponse, refus…). */
  date?: string;
  /** Notes libres (relance, date d'entretien, contact…). */
  notes?: string;
};

export type Letter = {
  id: string;
  applicationId: string | null;
  company: string;
  role: string;
  content: string;
  date: string;
};

export type DetectedOffer = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  match: number;
  keywords: string[];
  text: string;
  summary?: string;
  level?: string;
  url?: string;
  source?: string;
  reason?: string;
};

export type Recruiter = {
  name: string;
  role: string;
  company: string;
  email: string;
  linkedin: string;
  responseRate: number;
};

export type Tailoring = {
  id: string;
  company: string;
  title: string;
  date: string;
  words: number;
  edits: number;
  fitBefore: number;
  fitAfter: number;
  factsChecked: number;
  factsPreserved: number;
  headline: string;
};

export type Profile = {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  city: string;
  skills: string[];
  experiences: { title: string; place: string; period: string; detail: string }[];
  educations: { degree: string; school: string; period: string }[];
};

export type UserData = {
  v?: number;
  /** Texte du vrai CV du candidat : source de vérité pour toutes les analyses IA. */
  originalCv?: { name: string; text: string };
  /** CV structuré éditable (builder) : la source du rendu et du PDF. */
  cvData?: import("./cv").CvData;
  /** Historique des tailoring réalisés (8 derniers). */
  tailorings?: Tailoring[];
  profile: Profile;
  cvs: CvVersion[];
  applications: Application[];
  letters: Letter[];
  offers: DetectedOffer[];
  recruiters: Recruiter[];
  autopilot: boolean;
};

/* ══════════════════ Seed ══════════════════ */

const uid = () => Math.random().toString(36).slice(2, 9);

const DEMO_EMAIL = "demo@cible.app";

/* Compte neuf : espace vide qui se remplit au fil des actions de l'utilisateur */
export function emptyData(name: string, email: string): UserData {
  const [firstName = "", ...rest] = name.split(" ");
  return {
    v: APP_VERSION,
    profile: {
      firstName,
      lastName: rest.join(" "),
      title: "",
      email,
      phone: "",
      city: "",
      skills: [],
      experiences: [],
      educations: [],
    },
    cvs: [],
    applications: [],
    letters: [],
    offers: [],
    recruiters: [],
    autopilot: false,
  };
}

export function seedData(name: string, email: string): UserData {
  const [firstName = "Camille", ...rest] = name.split(" ");
  const lastName = rest.join(" ") || "Dubois";
  return {
    v: APP_VERSION,
    profile: {
      firstName,
      lastName,
      title: "Étudiant·e M1 Marketing — en recherche d'alternance",
      email,
      phone: "06 12 34 56 78",
      city: "Paris 11ᵉ",
      skills: ["SEO", "Rédaction web", "Google Analytics", "Réseaux sociaux", "Pack Office"],
      experiences: [
        {
          title: "Créatrice du blog « Camille à Paris »",
          place: "Indépendant",
          period: "2023 → aujourd'hui",
          detail:
            "3 articles optimisés SEO par semaine · +240 % de trafic organique en un an · suivi Google Analytics et stratégie éditoriale.",
        },
        {
          title: "Trésorière du BDE — Lycée Voltaire",
          place: "Association étudiante",
          period: "2023–2024",
          detail:
            "Budget de 18 k€ suivi sur tableur · reporting mensuel au bureau · pilotage de 4 campagnes événementielles.",
        },
        {
          title: "Serveuse — Le Petit Bistrot",
          place: "Restauration",
          period: "Été 2023",
          detail:
            "Relation client sur des services de 80 couverts · travail en équipe · gestion des priorités en salle.",
        },
      ],
      educations: [
        { degree: "Master 1 Marketing Digital", school: "Université Paris-Dauphine", period: "2025–2026" },
        { degree: "Licence Information & Communication", school: "Université Paris-Dauphine", period: "2022–2025" },
        { degree: "Bac Générale (SES, HGGSP)", school: "Lycée Voltaire", period: "2019–2022" },
      ],
    },
    cvs: [
      { id: uid(), name: "CV original", file: `${firstName}_${lastName}_cv.pdf`, score: 61, date: "il y a 12 jours" },
      { id: uid(), name: "Calibré — L'Oréal (alternance)", file: `${firstName}_${lastName}_cv_loreal.pdf`, score: 94, date: "il y a 2 jours" },
      { id: uid(), name: "Calibré — Sephora (e-commerce)", file: `${firstName}_${lastName}_cv_sephora.pdf`, score: 88, date: "il y a 5 jours" },
    ],
    applications: [
      { id: uid(), company: "L'Oréal", role: "Chargé·e de marketing digital", status: "interview", daysAgo: 4, source: "Page carrière", cvName: "Calibré — L'Oréal (alternance)", date: new Date(Date.now() - 4 * 86400000).toISOString(), notes: "Relance prévue J+7 — contact Marie Delacroix." },
      { id: uid(), company: "Sephora", role: "Alternance e-commerce", status: "sent", daysAgo: 7, source: "Cible — pilotage auto", cvName: "Calibré — Sephora (e-commerce)", date: new Date(Date.now() - 7 * 86400000).toISOString() },
      { id: uid(), company: "Doctolib", role: "Community manager", status: "offer", daysAgo: 11, source: "LinkedIn", cvName: "CV original", date: new Date(Date.now() - 11 * 86400000).toISOString(), notes: "Offre reçue — réponse demandée avant vendredi." },
      { id: uid(), company: "SNCF", role: "Assistant·e communication", status: "sent", daysAgo: 2, source: "Cible — pilotage auto", cvName: "CV original", date: new Date(Date.now() - 2 * 86400000).toISOString() },
      { id: uid(), company: "Decathlon", role: "Chargé·e de contenu web", status: "rejected", daysAgo: 15, source: "Welcome to the Jungle", cvName: "CV original", date: new Date(Date.now() - 15 * 86400000).toISOString() },
    ],
    letters: [],
    offers: [
      {
        id: uid(),
        title: "Chargé·e de marketing digital",
        company: "L'Oréal",
        location: "Paris 9ᵉ · Alternance 12 mois",
        salary: "38–42 k€/an",
        match: 94,
        keywords: ["SEO", "Google Analytics", "Rédaction web", "CRM", "Reporting"],
        text: "Vous piloterez la stratégie de contenu du site : SEO on-page, rédaction d'articles optimisés, analyse d'audience via Google Analytics, animation du CRM et reporting mensuel des KPI au comité marketing.",
      },
      {
        id: uid(),
        title: "Alternance e-commerce",
        company: "Sephora",
        location: "Paris 8ᵉ · Alternance 18 mois",
        salary: "35–39 k€/an",
        match: 88,
        keywords: ["E-commerce", "Réseaux sociaux", "Contenu", "Data"],
        text: "Au sein de l'équipe digitale, vous alimentez les fiches produits, suivez les performances e-commerce, créez du contenu pour les réseaux sociaux et participez à l'analyse data des campagnes.",
      },
      {
        id: uid(),
        title: "Community manager junior",
        company: "Doctolib",
        location: "Paris 2ᵉ · CDI",
        salary: "34–38 k€/an",
        match: 81,
        keywords: ["Réseaux sociaux", "Contenu", "Communication", "Analytics"],
        text: "Vous animez nos communautés sur Instagram, LinkedIn et TikTok : calendrier éditorial, rédaction de contenus engageants, veille et reporting analytics hebdomadaire.",
      },
      {
        id: uid(),
        title: "Assistant·e communication interne",
        company: "SNCF",
        location: "Saint-Denis · Alternance 12 mois",
        salary: "32–36 k€/an",
        match: 76,
        keywords: ["Communication interne", "Rédaction", "Événementiel", "Pack Office"],
        text: "Vous rédigez la newsletter des collaborateurs, préparez les supports de présentation et contribuez à l'organisation d'événements internes.",
      },
    ],
    recruiters: [
      { name: "Marie Delacroix", role: "Talent Acquisition Manager", company: "L'Oréal", email: "marie.delacroix@loreal.com", linkedin: "linkedin.com/in/mariedelacroix", responseRate: 68 },
      { name: "Thomas Rey", role: "Recruteur IT & Digital", company: "Sephora", email: "t.rey@sephora.fr", linkedin: "linkedin.com/in/thomasrey", responseRate: 54 },
      { name: "Aïcha Benali", role: "Responsable alternances", company: "Doctolib", email: "a.benali@doctolib.fr", linkedin: "linkedin.com/in/aichabenali", responseRate: 71 },
      { name: "Julien Moreau", role: "HR Business Partner", company: "Decathlon", email: "j.moreau@decathlon.com", linkedin: "linkedin.com/in/julienmoreau", responseRate: 47 },
      { name: "Claire Fontaine", role: "Talent Partner", company: "SNCF Connect", email: "c.fontaine@sncf.com", linkedin: "linkedin.com/in/clairefontaine", responseRate: 59 },
    ],
    autopilot: true,
  };
}

/* ══════════════════ Persistance ══════════════════ */

/* Clé v2 : les données démo « marketing » injectées à tort dans les comptes
   créés avant le correctif vivaient sous l'ancienne clé. On ne les reprend
   JAMAIS : seul un blob déjà estampillé v:2 peut migrer vers la clé v2. */
const keyFor = (email: string) => `cible:data:v2:${email.toLowerCase()}`;
const legacyKeyFor = (email: string) => `cible:data:${email.toLowerCase()}`;

export function loadData(email: string): UserData | null {
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    if (raw) {
      const parsed = JSON.parse(raw) as UserData;
      const migrated = migrateData(parsed);
      if (migrated !== parsed) saveData(email, migrated);
      return migrated;
    }

    const legacyRaw = window.localStorage.getItem(legacyKeyFor(email));
    if (!legacyRaw) return null;
    window.localStorage.removeItem(legacyKeyFor(email));
    let legacy: UserData | null = null;
    try {
      legacy = JSON.parse(legacyRaw) as UserData;
    } catch {
      legacy = null;
    }
    /* Reprise refusée sauf données déjà propres (v2) d'un compte non-démo. */
    if (!legacy || legacy.v !== 2 || email.trim().toLowerCase() === DEMO_EMAIL) {
      return null;
    }
    const migrated = migrateData(legacy);
    window.localStorage.setItem(keyFor(email), JSON.stringify(migrated));
    return migrated;
  } catch {
    return null;
  }
}

/* Migration silencieuse entre versions de schéma.
   v2 → v3 : le statut « waiting » fusionne avec « sent » et chaque candidature
   reçoit une date ISO (déduite de joursAgo quand elle manque). */
const APP_VERSION = 3 as const;
function migrateData(d: UserData): UserData {
  if (d && d.v === APP_VERSION) return d;
  const next: UserData = {
    ...d,
    v: APP_VERSION,
    applications: (d?.applications ?? []).map((a) => {
      const rawStatus = (a as { status?: string }).status || "sent";
      return {
        ...a,
        status: rawStatus === "waiting" ? "sent" : (rawStatus as AppStatus),
        date:
          a.date ??
          new Date(Date.now() - (a.daysAgo ?? 0) * 86400000).toISOString(),
      };
    }),
  };
  return next;
}

export function saveData(email: string, data: UserData) {
  try {
    window.localStorage.setItem(keyFor(email), JSON.stringify(data));
  } catch {
    /* quota dépassé — tant pis pour la démo */
  }
}

export function getOrCreateData(name: string, email: string): UserData {
  const existing = loadData(email);
  if (existing && existing.v === APP_VERSION) return existing;
  /* Toute donnée non conforme = résidu de démo → espace vide immédiat. */
  const fresh =
    email.trim().toLowerCase() === DEMO_EMAIL
      ? seedData(name, email)
      : emptyData(name, email);
  saveData(email, fresh);
  return fresh;
}

/* Remise à zéro manuelle de l'espace (bouton Réinitialiser). */
export function resetData(name: string, email: string): UserData {
  try {
    window.localStorage.removeItem(legacyKeyFor(email));
  } catch {
    /* ignore */
  }
  const isDemo = email.trim().toLowerCase() === DEMO_EMAIL;
  const fresh = isDemo ? seedData(name, email) : emptyData(name, email);
  saveData(email, fresh);
  return fresh;
}

export const isEmptyData = (d: UserData) =>
  d.cvs.length === 0 &&
  d.applications.length === 0 &&
  d.letters.length === 0 &&
  d.offers.length === 0 &&
  d.recruiters.length === 0;

export const STATUS_META: Record<AppStatus, { label: string; cls: string }> = {
  sent: { label: "Postulé", cls: "pill--info" },
  interview: { label: "Entretien", cls: "pill--ok" },
  offer: { label: "Accepté · offre", cls: "pill--ok" },
  rejected: { label: "Refusé", cls: "" },
};
