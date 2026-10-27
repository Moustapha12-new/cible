# Rapport Module 3 — pipeline vs gold standard

- Date : 2026-10-27T22:53:10.862Z
- Mode 3 e-mails : **IA RÉELLE (GEMINI_API_KEY depuis .env.local)**
- Mode corpus 171 : **code seul (skipAi:true)**
- Gold : 489 offres / 120 e-mails (Deep Recheck IA, lots 0/1/16/21 en erreur JSON, 51 e-mails sans entrée).

## 1. Les 3 e-mails .eml réels

| E-mail | ID corpus | Gold (offres) | Code | Total pipeline | Méthode | Statut |
|---|---|---:|---:|---:|---|---|
| Moustapha, Hellowork a trouvé 2 nouvelles offres | 1a0cd8baec962b60 | 8 | 11 | 11 | code+ia | detected |
| Stage - Ingénieur Etudes et Projets (F_H) à Veol | 1a0cb13272b465d3 | 0 | 10 | 10 | code+ia | detected |
| Stagiaire ingénieur automatismes F_H chez EDF _  | — | n/a | 4 | 4 | code+ia | detected |

### Écarts documentés (3 e-mails)

- **Moustapha, Hellowork a trouvé 2 nouvelles offres** : gold=8 (IA recheck) vs pipeline=11 (delta=3). Méthode=code+ia, mode=IA RÉELLE (GEMINI_API_KEY depuis .env.local).
- **Stage - Ingénieur Etudes et Projets (F_H) à Veol** : gold=0 avec `detectStatus=error` (lot en erreur) — gold non fiable pour cet e-mail ; pipeline=10.
- **Stagiaire ingénieur automatismes F_H chez EDF _ ** : absent du corpus gold Deep Recheck (aucun ID apparié) — comparaison impossible.

## 2. Corpus 171 e-mails

| Métrique | Gold IA (Deep Recheck) | Nouveau pipeline (code seul) |
|---|---:|---:|
| E-mails corpus | 171 | 171 |
| E-mails avec entrée / traités | 120 | 171 |
| E-mails avec ≥1 offre | 99 | 159 |
| Total offres détectées | 489 | 835 |
| Correspondances exactes (sur 120) | — | 72 |

### Écarts top (|delta| > 1 offre, sur les 120 e-mails gold)

| ID | Sujet | Gold | Code | Δ |
|---|---|---:|---:|---:|
| 1a0cb13272b465d3 | Stage - Ingénieur Etudes et Projets (F/H) à Veolia | 0 | 10 | +10 |
| 1a0b6484493e4390 | Stage - ingénieur(e) performance énergétique indus | 0 | 9 | +9 |
| 1a0b63b299cfe1a1 | Stage fiabilité équipement sous vide F/H chez EDF  | 0 | 7 | +7 |
| 1a0cd67c5331ac38 | Stagiaire Ingénieur(e) de Projets junior Solaire / | 0 | 6 | +6 |
| 1a0baab5799e1a79 | Stage - Développement IHM/ Diagnostic Systèmes de  | 0 | 6 | +6 |
| 1a0c2e774a2f5121 | Moustapha, Hellowork a trouvé 2 nouvelles offres d | 6 | 10 | +4 |
| 1a0b716e1d3b5467 | Ingénieur études et conception mobilité électrique | 5 | 9 | +4 |
| 1a0cd8baec962b60 | Moustapha, Hellowork a trouvé 2 nouvelles offres d | 8 | 11 | +3 |
| 1a0c83ef1be0b274 | Moustapha, Hellowork a trouvé une nouvelle offre d | 8 | 11 | +3 |
| 1a0c79f0ac7d832f | Moustapha, Hellowork a trouvé une nouvelle offre d | 6 | 9 | +3 |
| 1a0c284d2e88ea35 | Moustapha, Hellowork a trouvé 2 nouvelles offres d | 6 | 9 | +3 |
| 1a0bd8fadb644085 | Moustapha, Hellowork a trouvé une nouvelle offre d | 5 | 8 | +3 |
| 1a0bd7116086ff89 | Moustapha, Hellowork a trouvé 3 nouvelles offres d | 4 | 7 | +3 |
| 1a0bd68603c841c0 | Moustapha, Hellowork a trouvé une nouvelle offre d | 5 | 8 | +3 |
| 1a0b8f8e54c45f18 | Moustapha, Hellowork a trouvé 4 nouvelles offres d | 4 | 7 | +3 |

**Causes d'écart :**

1. Gold = IA Deep Recheck (lots partiellement en erreur) ; pipeline Module 3 corpus = **code seul** (`skipAi`) pour comparaison déterministe.
2. 51 e-mails du corpus n'ont **aucune** entrée gold (batches pending 24–34) — non comptabilisés dans les 489.
3. Liens de tracking (HelloWork `emails.hellowork.com/clic/…`) : la clé de dédup code peut différer de la détection IA gold.
4. E-mails gold en `detectStatus=error` (JSON tronqué) : comptes gold sous-estimés ou nuls.

## 3. Preuves & anti-doublon & checkpoints

- sourceUrl : 860/860 offres.
- anchorText : 860/860 offres.
- snippet : 860/860 offres (Module D : isolateBlock matche par clé d'offre — tracking ↔ canonique).
- Anti-doublon Sopra Steria Nantes : paire titre+entreprise+localité identique → 1 nouvelle + 1 doublon (classifyImportBatch).
- Checkpoints : 3/3 `gmail:processed:<id>` status=done.

## 4. Reproductibilité

```
npx tsx src/lib/gmail-module3.test.ts
```
