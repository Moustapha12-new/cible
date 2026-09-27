# Rapport Module 3 — pipeline vs gold standard

- Date : 2026-09-26T16:30:06.326Z
- Mode 3 e-mails : **IA RÉELLE (GEMINI_API_KEY depuis .env.local)**
- Mode corpus 171 : **code seul (skipAi:true)**
- Gold : 489 offres / 120 e-mails (Deep Recheck IA, lots 0/1/16/21 en erreur JSON, 51 e-mails sans entrée).

## 1. Les 3 e-mails .eml réels

| E-mail | ID corpus | Gold (offres) | Code | Total pipeline | Méthode | Statut |
|---|---|---:|---:|---:|---|---|
| Moustapha, Hellowork a trouvé 2 nouvelles offres | 1a0cd8baec962b60 | 8 | 8 | 8 | code+ia | detected |
| Stage - Ingénieur Etudes et Projets (F_H) à Veol | 1a0cb13272b465d3 | 0 | 10 | 10 | code+ia | detected |
| Stagiaire ingénieur automatismes F_H chez EDF _  | — | n/a | 4 | 4 | code+ia | detected |

### Écarts documentés (3 e-mails)

- **Moustapha, Hellowork a trouvé 2 nouvelles offres** : gold=8 = pipeline=8 — OK.
- **Stage - Ingénieur Etudes et Projets (F_H) à Veol** : gold=0 avec `detectStatus=error` (lot en erreur) — gold non fiable pour cet e-mail ; pipeline=10.
- **Stagiaire ingénieur automatismes F_H chez EDF _ ** : absent du corpus gold Deep Recheck (aucun ID apparié) — comparaison impossible.

## 2. Corpus 171 e-mails

| Métrique | Gold IA (Deep Recheck) | Nouveau pipeline (code seul) |
|---|---:|---:|
| E-mails corpus | 171 | 171 |
| E-mails avec entrée / traités | 120 | 171 |
| E-mails avec ≥1 offre | 99 | 159 |
| Total offres détectées | 489 | 796 |
| Correspondances exactes (sur 120) | — | 80 |

### Écarts top (|delta| > 1 offre, sur les 120 e-mails gold)

| ID | Sujet | Gold | Code | Δ |
|---|---|---:|---:|---:|
| 1a0cb13272b465d3 | Stage - Ingénieur Etudes et Projets (F/H) à Veolia | 0 | 10 | +10 |
| 1a0b6484493e4390 | Stage - ingénieur(e) performance énergétique indus | 0 | 9 | +9 |
| 1a0b63b299cfe1a1 | Stage fiabilité équipement sous vide F/H chez EDF  | 0 | 7 | +7 |
| 1a0cd67c5331ac38 | Stagiaire Ingénieur(e) de Projets junior Solaire / | 0 | 6 | +6 |
| 1a0baab5799e1a79 | Stage - Développement IHM/ Diagnostic Systèmes de  | 0 | 6 | +6 |
| 1a0b716e1d3b5467 | Ingénieur études et conception mobilité électrique | 5 | 9 | +4 |
| 1a0cd44d47987d9c | Moustapha, Hellowork a trouvé 3 nouvelles offres d | 11 | 8 | -3 |
| 1a0b6a900eeaf017 | Ingénieur études et conception mobilité électrique | 5 | 8 | +3 |
| 1a0c84162a378b74 | Stage 6 mois - Ingénieur Contrôle Commande & Prote | 6 | 8 | +2 |
| 1a0c07d31f925f5b | Stage - ingénieur(e) performance énergétique indus | 9 | 7 | -2 |
| 1a0bfac20f651b26 | Nouvelles offres d’emploi similaires à STAGE ENERG | 9 | 11 | +2 |
| 1a0b93c33077059a | Stage PFE - Réseaux électriques : Modélisation et  | 8 | 10 | +2 |
| 1a0b8ce579b143b7 | Ingénieur études et conception mobilité électrique | 4 | 6 | +2 |
| 1a0b63b27b3e8d22 | Stage ingénieur calcul électromécanique F/H chez E | 6 | 8 | +2 |
| 1a0b63b264987112 | Stagiaire Asset Management F/H chez VINCI Energies | 8 | 10 | +2 |

**Causes d'écart :**

1. Gold = IA Deep Recheck (lots partiellement en erreur) ; pipeline Module 3 corpus = **code seul** (`skipAi`) pour comparaison déterministe.
2. 51 e-mails du corpus n'ont **aucune** entrée gold (batches pending 24–34) — non comptabilisés dans les 489.
3. Liens de tracking (HelloWork `emails.hellowork.com/clic/…`) : la clé de dédup code peut différer de la détection IA gold.
4. E-mails gold en `detectStatus=error` (JSON tronqué) : comptes gold sous-estimés ou nuls.

## 3. Preuves & anti-doublon & checkpoints

- sourceUrl : 818/818 offres.
- anchorText : 818/818 offres.
- snippet : 818/818 offres (Module D : isolateBlock matche par clé d'offre — tracking ↔ canonique).
- Anti-doublon Sopra Steria Nantes : paire titre+entreprise+localité identique → 1 nouvelle + 1 doublon (classifyImportBatch).
- Checkpoints : 3/3 `gmail:processed:<id>` status=done.

## 4. Reproductibilité

```
npx tsx src/lib/gmail-module3.test.ts
```
