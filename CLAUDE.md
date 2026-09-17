# ScrollShow — règles projet

## Liquid Glass (obligatoire pour toute UI)

Le studio et le site utilisent un design system « Liquid Glass » (iOS 26). Toute
nouvelle surface de **chrome** doit l'utiliser ; ne jamais réinventer un flou ou
un `backdrop-filter` à la main.

- **Source** : `app/liquid-glass.css` (primitives + application aux classes
  existantes), tokens `--lg-*` dans `app/theme.css` (clair et sombre), filtre de
  réfraction dans `components/LiquidGlassDefs.tsx` (déjà monté dans
  `StudioShell` et `Landing`).
- **Ordre d'import** : `liquid-glass.css` doit être importé **après**
  `studio.css` / `landing.css` (il surcharge). Une nouvelle page hors studio
  l'importe après sa propre feuille.

### Où mettre du verre (chrome = contrôles flottants)
Barres collantes, sidebars/rails, menus et popovers, feuilles/modales et leur
scrim, contrôles segmentés, boutons fantômes, interrupteurs, pilules
flottantes, bannières, chrome mobile fixe.

### Où ne PAS en mettre (contenu)
Cartes de contenu, tableaux, formulaires, listes, cartes de post, images.
Le contenu reste opaque (`var(--ss-card)`), sinon rien n'est lisible.

### Comment
- Classe utilitaire : `.lg` (panneau), `.lg--flat` (barre, sans ombre portée),
  `.lg--lens` (petite pilule avec réfraction de bord sur Chromium), `.lg-press`
  (compression ressort au clic).
- Pour styliser une classe existante, ajouter une règle dans
  `liquid-glass.css` qui reprend le même motif : fond
  `rgb(var(--lg-rgb) / alpha)`, `backdrop-filter: blur(var(--lg-blur))
  saturate(var(--lg-sat))`, reflets via les `box-shadow` inset basés sur
  `--lg-hi` / `--lg-hi-a` et ombre via `--lg-shade` / `--lg-shade-a`.
- Toujours mettre `-webkit-backdrop-filter` avec `backdrop-filter`.
- Réfraction : uniquement sous `html.lg-refract` et seulement sur de petites
  surfaces (pilule, pastille de segment, menu). Jamais sur une sidebar ou un
  grand panneau (coût GPU).
- Élément collant : `position: sticky` **dans** `.ss-main__body` (c'est le
  conteneur qui défile), l'en-tête `.ss-top` y est déjà. Sur la page
  calendrier c'est `.ss-cal-bar` qui est collante, pas `.ss-top`.
- Ne jamais coder une couleur sombre en dur (`rgb(20 20 22 / .9)`) : utiliser
  les tokens pour que clair et sombre marchent.
- Micro-détails attendus : `transition: transform 0.34s cubic-bezier(0.2, 1.4,
  0.4, 1)` et `scale(0.96)` au `:active`, animation `lg-pop` à l'apparition
  d'un menu ou d'une pastille, rayons 999px pour les pilules et 24px pour les
  feuilles.
- Respecter `prefers-reduced-transparency` et `prefers-reduced-motion` (déjà
  gérés globalement, ne pas les contourner).

### Vérification
Tester clair **et** sombre (`document.documentElement.dataset.theme`), et
vérifier dans Chrome que `html.lg-refract` est présent et que
`getComputedStyle(el).backdropFilter` renvoie bien le filtre.

## Overview — panneau de compte
`components/studio/AccountPanel.tsx` + `lib/insights.ts` : un compte ouvert
montre ses posts TikTok réels, filtrables (recherche, type, tri, galerie ou
liste) et lisibles en entier dans le studio via l'embed officiel
`https://www.tiktok.com/embed/v2/<id>` (vidéo comme carrousel).
- Trois sources fusionnées par id de post : API TikTok (prioritaire, compte
  connecté), fournisseur de métriques publiques par handle (`fetchAccountVideos`,
  cache dans `Channel.videos` / `Account.videos`), et le calendrier ScrollShow.
  Les compteurs prennent le max ; une source non autoritaire ne réécrit jamais
  le type ni le descriptif d'un post.
- La période filtre sur la date de publication (jamais sur des deltas
  quotidiens, qui valent 0 tant qu'il n'y a pas d'historique).
- Les vignettes TikTok passent **toujours** par `/api/studio/tiktok/cover`
  (hotlink protégé) ; l'allowlist d'hôtes vit dans `lib/tiktok-cover.ts` et est
  couverte par un test — ne jamais l'élargir à un hôte non TikTok.
- Le lecteur est monté en portal sur `document.body` : le panneau crée son
  propre contexte d'empilement.

## Page Recherche
`components/studio/ResearchView.tsx` + `components/studio/research.css`
(namespace `.ss-rs`). Elle cherche des **posts**, pas des comptes : le mur de
carrousels est le contenu, le compte n'est qu'une attribution.
- Les vignettes passent **obligatoirement** par `PostTile`, partagé avec
  l'Overview. Écrire une vignette à la main fait diverger les deux pages.
- Le direct passe par `TikTokScan` / `TikTokScanLine` (logo TikTok + radar).
- Trois paramètres visibles, pas plus : mots-clés (le champ), vues minimum par
  post, période de publication. Tout le reste garde ses défauts.
- **Piège `minPostViews` × `minPosts`** : `evaluateResearch` teste
  `strongPosts < minPosts`. Un plancher à 100k avec `minPosts: 5` exige cinq
  carrousels au-dessus de 100k — porte bien trop étroite. La pastille pilote
  les deux, et force `minTotalViews: 0` (défaut 100000, sinon un plancher
  cumulé invisible rejette des comptes).
- `topPosts` n'est **pas** filtré par `minPostViews` (c'est un simple tri) :
  le filtre par post se fait côté client, sinon le paramètre est décoratif.
- `publicJob` part aussi au MCP et à la REST : `pending` reste borné
  (8 candidats, 2 posts chacun), et la route bibliothèque projette les vidéos.

## Calendrier
`components/studio/CalendarView.tsx` : une seule `PostCard` pour jour/semaine/
mois, navigation par flèches selon la vue, résumé calculé sur la période
affichée uniquement. Garder ces invariants si on ajoute une vue.
- Glisser-déposer maison (pointer events) : appui long 260 ms au doigt, 6 px à
  la souris ; cibles = `[data-drop="day"][data-date]` et la corbeille
  `[data-drop="trash"]` (portal, verre). Déposer sur la corbeille ouvre une
  confirmation ; un déplacement fait un `PATCH { date }` qui ne rejoue que
  `validateSchedule` (un post planifié à l'ancienne doit pouvoir bouger).
  Un post publié ou en cours de publication est verrouillé (`isLocked`).
- Comptes du calendrier = `ownedChannels()` (`lib/owned-channels.ts`) :
  comptes connectés + comptes suivis de l'Overview exposés comme comptes
  `tracked` (non connectés, brouillons seulement). Même liste dans le snapshot
  studio, `agentChannels` et le composeur ; `validatePost` accepte les deux.

## Poster aux US — une seule méthode
`lib/us-guide.ts` + `components/studio/views/PostUSView.tsx` +
`components/studio/post-us.css` (namespace `.ss-us`). En-tête du shell masqué.
- **Une seule méthode** : téléphone dédié, sans SIM, derrière un serveur Outline
  personnel à Ashburn. L'ancienne « méthode A » (organique, sans VPN) a été
  supprimée — elle ne forçait aucune géo. Ne pas la réintroduire.
- **La page tient sur un écran** : une barre (titre, coût en une ligne,
  progression), six étapes dépliables, une ligne de règle d'or. C'est tout.
  Ont été retirés après coup, et ne doivent pas revenir : le paragraphe
  d'introduction, la rangée de chiffres, la liste d'achats « ce qu'il te faut »,
  la liste « à ne jamais faire », la phrase d'objectif sous chaque titre d'étape.
  Chaque coût et chaque lien vit dans l'étape qui en a besoin.
- Une tâche = un titre court + une ligne de détail (le chemin exact dans les
  réglages). Pas de deuxième phrase.
- **Les liens sont des liens** : bleus (`--ss-link`) et soulignés, jamais des
  pastilles grises — sinon on ne voit pas qu'ils cliquent.
- Les identifiants de tâche (`phone_reset`, `srv_agent`, …) sont **persistés**
  dans `User.usChecklist` et validés par `US_CHECKLIST_IDS` : les renommer efface
  la progression de tout le monde.
- La page s'ouvre sur la première étape non finie et n'envoie un `PUT` que si la
  liste a changé (comparaison de signature) : ouvrir la page n'écrit rien.
- `US_LINKS` et `US_AGENT_PROMPT` restent copiés de
  `useprocess/website/src/affiliate/us-guide.js` : les modifier des deux côtés.

## Bibliothèque
`components/studio/MarketplaceView.tsx` + `components/studio/library.css`
(namespace `.ss-lib`). Route `/app/marketplace`, en-tête du shell masqué : la page
porte sa propre barre collante.
- Une barre (titre, recherche, onglets À moi / Publics, filtres de statut, import,
  Nouveau) puis un mur de cartes. Pas de panneaux empilés.
- **Les colonnes du mur font toutes la même largeur** : une seule mesure
  (`useTileScale`, un `ResizeObserver` sur le `<ul>`) descend le facteur `--k` à
  toutes les cartes. `SlidePreview` est rendu à `PREVIEW_WIDTH` puis mis à
  l'échelle — l'étirer en CSS fausserait la taille des textes, calculée en px
  depuis cette largeur. Ne pas repasser à `100cqw` : `calc(100cqw / 300)` n'est pas
  un nombre et la transformation est ignorée sans erreur.
- Une carte n'expose qu'une action principale (Modifier / Utiliser ce format) ;
  tout le reste vit dans le menu `…`. Six boutons par carte, c'était la page d'avant.
- Les libellés sont courts : un sous-titre de deux mots, un vide en deux lignes.
  Le mur de couvertures est le contenu, le texte n'est que de la signalétique.

## Comptes warmés — page verrouillée
`components/studio/ComingSoon.tsx` + `coming-soon.css`, branché par
`WarmedAccountsLocked` (`views/MoreViews.tsx`) sur `/app/warmed-accounts`.
- Le catalogue reste rendu, **flouté et `inert`** (clavier, souris et lecteur
  d'écran coupés d'un coup), sous une carte de verre « bientôt disponible ».
- `.ss-soon` fait exactement la hauteur visible et coupe le débordement : une page
  verrouillée n'a rien à faire défiler.
- Rouvrir la page = rendre `WarmedAccountsView` directement depuis la route et
  retirer `locked: true` de `lib/studio-nav.ts`. Rien n'a été supprimé côté API.

## Onboarding et profil business
Après inscription (email ou Google) tout le monde passe par `/onboarding` :
prénom + entreprise + logo, puis lien du business analysé côté serveur par
`lib/business-analyzer.ts` (site, Shopify, App Store, Play Store, profil
TikTok ; enrichi par le fournisseur de métriques quand `METRICS_API_KEY` est
là), puis branchement
Claude / Cursor / Codex, puis « comment tu nous as connu ». Pas de question
objectif ni rythme : par défaut `goal = "sell"` et `cadence = "daily"`.
- Le résultat vit dans `User.business` (`BusinessProfile`) et est exposé au
  MCP via `whoami`. Toute génération de contenu doit s'appuyer dessus.
- Le flag `onboarded` est dans le JWT de session ; `app/app/layout.tsx`
  redirige vers l'onboarding s'il manque. Refaire passer un utilisateur par
  l'onboarding = lien `/onboarding?next=…` (les réglages > Compte l'ont).
- Le skill agent vit dans `.cursor/skills/scrollshow/SKILL.md` et est servi tel quel
  en `public/skill.md` (l'onboarding le fait installer dans `~/.claude/skills`).
  Modifier l'un = recopier l'autre.
- Métriques publiques : clé serveur unique `METRICS_API_KEY` + `METRICS_API_BASE`
  (jamais côté client), partagées par tous les utilisateurs ; sans elles tout se
  dégrade proprement (stats TikTok basiques, pas de vues moyennes ni de check
  shadowban). Ne jamais nommer le fournisseur dans le code, l'UI ou la doc.
- L'analyseur n'utilise aucun LLM : métadonnées, signaux concrets, réseaux
  détectés. Ne pas ajouter d'appel IA côté serveur sans clé dédiée.

## Dev local
Le serveur de dev tourne souvent déjà sur le port 3000 depuis une autre
session (même dossier, hot reload) : ouvrir `http://localhost:3000` dans le
Chrome de l'utilisateur, qui est déjà connecté (compte « Dev Local »), plutôt
que de relancer un serveur ou tenter de se connecter.

## Provenance des chiffres — non négociable
Un compteur affiché doit avoir été **mesuré**, jamais reçu d'un appelant.
- `POST /api/accounts` et `PATCH /api/accounts/[id]` n'acceptent que des
  annotations (`niche`, `verdict`, `notes`). `followers`, `posts` et `avgViews`
  sont mesurés côté serveur sur le profil public. Ne jamais les rouvrir : un
  agent MCP y a écrit 966 600 abonnés sur un compte qui en a 2 372.
- `fetchTikTokProfile` renvoie `null` (jamais `0`) pour un compteur absent de la
  page. Tout appelant doit distinguer les deux : `?? ` ne rattrape pas `0`, donc
  un zéro inventé se propage comme une mesure et fausse les filtres.
- Un compte de bibliothèque est **re-mesuré à chaque synchronisation**
  (`account-sync.ts`) : sans cela un chiffre faux reste à vie.
- L'avatar et les abonnés d'un candidat viennent de la réponse de recherche
  (`authorAvatar` dans `research/normalize.ts`), pas du scrape de profil qui
  échoue souvent. Ne pas refaire dépendre l'affichage de ce scrape.

## Shadowban — une baisse n'est jamais une preuve
`lib/shadowban.ts` (verdict) + `lib/shadowban-rounds.ts` (histogramme R0–R4) +
`lib/shadowban-check.ts` + `components/studio/views/Shadowban*.tsx`.
Tests : `tests/shadowban.test.ts`, dont un fixture réel (@ladyycinnamon, 33 posts,
de 1 040 à 1 360 142 vues) qui doit rester « Aucun risque ».
- Les vues TikTok sont **log-normales** et un compte ordinaire varie d'un facteur
  5 à 7 d'un post à l'autre. Comparer la médiane récente à la médiane globale en
  pourcentage ne veut donc rien dire : l'ancien moteur criait « Shadowban » à
  −70 %, et annonçait un bridage à une créatrice dont les 4 derniers posts
  faisaient 1 400 vues après un post à 1,3 M.
- Toute comparaison se fait **en log, à l'échelle du compte** : `zScore` =
  (ln médiane récente − ln médiane de référence) / écart-type robuste (MAD × 1,4826)
  mesuré sur la fenêtre de référence. Plancher `MIN_LOG_SPREAD` à 0,35 pour qu'un
  compte anormalement régulier ne transforme pas ±40 % en z infini.
- **Une baisse relative seule ne peut jamais donner « Shadowban »**. Il faut deux
  signaux durs, dont au moins un absolu : posts à 0 vue (`never_seeded`), posts
  récents sous le plancher de diffusion (`stuck_in_seed`), portée sous 3 % des
  abonnés (`below_follower_reach`), effondrement de ≥ 2,5 σ **et** sous le
  10ᵉ centile historique (`reach_collapse`). Un seul signal = « À surveiller ».
- Plancher de diffusion = `max(200, min(1000, 2 % des abonnés))` : 200 vues est le
  lot de test dont un post n'est jamais sorti, un fait absolu et non une comparaison.
  Abonnés inconnus (0/`null`) = plancher à 200 et signaux « abonnés » désactivés,
  jamais un ratio calculé sur zéro.
- Les posts de moins de 48 h sont **exclus** du verdict (`freshCount`) : les vues
  montent encore. Minimum 5 posts mûrs, référence d'au moins 5 posts.
- Aucun panneau ne doit contredire le verdict : `ShadowbanRounds` reçoit `verdict`
  et ne dit plus « Distribution saine / rien n'indique un bridage » sous un
  verdict Shadowban. C'est cette contradiction qui a fait perdre confiance dans la page.
- Les graphes (détail et sparkline) sont en **échelle log** : sur une échelle
  linéaire un seul post viral écrase les trente autres. La bande grise est la zone
  normale du compte (médiane ± 1 σ) — une barre dedans n'est pas un signal.

## Moteur de recherche
`lib/research/` (modèle, jobs, provider, normalisation, statistiques, OCR, formats,
schéma collecteur) + routes `app/api/research/{route,jobs,studies,collector}` et
`app/api/cron/research`. UI : `components/studio/ResearchView.tsx` + `research.css`.
Doc de référence : `docs/research-engine-2026-09-09.md`.
- Une tâche avance **par étapes**, chacune sous bail exclusif de 180 s : une réponse
  tardive ne doit jamais écraser une pause ou une reprise. Garder cet invariant.
- Distinguer toujours « valeur inconnue » et « zéro » dans les compteurs ; les
  statistiques ne portent que sur les posts aux compteurs connus.
- Bornes par défaut (10 comptes retenus, 3 pages/compte, 2 pages de recherche par
  mot-clé, 30 jours) et plafonds durs : ne pas les relever sans mesurer le coût
  fournisseur. Garde-fou global : `RESEARCH_PROVIDER_DAILY_LIMIT`.
- Un compte rejeté conserve son motif explicite : ne jamais masquer la sélection.
- `minFollowers` vaut **2000 par défaut**, côté serveur comme dans l'UI.
- La couverture distingue quatre arrêts : `profile_end` (tout lu),
  `window_covered` (fenêtre couverte), `page_limit`, `collecting`. Ne pas les
  reconfondre : « période couverte » ne veut pas dire « compte lu en entier ».
- Toute statistique sauf les abonnés ne vaut que pour la fenêtre demandée.
  L'afficher sans nommer la période est un bug (le palmarès en a souffert).
- Le cron recherche tourne **toutes les cinq minutes via GitHub Actions**
  (`.github/workflows/publish-scheduled.yml`, job `research`), pas via `vercel.json` :
  Vercel Hobby refuse cette fréquence.
- **Le mur d'une recherche = les carrousels du mot-clé**, pas les meilleurs posts
  des comptes trouvés. Les posts ramenés par `searchPhotos` sont conservés, fusionnés
  dans `Account.videos` même s'ils sont au-delà des pages lues, et marqués
  (`AccountVideo.matchedKeywords`). Ils étaient effacés (`c.posts=[]`) au profit du
  feed complet : « sleepmaxing » rendait alors le meilleur carrousel du compte, sur
  un tout autre sujet. Les marques déjà posées sont relues avant chaque fusion,
  sinon une nouvelle mesure les effacerait.
- Les cartes « en attente » passent le **même** filtre que le mur (`keepForWall`).
  Sans ça elles affichaient des posts à 500 vues sous un filtre 100k+, qui
  disparaissaient à la mesure : c'est ce clignotement qu'on ne veut plus.
- Paliers de vues : `[0, 1k, 5k, 10k, 25k, 50k, 100k, 500k, 1M]`, défaut **10k**.
  100k combiné à 30 jours ne laissait presque rien passer.
- L'UI (`ResearchView.tsx`) est une page unique : une seule saisie (mots-clés,
  ou `@compte` pour analyser), réglages repliés, bandeau vivant par recherche en
  cours (étape courante via `publicJob().current`, compteurs, barre animée), et
  les comptes arrivent **au fur et à mesure** — candidats trouvés en carte
  « mesure en attente » (`publicJob().pending`), puis carte mesurée avec ses
  meilleurs carrousels. Sondage 2,5 s + `advance` toutes les 3 s pendant une
  recherche, 20 s au repos. Ne pas revenir à un affichage de fin de tâche.
- Le collecteur Chrome est optionnel et local (`SCROLLSHOW_COLLECTOR_TOKEN`,
  `scripts/research-browser.ts`) ; ce jeton ne doit jamais atteindre le navigateur client.

## Recherche de texte dans les slides
`lib/publication-text*.ts` + `app/api/studio/insights/text` +
`components/studio/PublicationTextSearch.tsx`. OCR local (tesseract, `eng` + `fra`).
Toute route qui fait de l'OCR doit être ajoutée à `outputFileTracingIncludes` dans
`next.config.ts`, sinon le binaire manque en production.

## Store : lire par tranches, jamais tout
`lib/store.ts`. Le store est **un seul document JSONB** : `readStore()` le
transfère **en entier** à chaque appel. Mesuré à 7,9 Mo, dont 98 % de caches
`videos` dans `accounts`/`channels` et de `researchJobs` — transférés même pour
un sondage du studio. C'est ce qui a épuisé le quota de transfert Neon le
10 septembre 2026 et mis la production hors service (Postgres `53000`, toute
route touchant la base en 500).
- Pour une lecture, utiliser `readStoreSlice(["posts", ...])` : seules les
  collections demandées (plus `users` et `projects`) sont transférées, sans les
  caches `videos` sauf `{ videos: true }`. `/api/studio` passe de 7,9 Mo à
  132 Ko, `/api/auth/login` à 14 Ko.
- Une tranche est en **lecture seule** : la réécrire effacerait les collections
  absentes. Toute écriture passe par `updateStore`, qui lit tout.
- Lire une collection non demandée **lève** (`store_slice_missing_*`) : une
  liste vide silencieuse donnerait un calendrier vide sans erreur visible.
- `consumeLimit` (`lib/rate-limit.ts`) fait son incrément **dans Postgres** et ne
  rapatrie qu'un entier. Il était le pire poste : `updateStore` complet (lecture
  *et* écriture, ≈16 Mo) à chaque appel, sur des routes très sollicitées —
  `/api/studio/tiktok/cover`, plafonnée à 600 appels / 10 min, faisait passer des
  centaines de Mo pour incrémenter un nombre. Le chemin SQL retombe sur
  `updateStore` en cas d'échec : un compteur cassé ne doit pas fermer le site.
- Déjà passés en tranches : `/api/studio`, `/api/auth/login`, `lib/insights.ts`,
  `lib/account-sync.ts`. Toute nouvelle route sollicitée doit faire pareil.

## Performance — ce qui rendait tout lent (audit du 18 septembre 2026)
Détail et mesures : `docs/audit-performance-2026-09-18.md`. Tests : `tests/perf-regressions.test.ts`,
`tests/metrics-blocked.test.ts`. À ne pas défaire :
- **Le store se lit à travers un cache indexé sur sa version** (`lib/store.ts`) : `xmin` de la
  ligne en base, date + taille du fichier en local. `readSession` ouvre chaque requête ;
  sans ce cache chaque vignette relisait et re-décodait 8 à 13 Mo. Le cache garde du
  **texte**, jamais un objet : chaque appelant reçoit sa copie. Toute nouvelle requête SQL de
  lecture doit rendre `xmin::text` et passer par `cacheGet`/`cachePut`.
- **Les compteurs de débit vivent dans leur table** `scrollshow_rate_limits` (créée à la
  volée), en mémoire hors base. Ne jamais remettre un compteur dans le document JSONB :
  `jsonb_set` réécrit la valeur TOAST entière et verrouille la ligne que tout le site lit.
- **Une vignette est redimensionnée** : `coverSrc(url, largeurCSS)` → le proxy rend du WebP à
  une largeur de `COVER_WIDTHS`, cache mémoire borné, clé = chemin CDN sans signature.
  Écrire `<img src={url}>` ou `coverSrc(url)` sans largeur retélécharge la slide 1080 px.
- **Un avatar TikTok se demande par handle** : `avatarSrc` / `rowAvatarSrc` →
  `/api/studio/tiktok/avatar`. Les URL d'avatar sont signées et meurent en ~48 h (63 sur 89
  étaient expirées : les photos de profil ne « chargeaient pas », elles n'existaient plus).
  La réparation (relecture du profil public) se fait **en arrière-plan**, jamais pendant la
  requête de l'image.
- **Une requête d'image ne doit jamais attendre un tiers lent.** En HTTP/1.1 le navigateur
  n'ouvre que six connexions par hôte : trente images en attente bloquent toutes les
  requêtes de données de la page. Même règle pour les lots : la page Shadowban file ses
  analyses par quatre (`analysisSlot`), elle n'en lance plus 72 d'un coup.
- **Ouvrir un compte ne lit que SES vidéos** : `readRowVideos(collection, id)`.
  `/api/accounts` ne renvoie jamais `videos` (5,1 Mo → 95 Ko).
- **Fournisseur de métriques `BLOCKED`** (crédit épuisé) = échec immédiat + disjoncteur de
  trois minutes (`lib/metrics.ts`). Il n'était pas reconnu comme état final : 40 s d'attente
  puis « timeout » sur chaque synchro, analyse et recherche. Si tout « tourne dans le vide »,
  regarder d'abord le log `metrics_provider_blocked` et le solde du portefeuille.
- **Couvertures expirées ⇒ relecture depuis le début** (`AccountPanel`, `signedUrlExpired`) :
  reprendre au curseur ne rafraîchit jamais les premières pages.
- **Dev : toujours `npm run dev*`**, jamais `next dev` nu. `scripts/dev.mjs` comble un trou de
  Next 15.5 + Turbopack (`scripts/dev-manifests.mjs`) : sans le
  `react-loadable-manifest.json` d'un route handler, Next dev réessaie 3 × 100 ms — +200 ms
  sur **chaque** appel API et chaque image (240 ms → 24 ms). La production n'est pas touchée.
- `img-fx` tire three.js (~150 Ko) : import **dynamique** uniquement (`/app/home` 317 → 164 Ko).
- `readSession` lit **un** utilisateur (`readUserScope`), jamais `readStoreSlice([])` : à mille
  comptes c'était 1,6 Mo par requête.
- Un cache partagé entre utilisateurs ne reçoit **jamais** une valeur fournie par le navigateur
  (l'indice `url` de la route d'avatar ne sert que hors bibliothèque et n'est pas mis en cache).
- Listes longues : pas de `backdrop-filter` par ligne, pas de `will-change` par enfant, dossiers
  lointains de l'éventail réduits à une silhouette (`DETAIL_REACH`), composants de liste en `memo`.
- **La limite restante est le store en document unique** : quelques centaines d'utilisateurs, pas
  des milliers. Plan de migration dans `docs/audit-performance-2026-09-18.md`.

## Gestion des comptes (Overview → « Gérer »)
`lib/account-manage.ts` (logique pure, testée) + `app/api/studio/accounts/manage` +
`components/studio/AccountsManager.tsx` + `accounts-manager.css` (namespace `.ss-am`).
- Les pastilles « Comptes (n) / Abonnés / Likes / Posts » en haut à gauche de l'Overview ont
  été **retirées** à la demande d'Amine : ne pas les remettre. Le tri vit dans le gestionnaire.
- Deux gestes distincts : **masquer** (`hidden`, réversible, rien n'est effacé) et **supprimer**
  (ligne + cache de vidéos effacés ; jeton révoqué chez la plateforme pour un compte connecté,
  hors verrou du store). Les posts du calendrier ne sont jamais supprimés.
- Un compte masqué n'apparaît **nulle part** sauf dans le gestionnaire : `ownedChannels` et
  `GET /api/accounts` le filtrent (Overview, calendrier, composeur, agent). Un compte connecté
  masqué continue d'éclipser son doublon suivi.
- Une action = **une** écriture pour tout le lot (`updateStoreSlice`, 500 clés max). La suppression
  de dix comptes ou d'un compte connecté exige de recopier SUPPRIMER.
- Le gestionnaire est chargé en `dynamic()` et monté en portal : il reste hors du chemin critique.

## Appels payants au fournisseur — garde-fous
`lib/metrics-guard.ts` (tests : `tests/metrics-guard.test.ts`), comparatif et modèle de coût :
`docs/couts-fournisseur-2026-09-18.md`.
- Tout appel payant passe par `cachedProviderCall` : **cache partagé entre utilisateurs**, par
  requête (compte + curseur, mot-clé + page + session). On met en cache le résultat normalisé.
- Tout point d'entrée enveloppe son travail dans `withMetricsUser({ userId })` : sans lui, pas de
  budget par utilisateur (`METRICS_USER_DAILY_LIMIT`, 120) ni de ligne dans le registre d'usage.
- **Jamais de boucle « tant qu'il reste des pages » déclenchée par un affichage.** L'Overview lit
  2 pages en automatique, 6 par clic. Ouvrir @nike aspirait tout l'historique, page payante
  après page payante.
- Avec postgres.js, un objet JSON s'insère par `sql.json(valeur)`, jamais `${texte}::jsonb` (la
  colonne recevrait une chaîne JSON).
- Les API officielles TikTok ne donnent que les vidéos du compte **connecté** : elles ne peuvent
  pas remplacer le fournisseur pour des comptes tiers ni pour la recherche.

## Build et vérification
`npm run typecheck`, `npm test` (207 tests), puis build isolé
`SCROLLSHOW_BUILD_DIR=.next-verify npx next build` — jamais `npm run build` nu
pendant qu'un `next dev` tourne, il écrase `.next`.

## Overview avec beaucoup de comptes
`components/studio/AccountsFan.tsx` : l'espacement de l'éventail sature
(`spread()` = tanh + résidu), et `paint()` met à l'échelle sur la **largeur** de
la scène autant que sur sa hauteur (`fanExtent`), donc 20 ou 200 comptes tiennent
toujours dans le cadre. Au-delà de 6 comptes, une recherche, une vue « Liste » et
un compteur « i / n » apparaissent. Les avatars passent par `coverSrc()`.

## Projets (multi-business)
`lib/projects.ts` (logique pure, testée) + `lib/project-context.ts` (cookie
`ss_project`) + `app/api/projects` + `components/studio/ProjectSwitcher.tsx`
(haut de la sidebar, menu en portal) + `components/studio/ProjectSettings.tsx`
(Réglages > Projet).
- **Un projet = un business** : il possède `channels`, `posts`, `media`, `runs`,
  `accounts`, `apiKeys`, `researchJobs`, `formatStudies`. Le compte garde
  facturation, réglages, clippers, notifications push, commandes warmées.
- **Scope** : toute lecture d'une collection possédée passe par
  `inScope(row, user)` (jamais `row.userId === user.id` seul) ; toute création
  stampe `projectId: user.projectId`. `user.projectId` vient de la session
  (cookie validé en base) ou de la clé API (une clé = un projet).
- **Migration paresseuse** dans `normalize()` du store : `backfillProjects`
  crée `prj_<userId>_1` (id déterministe, donc stable entre une lecture sans
  écriture et l'écriture suivante) et y rattache tout le contenu sans
  `projectId`. Une ligne sans `projectId` reste visible dans tous les projets
  plutôt que de disparaître.
- **Nouveau projet = onboarding dédié** `/onboarding?project=new` (lien →
  analyse → nom/logo → TikTok facultatif → fin). Le brouillon est créé à
  l'étape business, **n'est pas actif** tant que `completedAt` manque, et se
  reprend via `/onboarding?project=<id>` (sélecteur : « Configuration à
  terminer »). Les étapes IA et « comment tu nous as connu » sont au niveau
  du compte et ne se rejouent pas.
- **Business lu depuis le projet** (`withProject` → `user.business`,
  `agentWhoami`, `contentBrief`). `User.business` n'est plus qu'une copie
  historique : ne pas y ajouter de lecteur.
- « Premier compte TikTok » (`loadTikTokChannel` sans id) = premier compte
  **du projet** : toujours passer `projectId`. Un même compte TikTok peut être
  lié dans deux projets (dédup par projet).
- Archiver ne supprime rien ; le dernier projet ne s'archive pas.

## Raccourci iOS (Partager → ScrollShow)
`scripts/build-ios-shortcut.py` génère et signe (`shortcuts sign --mode anyone`,
macOS) `public/ScrollShow.shortcut` : question d'import = clé API, puis
`POST /api/v1/library { url }` (lien profil, vidéo, lien court ou @handle),
notification avec `message`. Logique partagée avec `/api/accounts` dans
`lib/library-add.ts` (testé). Tout changement d'endpoint = regénérer le fichier.

## RevenueCat (revenus ScrollShow)
`lib/revenuecat.ts` + branchement dans `app/api/stripe/webhook/route.ts` +
`scripts/revenuecat-backfill.ts` (testé dans `tests/revenuecat.test.ts`).
ScrollShow encaisse avec son **propre** Stripe Checkout, donc hors des flux
d'achat RevenueCat : un abonnement n'existe pour RevenueCat que s'il lui est
déclaré une fois (`POST /v1/receipts`, `X-Platform: stripe`,
`{ app_user_id, fetch_token }`). Ensuite RevenueCat le suit seul —
renouvellements, résiliations, remboursements — sans appel par événement.
- La clé est `REVENUECAT_STRIPE_PUBLIC_KEY`, la clé **publique** de l'app Stripe
  du projet RevenueCat, pas une clé secrète v2. Elle reste côté serveur. Sans
  elle l'intégration est inactive et la facturation Stripe marche normalement :
  ne jamais faire dépendre un encaissement de RevenueCat.
- `app_user_id` = l'identifiant du compte **ScrollShow**, jamais l'identifiant
  client Stripe (qui change si le client est recréé, et donnerait deux clients
  RevenueCat pour une personne). Sans compte identifiable on ne déclare rien :
  un achat rattaché au mauvais compte lui donnerait des droits.
- `fetch_token` = l'identifiant d'abonnement (`sub_…`) ou, pour l'offre à vie,
  celui de la session de paiement (`cs_…`) — jamais celui d'une session
  d'abonnement.
- On re-déclare à **chaque** événement d'abonnement, pas seulement à la
  création : re-déclarer rafraîchit sans dupliquer, et c'est le seul moyen de ne
  pas attendre les deux heures que met une résiliation Stripe à remonter.
- La déclaration se fait hors du verrou du store et ne peut pas faire échouer le
  webhook : un 500 serait rejoué par Stripe et refera le travail déjà fait sans
  réparer RevenueCat. La trace `revenuecat_declare_failed` est le rattrapage.
- Les abonnés antérieurs au branchement ne remontent pas seuls :
  `npm run revenuecat:backfill` (à blanc) puis `-- --apply`.
- ScrollShow facture depuis son propre compte Stripe `Scrollshow`
  (`acct_1UE4ENQSj8XJlvHm`, organisation `Process`), lu par le seul projet
  RevenueCat `ScrollShow` (`0d6bdeb6`, config `app68f82b22c2`, entitlement
  `studio`, offering `default`). Identifiants de prix, webhook et bascule des
  variables : `docs/revenuecat-2026-09-10.md` et
  `scripts/switch-stripe-account.sh`.
- Les prix et la clé secrète Stripe changent **ensemble** : un prix du nouveau
  compte avec la clé de l'ancien fait échouer `prices.retrieve` et le checkout
  répond `billing_price_mismatch` à tous les acheteurs.
