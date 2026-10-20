# Recette de la version 0.2.1

Données exclusivement fictives. Vérifications réalisées sous Linux avec Node.js 24.19.0, npm 11.9.0 et Chromium système, le 20 octobre 2026.

Résultat final : **39 tests métier/persistance/API/lanceur réussis et 5 scénarios navigateur réussis**, sans test ignoré. Types et build réussis.

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
- PDF texte : exemple fictif de type Société Générale sur deux pages, neuf mouvements, date d’opération distincte de la date de valeur, libellé sur deux lignes, signes débit/crédit, doublon interne, totaux et soldes. Correction modifiable, année manquante et période à cheval sur deux années.
- PDF : doublons entre CSV et PDF, séparation des comptes, lignes non interprétées visibles et ajout manuel, exclusions explicites, montant mal reconnu conservé en erreur, confirmation de revue obligatoire et refus atomique d’un écart de soldes.
- OCR français : véritable reconnaissance d’un PDF raster fictif d’une page, trois mouvements et soldes recoupés. Un processus de test interdit tout accès HTTP/HTTPS et fetch, y compris dans les workers ; la lecture réussit avec le modèle installé localement.
- PDF protégés et endommagés : erreurs explicites sans import. API : lecture asynchrone, image de page locale, isolation réel/démonstration, confirmation, original identique octet par octet et annulation de l’aperçu.
- Correctif Windows 0.2.1 : reproduction du refus par PDF.js de chemins terminés par un antislash pour les trois options de ressources. Les chemins corrigés sont acceptés par la bibliothèque réelle ; espaces, accents, caractères « # » et préfixe réseau UNC sont couverts. Les fichiers de polices, CMaps et WASM installés restent lisibles directement depuis le disque. Ce test sous Linux ne remplace pas l’exécution complète sur Windows.
- PDF persistants : original, pages/lignes, méthode texte/OCR et corrections retrouvés après réouverture et restauration ; incohérence de provenance refusée sans altérer l’état. Migration d’une base CSV et restauration d’une ancienne sauvegarde de format 1 vérifiées.
- Navigateur PDF : lecture sur deux pages avec original affiché, correction et actualisation, confirmation obligatoire, huit mouvements importés après détection du doublon, original téléchargé, rechargement et sauvegarde/restauration. Aucun appel réseau externe ni erreur JavaScript sur le parcours texte.
- Navigateur scan : OCR réel, trois mouvements, avertissement de contrôle et confirmation, refus de réimporter le même document.
- Mise à jour : installation complète par `scripts/prepare.mjs`, reconstruction après modification des sources et second lancement sans réinstallation/reconstruction inutiles. Le nouveau lanceur attend le signal réel d’écoute du serveur avant d’ouvrir le navigateur ; interface et API de version 0.2.1 contrôlées sur un port et un dossier temporaires. Un test de conflit de port vérifie le refus sans ouvrir une ancienne instance, puis l’arrêt propre du serveur lancé.

## Formats PDF réellement vérifiés

Uniquement des relevés entièrement fictifs : `examples/releve-fictif-sg.pdf` et `examples/releve-fictif-scan.pdf`, générés par `scripts/generate-pdf-examples.mjs`. Colonnes date d’opération, valeur, nature/libellé, débit et crédit ; dates courtes avec année fournie dans la période du relevé. Le premier a deux pages de texte, le second une page raster lisible. Un document fictif chiffré complète les contrôles d’erreur.

Aucun relevé bancaire réel de l’utilisateur n’a été fourni ou vérifié. Ces résultats ne garantissent pas la lecture de toutes les présentations Société Générale ou de tous les scans. Les colonnes réglables, les corrections, les lignes ignorées visibles et la confirmation servent à contrôler chaque import. Les mises en page mixtes, photographies dégradées et colonnes variables restent à vérifier sur les documents concernés.

## À vérifier sur le poste Windows

Le double-clic DEMARRER.cmd, l’installation réelle de Node sur Windows et l’ouverture automatique du navigateur n’ont pas été exécutés dans cette machine Linux. Les calculs, le serveur, le stockage et la chaîne de build utilisent des dépendances portables, sans module SQLite natif à compiler.

Recette manuelle : extraire l’archive, lancer DEMARRER.cmd, importer le PDF fictif texte puis le scan, comparer pages et mouvements, qualifier, sauvegarder, fermer la console, relancer et vérifier la persistance. Restaurer ensuite la sauvegarde uniquement dans le même espace. Pour une mise à jour, sauvegarder l’ancienne version puis tester la restauration dans un nouveau dossier en conservant l’ancien.

## Fonctionnalités explicitement non livrées

Excel, ajout de factures justificatives, suggestions récurrentes, scénarios documentaires de paiements partiels/commissions et déclarations fiscales. Les points correspondants restent ouverts dans PLAN.md.
