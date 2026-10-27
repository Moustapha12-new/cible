/* ══════════════ Identité réelle d'une offre : titre + entreprise ══════════════
   Constat terrain : les alertes Gmail produisent des offres nommées avec un
   fragment d'objet (« Stage TFE - »), un type de contrat seul (« Stage »,
   « STAGE – », « Stagiaire de fin d'études - ») ou une initiale (« S », « ST »,
   « ENE ») alors que le vrai nom est présent ailleurs (objet du mail, texte de
   l'annonce, hôte du lien, expéditeur).

   Ce module est PUR et sans dépendance : il répare à partir des seules données
   réelles de l'offre et refuse de fabriquer un nom quand rien de fiable
   n'existe — il rend alors un libellé explicite (« Titre à vérifier »,
   « Entreprise non précisée ») plutôt qu'un faux nom.
   ═══════════════════════════════════════════════════════════════════════════ */

export const UNKNOWN_TITLE = "Titre à vérifier";
export const UNKNOWN_COMPANY = "Entreprise non précisée";

/** Forme comparable : sans accents, sans casse, séparateurs unifiés. */
export const normalizeLabel = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2019\u02bc]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Retire le bruit autour d'un libellé : balises, entités, puces, tirets
    orphelins en fin de chaîne (« Stage TFE - » → « Stage TFE »). */
export function cleanLabel(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s|•·>*–—\u2013\u2014:;,.\"'\-]+/, "")
    .replace(/[\s|•·>*–—\u2013\u2014:;,.\-]+$/, "")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Texte lisible d'un extrait HTML, LIGNES CONSERVÉES.
    La preuve d'identité doit être du texte : avec du HTML brut, aucune ligne de
    titre n'est reconnaissable (« <h3>Stage …</h3> » n'est pas un intitulé) et
    une annonce dont le lien dit « Voir l'offre » finissait sans titre. */
export function evidenceText(raw: unknown): string {
  return String(raw ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|tr|td|span|strong|b|em|a|ul|ol)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t\u00a0]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/** Un titre n'est jamais un texte d'interface ni une invitation à cliquer. */
const CHROME_TEXT =
  /^(?:voir|voir plus|voir toutes?|voir l'offre|voir les offres|postuler|postulez|candidater|cliquez|cliquer|click here|apply|en savoir plus|découvrir|decouvrir|lire la suite|read more|s'inscrire|se désabonner|se desabonner|unsubscribe|gérer|gerer|nous contacter|partager)(?:\b|$)/i;

/** Référence de dossier, code d'annonce, date : jamais un intitulé de poste. */
const REFERENCE_LIKE =
  /^(?:r[eé]f(?:[eé]rence)?|dossier|code|annonce\s*n|offre\s*n|poste\s*n|id)\b|^\d{2,}[-/]|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/i;

/** Début d'annonce : le texte qui suit est l'intitulé du poste. */
const CONTRACT_START =
  /^(?:stage|stages|stagiaire|stagiaires|internship|interns?|alternance|apprentissage|apprenti|c[ée]sure|vie|pfe|tfe)\b/i;

/** Mots de contrat seuls : jamais un nom d'offre. */
const CONTRACT_WORD =
  /^(?:stage|stages|stagiaire|stagiaires|internship|internships|intern|interns|alternance|apprentissage|offre|offres|poste|postes|mission|missions|annonce|annonces|candidature|candidatures|emploi|emplois|job|jobs|vie|via)$/;

/** Qualificatifs sans contenu propre : « Stage TFE », « Stage 6 mois ». */
const BARE_QUALIFIER =
  /^(?:pfe|tfe|fin|d'?etudes?|etude|etudes|de|du|des|la|le|les|en|et|a|au|aux|un|une|pour|mois|an|ans|semestre|[1-9]|1[0-2]|h\/f|f\/h|hf|fh|h-f|2a|3a|4a|5a|master|licence|ecole|universite)$/;

/** Mots qui portent un contenu métier : ils sauvent un titre court. */
const SUBSTANTIVE =
  /ingenieur|ingenierie|technicien|technique|technologies?|expert|consultant|analyste|charge|chef|responsable|specialiste|architecte|developpeur|assistant|doctorant|eleve|etudes?|recherche|developpement|maintenance|qualite|projet|methodes|essais|exploitation|simulation|automatisme|informatique|data|reseau|reseaux|energie|electri|electrotech|mecanique|industriel|logistique|production|environnement|securite|structure|batiment|genie|management|audit|conseil|commercial|comptable|gestionnaire|acheteur|vendeur|projeteur|dessinateur|planificateur|planification|ordonnancement|formateur|juriste|stage-etranger|international/;

/** Filles d'attente administratives : jamais un nom d'offre. */
const FILLER_LINE =
  /\b(?:a pourvoir|pourvoir|rapidement|urgent|d[èe]s que possible|candidature spontan[eé]e|date de (?:d[ée]but|prise)|prise de poste|r[ée]mun[ée]ration|salaire|merci d'avance)\b/i;

export function isGenericTitle(value: unknown): boolean {
  if (CHROME_TEXT.test(cleanLabel(value))) return true;
  const t = normalizeLabel(value);
  if (!t) return true;
  if (t.length < 4) return true;
  const words = t.split(" ").filter(Boolean);
  if (words.some((w) => CONTRACT_WORD.test(w)) && words.every((w) => CONTRACT_WORD.test(w) || BARE_QUALIFIER.test(w))) return true;
  if (SUBSTANTIVE.test(t)) return false;
  return words.length <= 1;
}

/** Entreprises qui ne sont pas des entreprises : mots génériques, fragments de
    titre, initiales, plateformes d'annonces, valeurs techniques. */
const GENERIC_COMPANY =
  /^(?:entreprise|entreprises|societe|societes|structure|groupe|groupe-|rh|r h|ressources humaines|recrutement|recruteur|talent|talents|vous|nous|nous-memes|candidat|candidats|client|clients|non precisee|non renseignee|inconnue|inconnu|a definir|nd|na|nc|n a|non|france|ile-de-france|paris|lyon|marseille|bordeaux|toulouse|lille|nantes|rennes|strasbourg|nice|montpellier|grenoble|télétravail|teletravail|remote|h f|f h|hf|fh)$/;

const JOB_BOARD_COMPANY =
  /^(?:linkedin|indeed|hellowork|jobteaser|apec|welcometothejungle|welcome to the jungle|glassdoor|monster|talent io|meteojob|regionsjob|keljob|pole emploi|francetravail|jobijoba|studyrama|letudiant|emploi store|monster fr|jobs|carriere|carrieres|careers|recrutement|gmail|google|mail|no reply|noreply|ne pas repondre)$/;

/* Boîte d'alerte, jamais un employeur : « alertes », « noreply », « news… ». */
const ALERT_SENDER = /^(?:alertes?|noreply|no reply|ne pas repondre|notifications?|newsletter|infolettre|bonjour|bienvenue|mailer|mail|email|contact|support|service|webmaster|admin)$/;

export function isUnusableCompany(value: unknown, title?: unknown): boolean {
  const raw = cleanLabel(value);
  const t = normalizeLabel(raw);
  if (!t || t.length < 3) return true;
  /* Texte d'interface (« Voir l'offre ») et référence de dossier. */
  if (CHROME_TEXT.test(raw)) return true;
  if (REFERENCE_LIKE.test(raw)) return true;
  if (ALERT_SENDER.test(t)) return true;
  if (GENERIC_COMPANY.test(t)) return true;
  /* « Entreprise », « Société »… ne nomme personne (mais « Groupe NGE » reste
     une vraie entreprise). */
  if (/^(?:entreprise|societe|structure|employeur)\b/.test(t)) return true;
  if (JOB_BOARD_COMPANY.test(t)) return true;
  /* Phrase de description recopiée comme entreprise :
     « Chez Enedis. Études de raccordement, schémas unifilaires, dimensionnement ».
     Le test de ponctuation porte sur la valeur D'ORIGINE : cleanLabel retire le
     point final, donc « Études de raccordement. » redeviendrait une entreprise. */
  const original = String(value ?? "").trim();
  if (/[.!?]\s*$/.test(original) || /[:;]\s/.test(original)) return true;
  if (/,\s/.test(raw) || raw.split(/\s+/).length > 7 || raw.length > 70) return true;
  /* Titre de section numérique : « 3 nouvelles offres », « 12 résultats ». */
  if (/^\d/.test(raw)) return true;
  /* Fragment de titre recopié comme entreprise (« Stage TFE », « STAGE - »). */
  if (/^(?:stage|stagiaires?|offres?|emplois?|alternance|internship|interns?|annonces?|postes?|missions?|candidatures?)\b/.test(t)) return true;
  if (/^https?:|^www\.|@/.test(t)) return true;
  /* Date, nombre, ponctuation seule : jamais un nom. */
  if (!/[a-z]/.test(t)) return true;
  if (title && normalizeLabel(title) === t) return true;
  /* Fragment du titre recopié comme entreprise (« Ingénieur électricité HTA/BT »
     pour le titre « Stage Ingénieur électricité HTA/BT ») : un nom d'entreprise
     de plusieurs mots ne peut pas être un morceau de l'intitulé. */
  if (title && t.includes(" ")) {
    const titleLabel = normalizeLabel(title);
    if (titleLabel && (titleLabel.includes(t) || t.includes(titleLabel))) return true;
  }
  /* Sigle d'une ou deux lettres : jamais un nom d'entreprise. */
  if (/^[A-Z0-9.&'-]{1,2}$/.test(raw)) return true;
  if (t.replace(/[^a-z]/g, "").length < 3 && raw.length <= 4) return true;
  return false;
}

/** Ligne qui peut servir de titre : courte, nominale, jamais une phrase.
    `sentence: true` pour une phrase d'annonce (« Stage — Simulation thermique
du coeur ») : la ponctuation finale n'est plus éliminatoire. */
function titleLikeLine(line: string, options: { sentence?: boolean } = {}): string | null {
  const value = cleanLabel(line);
  if (!value || value.length < 8 || value.length > 120) return null;
  if (/https?:|@|^\d/.test(value)) return null;
  if (CHROME_TEXT.test(value)) return null;
  if (REFERENCE_LIKE.test(value)) return null;
  if (isGenericTitle(value)) return null;
  if (FILLER_LINE.test(value)) return null;
  /* Un intitulé porte toujours au moins un mot de métier. */
  if (!SUBSTANTIVE.test(normalizeLabel(value))) return null;
  /* Phrase descriptive : jamais un titre d'annonce. */
  if (/^(?:nous|notre|vous|votre|le|la|les|un|une|des|ce|cette|dans le cadre|rejoignez|rejoindre|participer|assurer|encadrer|contribuer|realiser|mettre|garantir|dans notre|au sein)/i.test(value)) return null;
  /* Phrase de description, pas un intitulé : sous-clause, durée, mention
     « chez X », ou plus de quatorze mots. */
  if (/[:;]\s/.test(value)) return null;
  if (/\b(?:chez|au sein de|recrute|recherche un|mois\b)\b/i.test(value)) return null;
  if (value.split(/\s+/).length > 14) return null;
  if (!options.sentence && /[.!?]$/.test(value)) return null;
  return value;
}

/** Intitulé extrait d'une phrase d'annonce, sur preuve de rôle explicite :
    « (H/F) Chargé d'études réseaux électriques », « Sanofi recrute un stagiaire
    ingénieur génie électrique pour son site de Vitry. », « poste de Data
    Analyst ». Aucune phrase purement descriptive n'est acceptée. */
function sentenceTitle(sentence: string): string | null {
  const clean = cleanLabel(sentence);
  if (!clean) return null;
  const candidates: string[] = [];
  const hfBefore = clean.match(/\(\s*h\s*\/\s*f\s*\)\s*([^.,;]{8,120})/i);
  if (hfBefore) candidates.push(hfBefore[1]);
  const hfAfter = clean.match(/^([^.,;]{8,120}?)\s*\(\s*h\s*\/\s*f\s*\)/i);
  if (hfAfter) candidates.push(hfAfter[1]);
  const hiring = clean.match(/\b(?:recrute|recherche|propose|offre)\s+(?:un|une|des)?\s*([^.,;]{8,120})/i);
  if (hiring) candidates.push(hiring[1]);
  const posting = clean.match(/\b(?:poste|intitul[eé]|fonction)\s*(?:de|d'|:|-|–|—)\s*([^.,;]{8,120})/i);
  if (posting) candidates.push(posting[1]);
  for (const raw of candidates) {
    const trimmed = cleanLabel(
      String(raw)
        .replace(/\s+(?:chez|au sein de|pour|dans|afin|sur|aupr[eè]s de)\b.*$/i, "")
        .replace(/^(?:un|une|des|le|la|les)\s+/i, "")
    );
    if (!SUBSTANTIVE.test(normalizeLabel(trimmed))) continue;
    const value = titleLikeLine(trimmed, { sentence: true });
    if (value) return value;
  }
  return null;
}

function looksLikeNewsletterSubject(subject: string): boolean {
  const s = normalizeLabel(subject);
  if (!s) return true;
  if (s.length > 140) return true;
  if (/\b(alerte|alertes|nouvelles? offres?|offres? (pour|du|de|correspondant)|votre alerte|job alert|recapitulatif|newsletter|synthese|ce jour|du jour)\b/.test(s) && !SUBSTANTIVE.test(s)) return true;
  if (/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(subject)) return true;
  return false;
}

export type OfferIdentityInput = {
  title?: string;
  company?: string;
  location?: string;
  url?: string;
  description?: string;
  summary?: string;
  snippet?: string;
  missions?: string[];
  profile?: string;
  /** Objet du mail source (utilisable seulement s'il nomme l'offre). */
  subjectHint?: string;
  /** Adresse d'expédition du mail source. */
  fromHint?: string;
};

/** Titre réel si une preuve existe, sinon chaîne vide (jamais inventé). */
export function titleFromEvidence(input: OfferIdentityInput): string {
  const text = [input.description, input.summary, input.profile, ...(input.missions || []), input.snippet]
    .filter((part): part is string => !!part && !!part.trim())
    .join("\n");

  /* 1 — L'objet du mail nomme l'offre (alertes à offre unique). */
  const subject = cleanLabel(input.subjectHint || "");
  if (subject && !looksLikeNewsletterSubject(subject) && !isGenericTitle(subject)) {
    const stripped = cleanLabel(subject.replace(/^(?:nouvelle offre|offre|alerte)\s*[:\-–—]\s*/i, ""));
    if (stripped && !isGenericTitle(stripped) && !looksLikeNewsletterSubject(stripped)) return stripped.slice(0, 140);
  }

  /* 2 — Première ligne du texte réel qui se lit comme un intitulé de poste. */
  for (const line of text.split(/\n|(?:\s{3,})|\u2022/)) {
    const candidate = titleLikeLine(line);
    if (candidate) return capitalize(candidate);
  }

  /* 3 — Annonce écrite d'une seule phrase : « (H/F) Chargé d'études réseaux
     électriques HTA/BT chez Enedis. » ou « Sanofi recrute un stagiaire
     ingénieur génie électrique pour son site de Vitry. » */
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const candidate = sentenceTitle(sentence);
    if (candidate) return capitalize(candidate);
    /* Annonce qui commence par le type de contrat : le début de phrase EST
       l'intitulé (« Stage — Simulation thermique du coeur. »). */
    if (CONTRACT_START.test(cleanLabel(sentence))) {
      const line = titleLikeLine(sentence, { sentence: true });
      if (line && SUBSTANTIVE.test(normalizeLabel(line))) return capitalize(line);
    }
  }

  /* 4 — Intitulé cité après un mot de rôle dans la description. */
  const quoted = text.match(/\b(?:poste|intitul[eé]|mission)\s*[:\-–—]\s*([^\n.]{8,120})/i);
  if (quoted) {
    const candidate = titleLikeLine(quoted[1]);
    if (candidate) return capitalize(candidate);
  }
  return "";
}

/** Un intitulé extrait d'une phrase commence par une majuscule. */
function capitalize(value: string): string {
  return value.replace(/^[a-zà-öø-ÿ]/, (c) => c.toUpperCase());
}

/** Entreprise citée par le texte de l'offre (preuve explicite uniquement). */
function companyFromText(input: OfferIdentityInput, title: string): string {
  const text = [input.description, input.summary, input.profile, ...(input.missions || []), input.snippet]
    .filter((part): part is string => !!part && !!part.trim())
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  /* Les mots-clés sont tolérants à la casse (« Chez Enedis » en début de phrase),
     la capture du nom reste sensible : un nom commence par une majuscule. */
  const patterns = [
    /\b(?:[Cc]hez|[Aa]u sein de|[Rr]ejoindre|[Rr]ejoins|int[eé]grer|[Aa]upr[eè]s de)\s+([A-ZÀ-Þ][\w&.'’-]*(?:\s+(?:de|du|des|d'|et)?\s?[A-ZÀ-Þ][\w&.'’-]*){0,3})/,
    /\b([A-ZÀ-Þ][\w&.'’-]*(?:\s+[A-ZÀ-Þ][\w&.'’-]*){0,2})\s+(?:[Rr]echerche|[Rr]ecrute|[Pp]ropose|[Oo]ffre|[Ss]ouhaite)\b/,
    /\b(?:entreprise|soci[eé]t[eé]|employeur)\s*[:\-–—]\s*([^\n,;]{3,60})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    /* La phrase s'arrête à la ponctuation : « chez Enedis. Missions : … »
       donne « Enedis », jamais « Enedis. Missions ». */
    const value = match
      ? cleanLabel(
          String(match[1])
            .split(/[.!?;:]/)[0]
            .replace(
              /\s+(?:Missions?|Poste|Profil|Descriptif|Description|Vous|Nous|Il|Elle|Ils|Elles|Le|La|Les|Ce|Cette|Ces|Dans|Afin|Pour|Postulez?|Candidater?|Candidature)\b.*$/i,
              ""
            )
        )
      : "";
    if (!value || value.length > 60) continue;
    if (isUnusableCompany(value, title)) continue;
    /* Un mot de contrat seul n'est pas une entreprise (mais « RTE » l'est). */
    const words = normalizeLabel(value).split(" ").filter(Boolean);
    if (!words.length || words.every((w) => CONTRACT_WORD.test(w) || BARE_QUALIFIER.test(w))) continue;
    return value;
  }
  return "";
}

/** Nom d'entreprise déduit de l'hôte du lien (site carrière ou ATS). */
export function companyFromUrl(url?: string): string {
  const raw = (url || "").trim();
  if (!raw) return "";
  let host = "";
  let path = "";
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) return "";
    host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    path = parsed.pathname;
  } catch {
    return "";
  }
  const ATS_HOST = /^(?:jobs|careers|carriere|carrieres|recrutement|emploi|apply|boards|job)\./;
  /* Plateformes où le premier segment du chemin EST l'employeur. */
  const ATS_SLUG_HOST = /(?:smartrecruiters|greenhouse|lever\.co|workable|teamtailor|recruitee|bamboohr|personio|jobvite|icims|taleo|successfactors)/;
  /* Job boards : leur URL ne nomme jamais l'employeur. */
  const JOB_BOARD_HOST = /(?:indeed|linkedin|hellowork|apec|monster|glassdoor|welcometothejungle|jobteaser|meteojob|regionsjob|keljob|jobijoba|studyrama|letudiant|francetravail|pole-emploi)/;
  const LOCALE_SEGMENT = /^(?:[a-z]{2}(?:[-_][a-z]{2,4})?|emplois?|offres?|jobs?|annonces?|recherche|search|candidature|page|detail|fr|en|de|es)$/;
  if (JOB_BOARD_HOST.test(host)) return "";
  if (ATS_SLUG_HOST.test(host)) {
    const segments = path.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    for (const segment of segments) {
      const value = cleanLabel(segment.replace(/\.(?:html?|php|aspx?)$/i, "").replace(/[-_]+/g, " "));
      if (!value || LOCALE_SEGMENT.test(value.toLowerCase()) || /^[a-z]{2,4}$/.test(value)) continue;
      if (isUnusableCompany(value)) continue;
      return value.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);
    }
    return "";
  }
  const labels = host.split(".");
  const base = labels.length >= 2 && /^(?:com|fr|org|net|eu|be|ch|io|co)$/.test(labels[labels.length - 1]) && !ATS_HOST.test(host)
    ? labels[labels.length - 2]
    : labels.find((label, index) => index > 0 && !/^(?:com|fr|org|net|eu|be|ch|io|co|jobs|careers|carriere|carrieres|recrutement|emploi|apply)$/.test(label)) || "";
  const value = cleanLabel(base.replace(/[-_]+/g, " "));
  if (!value || value.length < 3) return "";
  if (isUnusableCompany(value)) return "";
  return value.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);
}

/** Nom d'entreprise déduit de l'expéditeur du mail (alertes employeur direct). */
export function companyFromSender(from?: string): string {
  const address = (from || "").match(/[\w.+-]+@[\w.-]+/)?.[0] || "";
  if (!address) return "";
  const host = address.split("@")[1].toLowerCase();
  if (!host) return "";
  if (/(?:indeed|linkedin|hellowork|apec|jobteaser|welcometothejungle|glassdoor|monster|gmail|googlemail|outlook|hotmail|yahoo|orange|free|laposte|sfr|wanadoo|protonmail|meteojob|regionsjob|keljob|talent io)/.test(host)) return "";
  const labels = host.split(".");
  const base = labels.length >= 2 ? labels[labels.length - 2] : host;
  if (!base || base.length < 3) return "";
  if (isUnusableCompany(base)) return "";
  return base.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);
}

export type OfferIdentity = {
  title: string;
  company: string;
  /** Le libellé affiché n'est pas la valeur d'origine (réparé ou explicite). */
  titleRepaired: boolean;
  companyRepaired: boolean;
};

/** Mot de domaine seul (« Energies », « Électricité ») : décrit un secteur,
    pas une entreprise — jamais recyclé comme nom de société. */
const DOMAIN_ONLY =
  /^(?:energie|energies|electricite|electrique|electrotechnique|nucleaire|mecanique|informatique|data|reseau|reseaux|genie|maintenance|simulation|automatisme|qualite|production|logistique|environnement|securite|structure|btp|thermique|hydraulique|solaire|eolien|fpga|vhdl)$/;

/** Le libellé stocké ressemble-t-il au nom d'une entreprise (« Orano »,
    « Bouygues », « Sanofi ») plutôt qu'à un intitulé de poste ? */
function looksLikeCompanyName(value: unknown): boolean {
  const raw = cleanLabel(value);
  const t = normalizeLabel(raw);
  if (!raw || t.length < 3 || t.length > 40) return false;
  if (/\s/.test(raw)) return false;
  if (!/^[A-ZÀ-Þ]/.test(raw)) return false;
  if (/\d/.test(raw)) return false;
  if (
    CONTRACT_WORD.test(t) ||
    BARE_QUALIFIER.test(t) ||
    DOMAIN_ONLY.test(t) ||
    SUBSTANTIVE.test(t) ||
    JOB_BOARD_COMPANY.test(t)
  )
    return false;
  return true;
}

/** Répare l'identité d'une offre sans jamais inventer de nom. */
export function repairOfferIdentity(input: OfferIdentityInput): OfferIdentity {
  const rawTitle = cleanLabel(input.title);
  const rawCompany = cleanLabel(input.company);

  let title = rawTitle;
  let titleRepaired = false;
  /* L'ancien extracteur mettait parfois le nom de l'entreprise dans la colonne
     du titre (« Orano », « Sanofi ») : on le remet à sa place. */
  let companyFromTitle = "";
  if (!title || isGenericTitle(title)) {
    const recovered = titleFromEvidence(input);
    if (recovered) {
      if (looksLikeCompanyName(rawTitle)) companyFromTitle = rawTitle;
      title = recovered;
      titleRepaired = true;
    } else if (!title || isGenericTitle(title)) {
      title = UNKNOWN_TITLE;
      titleRepaired = true;
    }
  }

  let company = rawCompany;
  let companyRepaired = false;
  if (isUnusableCompany(company, title)) {
    const recovered =
      companyFromText(input, title) ||
      companyFromUrl(input.url) ||
      companyFromSender(input.fromHint) ||
      companyFromTitle;
    company = recovered || UNKNOWN_COMPANY;
    companyRepaired = true;
  }
  return { title, company, titleRepaired, companyRepaired };
}

/** Garde uniquement les mots-clés réellement présents dans le texte de
    l'offre — un badge affiché doit avoir une preuve (accents/casse ignorés).
    Un texte source court ne prouve rien (une fiche partielle ne mentionne pas
    tout) : sous ce seuil, aucun mot-clé n'est retiré. */
export const MIN_KEYWORD_EVIDENCE = 300;

export { looksLikeCompanyName };

export function groundKeywords(list: unknown, text: unknown): string[] {
  const items = Array.isArray(list) ? list.filter((item): item is string => typeof item === "string" && !!item.trim()) : [];
  const haystack = normalizeLabel(text);
  if (haystack.length < MIN_KEYWORD_EVIDENCE) return items;
  return items.filter((item) => {
    const needle = normalizeLabel(item);
    if (!needle || needle.length < 2) return false;
    return haystack.includes(needle);
  });
}
