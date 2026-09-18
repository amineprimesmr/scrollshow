# Recherche : session TikTok de service

## Le problème (mesuré le 18 septembre 2026)
La recherche de carrousels passe par la recherche « photos » web du fournisseur de
métriques, qui interroge TikTok **en anonyme**. Pour certains mots-clés elle répond
`400` à chaque essai : tout ce qui contient `looksmax`, `healthmaxing`, `mewing`.
Au même instant `jawline`, `softmaxxing`, `glow up`, `skincare routine` rendent
20 carrousels par page, et un navigateur **connecté** à TikTok voit des centaines
de résultats pour `looksmax`.

Replis anonymes essayés, tous insuffisants :

| Source | Résultat pour ces mots-clés |
| --- | --- |
| Recherche vidéo de l'application | 0 carrousel |
| Hashtags du mot-clé (4 hashtags × 2 pages) | 2 à 4 carrousels |
| Recherche générale de l'application | 7 carrousels uniques, répétés à chaque page |
| Forme `#mot` sur la recherche photos | `200` mais liste vide |

Les API officielles TikTok (comptes connectés par OAuth) n'ont aucune recherche par
mot-clé : on ne peut pas « chercher via le compte connecté de l'utilisateur ».

## La solution
La doc du fournisseur prévoit le cas : le paramètre `cookie` — « provide the cookie
yourself if you encounter an interface error ». `lib/research/provider.ts` l'envoie
**uniquement** quand l'anonyme a échoué, depuis `TIKTOK_SEARCH_COOKIE`.

Ordre : anonyme → session de service → recherche générale de l'application.
Une recherche commencée avec la session continue avec elle (préfixe `ck:` dans
`searchId`, aucun état serveur). La valeur n'entre ni dans la clé de cache ni dans
un log.

## Mise en place (à faire par un humain, une fois)
1. Créer un compte TikTok **dédié** à ScrollShow (adresse de service). Jamais un
   compte personnel, jamais celui d'un client : le cookie est transmis au fournisseur.
2. Dans une fenêtre de navigation privée, se connecter à tiktok.com avec ce compte,
   ouvrir `https://www.tiktok.com/search/photo?q=looksmax` et vérifier que les
   résultats s'affichent.
3. Outils de développement → onglet Réseau → cliquer une requête vers
   `www.tiktok.com/api/search/…` → En-têtes de requête → copier la valeur **complète**
   de l'en-tête `cookie`.
4. La poser côté serveur uniquement :
   - local : ligne `TIKTOK_SEARCH_COOKIE=…` dans `.env.local`, puis relancer `npm run dev` ;
   - production : `vercel env add TIKTOK_SEARCH_COOKIE production`, puis redéployer.
5. Fermer la fenêtre privée **sans se déconnecter** (se déconnecter invalide la session).

## Vérifier
Chercher `looksmax` dans Inspiration → Recherche : le mur doit se remplir par pages
de ~20 carrousels. Si la session a expiré, la recherche retombe sur le repli (une
poignée de résultats) et le serveur trace `research_search_cookie_failed` : refaire
les étapes 2 à 4. Une session TikTok web tient en général plusieurs semaines.

## Risques assumés
- Le compte de service peut être limité par TikTok s'il sert trop de recherches :
  le cache partagé de trois heures par mot-clé et le plafond
  `RESEARCH_PROVIDER_DAILY_LIMIT` bornent le volume.
- Le cookie donne accès au compte de service : le traiter comme un secret (jamais
  dans le dépôt, jamais côté client).
