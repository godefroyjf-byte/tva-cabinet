# Recette de la première version

Données exclusivement fictives. Vérifications réalisées sous Linux avec Node.js 24.19.0, npm 11.9.0 et Chromium système, le 20 octobre 2026.

Résultat final : **26 tests métier/persistance/API réussis et 3 scénarios navigateur réussis**, sans test ignoré. Types et build réussis.

## Vérifications automatiques

- Installation reproductible npm ci, types TypeScript et build Vite : exécutés avec succès.
- Tests métier/persistance/API : montants français, arrondis positifs et négatifs, quatre taux, remboursements de recettes/dépenses, déduction partielle, contraintes de confirmation, ventilation, séparation confirmé/estimé/exclu, filtrage sur les dates TVA, CSV Windows-1252 et multilignes, erreurs et doublons, neutralisation des formules.
- SQLite : import atomique, absence de modification après échec, conflit de révision, annulations successives, périodes verrouillées, isolation des espaces.
- Persistance : réouverture de la base dans un nouveau processus Node après qualification.
- Sauvegarde : restauration complète, refus d’une empreinte altérée, refus d’un contenu incohérent et d’un autre espace, état précédent conservé ; panne simulée pendant la restauration avec rollback.
- HTTP : contrôles Host et Origin, refus des mutations sans en-tête attendu, parcours import/qualification/export, crédit et régularisation de période, source originale et restauration protégée.
- Navigateur : import du relevé fictif avec doublon décoché (8 opérations), recette confirmée (200 € collectés), dépense confirmée (20 € déductibles), ventilation conservée, rechargement, sauvegarde téléchargée, restauration et export CSV. Aucun appel réseau externe ni erreur JavaScript sur ce parcours.
- Navigateur : bascule démonstration/réel et écran de 390 px. Le tableau reste à défilement horizontal.
- Aperçu modifiable : correction d’une date invalide et d’un montant, réanalyse puis import effectif, sans effacer les autres cellules valides. Une valeur monétaire invalide reste visible et n’est jamais remplacée silencieusement par zéro.
- Soldes : import refusé sans les soldes requis ou lorsque leur écart ne correspond pas aux mouvements ; import accepté lorsque le relevé se recoupe.
- Restauration : les formulaires ouverts avant le remplacement sont invalidés par une nouvelle révision ; un historique contenant un régime autrefois confirmé reste restaurable après modification des paramètres.
- Lanceur Node : démarré dans un dossier de données temporaire isolé, interface et API vérifiées par requêtes HTTP, puis arrêt du processus.

## À vérifier sur le poste Windows

Le double-clic DEMARRER.cmd, l’installation réelle de Node sur Windows et l’ouverture automatique du navigateur n’ont pas été exécutés dans cette machine Linux. Les calculs, le serveur, le stockage et la chaîne de build utilisent des dépendances portables, sans module SQLite natif à compiler.

Recette manuelle : extraire l’archive, lancer DEMARRER.cmd, essayer la démonstration, revenir à l’espace réel, importer le fichier fictif, qualifier, sauvegarder, fermer la console, relancer et vérifier la persistance. Restaurer ensuite la sauvegarde uniquement dans le même espace.

## Fonctionnalités explicitement non livrées

Excel, PDF, OCR, téléversement de justificatifs, suggestions récurrentes, scénarios documentaires de paiements partiels/commissions et déclarations fiscales. Les points correspondants restent ouverts dans PLAN.md.
