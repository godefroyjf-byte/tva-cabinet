# Calculs, hypothèses et sources

Version du 20 octobre 2026.

Les calculs implémentent les conventions mathématiques du CAHIER_DES_CHARGES.md fourni par l’utilisateur. Ils ne sélectionnent aucun régime, taux éligible, date d’exigibilité ni droit à déduction à partir de l’activité, du libellé ou du sens bancaire.

## Arithmétique

Les montants sont parsés directement en centimes entiers avec BigInt, sans conversion monétaire par flottant. Un taux est stocké en centièmes de pourcentage : 20 % = 2000, 5,5 % = 550. Les opérations de division utilisent des entiers BigInt.

TVA = arrondi(TTC traité × taux / (10000 + taux)).
HT = TTC traité − TVA.
Déductible = arrondi(TVA × coefficient / 10000).

Arrondi à chaque ventilation au centime le plus proche, avec les moitiés en s’éloignant de zéro : 0,5 centime devient 1 ; −0,5 devient −1. Les valeurs ainsi arrondies sont ensuite additionnées, sans recalcul sur les totaux. Une ventilation peut donc différer d’un centime du calcul sur un TTC regroupé ; cette convention est volontaire et testée.

Recette : TTC traité = montant bancaire signé. Dépense : TTC traité = opposé du montant bancaire. Une dépense remboursée porte donc une TVA déductible négative ; un remboursement d’honoraires porte une TVA collectée négative. La nature est toujours choisie manuellement.

Le HT et la TVA documentaires priment, après contrôle du total et des signes. L’égalité entre taux théorique et facture n’est pas présumée : l’utilisateur doit vérifier le justificatif. Une référence absente reste visible.

Solde = collectée confirmée − déductible confirmée + régularisations confirmées − crédit antérieur confirmé. Les estimations, exclusions et cas à vérifier restent séparés.

## Portée fiscale et références

Les taux initiaux 20 %, 10 %, 5,5 % et 2,1 % sont proposés selon le cahier des charges, sans affectation automatique à des opérations. Le régime sur encaissements/sur débits est une information à confirmer ; il ne déclenche aucun algorithme d’exigibilité. Les cas internationaux, l’autoliquidation, les paiements partiels et l’éligibilité spécifique ne sont pas automatisés.

Référence officielle à consulter pour vérifier les taux et leur champ :
https://www.impots.gouv.fr/professionnel/questions/quels-sont-les-taux-de-tva-en-vigueur-en-france-et-dans-lunion-europeenne

L’accès à cette page depuis la machine a été refusé par le proxy réseau (HTTP 403) le 20/10/2026. Son contenu n’est donc pas annoncé comme consulté ou vérifié dans cette livraison. Aucune règle d’éligibilité fiscale nouvelle n’a été codée à partir d’une source non vérifiée. Confirmer les paramètres et traitements avec les documents applicables au cabinet avant d’utiliser des totaux pour une déclaration. Le logiciel produit une préparation contrôlable, sans correspondance CA3 inventée.
