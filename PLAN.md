# Plan d'implémentation

État au 20 octobre 2026 : première version CSV fonctionnelle, persistante et testée. Aucun déploiement public.

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
- [ ] PDF texte avec confirmation et provenance des lignes.
- [ ] Détection explicite des scans et formats non pris en charge.
- [ ] Documentation des formats réellement testés.
- [ ] Paiements partiels, commissions et cas documentaires avancés.

Ne cocher une tâche qu'après implémentation et vérification.
Si un lot est partiel, le dire au lieu de présenter tout le périmètre comme livré.

Le prochain lot prioritaire porte sur la vérification Windows puis les justificatifs locaux.
Les fonctions Excel/PDF/OCR, règles récurrentes et paiements complexes restent indisponibles.
Les détails des vérifications réellement exécutées sont dans docs/RECETTE.md.
