# TVA Cabinet — première version locale

Importer un CSV, qualifier les mouvements par clic, séparer la TVA confirmée des estimations, exporter la vue et retrouver ses données au redémarrage. Application française mono-utilisateur : React/TypeScript, Node.js 24 et SQLite. Aucun compte, abonnement ni clé API.

## Utiliser sous Windows

1. Installer **Node.js 24 LTS** depuis https://nodejs.org/ (conserver les choix proposés).
2. Extraire complètement l’archive du projet dans un dossier local, par exemple **C:\TVA-Cabinet**. Ne pas lancer depuis l’intérieur du ZIP.
3. Double-cliquer sur **DEMARRER.cmd**. Au premier lancement, les dépendances sont installées ; Internet est alors nécessaire. Une fenêtre de console reste ouverte et le navigateur s’ouvre sur **http://127.0.0.1:3210**.
4. Cliquer sur **Essayer la démonstration** pour commencer avec des données fictives, séparées de l’espace réel.

Pour fermer, revenir à la fenêtre de console et appuyer sur **Ctrl+C**. Fermer le navigateur seul n’arrête pas le serveur. Pour reprendre, double-cliquer à nouveau sur DEMARRER.cmd. Le dossier **data** contient vos bases persistantes : ne pas le supprimer. Sauvegarder depuis le bouton **Sauvegarder / restaurer** avant de changer de dossier ou de version. Après installation, l’application fonctionne sans Internet.

Ce lanceur a été vérifié sur ses étapes Node.js sous Linux ; le double-clic et l’ouverture automatique du navigateur sous Windows n’ont pas été exécutés sur une machine Windows.

## Premier parcours avec un relevé fictif

Le bouton de démonstration charge neuf lignes, dont deux paiements identiques volontairement conservés. Pour découvrir l’import et sa détection des doublons, revenir à l’espace réel vide et importer **examples/releve-fictif.csv** (uniquement fictif).

1. Choisir un nom de compte, sélectionner le CSV et cliquer **Analyser le CSV**.
2. Vérifier les colonnes, les erreurs, le total et les lignes retenues. Un doublon est décoché par défaut : huit mouvements sont retenus. Deux paiements identiques peuvent être légitimes ; les conserver exige votre confirmation explicite.
3. Si nécessaire, corriger une date, un libellé ou un montant dans l’aperçu, puis **Actualiser l’aperçu et les corrections**. Les lignes rejetées ne disparaissent pas silencieusement. Le fichier source et les cellules originales sont conservés.
4. Vérifier **Paramètres** : le régime fiscal n’est jamais présumé. Choisir seulement un régime effectivement vérifié. Le logiciel ne détermine pas l’exigibilité ; choisir manuellement la date TVA de chaque ventilation.
5. Ouvrir **Honoraires dossier ALPHA**, choisir **Recette / honoraires**, **Taxable**, **20 %**, confirmer la date TVA puis **Confirmer l’opération** : TVA collectée = **200,00 €**.
6. Ouvrir **Fournitures bureau**, choisir **Dépense**, **Taxable**, **20 %**, déduction intégrale. Saisir **100,00** de HT et **20,00** de TVA facturés ; confirmer les montants, le droit à déduction et la date. TVA déductible = **20,00 €**, solde préparatoire = **180,00 €**. Référencer le justificatif, qui peut rester dans vos dossiers.
7. Pour une ventilation, répartir le **TTC bancaire signé** sur les lignes : le total doit rester exactement égal au mouvement initial. Les remboursements de dépenses utilisent des montants documentaires négatifs ; les dépenses ordinaires utilisent des montants documentaires positifs.
8. Exporter la vue en CSV, télécharger une sauvegarde complète, fermer puis relancer : les qualifications persistent. La restauration contrôle le format et l’intégrité et conserve l’état précédent dans **data/backups**.

Les boutons rapides sur une sélection créent des **estimations**, jamais des confirmations. L’annulation de la dernière qualification est tracée. Une période verrouillée refuse les imports et modifications qui la concernent ; elle doit être rouverte explicitement dans les paramètres.

## Formats et limites de cette version

- CSV uniquement : UTF-8 ou Windows-1252, virgule, point-virgule ou tabulation, guillemets et cellules multilignes. Date JJ/MM/AAAA, JJ.MM.AAAA ou AAAA-MM-JJ.
- En-têtes uniques, nom de compte explicite, montant signé **ou** débit/crédit positifs séparés. Montants français : **1 234,56** ; les notations scientifiques et les séparateurs de milliers ambigus sont refusés.
- Si des colonnes de solde sont détectées, saisir les soldes de début et de fin : fin − début doit correspondre à la somme de toutes les lignes du fichier avant sélection. Le contrôle ne prétend pas interpréter chaque colonne de solde intermédiaire.
- 5 Mo par fichier, 10 000 lignes/opérations par espace, 30 ventilations par mouvement, 40 Mo de sauvegarde par espace et 20 000 actions historiques. Les dépassements annulent l’action en cours.
- Les montants documentaires remplacent les estimations. HT + TVA doit égaler le TTC traité. Une dépense taxable ne peut être confirmée sans montants facturés, vérification de la facture, droit à déduction et date TVA.
- Les filtres de période portent sur les **dates TVA retenues des ventilations**. Recherche et filtre d’état limitent également l’export et la synthèse. Une ventilation hors période n’est pas exportée. Les ajustements de période ne s’appliquent pas aux vues filtrées par libellé ou état.
- Les régularisations et le crédit antérieur sont propres à l’intervalle exact et au compte choisi ; aucun report automatique. Le total reste un récapitulatif de préparation, sans correspondance CA3.
- Le CSV exporte les valeurs en **centimes entiers**, le taux en centièmes de pourcentage, les ventilations, l’état, la provenance et la synthèse. Les cellules susceptibles de devenir des formules sont neutralisées par une apostrophe.
- **Indisponibles** : import/export Excel, PDF, OCR, téléversement/visualisation de pièces, règles récurrentes, paiements partiels et commissions documentaires complexes. Ils ne sont pas simulés. Les cas fiscaux particuliers restent à vérifier et hors du confirmé.
- Sauvegardes JSON versionnées contenant les CSV originaux et l’historique. SHA-256 détecte une corruption, pas une falsification volontaire par quelqu’un ayant accès aux fichiers. La restauration remplace atomiquement l’espace choisi et conserve un fichier de l’état précédent. Les bases réel/démonstration sont distinctes.
- Mono-utilisateur local uniquement. Pas de publication publique, paiement, télédéclaration ou service distant. Les pièces et sauvegardes peuvent contenir vos données sensibles : conserver le dossier et les sauvegardes dans votre espace privé.

## Développement et vérifications

Utiliser **npm uniquement**, avec le lockfile fourni et Node.js **24.x**.

~~~sh
npm ci
npm run dev
~~~

Le mode développement utilise également le serveur local **127.0.0.1:3210**.

~~~sh
npm run typecheck
npm test
npm run build
npm start
~~~

La production sert uniquement **dist**, jamais **data**. Le serveur vérifie Host/Origin et un en-tête spécifique pour chaque mutation. Pas de ressources externes, de télémétrie ou d’appel réseau pour traiter un relevé.

Pour la recette navigateur :

~~~sh
npx playwright install chromium
npm run build
npm run test:e2e
~~~

Dans cet environnement cloud, Chromium est fourni par le système :

~~~sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
~~~

Les tests utilisent des dossiers temporaires et des données fictives. **TVA_DATA_DIR** permet de changer le dossier de données ; **PORT** permet de changer le port. Ne pas lancer deux instances sur la même base.

Voir **docs/MODELE_DONNEES.md**, **docs/RECETTE.md**, **docs/CALCULS_ET_SOURCES.md** et **PLAN.md** pour les conventions, la recette exécutée et le travail restant.
