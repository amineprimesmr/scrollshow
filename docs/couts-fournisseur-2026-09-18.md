# Coût des données TikTok — comparatif et garde-fous (18 septembre 2026)

Question : comment lire les posts de comptes TikTok **tiers** et chercher par mot-clé pour des
milliers d'utilisateurs sans brûler les crédits ? Faut-il passer par notre clé TikTok ?

Prix relevés le 18 septembre 2026. **[V]** = vérifié sur la page ou l'API du fournisseur,
**[N]** = non vérifié (page illisible, extrait de recherche).

## 1. Les API officielles TikTok ne remplacent pas un fournisseur

| API | Ce qu'elle donne | Verdict |
|---|---|---|
| Display API (`video.list`, Login Kit) | Gratuite, 600 req/min. **Uniquement les vidéos du compte connecté**, 20 par appel. Pas de champ « images du carrousel » [V] | À garder pour les comptes **connectés** (compteurs gratuits et fiables) |
| Research API | Comptes publics + mots-clés, mais réservée à la recherche académique / sans but lucratif, **usage commercial exclu**, 1 000 req/jour [V] | Inutilisable |
| Commercial Content API | Bibliothèque publicitaire | Hors sujet |
| Content Posting API | Écriture seule | Déjà utilisée pour publier |

Aucune API officielle ne sert des comptes tiers ni la recherche à un SaaS commercial.

## 2. Fournisseurs (1 appel « page de compte » ≈ 50 posts)

| Fournisseur | Modèle | $ / 1 000 pages | $ / 1 000 recherches | Carrousels | Notes |
|---|---|---|---|---|---|
| Intermédiaire actuel → source | à l'appel | **1,50** [V] | 1,50 [V] | oui | un saut réseau de plus, latence médiane 4,5 s |
| **La même source, en direct** | à l'appel, dégressif à la journée | **1,00** [V] | 1,00 → 0,50 au-delà de 30 000/jour [V] | oui | mêmes endpoints, même charge utile ; 10 req/s ; échecs non facturés |
| Abonnement « web JSON » (tiktok-api23) | forfait | 0,05–0,07 [V] (35 posts/appel) | 0,05 [V] | probable [N] | 20× moins cher, petit vendeur, à éprouver |
| Packs de crédits sans expiration | crédit = appel | 0,99–1,88 [V] | 0,99 | oui [V] | pile technique indépendante : bon secours |
| Unités quotidiennes (acteur établi) | abonnement | ~4,7 [V] | ~0,93 | [N] | le plus stable, le plus cher |
| Scraper « par résultat » (batch) | par post | 25–185 [V] | 10–74 | oui [V] | inadapté au requête/réponse |
| Auto-hébergé | proxys résidentiels + maintenance | 0,2–1,0 de proxy **+ ~1,5–3 k$/mois d'ingénierie** [N] | — | — | rentable seulement au-delà de ~5 M d'appels/mois ; la recherche exige souvent un cookie |

## 3. Modèle de coût (sans cache partagé)

Hypothèses : 20 comptes suivis par utilisateur, 30 % d'actifs par jour, 1 page par compte et par
jour actif, 2 recherches/semaine à 6 appels, import initial de 4 pages par compte.

| Utilisateurs | Appels / mois | Intermédiaire 0,0015 $ | Direct 0,001 $ | Direct dégressif | Forfait web JSON |
|---|---|---|---|---|---|
| 1 000 | 195 600 | 293 $ | 196 $ | ~174 $ | 10–50 $ |
| 5 000 | 978 000 | 1 467 $ | 978 $ | ~687 $ | 50–100 $ |
| 20 000 | 3 912 000 | 5 868 $ | 3 912 $ | ~2 154 $ | ~200 $ [N] |

## 4. Ce qui est maintenant en place dans le code

Le premier levier n'est pas le fournisseur, c'est de **ne pas appeler**.

- **Cache partagé entre utilisateurs** (`lib/metrics-guard.ts`, table `scrollshow_provider_cache`) :
  une page de compte ou de recherche demandée par cent personnes ne coûte qu'un appel par
  fenêtre de fraîcheur (1ʳᵉ page 6 h, pages suivantes 24 h, recherche 3 h). Résultat normalisé
  (~1 Ko/post), pas la réponse brute. Un « Actualiser » explicite exige un cache de moins de 10 min.
- **Budget par utilisateur** : `METRICS_USER_DAILY_LIMIT` (120 appels payés/jour par défaut ≈ 0,18 $
  au pire). Un résultat servi du cache ne compte pas. Le plafond global reste en dernier rempart.
- **Registre d'usage** : `npm run metrics:usage` (table `scrollshow_provider_usage`) — appels payés,
  appels évités, utilisateurs les plus coûteux.
- **Ouvrir un compte ne lit plus tout son historique** : 2 pages en automatique, 6 par clic.
  Avant, ouvrir @nike enchaînait des dizaines de pages payantes sans rien demander.
- Relecture automatique seulement si jamais lu, vieux de 24 h, ou images expirées — et panneau
  ouvert. Une fois par compte et par visite, y compris après une erreur.
- Shadowban : fraîcheur 24 h (au lieu de 12), 4 analyses à la fois, cache d'abord.
- Fournisseur `BLOCKED` (solde vide) : échec immédiat + disjoncteur, au lieu de 40 s d'attente.
- OCR des slides (CPU serveur) : 60 slides en automatique par ouverture, le reste à la demande.
- **Mode direct** : `METRICS_API_MODE=direct` + `METRICS_API_BASE` = origine de la source +
  `METRICS_API_KEY` = sa clé. Testé sur réponses simulées, **pas encore contre la vraie source**.

## 5. Recommandation

1. Passer en **direct** (−33 % tout de suite, −67 % sur la recherche à gros volume) : créer un compte
   chez la source, mettre 5–10 $, basculer les trois variables en préproduction, vérifier une page
   de compte et une recherche, puis en production. Garder l'intermédiaire en secours.
2. Laisser tourner une semaine et lire `npm run metrics:usage` : le taux d'appels évités dira si le
   budget par utilisateur (120) peut descendre.
3. Essayer le **forfait web JSON** deux semaines sur le rafraîchissement quotidien (taux de succès,
   images de carrousel, écart des compteurs). S'il tient : lui le volume, la source directe pour la
   recherche et le secours. À 20 000 utilisateurs : ~300 $ au lieu de ~3 900 $ par mois.
4. Comptes **connectés** : basculer leurs compteurs sur la Display API (gratuite). À décider : elle
   ne rend pas les images des carrousels, que le produit affiche aujourd'hui.
5. Ne pas auto-héberger avant ~5 M d'appels par mois.

Risque à connaître : les CGU de TikTok interdisent l'extraction automatisée. Le risque réaliste est
contractuel (révocation de l'app Login Kit / Posting), pas pénal. Ne pas nommer le fournisseur dans
le produit, minimiser les données, supprimer sur demande.
