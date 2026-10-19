export interface DemoRecommendedOffer {
  id: string;
  rank: number;
  priorityLabel: string;
  company: string;
  title: string;
  location: string;
  duration: string;
  tags: string[];
  description: string;
  /** Absent pour les offres réelles sans score calculé — jamais inventé. */
  matchType?: string;
  matchPercentage?: number | null;
  url?: string;
  isFavorite?: boolean;
}

export interface DemoTableOffer {
  careerScore?: number;
  careerReason?: string;
  id: string;
  company: string;
  title: string;
  location: string;
  tags: string[];
  date: string;
  /** Absent pour les offres réelles sans score calculé — jamais inventé. */
    matchPercentage: number | null;
    matchExplanation?: string;
  /** Date ISO réelle de réception (tri « Plus récentes »). */
  receivedAt?: string;
  status?: "nouvelle" | "a_traiter" | "postulee" | "favori" | "expiree";
  url?: string;
  isFavorite?: boolean;
}

export interface DemoPreparationQueueItem {
  id: string;
  company: string;
  initials: string;
  step: string;
  progress: number;
  status: "running" | "pending" | "ready";
}

export const DEMO_USER_PROFILE = {
  name: "Moustapha Ibrahim",
  school: "ECAM-EPMI",
  initials: "M",
  email: "moustapha.ibrahim@example.com",
  targetGoal: "Stage de 6 mois",
  stats: {
    totalOffers: 467,
    totalOffersDiff: "+28",
    applications: 12,
    applicationsDiff: "+5",
    interviews: 3,
    interviewsDiff: "+2",
  },
  nextAction: {
    count: 4,
    label: "4 offres prioritaires à traiter aujourd'hui",
    buttonText: "Commencer ma session",
  },
  lastGmailSync: {
    time: "aujourd'hui à 20:42",
    analyzedCount: 319,
  },
};

export const DEMO_RECOMMENDED_OFFERS: DemoRecommendedOffer[] = [
  {
    id: "rec-edf-1",
    rank: 1,
    priorityLabel: "Priorité",
    company: "EDF",
    title: "Stage Bureau d'études Réseaux électriques",
    location: "Lyon (69)",
    duration: "6 mois",
    tags: ["Réseaux", "Études", "Dimensionnement"],
    description: "Correspond parfaitement à ton projet de réseau BT et à ton expérience en analyse énergétique.",
    matchType: "Très bon match",
    matchPercentage: 92,
    url: "https://www.edf.fr/carrieres",
    isFavorite: false,
  },
  {
    id: "rec-rte-2",
    rank: 2,
    priorityLabel: "Priorité",
    company: "RTE",
    title: "Stage Études et ingénierie",
    location: "Paris (75)",
    duration: "6 mois",
    tags: ["Réseaux", "Systèmes électriques", "Automatisation"],
    description: "Missions en adéquation avec ton profil et tes compétences en dimensionnement.",
    matchType: "Très bon match",
    matchPercentage: 88,
    url: "https://www.rte-france.com",
    isFavorite: false,
  },
  {
    id: "rec-engie-3",
    rank: 3,
    priorityLabel: "Priorité",
    company: "Engie",
    title: "Stage Performance Énergétique",
    location: "Nanterre (92)",
    duration: "6 mois",
    tags: ["Énergie", "Audit", "Excel", "Analyse"],
    description: "En lien avec ton expérience EDD et tes projets énergétiques.",
    matchType: "Bon match",
    matchPercentage: 85,
    url: "https://www.engie.com",
    isFavorite: false,
  },
  {
    id: "rec-schneider-4",
    rank: 4,
    priorityLabel: "Priorité",
    company: "Schneider Electric",
    title: "Stage Automatisation industrielle",
    location: "Grenoble (38)",
    duration: "6 mois",
    tags: ["Automatisme", "Systèmes", "Électrotechnique", "VHDL"],
    description: "Utilise tes connaissances en automatisation et en électronique industrielle.",
    matchType: "Bon match",
    matchPercentage: 82,
    url: "https://www.se.com",
    isFavorite: false,
  },
];

export const DEMO_TABLE_OFFERS: DemoTableOffer[] = [
  {
    id: "tab-edf-1",
    company: "EDF",
    title: "Stage Bureau d'études Réseaux électriques",
    location: "Lyon (69)",
    tags: ["Réseaux", "Études", "Dimensionnement"],
    date: "12/01/2025",
    matchPercentage: 92,
    status: "a_traiter",
    url: "https://www.edf.fr",
  },
  {
    id: "tab-rte-2",
    company: "RTE",
    title: "Stage Études et ingénierie",
    location: "Paris (75)",
    tags: ["Réseaux", "Systèmes", "Automatisation"],
    date: "10/01/2025",
    matchPercentage: 88,
    status: "a_traiter",
    url: "https://www.rte-france.com",
  },
  {
    id: "tab-engie-3",
    company: "Engie",
    title: "Stage Performance énergétique",
    location: "Nanterre (92)",
    tags: ["Énergie", "Audit", "Excel"],
    date: "08/01/2025",
    matchPercentage: 85,
    status: "nouvelle",
    url: "https://www.engie.com",
  },
  {
    id: "tab-total-4",
    company: "TotalEnergies",
    title: "Stage Transition énergétique",
    location: "Courbevoie (92)",
    tags: ["ENR", "Analyse", "Performance"],
    date: "07/01/2025",
    matchPercentage: 78,
    status: "nouvelle",
    url: "https://totalenergies.com",
  },
  {
    id: "tab-enedis-5",
    company: "Enedis",
    title: "Stage Réseaux électriques",
    location: "Lyon (69)",
    tags: ["Distribution", "Réseaux", "Qualité"],
    date: "03/01/2025",
    matchPercentage: 86,
    status: "postulee",
    url: "https://www.enedis.fr",
  },
  {
    id: "tab-alstom-6",
    company: "Alstom",
    title: "Stage Systèmes électriques",
    location: "Saint-Ouen (93)",
    tags: ["Matériel roulant", "Études", "Simulation"],
    date: "28/12/2024",
    matchPercentage: 81,
    status: "postulee",
    url: "https://www.alstom.com",
  },
  {
    id: "tab-siemens-7",
    company: "Siemens",
    title: "Stage Électrotechnique",
    location: "Vélizy (78)",
    tags: ["Automatisation", "PLC", "Industrie 4.0"],
    date: "20/12/2024",
    matchPercentage: 79,
    status: "a_traiter",
    url: "https://www.siemens.com",
  },
  {
    id: "tab-vinci-8",
    company: "VINCI Energies",
    title: "Stage Infrastructures électriques",
    location: "Nanterre (92)",
    tags: ["Tertiaire", "Courant fort", "Supervision"],
    date: "18/12/2024",
    matchPercentage: 75,
    status: "postulee",
    url: "https://www.vinci-energies.com",
  },
  {
    id: "tab-sncf-9",
    company: "SNCF Réseau",
    title: "Stage Études signalisation",
    location: "Saint-Denis (93)",
    tags: ["Signalisation", "Réseaux", "Sécurité"],
    date: "12/12/2024",
    matchPercentage: 83,
    status: "postulee",
    url: "https://www.sncf-reseau.com",
  },
];

export const DEMO_PREPARATION_QUEUE: DemoPreparationQueueItem[] = [
  {
    id: "q-airbus",
    company: "Airbus",
    initials: "A",
    step: "CV en cours de génération…",
    progress: 60,
    status: "running",
  },
  {
    id: "q-hager",
    company: "Hager",
    initials: "H",
    step: "Analyse de l'offre…",
    progress: 30,
    status: "running",
  },
  {
    id: "q-vinci",
    company: "VINCI Energies",
    initials: "VE",
    step: "En attente…",
    progress: 0,
    status: "pending",
  },
];

export interface DemoApplication {
  id: string;
  company: string;
  title: string;
  location: string;
  date: string;
  status: "interview" | "sent" | "rejected" | "offer";
  statusLabel: string;
  tags: string[];
  cvFileName: string;
  cvFileSize: string;
  cvSentDate: string;
  offerSummary: string;
  offerContract: string;
  offerPostedDate: string;
  nextInterview?: {
    label: string;
    date: string;
    details: string;
  };
  checklist: { id: string; text: string; done: boolean; date?: string }[];
  notes: string;
  timeline: { step: string; date: string; active: boolean; completed: boolean }[];
  journal: { date: string; title: string; description: string; type: "interview" | "reminder" | "application" | "adaptation" }[];
}

export const DEMO_APPLICATIONS: DemoApplication[] = [
  {
    id: "app-rte-1",
    company: "RTE",
    title: "Stage Études et ingénierie",
    location: "Paris (75)",
    date: "10/01/2025",
    status: "interview",
    statusLabel: "Entretien",
    tags: ["Réseaux", "Systèmes électriques", "Automatisation", "Dimensionnement"],
    cvFileName: "CV_Moustapha_Ibrahim_RTE.pdf",
    cvFileSize: "312 Ko",
    cvSentDate: "10/01/2025 à 14:23",
    offerSummary:
      "Contribuer aux études et à la conception des réseaux électriques haute et très haute tension. Participation aux analyses de stabilité, aux études de raccordement et à la modélisation du réseau.",
    offerContract: "Stage de 6 mois",
    offerPostedDate: "02/01/2025",
    nextInterview: {
      label: "Entretien avec l'équipe études",
      date: "Demain • 14h00 - 15h00",
      details: "Visio Teams",
    },
    checklist: [
      { id: "c1", text: "Relire la description de l'offre", done: true, date: "15/01" },
      { id: "c2", text: "Préparer mes réponses aux questions techniques", done: true, date: "16/01" },
      { id: "c3", text: "Se renseigner sur les projets récents de RTE", done: false, date: "19/01" },
      { id: "c4", text: "Préparer des questions pour le recruteur", done: false, date: "20/01" },
    ],
    notes:
      "Entretien avec Marie (ingénieure études) et Thomas (responsable d'équipe). Se concentrer sur mes projets ENR et ma maîtrise de Power Factory. Poser des questions sur les outils utilisés et les perspectives d'embauche.",
    timeline: [
      { step: "CV adapté", date: "03/01/2025", active: false, completed: true },
      { step: "Postulé", date: "05/01/2025", active: false, completed: true },
      { step: "Relance", date: "09/01/2025", active: false, completed: true },
      { step: "Entretien", date: "17/01/2025", active: true, completed: false },
      { step: "Décision", date: "À venir", active: false, completed: false },
    ],
    journal: [
      {
        date: "il y a 2 jours",
        title: "Entretien planifié",
        description: "17/01/2025 à 14h00 - avec Marie Dupont (Ingénieure Recrutement)",
        type: "interview",
      },
      {
        date: "il y a 5 jours",
        title: "Relance envoyée",
        description: "Email de relance envoyé suite à ma candidature.",
        type: "reminder",
      },
      {
        date: "il y a 9 jours",
        title: "Candidature envoyée",
        description: "CV adapté envoyé via le site carrière RTE.",
        type: "application",
      },
      {
        date: "il y a 9 jours",
        title: "CV adapté avec l'IA",
        description: "Version optimisée pour ce poste (focus réseaux et dimensionnement).",
        type: "adaptation",
      },
    ],
  },
  {
    id: "app-edf-2",
    company: "EDF",
    title: "Stage Bureau d'études Réseaux électriques",
    location: "Lyon (69)",
    date: "12/01/2025",
    status: "sent",
    statusLabel: "Postulé",
    tags: ["Réseaux", "Études", "Dimensionnement"],
    cvFileName: "CV_Moustapha_Ibrahim_EDF.pdf",
    cvFileSize: "324 Ko",
    cvSentDate: "12/01/2025 à 10:15",
    offerSummary:
      "Au sein de la Direction de l'Ingénierie, tu participeras aux études de dimensionnement et d'analyse des réseaux électriques haute et très haute tension.",
    offerContract: "Stage de 6 mois",
    offerPostedDate: "05/01/2025",
    checklist: [
      { id: "c1", text: "Vérifier le statut sur le portail EDF", done: false },
      { id: "c2", text: "Préparer un e-mail de relance à J+10", done: false },
    ],
    notes: "Postulé via LinkedIn avec CV adapté. Relance prévue si pas de retour d'ici le 22/01.",
    timeline: [
      { step: "CV adapté", date: "11/01/2025", active: false, completed: true },
      { step: "Postulé", date: "12/01/2025", active: true, completed: true },
      { step: "Relance", date: "À venir", active: false, completed: false },
      { step: "Entretien", date: "À venir", active: false, completed: false },
      { step: "Décision", date: "À venir", active: false, completed: false },
    ],
    journal: [
      {
        date: "il y a 2 jours",
        title: "Candidature envoyée",
        description: "Candidature envoyée sur l'offre Stage Bureau d'études.",
        type: "application",
      },
    ],
  },
  {
    id: "app-engie-3",
    company: "Engie",
    title: "Stage Performance énergétique",
    location: "Nanterre (92)",
    date: "08/01/2025",
    status: "sent",
    statusLabel: "Postulé",
    tags: ["Énergie", "Audit", "Excel"],
    cvFileName: "CV_Moustapha_Ibrahim_Engie.pdf",
    cvFileSize: "298 Ko",
    cvSentDate: "08/01/2025 à 16:40",
    offerSummary:
      "Missions d'audit d'efficacité énergétique industrielle et de modélisation de bilans thermiques et électriques.",
    offerContract: "Stage de 6 mois",
    offerPostedDate: "28/12/2024",
    checklist: [],
    notes: "Contact RH trouvé sur LinkedIn : Pierre Martin.",
    timeline: [
      { step: "CV adapté", date: "07/01/2025", active: false, completed: true },
      { step: "Postulé", date: "08/01/2025", active: true, completed: true },
      { step: "Relance", date: "À venir", active: false, completed: false },
      { step: "Entretien", date: "À venir", active: false, completed: false },
      { step: "Décision", date: "À venir", active: false, completed: false },
    ],
    journal: [],
  },
  {
    id: "app-schneider-4",
    company: "Schneider Electric",
    title: "Stage Automatisation industrielle",
    location: "Grenoble (38)",
    date: "05/01/2025",
    status: "rejected",
    statusLabel: "Refusé",
    tags: ["Automatisme", "Systèmes", "Électrotechnique"],
    cvFileName: "CV_Moustapha_Ibrahim_SE.pdf",
    cvFileSize: "305 Ko",
    cvSentDate: "05/01/2025 à 11:20",
    offerSummary: "Développement d'automates programmables industriels et intégration de bus de terrain.",
    offerContract: "Stage de 6 mois",
    offerPostedDate: "20/12/2024",
    checklist: [],
    notes: "Refus automatique reçu le 14/01 : profil orienté réseau plutôt qu'automatisme pur.",
    timeline: [
      { step: "CV adapté", date: "04/01/2025", active: false, completed: true },
      { step: "Postulé", date: "05/01/2025", active: false, completed: true },
      { step: "Refusé", date: "14/01/2025", active: true, completed: true },
    ],
    journal: [],
  },
  {
    id: "app-total-5",
    company: "TotalEnergies",
    title: "Stage Transition énergétique",
    location: "Courbevoie (92)",
    date: "07/01/2025",
    status: "sent",
    statusLabel: "Postulé",
    tags: ["ENR", "Analyse", "Performance"],
    cvFileName: "CV_Moustapha_Ibrahim_Total.pdf",
    cvFileSize: "315 Ko",
    cvSentDate: "07/01/2025 à 09:30",
    offerSummary: "Études technico-économiques de projets de parcs éoliens et photovoltaïques raccordés au réseau.",
    offerContract: "Stage de 6 mois",
    offerPostedDate: "02/01/2025",
    checklist: [],
    notes: "",
    timeline: [],
    journal: [],
  },
  {
    id: "app-enedis-6",
    company: "Enedis",
    title: "Stage Réseaux électriques",
    location: "Lyon (69)",
    date: "03/01/2025",
    status: "interview",
    statusLabel: "Entretien",
    tags: ["Distribution", "Réseaux", "Qualité"],
    cvFileName: "CV_Moustapha_Ibrahim_Enedis.pdf",
    cvFileSize: "310 Ko",
    cvSentDate: "03/01/2025 à 14:00",
    offerSummary: "Optimisation de la conduite des réseaux de distribution moyenne et basse tension.",
    offerContract: "Stage de 6 mois",
    offerPostedDate: "27/12/2024",
    checklist: [],
    notes: "Premier contact téléphonique très positif.",
    timeline: [],
    journal: [],
  },
  {
    id: "app-alstom-7",
    company: "Alstom",
    title: "Stage Systèmes électriques",
    location: "Saint-Ouen (93)",
    date: "28/12/2024",
    status: "sent",
    statusLabel: "Postulé",
    tags: ["Matériel roulant", "Études", "Simulation"],
    cvFileName: "CV_Moustapha_Ibrahim_Alstom.pdf",
    cvFileSize: "318 Ko",
    cvSentDate: "28/12/2024 à 15:10",
    offerSummary: "Simulation de la chaîne de traction électrique ferroviaire sous MATLAB/Simulink.",
    offerContract: "Stage de 6 mois",
    offerPostedDate: "15/12/2024",
    checklist: [],
    notes: "",
    timeline: [],
    journal: [],
  },
  {
    id: "app-siemens-8",
    company: "Siemens",
    title: "Stage Électrotechnique",
    location: "Vélizy (78)",
    date: "20/12/2024",
    status: "rejected",
    statusLabel: "Refusé",
    tags: ["Automatisation", "PLC", "Industrie 4.0"],
    cvFileName: "CV_Moustapha_Ibrahim_Siemens.pdf",
    cvFileSize: "302 Ko",
    cvSentDate: "20/12/2024 à 17:00",
    offerSummary: "Mise en service d'équipements moyenne tension et protection réseau.",
    offerContract: "Stage de 6 mois",
    offerPostedDate: "10/12/2024",
    checklist: [],
    notes: "Poste pourvu en interne.",
    timeline: [],
    journal: [],
  },
  {
    id: "app-vinci-9",
    company: "VINCI Energies",
    title: "Stage Infrastructures électriques",
    location: "Nanterre (92)",
    date: "18/12/2024",
    status: "sent",
    statusLabel: "Postulé",
    tags: ["Tertiaire", "Courant fort", "Supervision"],
    cvFileName: "CV_Moustapha_Ibrahim_Vinci.pdf",
    cvFileSize: "322 Ko",
    cvSentDate: "18/12/2024 à 11:45",
    offerSummary: "Études d'exécution et suivi de chantiers pour des postes de transformation tertiaires.",
    offerContract: "Stage de 6 mois",
    offerPostedDate: "05/12/2024",
    checklist: [],
    notes: "",
    timeline: [],
    journal: [],
  },
  {
    id: "app-sncf-10",
    company: "SNCF Réseau",
    title: "Stage Études signalisation",
    location: "Saint-Denis (93)",
    date: "12/12/2024",
    status: "offer",
    statusLabel: "Accepté",
    tags: ["Signalisation", "Réseaux", "Sécurité"],
    cvFileName: "CV_Moustapha_Ibrahim_SNCF.pdf",
    cvFileSize: "315 Ko",
    cvSentDate: "12/12/2024 à 10:20",
    offerSummary: "Conception des schémas de signalisation ferroviaire et fiabilisation des sous-stations d'alimentation.",
    offerContract: "Stage de 6 mois",
    offerPostedDate: "01/12/2024",
    checklist: [],
    notes: "Proposition reçue ! Début possible en mars 2025. Réponse attendue sous 2 semaines.",
    timeline: [],
    journal: [],
  },
];
