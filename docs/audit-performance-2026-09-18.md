# Audit de performance — 18 septembre 2026

Symptôme : « tout est ultra lent » — photos de profil absentes, vignettes TikTok qui
n'arrivent pas, « Lecture des statistiques… » et « Chargement… » interminables, sur
toutes les pages, connexion Internet hors de cause.

Méthode : mesures avant toute hypothèse (Performance API dans Chrome, banc de routes
avec une session de dev, `sample` sur le processus Node, trace de Next, appel direct
du fournisseur, validation du SQL sur un vrai moteur Postgres via PGlite).

## Mesures

| | Avant | Après |
|---|---|---|
| Route API quelconque en dev (`/api/keys`, 0 Ko) | 260–700 ms | ~30 ms |
| `/api/accounts` | 5,1 Mo | 95 Ko |
| Dernière vignette de l'Overview affichée | 25 s | < 4 s à froid, < 0,5 s ensuite |
| Vignette (médiane) | 3 s, JPEG 1080 px de 50–500 Ko | WebP à la taille affichée, ~15 Ko |
| Avatars valides | 26 sur 89 (63 URL expirées) | tous ceux dont le compte existe |
| Synchro d'un compte, fournisseur bloqué | 40 s puis « timeout » | 0,15 s, message clair |
| Analyse shadowban, fournisseur bloqué | 40 s par compte, 72 en parallèle | 0,2 s (cache), 4 à la fois |
| JS de `/app/home` au premier chargement | 317 Ko | 164 Ko |
| Lecture de session (store) | 35–70 ms, 13 Mo décodés | 0,4 ms |

## Causes, par ordre d'impact

1. **Portefeuille du fournisseur de métriques vide.** Le run revient `BLOCKED`
   (« Insufficient wallet balance: available $0.001 »). Statut non reconnu comme final :
   40 s de sondage puis « timeout », sur chaque synchro, analyse shadowban et recherche.
   → Échec immédiat + disjoncteur de 3 min (`lib/metrics.ts`). **Action humaine requise :
   recharger le portefeuille**, sinon aucun nouveau post ne peut être lu.
2. **+200 ms sur chaque route API en dev.** Next 15.5 + Turbopack n'écrit pas
   `react-loadable-manifest.json` pour un route handler ; `loadComponents` réessaie alors
   3 × 100 ms. Chaque image passant par une route API, une galerie le payait des dizaines
   de fois, six connexions à la fois. → `scripts/dev.mjs` + `scripts/dev-manifests.mjs`.
   Production non concernée.
3. **Le store relu en entier à chaque requête.** `readSession` ouvre toute requête et
   lisait/décodait le document complet (13 Mo en local, 8 Mo de transfert Neon en prod).
   → Cache indexé sur la version (`xmin` / date du fichier), en texte.
4. **Compteur de débit = réécriture du store par image.** En local : verrou fichier +
   lecture + écriture de 13 Mo par vignette, en file indienne, dans un dossier synchronisé
   par iCloud. En prod : `jsonb_set` sur le document unique = réécriture TOAST de 8 Mo et
   verrou de LA ligne du site, par vignette. → Table `scrollshow_rate_limits`, mémoire en local.
5. **Images jamais redimensionnées.** Slides 1080 px servies dans des tuiles de 200 px, et
   chaque tuile chargeait aussi la slide suivante. → sharp → WebP, largeurs fermées, cache
   mémoire, slide voisine seulement à l'approche de la tuile.
6. **Avatars et couvertures morts.** URL CDN signées, expirées en ~48 h, jamais
   rafraîchies. → Avatar par handle auto-réparé ; couvertures expirées ⇒ relecture du compte
   depuis le début ; une URL expirée répond 404 sans aller voir le CDN.
7. **Page Shadowban : 72 requêtes d'un coup**, limite de 100 lectures/heure dépassée dès la
   deuxième visite (429). → File de 4, limite à 1200/h, lecture ciblée des vidéos.
8. **Ouvrir un compte lisait les vidéos des 72 comptes** (5–6 Mo). → `readRowVideos`.
9. three.js (via `img-fx`) sur le chemin critique de l'Overview et de l'écran de
   chargement. → Import dynamique.

## Reste à faire (hors code, ou à décider)

- **Recharger le portefeuille du fournisseur de métriques.**
- **Sortir le projet de `~/Desktop`** : le Bureau est géré par iCloud (`store 2.json`,
  `app-build-manifest 2.json` sont des doublons de conflit iCloud). `.data/` et `.next*`
  y sont synchronisés en continu. Un dossier hors iCloud (`~/Developer/scrollshow`) règle
  aussi l'éviction de `node_modules`.
- `.next-audit`, `.next-qa`, `.next-verify` : ~1,2 Go de builds jetables.
- Le store reste un document JSONB unique : chaque **écriture** le réécrit en entier.
  Le cache a réglé les lectures ; découper en une ligne par collection est l'étape suivante
  si les écritures deviennent le goulot (recherches actives, synchros longues).
- `/api/research` (1,4 Mo) et `/api/runs` (0,85 Mo) restent lourds : à paginer.
- Déployer : le chemin Postgres a été validé sur PGlite (lectures, invalidation par `xmin`,
  table des compteurs), pas encore sur Neon.

---

# Deuxième passe — « des milliers d'utilisateurs » (même jour)

Trois relectures indépendantes (mes propres changements, passage à l'échelle serveur, fluidité
client), puis correction. Les nouvelles requêtes SQL ont été rejouées sur un vrai moteur Postgres
(PGlite) : lecture par utilisateur, gestionnaire de comptes, cache fournisseur, registre d'usage.

## Bugs trouvés dans la première passe, corrigés

| Bug | Conséquence | Correction |
|---|---|---|
| Cache d'avatars partagé, alimenté par une URL fournie par le navigateur | N'importe quel utilisateur connecté pouvait faire servir l'image de son choix comme avatar de @nike à tous, 24 h | L'indice du navigateur ne sert que hors bibliothèque et n'entre jamais dans le cache ; cache borné en octets |
| Repli du compteur de débit sur **toute** erreur | Une base saturée déclenchait la réécriture de plusieurs Mo qui invalide le cache de toutes les instances : l'incident s'auto-alimentait | Repli lourd seulement si la table est impossible (42P01/42501), sinon compteur mémoire + log |
| Cache du store FIFO, 32 entrées, vidéos par compte dans le même cache | 32 requêtes (ou la page Shadowban) chassaient la tranche de session que tout le monde relit | Vrai LRU borné en taille, cache séparé pour les vidéos d'une ligne, propriété vérifiée avant lecture |
| Relecture auto : ancienneté d'une erreur lue sur le mauvais champ | Un compte qui échoue toujours était re-tenté (payant) à chaque A → B → A | `sync.updatedAt`, mémoire de tous les comptes tentés, panneau ouvert requis |
| Compteur d'octets du cache de vignettes | Dérive → le cache finissait par se vider seul | Retrait de l'ancienne taille avant réinsertion |
| Slide « indisponible » indexée par position | Restait cassée après rafraîchissement des URL | Indexée par URL |
| Disjoncteur armé sur tout `BLOCKED` | Un refus propre à une requête coupait les métriques de tous | Armé seulement sur un motif de solde / facturation |
| `${json}::jsonb` avec postgres.js | La colonne recevait une **chaîne** JSON, pas l'objet (trouvé sur PGlite) | `sql.json(valeur)` |
| Voile des modales en sombre : alpha 0,55 × 2,2 > 1 | Noir opaque, flou invisible, sur **toutes** les modales | `min(0.62, …)` |

## Passage à l'échelle serveur

- `readSession` rapportait `users` + `projects` de **tout le monde** à chaque requête (1,6 Ko par
  utilisateur → 1,6 Mo par requête à 1 000 comptes). → `readUserScope(id)` : filtre dans Postgres.
- Écritures « document entier » restantes sur des chemins sondés, passées en tranches : connexion QR
  (une lecture + deux écritures complètes toutes les 2 s), push, OCR (une réécriture complète **par
  slide**), shadowban, ajout de compte, analyse de compte, médias, réglages.
- `account-sync` ne rapatrie plus les vidéos de tous les comptes pour en synchroniser un.
- Sondages : recherche 1 s → 2,5 s et en pause onglet masqué ; statut de publication : l'intervalle se
  relançait à chaque réponse, le plafond de 60 essais ne jouait jamais → sondage infini corrigé.

## Fluidité client (70 à 300 comptes)

- Éventail : dossiers lointains réduits à une silhouette (~9 000 nœuds → ~1 500 à 300 comptes ;
  mesuré 2 200 → 927 à 72), dossier mémoïsé, plus de `will-change` par enfant (~5 couches × N),
  taille de scène mise en cache (plus de reflow forcé par image), écritures de style sautées si
  inchangées, état « chargement » et « erreur » au lieu d'un faux « Aucun compte ».
- Recherche : mur mémoïsé (il était re-rendu chaque seconde par le chrono et à chaque pixel d'un glisser).
- Contexte studio : les collections gardent leur référence quand l'instantané est identique.
- Shadowban : décalage d'animation plafonné (la 300ᵉ carte restait invisible 18 s), requêtes annulées
  en quittant la page.
- Flou par ligne supprimé dans les listes longues (900 surfaces pour 300 comptes suivis) et sur la
  pastille des tuiles ; `FxImage` ne retélécharge plus chaque image à 6 s ; aperçus de slides en lazy.

## Ce qui reste à faire — par priorité

1. **Le store est un document JSONB unique : c'est LA limite.** Estimation de la relecture : il tient
   quelques **centaines** d'utilisateurs, pas des milliers. Chaque écriture de n'importe qui invalide le
   cache de toutes les instances et prend l'unique verrou du produit ; 1 à 4 Mo par utilisateur actif ;
   mur dur à ~255 Mo (conteneur jsonb) et, avant, mémoire d'une fonction à ~200–300 Mo. Les caches et
   tranches de cet audit repoussent le mur, ils ne l'enlèvent pas. Migration sans coupure, dans l'ordre :
   `research_jobs` → `account_videos` (98 % du poids) → `video_stats` / `publication_text` →
   `users` / `projects` / `api_keys` / `oauth_*` → `posts` / `media` / `channels` → le reste. Pour chaque
   collection : module d'accès derrière les signatures actuelles, reprise idempotente depuis le JSONB,
   double écriture dans la même transaction, lecture comparée, bascule par variable, puis retrait de la clé.
2. **Basculer le fournisseur en direct** et lire `npm run metrics:usage` (voir `docs/couts-fournisseur-2026-09-18.md`).
3. `researchJobs` n'est jamais purgé (~660 Ko par tâche, 30 tâches/jour possibles) : alléger les tâches
   terminées et plafonner par utilisateur. `videoStats`, `billingEvents`, `runs`, `publicationText` : idem.
4. Crons : `captureDailyAnalytics(limit = 3)` par heure = 72 espaces de travail par jour au plus ;
   `runScheduledPublishes` traite tout le monde en série dans une seule fonction — un pic à 18 h ratera
   des créneaux. À découper par lots avec concurrence bornée.
5. `resolveApiKey` parcourt toutes les clés ; `/api/research` (1,4 Mo) et `/api/runs` (0,85 Mo) à paginer ;
   `completeResearch` verrouille encore `accounts` avec vidéos ; webhook Stripe et changement de mot de
   passe écrivent encore le document entier (volontairement laissés : chemins critiques, peu fréquents).
6. Client : scinder `StudioContext` (données / interface) — ouvrir « Nouveau post » re-rend encore tout ;
   mémoïser `PostCard` du calendrier et passer ses vignettes de 20–40 px par une URL redimensionnée ;
   paginer la Bibliothèque par 24 ; replier `/api/accounts`, `/api/keys`, `/api/studio/us-guide` et
   `/api/projects` dans l'instantané `/api/studio` (5 requêtes → 1, couvertes par l'ETag) ; la page
   « Comptes warmés » verrouillée charge encore son catalogue sous un flou plein écran.
7. Sortir le projet de `~/Desktop` (iCloud), purger `.next-audit` / `.next-qa` / `.next-verify` (~1,2 Go).
8. Valider sur Neon (seul PGlite a servi) avant de déployer : les tables `scrollshow_rate_limits`,
   `scrollshow_provider_cache`, `scrollshow_provider_usage` se créent seules si le rôle a le droit `CREATE`.
