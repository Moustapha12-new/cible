import type { Profile } from "@/lib/data";

/* ══════════════════ Types partagés ══════════════════ */

export type Task =
  | "match"
  | "adapt"
  | "letter"
  | "offer"
  | "cvScore"
  | "rank"
  | "keywords"
  | "suggest"
  | "entretien"
  | "enrich"
  | "boost-ats"
  | "improve"
  | "trim"
  | "batch-compare"
  | "gmail-offers"
  | "gmail-recheck"
  | "rank-gmail"
  | "gmail-enrich"
  | "deep-recheck-detect"
  | "deep-recheck-analyze";

export type KwInput = { term: string; importance?: string; type?: string };

export type AiEmailInput = {
  id: string;
  subject?: string;
  from?: string;
  date?: string;
  text?: string;
  links?: string[];
  /** Ancres du mail énumérées par le code (texte visible → lien réel), dans
      l'ordre du document. Sert de source de vérité pour associer chaque annonce
      à son lien de candidature, y compris les liens de tracking. */
  anchors?: { text: string; href: string }[];
};

export type Body = {
  task?: Task;
  profile?: Profile;
  cvOriginal?: string;
  offerText?: string;
  company?: string;
  role?: string;
  jobs?: { id: string; title: string; company: string; location: string; text?: string }[];
  keywords?: KwInput[];
  /** Mots-clés choisis par l'utilisateur (depuis Matching) à intégrer en priorité. */
  forceKeywords?: string[];
  cv?: unknown;
  /** E-mails provenant du libellé Gmail « Stages – Alertes offres ». */
  emails?: AiEmailInput[];
  /** Offres candidates à l'enrichissement (texte de l'e-mail + page ouverte). */
  offers?: GmailEnrichOfferInput[];
  /** Deep Recheck — analyse unitaire d'une offre (bloc + lien réel + page). */
  deepAnalyze?: DeepAnalyzeInput[];
};

export type DeepAnalyzeInput = {
  id: string;
  subject?: string;
  block?: string;
  sourceUrl?: string;
  anchorText?: string;
  snippet?: string;
  pageText?: string;
};

export type GmailEnrichOfferInput = {
  id: string;
  title?: string;
  source?: string;
  applicationUrl?: string;
  emailText?: string;
  pageText?: string;
};

/* ══════════════════ En-tête système ══════════════════ */

const SYSTEM =
  "Tu es un expert français du recrutement, des ATS et de la rédaction de CV et de lettres. " +
  "Tu réponds TOUJOURS en français, exclusivement en JSON valide, sans texte autour. " +
  "Tu ne génères jamais de PDF, HTML ou rendu : uniquement des données structurées que l'application appliquera avec l'accord de l'utilisateur.\n\n" +
  "MÉTHODE DE RÉÉCRITURE CONSERVATRICE (à appliquer pour adapt, suggest, boost-ats) :\n" +
  "RÈGLE ABSOLUE : jamais de fait, chiffre, compétence, date ou diplôme absent du CV. " +
  "Pour chaque modification, l'« original » doit être une citation EXACTE copiée du CV (mots consécutifs, UNE proposition maximum). " +
  "Le « rewritten » est la MÊME phrase avec le MINIMUM de changements pour intégrer un mot-clé accepté. " +
  "La structure, les faits, les chiffres, les dates, les noms d'entreprises et de diplômes restent strictement identiques.\n\n" +
  "CLASSIFICATION DE CHAQUE MODIFICATION :\n" +
  "• RETURN UNCHANGED → la phrase couvre déjà bien l'exigence ; ne pas toucher.\n" +
  "• VARIANT FIX → léger ajustement de vocabulaire sans changer les faits.\n" +
  "• KEYWORD INSERT → intégration minimale d'un mot-clé justifié par le CV.\n" +
  "N'utilise JAMAIS la méthode « régénérer tout le CV » : chaque changement est un remplacement ciblé.\n\n" +
  "SCORING ATS PONDÉRÉ (à renvoyer dans adapt, match, suggest) :\n" +
  "• hardSkills (compétences techniques explicites) : 2 points par mot-clé couvert.\n" +
  "• titleKeywords (mots-clés du titre du poste) : 1,5 point par mot-clé couvert.\n" +
  "• businessContext (contexte métier, secteur, outils spécifiques) : 1 point par mot-clé couvert.\n" +
  "Score final = (points gagnés / points max possibles) × 100.\n\n" +
  "ANALYSE DE L'OFFRE :\n" +
  "1. Analyse d'abord l'OFFRE en entier — y compris « Profil recherché » et « Qualités attendues » : titre, hard skills, soft skills, expérience attendue, résultats recherchés, mots-clés ATS.\n" +
  "2. Compare ensuite au CV section par section : ce qui matche, ce qui manque, ce qui est générique.\n" +
  "3. Réécris les bullets avec la formule : verbe d'action fort + contexte/étendue + résultat chiffré + outil/méthode.\n" +
  "   Si un chiffre manque, indique le TYPE de donnée que l'utilisateur doit compléter — ne l'invente JAMAIS.\n" +
  "4. Cherche le « brief caché » : ce que l'employeur cherche vraiment au-delà du texte de l'offre.\n" +
  "5. N'intègre que les mots-clés JUSTIFIÉS par le CV — cherche dans TOUT le CV : expériences, projets, certifications, langues, centres d'intérêt. Liste explicitement ceux que tu REFUSES et pourquoi.\n" +
  "6. Liste ce qui manque VRAIMENT pour le poste (absent du CV) avec une ressource gratuite PRÉCISE et NOMMÉE pour l'acquérir.\n" +
  "RÈGLE ABSOLUE ANTI-INVENTION : jamais de fait, chiffre, compétence, date ou diplôme absent du CV. " +
  "Pour un écart réel, signale-le honnêtement (à acquérir, à ne pas déclarer) au lieu de l'inventer.";

/* ══════════════════ Appel modèle ══════════════════ */

/* Résumé texte compact du profil = le « CV original » envoyé à Gemini. */
function cvText(p: Profile): string {
  if (!p) return "(profil vide)";
  const exps = p.experiences
    .map((e) => `- ${e.title} — ${e.place} (${e.period}) : ${e.detail}`)
    .join("\n");
  const eds = p.educations.map((e) => `- ${e.degree} — ${e.school} (${e.period})`).join("\n");
  return [
    `Nom : ${p.firstName} ${p.lastName}`,
    `Titre : ${p.title || "(non renseigné)"}`,
    `Ville : ${p.city}`,
    `Compétences : ${p.skills.join(", ") || "(aucune)"}`,
    `Expériences :\n${exps || "(aucune)"}`,
    `Formation :\n${eds || "(aucune)"}`,
  ].join("\n");
}

/* Anonymisation : les coordonnées ne servent à aucune analyse — on ne les
   envoie jamais au modèle. */
function redactPii(text: string): string {
  return (text ?? "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail masqué]")
    .replace(/(?:\+\d{1,3}[\s.-]?)?(?:0\d(?:[\s.-]?\d{2}){4})/g, "[téléphone masqué]");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ask(user: string, temperature = 0.4): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Clé API manquante côté serveur");
  /* La plus forte en premier : Gemini 3 Flash = intelligence « Pro » à vitesse flash
     (disponible en tier gratuit). Pour le Pro le plus avancé (gemini-3.1-pro-preview,
     payant), renseigner GEMINI_MODEL côté Vercel.
     Repli automatique si panne, 503/429, quota ou modèle indisponible. */
  const primary = (process.env.GEMINI_MODEL || "gemini-3-flash-preview").trim();
  const MODELS = [primary, "gemini-flash-latest", "gemini-3.1-flash-lite"].filter(
    (m, i, a) => a.indexOf(m) === i
  );
  let lastErr: Error = new Error("Aucun modèle disponible");
  for (const MODEL of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(900 * attempt);
      try {
        const isPro = /pro/.test(MODEL);
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: SYSTEM }] },
              contents: [{ role: "user", parts: [{ text: user }] }],
              generationConfig: {
                temperature,
                responseMimeType: "application/json",
                /* 8192 : un e-mail d'alerte peut lister jusqu'à ~18 annonces ;
                   en dessous, le JSON est coupé en pleine liste et le parse
                   backend plante. Ne jamais baisser cette limite. */
                maxOutputTokens: 8192,
                /* Pro : raisonnement intermédiaire — qualité maximale à vitesse tenable. */
                ...(isPro ? { thinkingConfig: { thinkingLevel: "medium" } } : {}),
              },
            }),
            signal: AbortSignal.timeout(isPro ? 90000 : 45000),
            cache: "no-store",
          }
        );
        if (!res.ok) {
          /* Surcharge transitoire → relance le même modèle avant de basculer. */
          const transient = res.status === 503 || res.status === 429;
          if (transient && attempt < 2) continue;
          throw new Error(`Gemini ${MODEL} HTTP ${res.status}`);
        }
        const j = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
        };
        const t = (j.candidates?.[0]?.content?.parts ?? [])
          .filter((p) => !p.thought)
          .map((p) => p.text ?? "")
          .join("")
          .trim();
        if (!t) {
          if (attempt < 2) continue;
          throw new Error("Réponse IA vide");
        }
        return t;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        /* Erreur franche (400, modèle inconnu…) : inutile de re-tenter le même. */
        if (e instanceof Error && /Gemini .* HTTP/.test(e.message) && !/ HTTP (503|429)/.test(e.message)) break;
      }
    }
  }
  throw lastErr;
}

/* ══════════════════ Prompts par tâche ══════════════════ */

function buildPrompt(task: Task, b: Body): string {
  /* Le vrai CV collé par le candidat prime sur le profil structuré. */
  const raw = b.cvOriginal?.trim();
  const cv = redactPii(raw && raw.length > 40 ? raw.slice(0, 12000) : cvText(b.profile as Profile));
  switch (task) {
    case "match":
      return `Voici le CV original du candidat :
${cv}

Voici l'offre visée :
"""${b.offerText}"""

Compare ce CV à cette offre. Réponds avec ce JSON exact :
{"score": <entier 0-100, compatibilité réelle>,
 "matched": ["mots-clés et aspects du CV qui matchent l'offre"],
 "missing": ["mots-clés décisifs de l'offre absents du CV"],
 "strategy": "<stratégie de candidature en 3-4 phrases>",
 "changes": [{"area": "<zone : Titre | Compétences | Expérience | Formation>", "change": "<modification à faire, honnête, prouvée par le CV>", "keywords": ["mots-clés liés"]}],
 "addedKeywords": ["mots-clés de l'offre prouvés ailleurs dans le CV mais pas mis en avant"],
 "considerations": [{"title": "<point de vigilance>", "detail": "<détail>"}]}
Sois strict : ne gonfle pas le score, un CV non fourni = score bas. Ne propose que des modifications honnêtes.`;
    case "adapt":
      return `Voici le CV ORIGINAL du candidat, texte intégral :
"""${cv}"""

Voici l'offre visée :
"""${b.offerText}"""

Voici les mots-clés décisifs de l'offre déjà audités :
${JSON.stringify(b.keywords ?? [], null, 1)}
${(b.forceKeywords ?? []).filter(Boolean).length ? `Mots-clés QUE LE CANDIDAT A CHOISI de faire ajouter (il les a sélectionnés dans Matching) :
${(b.forceKeywords ?? []).filter(Boolean).join(", ")}
Intègre CHACUN d'eux dès qu'il est justifiable par UN fait réel du CV (cherche notamment dans les projets, certifications, langues, centres d'intérêt) ; sinon liste-le dans "refused" avec la raison précise.` : ""}

MISSION DE RÉÉCRITURE CHIRURGICALE — pas une régénération :
1. Pour CHAQUE modification, "original" doit être une citation EXACTE copiée du CV (mots consécutifs, UNE proposition maximum). "rewritten" est la MÊME phrase avec le MINIMUM de changements pour intégrer un mot-clé accepté : la structure, les faits, les chiffres, les dates, les noms d'entreprises et de diplômes restent strictement identiques. Interdiction absolue d'introduire un chiffre, une date ou un nom absent du CV original.
2. Vise 4 à 8 modifications qui font VRAIMENT avancer le CV : le titre professionnel, les phrases d'expérience les plus pertinentes pour l'offre (réoriente leur accent vers ce que cherche le recruteur), ET la section Compétences : si des mots-clés intégrés sont prouvés ailleurs dans le CV (projets, certifications, expériences) mais absents de la ligne compétences du CV, propose une modification de cette ligne qui les ajoute.
3. Le titre proposé doit rester PROUVÉ par les expériences : jamais de titre plus senior ou d'un autre métier que ce que le CV démontre.
4. N'intègre que les mots-clés JUSTIFIÉS par le CV — cherche dans TOUT le CV : expériences, projets, certifications, langues, centres d'intérêt (un fait pertinent peut être caché ailleurs). Liste explicitement ceux que tu REFUSES et pourquoi.
5. Liste ce qui manque VRAIMENT pour le poste (absent du CV) avec une ressource gratuite PRÉCISE et NOMMÉE pour l'acquérir (plateforme réelle + intitulé de formation, ex : « OpenClassrooms — parcours Python »). N'invente jamais d'URL.

Réponds avec ce JSON exact :
{"headline": "<nouveau titre professionnel orienté offre, une ligne>",
 "changes": [{"section": "<Titre | Compétences | Expérience : <intitulé> | Formation : <intitulé>>", "original": "<citation exacte du CV>", "rewritten": "<même phrase, ajustement minimal>", "method": "RETURN_UNCHANGED|VARIANT_FIX|KEYWORD_INSERT"}],
 "integrated": [{"keyword": "<mot-clé>", "where": "<section où il apparaît maintenant>", "reason": "<pourquoi c'est légitime : fait réel du CV>"}],
 "refused": [{"keyword": "<mot-clé non intégré>", "reason": "<ce qui manque dans le CV pour le justifier>"}],
 "stillMissing": [{"item": "<exigence du poste absente du CV>", "howToGet": "<action concrète : tuto, projet, certification…>"}],
 "tips": ["2 à 3 conseils courts pour le dépôt ou l'entretien"],
 "atsScore": {"score": <entier 0-100>, "hardSkills": {"covered": <nb>, "total": <nb>, "pts": <nb>}, "titleKeywords": {"covered": <nb>, "total": <nb>, "pts": <nb>}, "businessContext": {"covered": <nb>, "total": <nb>, "pts": <nb>}}}

RAPPEL CRITIQUE : le CV final sera construit par le programme en remplaçant dans le texte original chaque "original" par "rewritten". Tu ne réécris JAMAIS le CV toi-même : tes "original" doivent être des citations mot pour mot, et tout ce que tu ne cites pas restera inchangé.`;
    case "keywords":
      return `Voici une offre d'emploi :
"""${b.offerText}"""

Parcours TOUTE l'annonce sans en ignorer une seule section : « À propos du poste », « Missions », mais AUSSI et surtout « Profil recherché », « Profil souhaité », « Qualités attendues », « Vous avez » — les exigences cachées dans ces sections sont souvent les plus décisives pour les recruteurs.
Extrais 10 à 14 mots-clés décisifs : compétences techniques, logiciels, soft skills, langues, permis, niveau d'études. Réponds avec ce JSON exact :
{"keywords": [{"term": "<terme court tel qu'écrit dans l'offre>", "importance": "haute|moyenne", "type": "compétence|logiciel|qualité|diplôme|langue"}]}`;
    case "suggest":
      return `Voici le CV STRUCTURÉ du candidat (JSON) :
${JSON.stringify(b.cv ?? {}, null, 1)}

Voici l'offre visée :
"""${b.offerText}"""

Propose des améliorations honnêtes, prêtes à appliquer par l'application. Réponds avec ce JSON exact :
{"headline": "<titre professionnel orienté offre, prouvé par les expériences>",
 "summary": "<paragraphe « Profil » réécrit dans le vocabulaire de l'offre, faits inchangés>",
 "items": [{"sectionKey": "<key de la section>", "itemId": "<id de l'item>", "proposed": "<détail réécrit : verbe d'action + contexte + résultat chiffré UNIQUEMENT si le chiffre existe déjà dans le CV>", "reason": "<pourquoi ça matche l'offre>"}],
 "skillsAdd": [{"sectionKey": "<key de la section compétences>", "terms": ["termes prouvés ailleurs dans le CV mais absents de cette section"]}]}

Contraintes : 2 à 6 items maximum, chacun ancré dans le texte existant de l'item ; aucun nouveau chiffre, date, entreprise ou diplôme ; si une exigence manque vraiment, ne la propose pas — elle apparaîtra dans les refus du module de tailoring.`;
    case "entretien":
      return `Voici le CV du candidat :
${cv}

Voici l'offre visée :
"""${b.offerText}"""

Joue le recruteur sceptique qui va l'interroger. Réponds avec ce JSON exact :
{"questions": [{"q": "<question difficile réaliste>", "a": "<réponse structurée basée sur les VRAIS points forts du CV>", "insight": "<ce que la question révèle de ce que l'entreprise cherche>"}],
 "risks": [{"zone": "<zone de risque du CV>", "answer": "<réponse clé en main>"}]}
Contraintes : 5 à 7 questions, 2 à 3 zones de risque ; aucune invention de fait ; ton direct et pratique.`;
    case "letter":
      return `Voici le CV / profil du candidat :
${cv}

Offre ciblée : ${b.role || ""} chez ${b.company || "l'entreprise"}.
Texte de l'offre (si disponible) :
"""${b.offerText}"""

Rédige une lettre de motivation française authentique, chaleureuse mais professionnelle, ancrée dans les VRAIES expériences du candidat (chiffres si présents), qui reprenne les mots-clés essentiels de l'offre. Maximum 250 mots.
HONNÊTETÉ SUR L'ÉCARTE : compare d'abord le CV à l'offre. Si une exigence importante manque vraiment, assume-le en UNE phrase sobre (« je n'ai pas encore pratiqué X, mais… ») et compense immédiatement par une capacité prouvée par un fait réel du CV (apprentissage rapide, compétence adjacente). Ne survends jamais un fit inexistant — c'est ce qui grille en entretien. Adapte le ton au secteur : sobre et technique pour l'ingénierie, plus narratif pour le marketing/communication. Réponds avec ce JSON exact :
{"subject": "<ligne Objet : ...>",
 "body": "<lettre complète avec Madame, Monsieur, paragraphes, formule de politesse et signature ${b.profile?.firstName ?? ""} ${b.profile?.lastName ?? ""}>"}`;
    case "offer":
      return `Voici le CV original du candidat :
${cv}

Voici un texte d'offre d'emploi collé par le candidat :
"""${b.offerText}"""

Extrais les informations clés et évalue le match avec le CV. Réponds avec ce JSON exact :
{"company": "<nom de l'entreprise, sinon 'Non précisée'>",
 "title": "<intitulé du poste>",
 "location": "<ville + type de contrat si présent, ex : 'Paris · Alternance 12 mois', sinon 'Non précisé'>",
 "salary": "<salaire si mentionné, sinon ''>",
 "match": <entier 0-100, compatibilité avec le CV>,
 "keywords": ["4 à 6 mots-clés compétences les plus importants de l'offre"],
 "level": "<profil et niveau attendus en une ligne, ex : 'Bac+2/3 électrotechnique, première expérience appréciée', sinon ''>",
 "summary": "<résumé fidèle de l'offre en 2-3 phrases, style annonce, en français>"}`;
    case "cvScore":
      return `Voici le CV original d'un candidat :
${cv}

Évalue ce CV comme un recruteur-ATS strict. Réponds avec ce JSON exact :
{"score": <entier 0-100, force ATS globale du CV>,
 "strengths": ["2 à 4 points forts concrets"],
 "improvements": ["3 à 5 améliorations précises et actionnables, en français"]}`;
    case "enrich":
      return `Voici le CV STRUCTURÉ du candidat (JSON) :
${JSON.stringify(b.cv ?? {}, null, 1)}

Voici l'offre visée :
"""${b.offerText}"""

Analyse ce CV pour repérer les items dont la description est faible, vague ou incomplète.
Identifie les items qui bénéficieraient de plus de détails (métriques, technologies, portée, impact).
Génère un MAXIMUM de 6 questions au total sur TOUS les items (pas par item).
Les questions doivent aider à extraire : métriques, technologies utilisées, portée, impact, contributions spécifiques.

Réponds avec ce JSON exact :
{"items_to_enrich": [{"itemId": "<id de l'item>", "sectionKey": "<key de la section>", "title": "<intitulé de l'item>", "currentDescription": "<texte actuel>", "weaknessReason": "<pourquoi c'est faible>"}],
 "questions": [{"questionId": "q_0", "itemId": "<id de l'item>", "question": "<question ciblée>", "placeholder": "<exemple concret de réponse>"}],
 "analysisSummary": "<résumé de la qualité globale du CV et des axes d'amélioration>"}
Contraintes : 6 questions maximum au total ; ne pose des questions que sur les items qui en ont vraiment besoin ; chaque question doit être spécifique au poste visé.`;
    case "boost-ats":
      return `Voici le CV ORIGINAL du candidat :
"""${cv}"""

Voici l'offre visée :
"""${b.offerText}"""

Voici les mots-clés décisifs de l'offre :
${JSON.stringify(b.keywords ?? [], null, 1)}

MODE BOOST ATS — optimisation AGRESSIVE pour les robots-tri :
Pour CHAQUE modification, "original" est une citation EXACTE du CV, "rewritten" est la version optimisée ATS.
Tu peux être plus libre que le mode adapt : réorganiser les listes de compétences, reformuler les titres pour inclure les mots-clés exacts de l'offre, ajouter des variantes de mots-clés (ex : "React.js" et "ReactJS", "JavaScript ES6" et "ES6").
MAIS : les faits, chiffres et dates restent strictement inchangés.

Réponds avec ce JSON exact :
{"headline": "<titre professionnel incluant 2-3 mots-clés ATS de l'offre>",
 "changes": [{"section": "<section>", "original": "<citation exacte>", "rewritten": "<version ATS optimisée>"}],
 "skillsReorg": [{"sectionKey": "<key section compétences>", "originalText": "<texte actuel>", "reorganizedText": "<texte réorganisé avec mots-clés ATS>"}],
 "atsScore": {"score": <entier 0-100, score ATS APRÈS boost>, "hardSkills": {"covered": <nb>, "total": <nb>}, "titleKeywords": {"covered": <nb>, "total": <nb>}, "businessContext": {"covered": <nb>, "total": <nb>}}}`;

    case "improve":
      return `Tu es un éditeur de CV expert. Tu génères des DIFFS ciblés — pas le CV complet.
Voici le CV ORIGINAL du candidat, texte intégral :
"""${cv}"""

Voici l'offre visée :
"""${b.offerText}"""

INSTRUCTIONS :
1. Génère une liste de MODIFICATIONS CIBLÉES pour améliorer le match ATS et la qualité du CV.
2. Chaque modification doit être un diff précis : une citation exacte du CV (original) remplacée par une version améliorée (rewritten).
3. Les faits, chiffres, dates, noms d'entreprises et de diplômes restent strictement identiques.
4. Chaque modification est classée : RETURN_UNCHANGED (couvre déjà), VARIANT_FIX (ajustement léger), KEYWORD_INSERT (intégration mot-clé).
5. Tu peux aussi REORDER les compétences pour mettre en avant celles de l'offre.
6. Tu peux AJOUTER des compétences déjà prouvées dans le CV mais absentes de la section compétences.
7. MAXIMUM 8 modifications. Priorise celles qui ont le PLUS d'impact sur le score ATS.

Réponds avec ce JSON exact :
{"changes": [{"section": "<Titre | Compétences | Expérience : <intitulé>>", "original": "<citation exacte du CV>", "rewritten": "<version améliorée>", "method": "RETURN_UNCHANGED|VARIANT_FIX|KEYWORD_INSERT", "impact": "haute|moyenne|basse", "reason": "<pourquoi cette modification améliore le match>"}],
 "skillsReorder": [{"sectionKey": "<key section compétences>", "ordered": ["compétence1", "compétence2", "..."]}],
 "skillsAdd": [{"sectionKey": "<key section>", "terms": ["compétence prouvée dans le CV mais absente de cette section"]}],
 "summary": "<paragraphe profil réécrit avec vocabulaire de l'offre, si pertinent>",
 "headline": "<titre professionnel amélioré>",
 "estimatedAtsScore": {"before": <nb>, "after": <nb>, "improvedBy": <nb>},
 "warnings": ["points de vigilance, compétences manquantes, choses à ne PAS déclarer"]}`;

    case "trim":
      return `Tu es un expert en optimisation de CV. Tu dois réduire le CV pour tenir sur UNE SEULE PAGE.
Voici le CV actuel :
"""${cv}"""

Voici l'offre visée :
"""${b.offerText}"""

INSTRUCTIONS :
1. Analyse la longueur actuelle du CV (nombre de mots par section).
2. Propose des coupes ciblées pour tenir sur 1 page (environ 400-500 mots max pour un CV français).
3. Pour CHAQUE coupe, indique le texte original et la version raccourcie.
4. NE COUPE JAMAIS : le nom, le titre, les compétences clés, les chiffres d'impact.
5. COUPE en priorité : descriptions trop longues, répétitions, détails secondaires, adverbes inutiles.
6. Propose aussi de SUPPRIMER des sections entières si nécessaire (projets secondaires, formations anciennes).

Réponds avec ce JSON exact :
{"totalWords": <nb actuel>,
 "targetWords": 450,
 "cuts": [{"section": "<section>", "original": "<texte original>", "trimmed": "<texte raccourci>", "wordsSaved": <nb>, "priority": "haute|moyenne|basse"}],
 "sectionsToRemove": [{"section": "<titre de la section>", "reason": "<pourquoi la supprimer>"}],
 "skillsReorder": [{"sectionKey": "<key>", "ordered": ["compétences réordonnées par priorité pour l'offre"]}],
 "estimatedFinalWords": <nb>,
 "fitsOnePage": true|false}`;

    case "batch-compare":
      return `Voici le CV du candidat :
${cv}

Voici une liste d'offres d'emploi :
${JSON.stringify(b.jobs ?? [], null, 1)}

Compare le CV avec CHAQUE offre et fournis un classement détaillé. Pour chaque offre, donne :
- Un score de compatibilité (0-100)
- Les mots-clés forts qui matchent
- Les mots-clés critiques qui manquent
- Une recommandation personnalisée (quels ajustements prioritaires pour cette offre)

Réponds avec ce JSON exact :
{"batch": [{"id": "<id de l'offre>", "match": <entier 0-100>, "matchedKeywords": ["mots-clés présents dans le CV"], "missingKeywords": ["mots-clés critiques absents"], "topRecommendation": "<conseil prioritaire pour cette offre>", "effortLevel": "faible|moyen|fort", "estimatedBoost": <points ATS gagnables>}],
 "globalSummary": "<résumé global : quelle offre est la meilleure pour le CV actuel, et pourquoi>",
 "quickWins": ["modifications qui améliorent le score sur PLUSIEURS offres simultanément"]}`;

    /* ── Module dédié : Alertes Gmail ─────────────────────────────── */
    case "gmail-offers":
      return `Tu es chargé de classer les e-mails reçus dans un libellé Gmail « Stages – Alertes offres ».
Voici les e-mails à analyser (métadonnées, texte complet de l'e-mail, liens et ancres) :
${JSON.stringify(b.emails ?? [], null, 1)}

**Champ « anchors » (source de vérité des liens) :** chaque e-mail contient en plus la liste ORDONNÉE de ses liens réels, sous la forme {"text": "<texte visible du lien>", "href": "<URL>"} — dans l'ordre où ils apparaissent dans le mail. Utilise-les pour LOCALISER chaque annonce : le titre, l'entreprise et la ville se trouvent dans le texte autour du lien d'annonce. Un lien de CANDIDATURE peut être un long lien de tracking (clk/track/redirect/comm/...) : c'est TOUT DE MÊME le lien de cette annonce. Les liens de désinscription, de compte, de footer, de réseaux sociaux ou d'accueil ne sont PAS des liens d'annonce.

Pour CHAQUE e-mail :
1. Parcours le texte intégralement, DE LA PREMIÈRE à la DERNIÈRE ligne, sans t'arrêter. Dès que le motif « Titre + Entreprise + Lieu » apparaît, cherche activement s'il se répète plus bas : 3 occurrences = 3 offres, 18 occurrences = 18 offres. Ne t'arrête jamais à la première.
2. Détermine s'il contient une ou plusieurs offres de STAGE, INTERNSHIP, ALTERNANCE ou opportunité équivalente pour un étudiant ou jeune diplômé (y compris alternance apprentissage, VIE jeune diplômé, job étudiant à forte valeur…).
3. IGNORE strictement (isOffer=false, avec une raison courte) : newsletters générales sans poste concret, offres CDI/CDD seniors, publicités, événements, formations payantes, invitations.
4. Ignore le « bruit » contextuel (« Voir toutes les offres », « Postulez facilement », « Plus d'infos », slogans, photos, recommandations) : ce ne sont PAS des offres et ils ne doivent pas te faire oublier les annonces réelles du dessous.
5. Si un e-mail contient plusieurs offres, liste CHACUNE séparément.

**RÈGLE ABSOLUE :** ne limite JAMAIS le nombre d'offres extraites d'un même e-mail. Un seul e-mail peut contenir 1, 3, 10, 20 ou 30 annonces : tu dois les lister TOUTES, chacune avec son propre objet dans offers[], sans exception. Si tu t'arrêtes avant la fin de l'e-mail, tu perds des offres réelles. Chaque annonce distincte = un objet offers[] séparé avec l'applicationUrl qui lui correspond exactement.

Pour CHAQUE offre retenue, extrais (sans rien inventer — utilise uniquement les liens et textes fournis) :
- title : intitulé du poste
- company : entreprise
- location : localisation
- contract : "Stage" | "Alternance" | "Internship" | autre précision
- duration : durée si indiquée (ex "6 mois"), sinon ""
- deadline : date limite de candidature si indiquée (format ISO AAAA-MM-JJ si possible, sinon texte), sinon ""
- skills : 3 à 8 compétences demandées
- description : résumé fidèle en 2-3 phrases
- applicationUrl : le href EXACT de l'ancre de CETTE offre (pas celle d'une autre). S'il n'existe AUCUN lien réel correspondant à cette offre (ni dans « anchors » ni dans « links »), renvoie EXACTEMENT « "" » — le système générera lui-même un lien de recherche. Ne JAMAIS inventer, assembler ou recoller un lien.
- source : "LinkedIn" | "Indeed" | "Welcome to the Jungle" | "Site entreprise" | "Autre"

Réponds avec ce JSON exact :
{"results": [{"id": "<id de l'e-mail>", "isOffer": true|false, "reason": "<si false : pourquoi ignoré ; si true : très court>", "offers": [{"title": "...", "company": "...", "location": "...", "contract": "...", "duration": "...", "deadline": "...", "skills": ["..."], "description": "...", "applicationUrl": "...", "source": "..."}]}]}

Règle anti-invention : ne crée JAMAIS un lien ou une information absente des données fournies. Retourne exactement un objet "results" couvrant TOUS les e-mails reçus, avec TOUTES les offres sans exception.`;

    case "gmail-recheck":
      return `Ces e-mails proviennent du libellé Gmail « Stages – Alertes offres » : ce sont des ALERTES EMPLOI. Il y a donc TRÈS PROBABLEMENT des offres de stage à l'intérieur, même si le corps de l'e-mail est court ou réduit à des liens.
Ne conclus JAMAIS « sans offre » à la légère : cherche CHAQUE annonce jusqu'au bout de l'e-mail.
Voici les e-mails à analyser :
${JSON.stringify(b.emails ?? [], null, 1)}

**Champ « anchors » :** chaque e-mail contient la liste ORDONNÉE de ses liens réels ({"text": "<texte visible>", "href": "<URL>"}) dans l'ordre du document, ainsi que le « links » (URLs seules). LOCALISE chaque annonce grâce à ses acnres : le titre et l'entreprise sont les textes autour du lien d'annonce. Un lien de candidature est souvent un lien de tracking long (clk/track/redirect/comm/...) : prends-le quand même comme applicationUrl. Ignore les liens de désinscription, compte, footer, réseaux sociaux, page d'accueil ou recherche générique.

Pour CHAQUE e-mail, isole CHACUNE des annonces de stage / alternance qu'il contient, en parcourant le texte du début à la fin et en répétant l'extraction si le motif « Titre + Entreprise + Lieu » réapparaît plus bas. Ignore le bruit (« Voir toutes les offres », « Postulez facilement », slogans) : seule compte la répétition des annonces réelles. Même une annonce réduite à un titre + un lien doit être listée. Pour chaque annonce :
- title : intitulé du poste (présent dans l'e-mail, sinon déduit du lien si clair, sinon "")
- company : entreprise (présente, sinon "")
- location : ville (présente, sinon "")
- contract : "Stage" | "Alternance" | "Internship" | autre précision
- duration, deadline, skills, description : uniquement si présents dans l'e-mail, sinon "" ou [] (ne JAMAIS inventer)
- applicationUrl : le href EXACT de l'ancre de CETTE annonce (pas celle d'une autre). S'il n'existe AUCUN lien réel correspondant à cette annonce (ni dans « anchors » ni dans « links »), renvoie EXACTEMENT « "" » — le système générera lui-même un lien de recherche. Ne JAMAIS inventer, assembler ou recoller un lien.
- source : plateforme d'origine ("Indeed", "LinkedIn", "Welcome to the Jungle", "JobTeaser", "HelloWork", "Apec", "Autre")
S'il n'y a réellement AUCUNE annonce (ex. : invitation événement, publicité pure, promo), renvoie isOffer=false avec une raison courte mais TU DOIS être sûr à 100% — plus de 99% des e-mails de ce libellé contiennent des offres.

Réponds avec ce JSON exact :
{"results": [{"id": "<id de l'e-mail>", "isOffer": true|false, "reason": "<court>", "offers": [{"title": "...", "company": "...", "location": "...", "contract": "...", "duration": "...", "deadline": "...", "skills": ["..."], "description": "...", "applicationUrl": "...", "source": "..."}]}]}
Retourne un objet par e-mail reçu, avec TOUTES les annonces trouvées, sans exception ni troncature.`;

    case "rank-gmail":
      return `Voici le CV du candidat :
${cv}

Voici une liste d'offres de stage / alternance détectées aujourd'hui :
${JSON.stringify(b.jobs ?? [], null, 1)}

Compare le CV à CHAQUE offre, évalue-les comme un ATS strict (pas de score généreux sans raison).
Pour chaque offre :
- score : <entier 0-100, compatibilité réelle avec le CV>
- reasons : 2-3 raisons principales DU score (faits concrets du CV)
- present : mots-clés de l'offre déjà présents dans le CV
- missing : mots-clés / compétences clés manquants (les 4-6 plus importants)
- deadline : même valeur que l'offre (transcrite telle quelle)

Réponds avec ce JSON exact :
{"results": [{"id": "<id de l'offre>", "score": <0-100>, "reasons": ["..."], "present": ["..."], "missing": ["..."], "deadline": "..."}]}

Retourne exactement un résultat par offre reçue, dans le même ordre.`;

    case "gmail-enrich":
      return `Tu enrichis des fiches de stage / alternance issues d'e-mails d'alerte (Indeed, LinkedIn…). Chaque id reçu correspond à UNE annonce distincte.

Voici les fiches à enrichir (id, métadonnées, texte de l'e-mail et texte de la page d'annonce ouverte) :
${JSON.stringify(b.offers ?? [], null, 1)}

Pour CHAQUE id fourni (obligatoirement TOUS, dans le même ordre), renvoie un objet en croisant les deux sources :
- emailText : le texte brut de l'e-mail d'alerte ;
- pageText : le texte de la page de l'annonce, qui PRIME sur l'e-mail.

Structure de chaque objet :
- id : reprends EXACTEMENT l'id fourni
- title : intitulé exact du poste
- company : entreprise ("Non précisée" si absente)
- location : ville / télétravail ("Non précisé" si absent)
- contract : "Stage", "Alternance", "Internship" ou précision
- duration : durée (ex. "6 mois") ou ""
- deadline : date limite de candidature (ISO AAAA-MM-JJ si possible) ou ""
- salary : rémunération si mentionnée, sinon ""
- skills : 4 à 10 compétences issues des textes
- keywords : 5 à 12 mots-clés techniques / termes ATS présents dans la page (langages, outils, méthodes)
- missions : 4 à 8 missions concrètes en français
- prerequisites : prérequis exigés (formation, années d'expérience, langues, certifications) — liste de phrases courtes, ou []
- profile : profil recherché en une ligne, ou ""
- description : description complète de l'annonce en 4 à 6 phrases fidèles aux textes (le résumé de l'offre)
- summary : résumé fidèle de l'offre en MAXIMUM 3 phrases (aperçu carte), en français
- applicationInfo : informations de candidature présentes dans les textes (email, formulaire, étapes, deadline de réponse), sinon ""
- applicationUrl : la valeur EXACTE fournie pour cet id
- source : "LinkedIn" | "Indeed" | "Welcome to the Jungle" | "Site entreprise" | "Autre"

RÈGLE : information absente des textes → "" ou [], jamais inventée. N'invente JAMAIS d'applicationUrl : reprends celle fournie pour cet id. Réponds TOUJOURS : un objet par id reçu, jamais zéro.

Réponds avec ce JSON exact :
{"results": [{"id": "<id fourni>", "title": "...", "company": "...", "location": "...", "contract": "...", "duration": "...", "deadline": "...", "salary": "...", "skills": ["..."], "keywords": ["..."], "missions": ["..."], "prerequisites": ["..."], "profile": "...", "description": "...", "summary": "...", "applicationInfo": "...", "applicationUrl": "<copie exacte de l'applicationUrl fournie>", "source": "..."}]}`;

    /* ── Deep Recheck (audit indépendant, pas le pipeline sync) ─────── */
    case "deep-recheck-detect":
      return `Audit EXHAUSTIF d'e-mails du libellé « Stages – Alertes offres ».
Tu analyses CHAQUE e-mail indépendamment. Un e-mail n'est JAMAIS terminé après la première offre : parcours-le DE LA PREMIÈRE à la DERNIÈRE ligne.

Données (id, subject, text, links, anchors) :
${JSON.stringify(b.emails ?? [], null, 1)}

Pour CHAQUE e-mail, réponds OBLIGATOIREMENT avec un objet dans "results" couvrant TOUS les ids reçus :
- emailId : id fourni
- containsInternshipOffer : true si au moins une offre de stage / alternance / internship / VIE / équivalent étudiant y figure, sinon false
- offerCount : nombre exact d'offres trouvées (0 si aucune)
- confidence : "high" | "medium" | "low"
- offers : liste COMPLÈTE de TOUTES les offres (jamais arrêtée à la première)

Pour chaque offre :
- title : intitulé du poste
- anchorText : texte visible du lien d'annonce (ou "")
- sourceUrl : UNIQUEMENT une URL exacte présente dans "links" ou dans anchors[].href de CET e-mail. Si aucune URL réelle ne correspond, mets "" — tu n'as pas le droit d'inventer, assembler ou réécrire un lien.
- snippet : court extrait du texte de l'e-mail autour de cette offre (pas inventé)

Ignore newsletters sans poste, CDI/CDD seniors pures, pubs, événements, formations payantes.

Réponds exactement :
{"results": [{"emailId": "...", "containsInternshipOffer": true, "offerCount": 2, "confidence": "high", "offers": [{"title": "...", "anchorText": "...", "sourceUrl": "...", "snippet": "..."}]}]}`;

    case "deep-recheck-analyze":
      return `Analyse PROFONDE d'UNE seule offre d'e-mail d'alerte. Une requête = une offre. N'utilise QUE les données fournies pour CETTE offre (id, subject, block, sourceUrl, anchorText, snippet, pageText). Ne mélange jamais avec une autre offre.

Données :
${JSON.stringify(b.deepAnalyze ?? [], null, 1)}

Pour CHAQUE id reçu (tous, même ordre), renvoie :
- id : exactement l'id fourni
- title, company, location, contract, duration, deadline : chaînes ("" si absent)
- skills : string[] (compétences réelles, sinon [])
- missions : string[] (sinon [])
- profile : string[] (profil exigé en points, sinon [])
- description : description fidèle en 3-6 phrases (pas d'invention)
- applicationInfo : modalités de candidature présentes dans les textes, sinon ""
- sourceUrl, anchorText, snippet : recopiés TELS QUELS depuis l'entrée (jamais inventés)

RÈGLE : information absente → "" ou []. Ne JAMAIS inventer. Réponds TOUJOURS un objet par id.

Réponds exactement :
{"results": [{"id": "...", "title": "", "company": "", "location": "", "contract": "", "duration": "", "deadline": "", "skills": [], "missions": [], "profile": [], "description": "", "applicationInfo": "", "sourceUrl": "", "anchorText": "", "snippet": ""}]}`;
  }
  return "{}";
}

/* Appel IA + parse JSON, sans erreurs de format qui feraient tout planter une
   fois sur deux. Les modèles répondent parfois un bloc ``` ```json → on nettoie.
   Une température peut être imposée par tâche (extraction : basse = déterministe). */
export async function askJson<T = unknown>(
  task: Task,
  body: Body,
  opts?: { temperature?: number }
): Promise<T> {
  const raw = await ask(buildPrompt(task, body), opts?.temperature);
  const clean = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return JSON.parse(clean) as T;
}