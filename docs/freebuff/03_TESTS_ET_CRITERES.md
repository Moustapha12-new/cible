# TESTS D'ACCEPTATION — CIBLE.

## A. Extraire les offres de trois emails (fixtures fournies)

1. Test unitaire des parseurs sur `fixtures/indeed_anonymise.eml`, `fixtures/linkedin_anonymise.eml`, `fixtures/hellowork_anonymise.eml` : **8, 10, 8 offres distinctes**, **26 au total**.
2. En plus du compte, comparer chaque offre aux identités attendues (ID source pour Indeed/LinkedIn, identité titre+entreprise+localisation pour HelloWork). La métrique « 26 » seule ne suffit pas.
3. Vérifier explicitement : pas de WSP ajouté depuis l'objet LinkedIn ; ne pas confondre trois ancres LinkedIn pour un même job avec trois offres ; les deux VINCI photovoltaïque aux IDs distincts sont conservés ; les cartes FAYAT mises en avant répétées chez HelloWork ne doublent pas ; Eiffage en villes différentes reste distinct ; pas de bouton « afficher tous » ni de footer importé.
4. Tester un email en MIME multipart, un message encodé quoted-printable et des accents UTF-8. Les erreurs doivent conserver message ID et contexte, pas faire disparaître les annonces.
5. Mesurer **rappel = vrais positifs / 26**, **précision = vrais positifs / annonces prédites** sur ce corpus. Pour l'accepter : 26/26 et 0 faux positif. Indiquer les limites de généralisation au reste de la boîte.

## B. Enrichir chaque offre

1. L0 : affiche titre/entreprise/lieu/URL d'origine du mail (si présentes), même lorsque la page de destination est inaccessible.
2. L1 : récupère la destination individuelle (lorsque testable) et n'enrichit pas depuis une page de recherche ou une annonce voisine.
3. L2 : `JobPosting` + HTML principal analysés ; missions/outils/compétences/livrables avec citations de texte vérifiables.
4. L3 : si lien employeur, comparaison de source et conservation de la meilleure description prouvée.
5. 403, login, CAPTCHA, 404, 429, timeouts : états distincts ; pas de création d'une description inventée ou d'une fausse expiration.
6. Réanalyser une seule offre après échec sans perdre ses autres données ; tests d'idempotence et déduplication sur relecture du même email et double synchronisation.
7. Calcul de statistiques cohérent : messages ≠ cartes ≠ offres uniques ≠ enrichissements réussis.

## C. CV et PDF

1. La page charge un **vrai CV maître** confirmé, pas les expériences de `demo-data.ts`.
2. Offre extraite par email enrichie puis sélectionnée avec son ID stable : l'analyse de l'offre et le CV exploitent **la même fiche**.
3. L'analyse distingue obligatoire/souhaité et explicite/inféré.
4. Matrice exigence → preuve id : directe/transférable/partielle/non démontrée ; si une compétence manque, la réponse mentionne « à confirmer » sans l'ajouter au CV.
5. Exemple MBDA : privilégie réseaux BT si prouvé, n'invente pas maintenance ; WSP : pas de Revit inféré ; TotalEnergies : crédible sur énergie et stockage ; Mews Labs : pas de PyTorch/NetworkX non validé.
6. Une version déjà adaptée n'est jamais utilisée comme CV maître pour la candidature suivante.
7. Au moins un cas d'adaptation **sans changement** doit être validé quand le CV est déjà pertinent.
8. Le document PDF généré est un véritable PDF une page A4, texte sélectionnable, liens cliquables, sans débordement, fidèle au design de référence ; aucun fallback de chaîne de texte `%PDF` présentée comme document valable.
9. Version exportée correspond au diff validé ; la candidature n'est jamais enregistrée comme envoyée sur le seul clic « Télécharger » ; l'archive retient exactement les octets du PDF confirmé envoyé.
10. Prévoir erreur IA explicite sans fausse réussite et un brouillon conservé après recharge.

## D. Preuves de travail à remettre au propriétaire

- Schéma textuel du pipeline et liste de fichiers réellement modifiés.
- Table d'acceptation des trois sources : `source | cartes repérées | offres attendues | offres extraites | faux positifs | exemples manqués`.
- Tests automatisés lancés, codes de retour, build Next.js et erreur éventuelle ; pas de formule « tout est testé » si Gmail/Supabase réel n'a pas été utilisé.
- Deux captures utiles : une offre enrichie avec ses missions/outils, puis l'analyse de CV et le comparateur avant/après.
- Un exemple d'analyse `JobAnalysis` et un exemple de `CVChangeSet` **sans données inventées**.
- Blocages de pages externes indiqués par source et numéro d'offre.
- Pas de déploiement Vercel tant que la validation n'est pas demandée.

## Jalons de validation

**Jalon A** : parsing 26/26 sans faux positifs sur fixtures + logique de stockage/déduplication.

**Jalon B** : enrichissement, statuts explicites, provenance et reconnexion fiable au modèle d'offre.

**Jalon C** : vrai CV maître, adaptation basée sur preuves, compare/PDF A4/archivage, tests métiers.

L'agent doit implémenter réellement avant de rendre son rapport, et s'arrêter à chaque jalon pour enregistrer les résultats, non pas pour réclamer sans cesse un nouveau prompt.
