import type { DetectedOffer, Profile, SkillEvidence, UserData } from "./data";
import { hasCvTerm } from "./cv-keywords";
import { cvToText } from "./cv";
import { pfeEligibility } from "./pfe-target";

export type RequirementPriority = "obligatoire" | "souhaitée" | "à vérifier";
export type RequirementMatch = "prouvée" | "déclarée" | "citée dans le CV" | "non documentée";
export type PFERequirement = {
  term: string;
  priority: RequirementPriority;
  source: string;
  match: RequirementMatch;
  evidenceIds: string[];
  cvExcerpt?: string;
};
export type PfeAnalysis = {
  offerId: string;
  fingerprint: string;
  analyzedAt: string;
  eligibility: ReturnType<typeof pfeEligibility>;
  relevance: { level: "forte" | "à examiner" | "faible"; reasons: string[]; domains: string[] };
  requirements: PFERequirement[];
  strengths: string[];
  gaps: string[];
  unknowns: string[];
  selectedEvidenceIds: string[];
  selectedCvTerms?: string[];
  aiSuggestion?: string;
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const VOCABULARY = [
  "CANECO BT", "DIALux", "AutoCAD", "Revit", "ETAP", "MATLAB", "Simulink", "Python", "Excel",
  "GMAO", "SCADA", "PLC", "API industriel", "électrotechnique", "génie électrique",
  "basse tension", "haute tension", "dimensionnement", "éclairage", "automatismes",
  "réseaux électriques", "maintenance industrielle", "nucléaire", "photovoltaïque",
  "éolien", "hydrogène", "stockage d'énergie", "batteries", "efficacité énergétique",
  "anglais", "gestion de projet", "simulation", "programmation", "électronique de puissance",
];
const DOMAINS: [string, RegExp][] = [
  ["Génie électrique", /electri|electrotech|basse tension|haute tension|cfo|cfa/],
  ["Réseaux et distribution", /reseaux? electri|distribution|smart.?grid|poste source/],
  ["Production et conversion", /production d.energie|convertiss|electronique de puissance/],
  ["Renouvelables et stockage", /renouvel|photovolta|eolien|batterie|stockage/],
  ["Nucléaire", /nucleaire/],
  ["Automatisation", /automatis|controle industriel|scada|\bplc\b/],
  ["Maintenance et exploitation", /maintenance|exploitation|\bgmao\b/],
  ["Performance énergétique", /efficacite energet|performance energet|thermique/],
  ["Essais et R&D", /essais|simulation|recherche|\br&d\b/],
  ["Gaz et hydrogène", /\bgaz\b|hydrogene/],
];
const PRIORITY_DESIRED = /souhait|appreci|un plus|idealement|serait un atout|facultatif|bonus/i;
const PRIORITY_REQUIRED = /obligatoire|indispensable|imperatif|exig[eé]|requis|n[eé]cessaire|ma[iî]trise demand[eé]e/i;

function offerSource(offer: DetectedOffer): string {
  return [offer.title, offer.description, offer.text, offer.profile, ...(offer.missions || []), ...(offer.prerequisites || []), ...(offer.skills || [])].filter(Boolean).join("\n");
}
function sameTerm(a: string, b: string): boolean { return normalize(a) === normalize(b); }
function evidenceSkills(item: SkillEvidence): string[] { return [item.term, ...(item.skills || [])].filter(Boolean); }
export function proofRecordId(item: SkillEvidence, index: number): string { return item.id || `legacy:${index}:${normalize(item.term)}`; }
function evidenceDescription(item: SkillEvidence): string { return (item.description || item.evidence || "").trim(); }
export function canSelectProof(item: SkillEvidence): boolean {
  return ["demonstrated", "declared", "studied"].includes(item.status) && !!evidenceDescription(item) && !!item.source?.trim();
}
function explicitEvidence(item: SkillEvidence): boolean {
  return item.status === "demonstrated" && canSelectProof(item);
}
export function termsFromOffer(offer: DetectedOffer): string[] {
  const text = offerSource(offer);
  const supplied = [...(offer.skills || []), ...(offer.keywords || [])]
    .filter(term => typeof term === "string" && term.trim().length >= 2)
    .filter(term => hasCvTerm(text, term));
  const found = VOCABULARY.filter(term => hasCvTerm(text, term));
  return [...new Map([...supplied, ...found].map(term => [normalize(term), term.trim()])).values()].slice(0, 35);
}
function contextFor(offer: DetectedOffer, term: string): { source: string; priority: RequirementPriority } {
  const sections = [
    ...(offer.prerequisites || []).map(text => ({ text, required: true })),
    ...(offer.skills || []).map(text => ({ text, required: false })),
    ...[offer.profile, offer.description, offer.text, ...(offer.missions || [])].filter(Boolean)
      .flatMap(text => String(text).split(/\n|[.;]\s+/)).map(text => ({ text, required: false })),
  ];
  const found = sections.filter(line => hasCvTerm(line.text, term));
  const marked = found.find(line => PRIORITY_DESIRED.test(line.text) || PRIORITY_REQUIRED.test(line.text) || line.required);
  const source = (marked || found[0])?.text.trim().slice(0, 260) || term;
  const priority = marked && PRIORITY_DESIRED.test(marked.text) ? "souhaitée"
    : marked && (marked.required || PRIORITY_REQUIRED.test(marked.text)) ? "obligatoire" : "à vérifier";
  return { source, priority };
}

/** Fingerprint of facts only: selection and Gemini wording cannot silently refresh an analysis. */
export function pfeFingerprint(offer: DetectedOffer, data: UserData): string {
  const facts = JSON.stringify({
    offer: [offer.title, offer.company, offer.contract, offer.duration, offer.startDate, offer.location,
      offer.description, offer.text, offer.missions, offer.skills, offer.prerequisites, offer.profile, offer.keywords],
    cv: data.originalCv?.text || "", cvData: data.cvData || null,
    profile: [data.profile.title, data.profile.skills, data.profile.experiences, data.profile.educations, data.profile.skillEvidence],
  });
  let a = 2166136261, b = 5381;
  for (let i = 0; i < facts.length; i++) { a = Math.imul(a ^ facts.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ facts.charCodeAt(i); }
  return `pfe4:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}

export function analyzePfeOffer(offer: DetectedOffer, data: UserData): PfeAnalysis {
  const source = offerSource(offer);
  const eligibility = pfeEligibility({ ...offer, description: source });
  const cv = data.originalCv?.text || (data.cvData ? cvToText(data.cvData) : "");
  const evidence = data.profile.skillEvidence || [];
  const requirements: PFERequirement[] = termsFromOffer(offer).map(term => {
    const { source: excerpt, priority } = contextFor(offer, term);
    const matching = evidence.map((item, index) => ({ item, id: proofRecordId(item, index) }))
      .filter(({ item }) => evidenceSkills(item).some(skill => sameTerm(skill, term)) && item.status !== "missing");
    const proven = matching.filter(({ item }) => explicitEvidence(item));
    const declared = matching.filter(({ item }) => item.status === "declared");
    const cvLine = cv.split(/\n+/).find(line => hasCvTerm(line, term))?.trim().slice(0, 220);
    const match: RequirementMatch = proven.length ? "prouvée" : cvLine ? "citée dans le CV" : declared.length || data.profile.skills.some(skill => sameTerm(skill, term)) ? "déclarée" : "non documentée";
    return { term, priority, source: excerpt, match, evidenceIds: matching.map(row => row.id), cvExcerpt: cvLine };
  });
  const normalizedSource = normalize(source);
  const domains = DOMAINS.filter(([, pattern]) => pattern.test(normalizedSource)).map(([name]) => name);
  const education = [...data.profile.educations.map(row => row.degree), data.profile.title].join(" ");
  const formationFits = /electri|energie|energet|electrotech|nucleaire|automatis|industriel/i.test(normalize(education)) && domains.length > 0;
  const validated = requirements.filter(row => row.match === "prouvée" || row.match === "citée dans le CV");
  const relevance = {
    level: (domains.length && formationFits && validated.length ? "forte" : domains.length ? "à examiner" : "faible") as "forte" | "à examiner" | "faible",
    reasons: [domains.length ? `Domaine identifié : ${domains.join(", ")}` : "Domaine technique à confirmer", formationFits ? "Formation en lien avec le domaine" : "Lien entre formation et domaine à examiner", validated.length ? `${validated.length} compétence(s) déjà présentes dans le CV` : "Choisis les compétences que tu veux déclarer dans ton CV"],
    domains,
  };
  const strengths = requirements.filter(row => row.match === "prouvée" || row.match === "citée dans le CV").map(row => row.term);
  const gaps = requirements.filter(row => row.priority === "obligatoire" && row.match === "non documentée").map(row => row.term);
  const unknowns = [...eligibility.reasons.filter(() => eligibility.status === "verify"),
    ...requirements.filter(row => row.priority === "à vérifier").map(row => `Caractère obligatoire ou souhaité de « ${row.term} » à vérifier`),
    ...(!offer.missions?.length ? ["Missions détaillées absentes de la fiche"] : []),
    ...(!requirements.length ? ["Compétences techniques non détaillées dans la fiche"] : [])];
  return { offerId: offer.id, fingerprint: pfeFingerprint(offer, data), analyzedAt: new Date().toISOString(), eligibility,
    relevance, requirements, strengths, gaps, unknowns, selectedEvidenceIds: [], selectedCvTerms: [] };
}

export function savePfeAnalysis(data: UserData, analysis: PfeAnalysis): UserData {
  return { ...data, pfeAnalyses: { ...data.pfeAnalyses, [analysis.offerId]: analysis } };
}

export function matchingEvidence(profile: Profile, requirement: PFERequirement): SkillEvidence[] {
  return (profile.skillEvidence || []).filter(item => evidenceSkills(item).some(skill => sameTerm(skill, requirement.term)) && item.status !== "missing");
}
