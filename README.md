# TVA Cabinet — version locale 0.3.0

Importer directement ses relevés **PDF**, qualifier les mouvements par clic, séparer la TVA confirmée des estimations, exporter la vue et retrouver ses données au redémarrage. Les PDF contenant du texte et les scans lisibles sont traités localement, avec reconnaissance de texte en français (OCR) pour les scans. Aucun CSV n’est nécessaire. Application française mono-utilisateur : React/TypeScript, Node.js 24 et SQLite. Aucun compte, abonnement ni clé API.

La version **0.2.1** corrige l’erreur Windows « Invalid factory url … must include trailing slash » lors de l’ouverture d’un PDF. Les chemins des ressources PDF locales utilisent maintenant les séparateurs attendus par PDF.js. Les données et les sauvegardes restent compatibles.

La version **0.3.0** ajoute le choix explicite d’un trimestre **T1 à T4**, avec son année, indépendamment des dates couvertes par les relevés.

## Préparer sa TVA trimestrielle

Importer les relevés **en entier**, même s’ils commencent avant le trimestre ou finissent après. Les dates de l’aperçu PDF décrivent le document bancaire et servent à contrôler ses lignes et ses soldes ; elles ne définissent pas la période de déclaration.

Dans le tableau principal, choisir **Période TVA → Trimestre**, puis le trimestre et l’année. Par exemple, **T2 2026** applique les dates **du 1er avril au 30 juin inclus**. Seules les ventilations dont la **date TVA retenue** tombe dans cette période contribuent à la synthèse et à l’export. Le régime et chaque date TVA restent des choix explicites de l’utilisateur ; l’application ne déduit pas automatiquement l’exigibilité du relevé.

Les autres mouvements sont conservés. Choisir un autre trimestre ou **Toutes les dates** permet de les retrouver. Modifier directement les dates passe le sélecteur en **Dates personnalisées**. Les soldes du PDF sont toujours rapprochés sur le relevé entier avant toute sélection. Pour des relevés qui se chevauchent, les contrôles d’import identique et de doublons restent applicables.

Un exemple entièrement fictif, **examples/releve-fictif-trimestres.pdf**, couvre le 15 mars au 15 juillet 2026 : quatre mouvements sont importés ; deux appartiennent à T2 aux dates retenues par défaut. L’identité visuelle du cabinet fera l’objet d’une intégration distincte à partir des éléments fournis.

## Utiliser sous Windows

1. Installer **Node.js 24 LTS** depuis https://nodejs.org/ (conserver les choix proposés).
2. Extraire complètement l’archive du projet dans un dossier local, par exemple **C:\TVA-Cabinet**. Ne pas lancer depuis l’intérieur du ZIP.
3. Double-cliquer sur **DEMARRER.cmd**. Au premier lancement ou après une mise à jour, les dépendances et le modèle OCR sont installés ; Internet est alors nécessaire. Une fenêtre de console reste ouverte et le navigateur s’ouvre sur **http://127.0.0.1:3210**.
4. Cliquer sur **Importer un relevé PDF**, ou sur **Essayer la démonstration** pour découvrir les qualifications avec des données fictives séparées de l’espace réel.

Pour fermer, revenir à la fenêtre de console et appuyer sur **Ctrl+C**. Fermer le navigateur seul n’arrête pas le serveur. Pour reprendre, double-cliquer à nouveau sur DEMARRER.cmd. Le dossier **data** contient vos bases persistantes : ne pas le supprimer. Sauvegarder depuis le bouton **Sauvegarder / restaurer** avant de changer de dossier ou de version. Après installation, l’application fonctionne sans Internet.

Ce lanceur a été vérifié sur ses étapes Node.js sous Linux ; le double-clic et l’ouverture automatique du navigateur sous Windows n’ont pas été exécutés sur une machine Windows.

## Importer un relevé Société Générale en PDF

1. Cliquer sur **Importer un relevé PDF**, nommer le compte, sélectionner son PDF puis **Lire le PDF**. Le traitement reste sur l’ordinateur. Les scans prennent plus de temps ; la progression est affichée.
2. Comparer les mouvements proposés avec les pages originales affichées à côté. Vérifier la date d’opération, le libellé, le signe et le montant. Les zones colorées montrent les colonnes utilisées ; elles peuvent être ajustées si le format du relevé diffère. La date de valeur reste distincte de la date d’opération.
3. Vérifier la période et l’année. Une date courte sans année exploitable exige une saisie explicite. Corriger les cellules si nécessaire, puis actualiser l’aperçu. Consulter aussi les lignes non interprétées : elles restent visibles et peuvent être ajoutées manuellement ou exclues explicitement.
4. Vérifier les soldes de début et de fin lorsqu’ils figurent sur le relevé : leur différence doit correspondre à la somme des mouvements reconnus avant sélection. Les doublons sont décochés par défaut ; leur conservation exige votre confirmation. Un PDF déjà importé sur le même compte est refusé.
5. Cocher la confirmation de comparaison avec le document original, puis **Importer … mouvements PDF**. Les opérations arrivent **à vérifier** : aucune qualification fiscale n’est confirmée automatiquement.

Le lien de relevé PDF fictif dans l’écran permet de s’entraîner. Les fichiers **examples/releve-fictif-sg.pdf** (texte, deux pages) et **examples/releve-fictif-scan.pdf** (image, une page) sont entièrement fictifs. Ils reprennent des colonnes de type Société Générale : date d’opération, date de valeur, nature, débit et crédit. Ils ont été testés ; aucun relevé réel de l’utilisateur n’a encore été vérifié. La lecture de toutes les présentations bancaires n’est pas garantie. Le mode « montant signé » et le réglage des zones permettent d’adapter l’aperçu ; il faut toujours comparer le résultat au PDF.

Une page scannée utilise automatiquement l’OCR français installé avec l’application. Si le document contient une couche de texte incorrecte, l’option de reconnaissance forcée permet une nouvelle lecture. Aucun modèle n’est téléchargé pendant la lecture d’un relevé. Le fichier PDF original, les pages/lignes sources et la méthode de lecture sont conservés après import et inclus dans les sauvegardes.

## Qualifier les mouvements avec un relevé fictif

Le bouton de démonstration charge neuf lignes, dont deux paiements identiques volontairement conservés. Pour découvrir l’import et sa détection des doublons, revenir à l’espace réel vide et importer le PDF fictif ci-dessus, ou **examples/releve-fictif.csv**. Les deux proposent les mêmes mouvements fictifs.

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

- PDF : **10 Mo et 30 pages maximum**, texte sélectionnable ou scan lisible. Un PDF protégé par mot de passe doit d’abord être déverrouillé localement. Un scan flou, des colonnes variables ou une mise en page inconnue peuvent nécessiter des corrections ; les erreurs et avertissements OCR restent visibles. Une lecture dépassant trois minutes est interrompue avec un message invitant à séparer le document.
- CSV également disponible : UTF-8 ou Windows-1252, virgule, point-virgule ou tabulation, guillemets et cellules multilignes. Date JJ/MM/AAAA, JJ.MM.AAAA ou AAAA-MM-JJ.
- En-têtes uniques, nom de compte explicite, montant signé **ou** débit/crédit positifs séparés. Montants français : **1 234,56** ; les notations scientifiques et les séparateurs de milliers ambigus sont refusés.
- Si des colonnes de solde sont détectées, saisir les soldes de début et de fin : fin − début doit correspondre à la somme de toutes les lignes du fichier avant sélection. Le contrôle ne prétend pas interpréter chaque colonne de solde intermédiaire.
- 5 Mo par CSV, 10 000 opérations par espace, 30 ventilations par mouvement, 40 Mo de sauvegarde par espace et 20 000 actions historiques. Les PDF originaux comptent dans cette limite de sauvegarde. Les dépassements annulent l’action en cours.
- Les montants documentaires remplacent les estimations. HT + TVA doit égaler le TTC traité. Une dépense taxable ne peut être confirmée sans montants facturés, vérification de la facture, droit à déduction et date TVA.
- Les filtres de période portent sur les **dates TVA retenues des ventilations**. Recherche et filtre d’état limitent également l’export et la synthèse. Une ventilation hors période n’est pas exportée. Les ajustements de période ne s’appliquent pas aux vues filtrées par libellé ou état.
- Les régularisations et le crédit antérieur sont propres à l’intervalle exact et au compte choisi ; aucun report automatique. Le total reste un récapitulatif de préparation, sans correspondance CA3.
- Le CSV exporte les valeurs en **centimes entiers**, le taux en centièmes de pourcentage, les ventilations, l’état, la provenance et la synthèse. Les cellules susceptibles de devenir des formules sont neutralisées par une apostrophe.
- **Indisponibles** : import/export Excel, ajout et visualisation de factures justificatives, règles récurrentes, paiements partiels et commissions documentaires complexes. Les relevés PDF bancaires sont pris en charge ; ils ne remplacent pas les factures pour justifier la TVA. Les cas fiscaux particuliers restent à vérifier et hors du confirmé.
- Sauvegardes JSON versionnées contenant les PDF/CSV originaux et l’historique. SHA-256 détecte une corruption, pas une falsification volontaire par quelqu’un ayant accès aux fichiers. La restauration remplace atomiquement l’espace choisi et conserve un fichier de l’état précédent. Les bases réel/démonstration sont distinctes.
- Mono-utilisateur local uniquement. Pas de publication publique, paiement, télédéclaration ou service distant. Les pièces et sauvegardes peuvent contenir vos données sensibles : conserver le dossier et les sauvegardes dans votre espace privé.

## Mettre à jour l’ancienne version CSV

1. Dans l’ancienne version, télécharger une sauvegarde par **Sauvegarder / restaurer**, puis arrêter le logiciel avec **Ctrl+C** dans sa console.
2. Extraire la nouvelle archive dans un **nouveau dossier** et double-cliquer sur **DEMARRER.cmd**. Le lanceur prépare automatiquement la nouvelle interface et ses dépendances.
3. Si l’ancienne version contenait des données, restaurer sa sauvegarde dans l’espace réel de la nouvelle version. Conserver l’ancien dossier et sa sauvegarde jusqu’à vérification.

Les anciennes bases CSV sont compatibles avec la migration automatique si le dossier `data` est conservé. Les sauvegardes de format 1 sont acceptées ; les nouvelles sauvegardes utilisent le format 2 incluant les PDF. Une ancienne version du logiciel ne peut pas relire ce nouveau format.

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
