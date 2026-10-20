# Modèle de données de la V1

Deux bases SQLite distinctes : data/real.sqlite et data/demo.sqlite. Migration 1 suivie par la table migrations, mode WAL, transactions BEGIN IMMEDIATE pour les lots. Aucun fichier importé n’est servi publiquement.

- **imports** : UUID, compte, nom d’origine (métadonnée uniquement), contenu binaire CSV encodé en base64, empreinte SHA-256, date, encodage, séparateur, correspondance des colonnes, soldes saisis et lignes volontairement exclues.
- **operations** : identifiant local, UUID d’import, ligne source et cellules brutes, compte, date bancaire, libellé, TTC bancaire signé en centimes, état, révision et ventilations.
- **ventilations** : identifiant unique au sein du mouvement, montant bancaire signé, nature, traitement distinct, taux en centièmes de pourcentage, coefficient de déduction, HT/TVA facturés optionnels, trois confirmations explicites, date facture, date TVA, référence du justificatif, note.
- **history** : snapshots avant/après des qualifications, date et type édition/annulation. L’annulation restaure le contenu avec une nouvelle révision, sans effacer la trace.
- **metadata** : régime confirmé, liste de taux manuels, mois verrouillés, régularisations et crédit antérieur par triplet JSON [début, fin, compte].

Invariants côté serveur : montants entiers bornés ; somme des ventilations exactement égale au mouvement ; HT + TVA documentaire égale au TTC traité ; provenance import/compte cohérente ; confirmation impossible si régime non vérifié, nature ou traitement indéterminé, date TVA non confirmée. Pour une dépense taxable, HT/TVA documentaire, facture et droit à déduction sont obligatoirement confirmés. Un justificatif conservé ailleurs reste visible comme absent de l’application.

Les champs bancaires ne sont plus modifiables après import. Leurs corrections se font dans l’aperçu avant import, en conservant les cellules originales. Une entrée bancaire ne détermine jamais automatiquement sa nature ou son droit à déduction.

Une révision protège les modifications contre les fenêtres devenues périmées. La restauration affecte une nouvelle révision aux opérations pour invalider les formulaires antérieurs. Les écritures de la restauration se font dans une seule transaction après validation de tout le contenu et sauvegarde de l’état précédent. Les sources originales, paramètres, historique et verrous font partie du fichier de sauvegarde.
