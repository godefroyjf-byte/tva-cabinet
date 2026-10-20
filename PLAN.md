# Plan d'implémentation

État au 21 octobre 2026 : version 0.4.0 avec lots de PDF texte/scannés, glisser-déposer, contrôles par document, logo JG Avocat et identité du modèle de conclusions. Parcours CSV et choix explicite des trimestres conservés. Aucun déploiement public.

## Lot 1 — Fondation
- [x] Initialiser React/TypeScript, Node.js/TypeScript, SQLite et lockfile npm.
- [x] Migrations, validation serveur, stockage local et contrôles Host/Origin.
- [x] Moteur de calcul en arithmétique exacte, signes et arrondis documentés.
- [x] Tests de calcul et modèle de données.

## Lot 2 — Parcours CSV complet
- [x] Import/mapping/aperçu modifiable, rapport d'erreurs, totaux et contrôle des soldes saisis.
- [x] Détection des doublons avec décision utilisateur ; refus d'un fichier déjà importé au même compte.
- [x] Tableau, édition et actions par clic, multi-sélection et annulation tracée.
- [x] Ventilation conservant le total et validation explicite.
- [x] Synthèse avec montants confirmés et estimations séparés, régularisations et crédit confirmés par période exacte.
- [x] Sélecteur T1 à T4 et année, dates personnalisées synchronisées, distinction claire entre période bancaire et trimestre TVA.
- [x] Relevé PDF couvrant plusieurs trimestres : import entier, bornes inclusives, totaux/export du trimestre et conservation des autres mouvements vérifiés.
- [x] Export CSV et vérification de persistance après redémarrage dans un nouveau processus.

Critère : les lignes du relevé fictif peuvent être importées et qualifiées,
les calculs se recoupent, les données sont retrouvées au redémarrage.

## Lot 3 — Fiabilité et sauvegarde
- [x] Sauvegarde/restauration complète de la V1 avec contrôle d'intégrité, état précédent conservé et transaction atomique.
- [x] Historique des qualifications et verrouillage/réouverture des périodes.
- [ ] Téléversement et visualisation des justificatifs : seule la référence documentaire est livrée.
- [ ] Règles suggérées, jamais validées automatiquement.
- [x] Mode démonstration séparé et parcours de recette automatisé dans Chromium.
- [x] README et lancement Windows documentés ; lanceur Node vérifié sous Linux.
- [ ] Vérification du double-clic et de l'ouverture du navigateur sur un poste Windows réel.

## Lot 4 — Imports/exports avancés
- [ ] Excel avec aperçu et export.
- [x] PDF texte avec aperçu original, corrections, confirmation et provenance des pages/lignes.
- [x] Détection des scans et OCR français local, sans envoi à un service externe.
- [x] Zones de colonnes réglables, dates d’opération distinctes des dates de valeur, année/période explicites, lignes ignorées visibles et contrôle des soldes.
- [x] Limites et erreurs des PDF protégés/endommagés ; lecture asynchrone avec progression et annulation.
- [x] Sources PDF persistantes, sauvegarde format 2 et lecture des anciennes sauvegardes CSV format 1.
- [x] Documentation des formats réellement testés : exemples fictifs à colonnes de type Société Générale, texte multi-pages et scan lisible.
- [x] Correctif Windows des chemins de ressources PDF.js : erreur « Invalid factory url … must include trailing slash » reproduite et couverte par un test de régression pour les polices, CMaps et modules WASM.
- [x] Lots jusqu’à 20 PDF / 50 Mo, sélection multiple et glisser-déposer ; lecture successive, compte modifiable, corrections et confirmation indépendantes.
- [x] Erreurs par fichier, passage au suivant, réessai et bilan des imports réussis / erreurs / fichiers passés ; imports précédents conservés.
- [x] Contrôle des doublons entre fichiers du lot, OCR, PDF protégé et reprise après échec d’enregistrement vérifiés dans le navigateur.
- [ ] Vérification sur un relevé Société Générale réel de l’utilisateur.
- [ ] Paiements partiels, commissions et cas documentaires avancés.

Ne cocher une tâche qu'après implémentation et vérification.
Si un lot est partiel, le dire au lieu de présenter tout le périmètre comme livré.

Le prochain contrôle porte sur le lancement Windows et le format du relevé réel de l’utilisateur.
Excel, les factures justificatives jointes, les règles récurrentes et les paiements complexes restent indisponibles.
Les détails des vérifications réellement exécutées sont dans docs/RECETTE.md.

## Identité visuelle du cabinet
- [x] Référence confirmée par l’utilisateur : https://godefroy-avocat.fr/ ; reprendre son logo, ses couleurs et ses polices.
- [x] Éléments récupérés depuis le modèle **Conclusions.docx** fourni par l’utilisateur : logo original, nom, typographies et présentation noir et blanc. Le site reste bloqué depuis l’environnement ; le modèle constitue la référence effective de cette version.
- [x] Logo PNG original intégré localement sans modification, en-tête du cabinet, palette noir/blanc/gris, Century Gothic et Tahoma avec polices de secours locales.
- [x] Rendu bureau/petite largeur vérifié et absence d’appels réseau externes contrôlée. Document Word et contenu juridique exclus du dépôt.
