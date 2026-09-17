# RevenueCat — achat historique ScrollShow — 13 septembre 2026

## Pourquoi le premier achat manquait

Le premier abonnement ScrollShow a été encaissé sur l'ancien compte Stripe
**Process** (`acct_1U6V0h3yrYjpyuOy`). La configuration RevenueCat principale
du projet ScrollShow ne lit que le nouveau compte Stripe dédié. La réparation
de sa clé publique et l'import du paiement récent ne pouvaient donc pas faire
apparaître cet abonnement historique.

Les vérifications Stripe et de la base ont été effectuées en lecture seule.
Dans Chrome, la première facture a été confirmée **payée le 9 septembre 2026**,
pour **23,99 EUR TTC**, soit **19,99 EUR HT et 4 EUR de TVA**, après un essai du
6 au 9 septembre. L'abonnement est actif et son annulation est prévue le
**9 octobre 2026**. Aucun identifiant client ni identifiant d'abonnement n'est
conservé dans cette note.

## Import ciblé effectué

Une seconde configuration a été créée dans le projet RevenueCat ScrollShow
(`0d6bdeb6`) : **ScrollShow (Stripe historique Process)** (`app3a3813e4d7`),
liée au compte Process déjà connecté à RevenueCat.

Le suivi automatique des achats externes reste désactivé sur cette
configuration : le compte Process porte également d'autres activités, qui
ne doivent pas être importées dans ScrollShow. La clé publique principale
utilisée par le site en production est inchangée.

La déclaration API ciblée du premier abonnement a répondu **HTTP 200**.
La réponse identifie un achat Stripe réel (`is_sandbox: false`), non remboursé
(`refund: false`), avec une échéance au **9 octobre 2026**. Cet import déclare
un paiement existant : il ne crée **aucun nouveau débit**, aucun nouvel
abonnement et ne modifie pas la facturation Stripe.

RevenueCat a créé le produit `prod55ef056065`, associé au tarif Stripe
`price_1U9MLv3yrYjpyuOyaU2ZWKf5`. Il a été renommé
**ScrollShow historique — 19,99 €/mois** et rattaché à l'entitlement `studio`
(ScrollShow Studio). Le profil client confirme cet accès actif jusqu'au
9 octobre et l'achat initial du 9 septembre. Aucune offering actuelle n'a
été modifiée.

Le tableau de bord de production confirme désormais **2 abonnements actifs**,
**57 USD de MRR** et **57 USD de revenus** arrondis. Les deux transactions
sont visibles : 33,65 USD pour l'achat récent de 29 EUR et 23,25 USD pour
l'achat historique de 19,99 EUR hors TVA. La facture Stripe historique reste
la référence pour le montant de 23,99 EUR effectivement payé, TVA comprise.

L'abonnement importé est ensuite suivi automatiquement par RevenueCat.
Cette reprise ciblée ne nécessite pas de modifier le site ni de remplacer la
clé Stripe legacy existante. Stripe reste la source de la facturation et des
droits d'accès ScrollShow.

## Icône du projet RevenueCat

Une [réponse du support RevenueCat du 23 avril 2026](https://community.revenuecat.com/dashboard-tools-52/unable-to-find-app-icon-upload-option-in-revenuecat-dashboard-7617)
indique qu'il n'existe pas d'upload manuel d'icône dans le dashboard et que
les icônes iOS sont récupérées depuis l'App Store.

L'interface a été vérifiée le 13 septembre : aucun réglage d'icône dans
Project settings / General ; Brand propose des couleurs et polices.
L'onglet Appearance de l'application Stripe propose bien App icon et Logo,
mais décrit leur usage pour les pages de paiement et les emails RevenueCat.
Ces paramètres sont distincts de l'icône du projet dans le tableau de bord.
Aucune image n'a été téléversée et aucun paramètre d'apparence n'a été modifié.
Le « S » gris est donc l'icône par défaut du projet web, sans incidence sur
la remontée des paiements.

## Limites de cette note

Cette note consigne les observations Stripe faites dans Chrome, la création
de la configuration historique, l'import ciblé, le produit et l'entitlement,
le profil client ainsi que l'actualisation du tableau de bord principal.
Elle ne prouve pas la réception d'une notification sur le téléphone de
l'utilisateur. Aucun nouveau paiement n'a été effectué pour ce diagnostic.
