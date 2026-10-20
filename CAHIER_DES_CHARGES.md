# Cahier des charges — TVA Cabinet

## Objectif
Importer mes relevés, qualifier chaque mouvement rapidement et préparer la TVA
du cabinet. Application locale mono-utilisateur, interface française, ordinateur Windows.
Ni télédéclaration ni paiement d'impôt.

## 1. Imports
CSV d'abord, Excel puis PDF contenant du texte exploitable.
Détecter date, libellé, débit/crédit séparés ou montant signé ; proposer une
correspondance des colonnes et un aperçu modifiable avant validation.
Formats français et caractères accentués ; aperçu des erreurs plutôt que correction silencieuse.
Conserver le fichier source, les cellules brutes et les références des lignes/pages.
Contrôler totaux et nombre de lignes. Si le relevé fournit des soldes, vérifier leur cohérence.
Refuser l'import incomplet sans signalement ; rapporter les lignes rejetées.
Pour les PDF : afficher les ambiguïtés et demander une vérification ;
identifier les scans sans OCR et proposer CSV/Excel. Ne pas annoncer un OCR livré s'il ne l'est pas.
Détecter les imports identiques et les doublons potentiels entre relevés.
Deux paiements identiques peuvent être légitimes : l'utilisateur décide.
Prévoir plusieurs comptes pour éviter les collisions entre établissements.

## 2. Tableau de qualification
Colonnes : date, libellé, TTC signé, nature, traitement/taux, HT, TVA,
déductibilité, état, justificatif et note.
Recherche, tri, filtres période/compte/état et sélection multiple.
Boutons rapides et passage à la ligne suivante ; annuler une action.

Nature : recette/honoraires, dépense, virement interne, apport/prélèvement personnel,
prêt, remboursement d'emprunt, autre et à vérifier.
Traitement : taxable aux taux configurables 20 %, 10 %, 5,5 %, 2,1 %,
exonéré, hors champ, traitement particulier à vérifier.
Les boutons de taux sont des choix utilisateur, pas une règle d'éligibilité fiscale.
Ne pas assimiler exonération, hors champ et taux zéro.
Dépenses : TVA déductible intégralement, partiellement, non déductible ou à vérifier.

## 3. Calcul et validation
À partir d'un TTC, TVA = TTC × taux / (100 + taux), HT = TTC − TVA.
Saisie possible du HT et de la TVA réellement facturée.
Conserver la provenance : calcul TTC ou saisie sur justificatif.
Le montant documentaire confirmé prévaut sur une estimation, avec contrôle de cohérence.
La TVA déductible confirmée suppose une confirmation explicite de la TVA facturée,
du droit à déduction et de la période retenue ; le document peut être conservé ailleurs,
mais son absence dans l'application doit rester visible.
Pas de validation automatique à partir du libellé seul.
Montants négatifs : distinguer remboursement de dépense et remboursement de recette,
même si le sens bancaire est opposé à la nature usuelle.
Ventilation multi-taux, partie sans TVA, usage mixte et coefficients de déduction.
Paiements partiels et encaissements nets : saisie contrôlée et liens documentaires,
sans reconstituer une facture par supposition.
Dates distinctes : opération bancaire, facture, période TVA retenue.
Les paramètres du régime fiscal doivent être confirmés ; aucune règle silencieuse.
International, autoliquidation ou autre particularité non prise en charge :
afficher « à vérifier », conserver les données et exclure du total confirmé.

## 4. Récapitulatif
Filtres mois, trimestre, année et intervalle personnalisé.
Présenter base taxable confirmée par taux, TVA collectée confirmée, TVA déductible
confirmée, régularisations signées, crédit antérieur saisi et solde calculé.
Convention : solde = collectée − déductible + régularisations − crédit antérieur.
Une régularisation positive augmente le solde à payer.
Le crédit antérieur doit être saisi/confirmé, jamais propagé plusieurs fois automatiquement.
Séparer montants confirmés, estimations et opérations exclues/en attente.
Afficher le nombre et les montants des opérations non résolues.
Une période non achevée affiche « calcul provisoire ».
Récapitulatif de préparation : ne pas inventer une correspondance officielle CA3.
Les paiements de TVA et crédits bancaires fiscaux ne sont pas des honoraires ou dépenses
ouvrant eux-mêmes une nouvelle TVA.

## 5. Justificatifs et historique
Joindre et visualiser PDF/images, conserver fichier original.
Règles récurrentes créées explicitement ; application sous forme de suggestions,
modification/désactivation possible, aucune réécriture d'un choix manuel.
Journal des modifications ; annulation tracée.
Verrouillage volontaire d'une période et réouverture explicite avant modification.
Un import dans une période verrouillée ne doit pas modifier ses totaux silencieusement.

## 6. Sauvegarde et export
SQLite persistant, fichiers joints conservés localement.
Sauvegarde versionnée intégrant base, paramètres, imports et pièces jointes.
Restauration : valider le format et l'intégrité avant remplacement ; sauvegarder l'état
précédent et effectuer l'opération atomiquement, sans accès concurrent aux écritures.
Export CSV puis Excel : lignes, ventilation, statut, provenance et synthèse.
Export identique aux filtres/périodes et totaux visibles.
Indiquer les opérations non confirmées.

## 7. Interface
Tableau dense et lisible, montants français, indicateurs avec texte et couleur.
Édition rapide et panneau de détail. Ne pas multiplier les écrans.
Montrer un succès uniquement après confirmation de la sauvegarde serveur.
En cas d'erreur, préserver la saisie et proposer une nouvelle tentative.
