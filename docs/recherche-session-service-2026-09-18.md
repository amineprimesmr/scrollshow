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

## La vraie cause (mesurée le 18 septembre 2026, navigateur anonyme)
TikTok **ne refuse pas** ces mots-clés à un visiteur anonyme. Son API de recherche
photos rend douze carrousels dans les trois cas — seul le champ `status_code` change :

| Mot-clé | HTTP | `status_code` | Carrousels rendus |
| --- | --- | --- | --- |
| jawline | 200 | 0 | 12 |
| glow up | 200 | 0 | 12 |
| looksmax | 200 | **403** | 12 |
| mewing | 200 | **203** | 12 |

Le fournisseur traite tout `status_code` non nul comme un échec : il répond `400` et
**jette des résultats valides**. C'est un défaut de son côté, pas une restriction de
TikTok ni un bug du moteur ScrollShow. (Première explication donnée, « TikTok
restreint ces termes aux comptes connectés » : fausse.) Notre `parseSearch` avait le
même défaut — corrigé : un code non nul n'est un refus que si la liste est vide.

Conséquences :
- le correctif définitif est chez le fournisseur → ticket de support ci-dessous ;
- la session de service reste un contournement plausible (connecté, TikTok rend
  `status_code: 0`), non vérifié ;
- le collecteur Chrome local lit TikTok lui-même et n'est donc pas concerné.

## Ticket de support à envoyer au fournisseur
> **Endpoint**: `GET /api/v1/tiktok/web/fetch_search_photo` (same on
> `web/fetch_general_search` and `web/fetch_search_video`).
> **Bug**: the endpoint returns HTTP 400 "Request failed" for some keywords although
> TikTok returns valid results. Reproduced 100 % of the time on 2026-09-18 with
> `keyword=looksmax`, `looksmaxxing`, `healthmaxing`, `mewing`; at the same moment
> `jawline`, `glow up`, `softmaxxing` return 20 items.
> **Cause**: for these keywords TikTok's `/api/search/photo/full/` answers HTTP 200 with
> a populated `item_list` (12 items) but a non-zero `status_code` (403 for
> `looksmax`, 203 for `mewing`). Your wrapper seems to treat any non-zero
> `status_code` as a failure and discards the items. Please return the items when
> `item_list` is non-empty.
> **Failed request ids**: `117fd0ec-f5cb-46e4-a3a1-f685a8bf02ad`,
> `1b43f88e-4f19-4382-9092-80f9970e03b4`.

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
