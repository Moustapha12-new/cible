"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Lang = "fr" | "en";

/* ══════════════════════════════════════════════════════════════
   DICTIONNAIRE — une clé, deux langues. Source unique de vérité.
   ══════════════════════════════════════════════════════════════ */
const dict: Record<string, { fr: string; en: string }> = {
  /* ── Nav ─────────────────────────────────────────────────── */
  "nav.features": { fr: "Fonctionnalités", en: "Features" },
  "nav.how": { fr: "Méthode", en: "How it works" },
  "nav.demo": { fr: "Démo", en: "Demo" },
  "nav.tracking": { fr: "Pilotage", en: "Tracking" },
  "nav.testimonials": { fr: "Témoignages", en: "Stories" },
  "nav.faq": { fr: "FAQ", en: "FAQ" },
  "nav.cta": { fr: "Essai gratuit", en: "Start free" },
  "nav.login": { fr: "Se connecter", en: "Log in" },
  "nav.menu": { fr: "Menu", en: "Menu" },
  "nav.close": { fr: "Fermer", en: "Close" },

  /* ── Hero ────────────────────────────────────────────────── */
  "hero.eyebrow": {
    fr: "Assistant candidature nouvelle génération",
    en: "The next-generation application assistant",
  },
  "hero.title.a": { fr: "Votre CV.", en: "Your CV." },
  "hero.title.b": { fr: "Leur offre.", en: "Their offer." },
  "hero.title.c": { fr: "Enfin alignés.", en: "Finally aligned." },
  "hero.sub": {
    fr: "Collez une offre d'emploi : Cible réécrit votre CV avec vos propres mots, vérifie sa compatibilité ATS, rédige votre lettre et pilote vos candidatures. Sans jamais rien inventer.",
    en: "Paste a job offer: Cible rewrites your CV in your own words, checks its ATS compatibility, writes your cover letter and manages your applications. Without ever inventing anything.",
  },
  "hero.cta.primary": { fr: "Calibrer mon CV — gratuit", en: "Calibrate my CV — free" },
  "hero.cta.secondary": { fr: "Voir la démo · 90 s", en: "Watch the demo · 90 s" },
  "hero.trust": {
    fr: "42 000 candidats l'ont déjà utilisé ce mois-ci",
    en: "42,000 candidates already used it this month",
  },
  "hero.badge.scoreLabel": { fr: "Score ATS", en: "ATS score" },
  "hero.badge.interviews": { fr: "+38 % d'entretiens", en: "+38% interviews" },
  "hero.badge.interviewsSub": { fr: "après calibration", en: "after calibration" },
  "hero.badge.letter": { fr: "Lettre générée", en: "Letter generated" },
  "hero.badge.letterSub": { fr: "en 12 secondes", en: "in 12 seconds" },
  "hero.scroll": { fr: "Défiler pour découvrir", en: "Scroll to explore" },

  /* ── Hero cinématique ────────────────────────────────────── */
  "cine.kicker": {
    fr: "Assistant candidature nouvelle génération",
    en: "The next-generation application assistant",
  },
  "cine.sub": {
    fr: "Collez une offre d'emploi : Cible aligne votre CV dessus, mot après mot, vérifie sa compatibilité ATS et rédige votre lettre. Sans jamais rien inventer.",
    en: "Paste a job offer: Cible aligns your CV to it, word by word, checks ATS compatibility and writes your letter. Without ever inventing anything.",
  },
  "cine.pill.cv": { fr: "CV calibré", en: "Tailored CV" },
  "cine.pill.ats": { fr: "Score ATS", en: "ATS score" },
  "cine.pill.letter": { fr: "Lettre rédigée", en: "Letter written" },
  "cine.cta.primary": { fr: "Calibrer mon CV — gratuit", en: "Calibrate my CV — free" },
  "cine.cta.demo": { fr: "Voir la démo · 90 s", en: "Watch the demo · 90 s" },
  "cine.cue": { fr: "Défiler", en: "Scroll" },
  "cine.cap.kw": {
    fr: "Les mots-clés de l'offre s'illuminent.",
    en: "The offer's keywords light up.",
  },
  "cine.cap.net": {
    fr: "Chaque compétence trouve sa cible.",
    en: "Every skill finds its mark.",
  },
  "cine.cap.arch": {
    fr: "Et la porte s'ouvre.",
    en: "And the door opens.",
  },

  /* ── Preuve sociale ──────────────────────────────────────── */
  "proof.label": {
    fr: "Nos utilisateurs ont décroché des entretiens chez",
    en: "Our users landed interviews at",
  },
  "stats.s1.label": { fr: "CV calibrés", en: "CVs calibrated" },
  "stats.s2.label": { fr: "entretiens décrochés en plus", en: "more interviews landed" },
  "stats.s3.label": { fr: "score ATS moyen atteint", en: "average ATS score reached" },
  "stats.s4.label": { fr: "note moyenne des utilisateurs", en: "average user rating" },

  /* ── Fonctionnalités ─────────────────────────────────────── */
  "features.eyebrow": { fr: "Super-pouvoirs", en: "Superpowers" },
  "features.title": {
    fr: "Tout le parcours candidature, dans un seul outil.",
    en: "The entire application journey, in a single tool.",
  },
  "features.sub": {
    fr: "Du premier import au dernier suivi de relance : chaque étape est pensée pour vous faire avancer, même si vous ne savez pas par où commencer.",
    en: "From the first import to the last follow-up: every step is designed to move you forward, even if you don't know where to start.",
  },
  "f1.t": { fr: "Import instantané", en: "Instant import" },
  "f1.d": {
    fr: "Glissez votre PDF, importez LinkedIn ou partez d'une page blanche guidée, question par question. Vos données restent les vôtres.",
    en: "Drop your PDF, import from LinkedIn or start from a guided blank page, question by question. Your data stays yours.",
  },
  "f2.t": { fr: "Lecture d'offre", en: "Offer analysis" },
  "f2.d": {
    fr: "Collez le texte de l'offre : mots-clés, compétences exigées, attentes implicites — tout est extrait et hiérarchisé en quelques secondes.",
    en: "Paste the job text: keywords, required skills, hidden expectations — everything is extracted and ranked in seconds.",
  },
  "f3.t": { fr: "Réécriture fidèle", en: "Faithful rewriting" },
  "f3.d": {
    fr: "Vos expériences reformulées avec le vocabulaire de l'offre. Zéro invention : chaque phrase reste traçable à votre CV d'origine.",
    en: "Your experience rephrased with the offer's vocabulary. Zero invention: every sentence remains traceable to your original CV.",
  },
  "f4.t": { fr: "Score & ATS visuel", en: "Visual score & ATS" },
  "f4.d": {
    fr: "Un score de compatibilité limpide, une analyse ATS détaillée et la liste exacte de ce qui pourrait vous filtrer — avant l'envoi.",
    en: "A crystal-clear compatibility score, a detailed ATS analysis and the exact list of what could filter you out — before you hit send.",
  },
  "f5.t": { fr: "Lettre & emails types", en: "Letter & email templates" },
  "f5.d": {
    fr: "Une lettre de motivation cohérente avec votre CV adapté, plus des emails de candidature et de relance prêts à personnaliser.",
    en: "A cover letter consistent with your tailored CV, plus application and follow-up emails ready to personalise.",
  },
  "f6.t": { fr: "Candidatures pilotées", en: "Managed applications" },
  "f6.d": {
    fr: "Offres pertinentes détectées, formulaires pré-remplis, relances programmées. Vous validez chaque envoi — rien ne part sans vous.",
    en: "Relevant offers detected, forms pre-filled, follow-ups scheduled. You approve every send — nothing goes out without you.",
  },
  "features.demo.kwTitle": { fr: "Mots-clés extraits de l'offre", en: "Keywords extracted from the offer" },
  "features.import.dropzone": { fr: "Déposez votre CV ici", en: "Drop your CV here" },
  "features.import.or": { fr: "ou importer depuis", en: "or import from" },
  "features.ats.title": { fr: "Analyse ATS en direct", en: "Live ATS analysis" },
  "features.letter.snippet": {
    fr: "« Fort de trois ans en gestion de projet e-commerce, je souhaite mettre mon expertise React et Agile au service de… »",
    en: "\u201cWith three years in e-commerce project management, I want to put my React and Agile expertise at the service of…\u201d",
  },
  "bonus.label": { fr: "Et aussi", en: "Also included" },
  "bonus.interviews": { fr: "Simulation d'entretien", en: "Interview simulator" },
  "bonus.salary": { fr: "Repères salariaux", en: "Salary benchmarks" },
  "bonus.career": { fr: "Carte de carrière", en: "Career map" },
  "bonus.beginner": { fr: "Mode débutant guidé", en: "Guided beginner mode" },
  "f6.c1": { fr: "Offres détectées", en: "Offers detected" },
  "f6.c2": { fr: "Formulaires pré-remplis", en: "Pre-filled forms" },
  "f6.c3": { fr: "Relances programmées", en: "Scheduled follow-ups" },
  "f6.c4": { fr: "Validation avant envoi", en: "Approval before send" },

  /* ── Comment ça marche ───────────────────────────────────── */
  "how.eyebrow": { fr: "Comment ça marche", en: "How it works" },
  "how.title": { fr: "De l'offre floue à l'entretien décroché.", en: "From vague offer to landed interview." },
  "how.sub": {
    fr: "Cinq étapes, zéro jargon. Si c'est votre première recherche d'emploi, chaque écran vous explique ce qu'il se passe.",
    en: "Five steps, zero jargon. If this is your first job hunt, every screen explains what's happening.",
  },
  "how.s1.t": { fr: "Importez votre CV", en: "Import your CV" },
  "how.s1.d": {
    fr: "PDF, LinkedIn ou page blanche guidée. Deux minutes chrono, même si vous n'avez jamais écrit de CV.",
    en: "PDF, LinkedIn or a guided blank page. Two minutes flat, even if you've never written a CV before.",
  },
  "how.s2.t": { fr: "Collez l'offre", en: "Paste the offer" },
  "how.s2.d": {
    fr: "Copiez le texte de n'importe quelle plateforme ou page carrière. Cible lit entre les lignes.",
    en: "Copy the text from any platform or careers page. Cible reads between the lines.",
  },
  "how.s3.t": { fr: "Cible analyse & aligne", en: "Cible analyses & aligns" },
  "how.s3.d": {
    fr: "Mots-clés manquants, phrases à ajuster, score de compatibilité en direct. Vous voyez tout, vous décidez de tout.",
    en: "Missing keywords, sentences to adjust, live compatibility score. You see everything, you decide everything.",
  },
  "how.s4.t": { fr: "Comparez & téléchargez", en: "Compare & download" },
  "how.s4.d": {
    fr: "Un avant/après limpide, mot après mot. Votre PDF calibré est prêt à envoyer en un clic.",
    en: "A crystal-clear before/after, word by word. Your calibrated PDF is ready to send in one click.",
  },
  "how.s5.t": { fr: "Postulez & suivez", en: "Apply & track" },
  "how.s5.d": {
    fr: "Candidatures trackées, relances programmées, recruteurs identifiés. Plus jamais d'offre perdue de vue.",
    en: "Applications tracked, follow-ups scheduled, recruiters identified. Never lose sight of an offer again.",
  },

  /* ── Démo avant / après ──────────────────────────────────── */
  "demo.eyebrow": { fr: "La preuve", en: "The proof" },
  "demo.title": { fr: "Avant / Après. Sans filtre.", en: "Before / After. No filters." },
  "demo.sub": {
    fr: "Un même CV, une même offre. Regardez ce que trente secondes d'alignement changent — sans rien inventer.",
    en: "One CV, one offer. See what thirty seconds of alignment change — without inventing anything.",
  },
  "demo.seg.before": { fr: "Avant", en: "Before" },
  "demo.seg.after": { fr: "Après", en: "After" },
  "demo.jd.label": { fr: "Offre collée par l'utilisateur", en: "Offer pasted by the user" },
  "demo.jd.text": {
    fr: "Chef de projet digital H/F · CDI · Paris. Vous piloterez la refonte de notre plateforme e-commerce : méthodologie Agile, coordination cross-team, reporting KPI au comité…",
    en: "Digital Project Manager M/F · Permanent · Paris. You will lead our e-commerce platform redesign: Agile methodology, cross-team coordination, KPI reporting to the board…",
  },
  "demo.analyzed": { fr: "Analyse terminée · 14 mots-clés détectés", en: "Analysis complete · 14 keywords detected" },
  "demo.gauge.before": { fr: "Avant Cible", en: "Before Cible" },
  "demo.gauge.after": { fr: "Après Cible", en: "After Cible" },
  "demo.gauge.label": { fr: "Compatibilité avec l'offre", en: "Match with the offer" },
  "demo.ats.title": { fr: "Contrôles ATS", en: "ATS checks" },
  "demo.kw.added": { fr: "Mots-clés ajoutés depuis votre CV", en: "Keywords surfaced from your CV" },
  "demo.download": { fr: "Télécharger le PDF calibré", en: "Download the calibrated PDF" },
  "demo.traceability": {
    fr: "Chaque surbrillance renvoie au texte d'origine de votre CV. Rien n'est inventé, tout est vérifiable.",
    en: "Every highlight links back to your CV's original text. Nothing is invented, everything is verifiable.",
  },

  /* ── Pilotage / dashboard ────────────────────────────────── */
  "auto.eyebrow": { fr: "Pilotage", en: "Command centre" },
  "auto.title": { fr: "Postulez plus. Suivez tout. N'oubliez rien.", en: "Apply more. Track all. Forget none." },
  "auto.sub": {
    fr: "Chaque candidature devient une ligne claire : envoyée, relancée, réponse, entretien. Et les bons recruteurs à contacter, toujours à portée de clic.",
    en: "Every application becomes one clear row: sent, followed up, answer, interview. And the right recruiters to contact, always one click away.",
  },
  "dash.greeting": { fr: "Bonjour, Camille", en: "Hello, Camille" },
  "dash.nav.overview": { fr: "Vue d'ensemble", en: "Overview" },
  "dash.nav.applications": { fr: "Candidatures", en: "Applications" },
  "dash.nav.offers": { fr: "Offres détectées", en: "Detected offers" },
  "dash.nav.recruiters": { fr: "Recruteurs", en: "Recruiters" },
  "dash.nav.letters": { fr: "Lettres", en: "Letters" },
  "dash.stat.sent": { fr: "Candidatures envoyées", en: "Applications sent" },
  "dash.stat.replies": { fr: "Taux de réponse", en: "Reply rate" },
  "dash.stat.interviews": { fr: "Entretiens obtenus", en: "Interviews secured" },
  "dash.stat.time": { fr: "Heures gagnées", en: "Hours saved" },
  "dash.chart.title": { fr: "Activité — 12 dernières semaines", en: "Activity — last 12 weeks" },
  "dash.pipe.company1": { fr: "Maison Lemoine", en: "Maison Lemoine" },
  "dash.pipe.role1": { fr: "Cheffe de projet digital", en: "Digital project manager" },
  "dash.pipe.company2": { fr: "Studio Vireo", en: "Vireo Studio" },
  "dash.pipe.role2": { fr: "Product owner junior", en: "Junior product owner" },
  "dash.pipe.company3": { fr: "Groupe Altis", en: "Altis Group" },
  "dash.pipe.role3": { fr: "Coordinateur e-commerce", en: "E-commerce coordinator" },
  "dash.pipe.company4": { fr: "Nova Retail", en: "Nova Retail" },
  "dash.pipe.role4": { fr: "Chef de projet CRM", en: "CRM project manager" },
  "dash.pill.sent": { fr: "Envoyée", en: "Sent" },
  "dash.pill.waiting": { fr: "En attente", en: "Waiting" },
  "dash.pill.interview": { fr: "Entretien jeudi", en: "Interview Thursday" },
  "dash.pill.offer": { fr: "Réponse positive", en: "Positive reply" },
  "dash.recruiter.title": { fr: "Recruteurs identifiés", en: "Recruiters identified" },
  "dash.recruiter.btn": { fr: "Modèle d'email", en: "Email template" },
  "dash.letter.card": { fr: "Lettre générée pour Maison Lemoine", en: "Letter generated for Maison Lemoine" },
  "dash.letter.cta": { fr: "Relire & envoyer", en: "Review & send" },
  "auto.trust": {
    fr: "Vous gardez le contrôle : aucune candidature ne part sans votre validation.",
    en: "You stay in control: no application leaves without your approval.",
  },

  /* ── Témoignages ─────────────────────────────────────────── */
  "testi.eyebrow": { fr: "Ils témoignent", en: "User stories" },
  "testi.title": { fr: "Des parcours qui débloquent.", en: "Journeys that unlock." },
  "t1.q": {
    fr: "Premier stage décroché en trois semaines. Le mode débutant m'a expliqué chaque étape, sans jamais me faire sentir novice.",
    en: "First internship landed in three weeks. Beginner mode walked me through every step without ever making me feel like a novice.",
  },
  "t1.name": { fr: "Léa M.", en: "Léa M." },
  "t1.role": { fr: "Étudiante en master — marketing", en: "Master's student — marketing" },
  "t1.chip": { fr: "Stage décroché", en: "Internship landed" },
  "t2.q": {
    fr: "Mon CV était excellent… pour personne. Aligné sur chaque offre, j'ai multiplié mes réponses par quatre en un mois.",
    en: "My CV was great… for no one. Aligned to each offer, I quadrupled my replies within a month.",
  },
  "t2.name": { fr: "Karim B.", en: "Karim B." },
  "t2.role": { fr: "Reconversion — développeur web", en: "Career switcher — web developer" },
  "t2.chip": { fr: "×4 réponses", en: "×4 replies" },
  "t3.q": {
    fr: "L'analyse ATS m'a montrée pourquoi on me filtrait. Deux corrections plus tard, j'avais trois entretiens.",
    en: "The ATS analysis showed me why I kept being filtered. Two fixes later, I had three interviews.",
  },
  "t3.name": { fr: "Sofia R.", en: "Sofia R." },
  "t3.role": { fr: "Arrivante en France — logistique", en: "Newcomer to France — logistics" },
  "t3.chip": { fr: "3 entretiens", en: "3 interviews" },
  "t4.q": {
    fr: "Je postulais à cinq offres par semaine, à la main. Maintenant trente, mieux ciblées, en moitié moins de temps.",
    en: "I used to apply to five jobs a week by hand. Now it's thirty, better targeted, in half the time.",
  },
  "t4.name": { fr: "Thomas D.", en: "Thomas D." },
  "t4.role": { fr: "Ingénieur senior — industrie", en: "Senior engineer — industry" },
  "t4.chip": { fr: "30 candidatures / semaine", en: "30 applications / week" },

  /* ── FAQ ─────────────────────────────────────────────────── */
  "faq.eyebrow": { fr: "Questions", en: "Questions" },
  "faq.title": { fr: "Tout ce que vous vous demandez.", en: "Everything you're wondering." },
  "faq.q1": { fr: "Est-ce que Cible invente des choses dans mon CV ?", en: "Does Cible invent things in my CV?" },
  "faq.a1": {
    fr: "Non — c'est notre principe fondateur. Cible ne fait qu'utiliser les informations déjà présentes dans votre CV : il les reformule avec le vocabulaire de l'offre, met en avant ce qui compte et masque le bruit. Chaque modification est surlignée et traçable jusqu'à votre texte d'origine. Vous validez chaque changement avant de télécharger.",
    en: "No — it's our founding principle. Cible only uses information already present in your CV: it rephrases it with the offer's vocabulary, surfaces what matters and hides the noise. Every change is highlighted and traceable back to your original text. You approve each change before downloading.",
  },
  "faq.q2": { fr: "Je cherche mon premier emploi, c'est fait pour moi ?", en: "I'm looking for my first job — is this for me?" },
  "faq.a2": {
    fr: "Oui, et c'est même conçu pour ça. Le mode débutant vous guide question par question pour construire un CV à partir de rien : stages, projets d'études, bénévolat, emplois étudiants. Chaque terme technique (ATS, matching, relance) est expliqué simplement, sans jargon ni jugement.",
    en: "Yes — it's designed exactly for that. Beginner mode guides you question by question to build a CV from scratch: internships, school projects, volunteering, student jobs. Every technical term (ATS, matching, follow-up) is explained simply, no jargon, no judgement.",
  },
  "faq.q3": { fr: "Qu'est-ce qu'un ATS, au juste ?", en: "What is an ATS, exactly?" },
  "faq.a3": {
    fr: "Un ATS (Applicant Tracking System) est le logiciel que la majorité des entreprises utilisent pour trier les CV avant qu'un humain ne les lise. S'il ne trouve pas les bons mots-clés ou la bonne structure, votre CV peut être écarté automatiquement. Cible simule cette lecture et corrige ce qui peut vous faire filtrer.",
    en: "An ATS (Applicant Tracking System) is the software most companies use to screen CVs before a human reads them. If it can't find the right keywords or structure, your CV can be automatically rejected. Cible simulates that read and fixes whatever could filter you out.",
  },
  "faq.q4": { fr: "Mes données sont-elles en sécurité ?", en: "Is my data safe?" },
  "faq.a4": {
    fr: "Votre CV vous appartient : chiffrement en transit et au repos, aucune revente, aucun entraînement de modèle sur vos documents, suppression définitive en un clic. Les lettres et emails générés restent privés. Vous pouvez exporter et effacer toutes vos données à tout moment.",
    en: "Your CV belongs to you: encrypted in transit and at rest, never sold, never used to train models, permanent deletion in one click. Generated letters and emails stay private. You can export and erase all of your data at any time.",
  },
  "faq.q5": { fr: "Puis-je garder ma mise en page préférée ?", en: "Can I keep my favourite layout?" },
  "faq.a5": {
    fr: "Oui. Cible propose plusieurs modèles sobres et lisibles par les robots, mais il peut aussi préserver votre mise en page existante et ne toucher qu'au contenu. Dans tous les cas, le PDF exporté reste 100 % le vôtre, prêt à envoyer.",
    en: "Yes. Cible offers several clean, machine-readable templates, but it can also preserve your existing layout and only touch the content. Either way, the exported PDF stays 100% yours, ready to send.",
  },
  "faq.q6": { fr: "Les recruteurs savent-ils que j'utilise Cible ?", en: "Do recruiters know I'm using Cible?" },
  "faq.a6": {
    fr: "Non. Le résultat est un CV et une lettre parfaitement normaux — parce que le fond vient de vous, et que seule la forme est optimisée. Aucune mention, aucun filigrane, aucun style « généré par IA ». Vous postulez comme vous, en mieux préparé.",
    en: "No. The result is a perfectly normal CV and letter — because the substance comes from you, and only the form is optimised. No mention, no watermark, no \u201cAI-generated\u201d look. You apply as yourself, just better prepared.",
  },

  /* ── CTA finale ──────────────────────────────────────────── */
  "cta.eyebrow": { fr: "Prêt à viser juste ?", en: "Ready to aim true?" },
  "cta.title": {
    fr: "Votre prochain emploi mérite mieux qu'un CV générique.",
    en: "Your next job deserves better than a generic CV.",
  },
  "cta.sub": {
    fr: "Créez votre compte, collez une offre, regardez votre CV se mettre au niveau. Trente secondes suffisent pour comprendre.",
    en: "Create your account, paste an offer, watch your CV rise to the occasion. Thirty seconds is all it takes to get it.",
  },
  "cta.input.ph": { fr: "votre@email.com", en: "you@email.com" },
  "cta.btn": { fr: "Commencer gratuitement", en: "Start for free" },
  "cta.success": { fr: "Merci ! Vérifiez votre boîte mail pour continuer.", en: "Thank you! Check your inbox to continue." },
  "cta.micro": {
    fr: "Gratuit pour commencer · Sans carte bancaire · Prêt en 2 minutes",
    en: "Free to start · No credit card · Ready in 2 minutes",
  },

  /* ── Footer ──────────────────────────────────────────────── */
  "footer.tagline": {
    fr: "L'assistant qui aligne votre CV sur chaque offre, sans jamais rien inventer.",
    en: "The assistant that aligns your CV to every offer, without ever inventing anything.",
  },
  "footer.product": { fr: "Produit", en: "Product" },
  "footer.resources": { fr: "Ressources", en: "Resources" },
  "footer.legal": { fr: "Légal", en: "Legal" },
  "footer.link.features": { fr: "Fonctionnalités", en: "Features" },
  "footer.link.pricing": { fr: "Tarifs", en: "Pricing" },
  "footer.link.security": { fr: "Sécurité", en: "Security" },
  "footer.link.changelog": { fr: "Nouveautés", en: "Changelog" },
  "footer.link.guide": { fr: "Guide du premier emploi", en: "First-job guide" },
  "footer.link.blog": { fr: "Blog", en: "Blog" },
  "footer.link.templates": { fr: "Modèles de CV", en: "CV templates" },
  "footer.link.faq": { fr: "FAQ", en: "FAQ" },
  "footer.link.privacy": { fr: "Confidentialité", en: "Privacy" },
  "footer.link.terms": { fr: "CGU", en: "Terms" },
  "footer.link.imprint": { fr: "Mentions légales", en: "Imprint" },
  "footer.rights": { fr: "© 2026 Cible. Tous droits réservés.", en: "© 2026 Cible. All rights reserved." },
  "footer.made": { fr: "Conçu avec soin à Paris.", en: "Crafted with care in Paris." },
};

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: "fr",
  setLang: () => undefined,
  t: (key) => dict[key]?.fr ?? key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fr");

  /* Restauration de la préférence après hydratation (pas de mismatch SSR) */
  useEffect(() => {
    let id = 0;
    try {
      const saved = window.localStorage.getItem("cible-lang");
      if (saved === "en" || saved === "fr") {
        id = window.setTimeout(() => setLangState(saved), 0);
      }
    } catch {
      /* stockage indisponible — on reste en français */
    }
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem("cible-lang", l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string) => dict[key]?.[lang] ?? dict[key]?.fr ?? key,
    [lang]
  );

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
