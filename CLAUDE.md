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

**Exception : la sidebar du studio (`.ss-sidebar`) est un rail opaque noir**
(`--ss-side-bg: #000`) **dans les deux thèmes**, à la demande d'Amine : les jetons
sombres sont re-posés sur `.ss-sidebar` dans `liquid-glass.css`. Rail étroit de
88 px (`--ss-sidebar`), icône au-dessus du libellé, entrées espacées ; projet et
profil réduits à leur pastille. Le tiroir mobile garde la liste en lignes.
États via `--ss-side-hover` / `--ss-side-active` (`color-mix` sur `--ss-ink`).
La page est un **panneau aux angles gauches arrondis** (`--ss-page-radius`) posé
sur ce noir : `.ss-main` porte la trame de points et un filet clair ;
sur le calendrier c'est `.ss-channels` qui porte les angles.
L'entrée active suit **le clic** (`useOptimistic` + `router.push` dans une
transition, `StudioShell`), pas `pathname` qui n'arrive qu'à la fin du chargement.

**Fond de toutes les pages** : l'atmosphère bleue de la landing, à l'identique
(`components/HeroAtmosphere.tsx` + `app/atmosphere.css` — à ne pas confondre avec
`components/Atmosphere.tsx`, la couche fixe de l'inscription et de l'onboarding —
partagés par `Landing` et
`StudioShell` — la modifier change les deux), sous la trame de points de
l'Overview (`.ss-main::after`). Amine a refusé une lueur verte : ne pas y revenir.
Animée en `transform`/`opacity` seulement ; ne jamais animer un dégradé ou un
`background-position` (repaint de toute la page). Sombre uniquement : en thème
clair il ne reste que les points. Une page ne doit pas peindre de fond opaque
plein cadre par-dessus.

**Inspiration = Recherche + Bibliothèque** : une seule entrée de menu
(`/app/discover`), deux onglets `.ss-insp-tabs` rendus par le shell
(`INSPIRATION_TABS`, `onInspiration` dans `lib/studio-nav.ts`). Les deux routes
restent telles quelles ; c'est l'entrée Inspiration qui reçoit le glisser-déposer
d'un carrousel. La page Résultats (`/app/analytics`) a été supprimée : ne pas la remettre.

**Menu réduit à six entrées** : Overview, Calendrier, Inspiration, Outils, puis
Comptes et Réglages en bas. **Outils** (`/app/tools`, `views/ToolsView.tsx` +
`tools.css`) est une page de cartes opaques vers Poster aux US, Shadowban et
Comptes warmés (`STUDIO_TOOLS`) ; leurs routes ne changent pas et n'ont pas
d'onglets (post-us et la page verrouillée tiennent sur un écran exact).
**Revenus, Agents et Comptes suivis sont des onglets des Réglages**
(`?tab=revenue|agents|tracked`, vues chargées en `dynamic()`) ;
`/app/business-connections`, `/app/mcp` et `/app/clippers` y redirigent en
conservant la query — les retours OAuth Shopify en dépendent, ne pas les supprimer.

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
- **Le panneau ouvert est une seule vue** : les onglets Aperçu / Publications /
  Formats, la vue Liste, la ligne de statut, le bouton Calendrier et les libellés
  TYPE / TRI / AFFICHAGE ont été supprimés à la demande d'Amine (« trois
  interfaces, on ne comprend rien ») — ne pas les remettre. Il reste : une rangée
  de commandes en verre (champ de recherche de texte, période, **Filtres**,
  Actualiser / Charger plus avec sa pastille d'état, lien TikTok), sept chiffres
  sans cadre (`.ss-acc__kpis`, calculés sur les posts **filtrés**), puis le mur.
  Tri, type, vues min., engagement min., performance (top 50 % / top 10 %) et
  portée de la recherche vivent tous dans le menu « Filtres ». La progression de la
  lecture OCR ne s'affiche que pendant une recherche de texte.
- Logique des filtres pure et testée dans `lib/account-filters.ts` : un compteur
  inconnu ne passe aucun filtre de vues et sort des moyennes (jamais compté comme
  zéro). Tout est local : aucun filtre ne déclenche d'appel payant.
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
- **Pas de bandeau** : ni titre « Recherche », ni compteur « X carrousels · X
  comptes », ni fond derrière le champ (retirés à la demande d'Amine). Les onglets
  Inspiration sont centrés, le champ centré dessous (680 px max), l'historique
  centré dessous. La barre **défile avec la page** : sans fond, une barre collante
  laisserait le mur passer sous les pastilles.
- **Aucun filtre** : le menu Filtres (vues min/max, période, histogramme) a été
  supprimé à la demande d'Amine, ne pas le remettre. Le mur montre tout ce que la
  recherche a trouvé. Un **tri** (`.ss-rs__sort` : vues, likes, commentaires,
  partages, récents) n'apparaît qu'une fois la recherche **terminée** — trier un
  mur qui se remplit ferait sauter les tuiles.
- **La recherche « photos » du fournisseur échoue pour certains mots-clés** : 400
  sur tout ce qui contient looksmax, healthmaxing, mewing, alors que softmaxxing,
  jawline, glow up rendent 20 carrousels par page au même instant (mesuré le
  18 septembre 2026). TikTok **connecté** sert des centaines de résultats pour ces
  mots. **Cause mesurée en navigateur anonyme** : TikTok rend bien douze carrousels
  pour ces mots, mais avec un `status_code` non nul (403 pour looksmax, 203 pour
  mewing, 0 pour jawline) ; le fournisseur prend ce code pour un échec et jette des
  résultats valides. Ce n'est ni une restriction TikTok ni un besoin de connexion
  (explications données d'abord, fausses). `parseSearch` avait le même défaut, corrigé :
  un code non nul n'est un refus que si la liste est vide. Ticket de support prêt dans
  `docs/recherche-session-service-2026-09-18.md`. C'est donc la collecte du fournisseur qui casse (ses autres recherches
  web échouent pareil ; la forme `#mot` répond 200 mais vide). Ce n'est pas un bug du
  moteur ScrollShow, et aucun repli anonyme ne donne de volume : hashtags = 2 à 4
  carrousels, recherche générale de l'application = 7 uniques (elle **répète** les
  mêmes posts à chaque page). `searchPhotos` réessaie une fois puis se replie sur
  `searchPhotosInApp`, qui s'arrête dès qu'une page n'apporte rien de neuf.
  Les API officielles TikTok (comptes connectés par OAuth) n'ont **aucune** recherche :
  on ne peut pas « chercher via le compte connecté ». Le seul chemin connecté est le
  collecteur Chrome local (`npm run research:browser`), qui lit tiktok.com dans un
  profil Chrome dédié où l'utilisateur s'est connecté lui-même.
  **Solution pour tous les utilisateurs** : `TIKTOK_SEARCH_COOKIE`, session d'un compte
  TikTok **dédié**, envoyée au fournisseur seulement quand l'anonyme échoue (préfixe
  `ck:` dans `searchId` pour les pages suivantes ; jamais en cache ni en log).
  Procédure et risques : `docs/recherche-session-service-2026-09-18.md`. Session
  expirée = trace `research_search_cookie_failed` et retour au repli.
  Avant de déboguer un zéro résultat, tester le mot-clé directement chez le fournisseur.
- **Extension Chrome = le chemin principal de la recherche par mots-clés**
  (`extension/`, `docs/extension-recherche-2026-09-19.md`) : comme scroll.show, la
  recherche tourne dans le TikTok **connecté** de l'utilisateur — volume réel sur tous
  les mots-clés, zéro appel payé. La page détecte l'extension par `window.postMessage`
  (`bridge.js`), crée la recherche en `source: "browser"`, et l'extension rend les pages
  **brutes** à `POST /api/research/collector` (`complete_raw`, session ou clé API) ; la
  normalisation reste serveur (`parseSearch`). Sans extension : collecte serveur + ligne
  d'invitation vers `/extension`. Les scripts TikTok sont inertes hors d'une fenêtre
  marquée `#scrollshow-collect` ; captcha et connexion sont signalés, jamais contournés.
  Tout changement de `extension/` = `npm run extension:build` (régénère
  `public/scrollshow-extension.zip`) **et** une nouvelle version sur le Store.
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

## Connexion TikTok (OAuth) — `state` signé
`lib/oauth-state.ts` (testé) + `app/api/tiktok/oauth/start` + `app/tiktok/callback`.
Le `state` porte sa propre preuve : compte ScrollShow, aléa, expiration 30 min,
HMAC `AUTH_SECRET`. Le retour vérifie la signature **et** que le compte du `state`
est celui de la session (c'est la garantie anti-CSRF). Ne pas revenir à un simple
cookie comparé : il expirait en dix minutes — connecter un *nouveau* compte
(déconnexion TikTok, reconnexion, code SMS) dépasse souvent ce délai — et un
second clic sur « Connecter » l'écrasait ; les deux donnaient « Connexion TikTok
interrompue » (`state_mismatch`). Un rejet est tracé `tiktok_oauth_state_rejected`
avec son verdict (`expired`, `other_user`, `bad_signature`, `malformed`).

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
Refonte du mur et incident de livraison : `docs/research-search-2026-09-14.md`.
- Le Studio passe par `startStudioResearch` : recherche directe de **photos**,
  deux pages, aucun filtre implicite, aucun parcours des auteurs. Les filtres
  min/max vues et dates sont locaux. L'analyse explicite `@compte` conserve
  le mode comptes ; les valeurs historiques ci-dessous ne concernent que lui.
- `readResearchJobs(user, id)` filtre côté SQL avant transfert. Ne pas revenir
  à une lecture de toute la collection pour les sondages d'un seul job.
- Le cache réutilise une recherche en cours ou terminée depuis moins de 15 min.
  Actualiser contourne le cache terminé, jamais le verrou d'une tâche en cours.
- Photos : délai 25 s/page, budget 60 s. Une pause/reprise garde les résultats et
  réinitialise explicitement le début de tentative. Les anciens jobs sans mode
  doivent être relancés via le Studio, pas repris par le cron des auteurs.
- Une livraison doit être committée et intégrée dans `main`. Un snapshot CLI
  non commité a été écrasé par le déploiement Git suivant le 13 septembre.
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

## Store : une ligne par enregistrement, portée par utilisateur
`lib/store-rows.ts` (moteur) + `lib/store.ts` (aiguillage, API inchangée) + `scripts/migrate-to-rows.ts`
(`npm run db:rows`) + `scripts/test-store-rows.mts` (test différentiel et de concurrence sur un vrai
Postgres). Runbook : `docs/migration-store-lignes-2026-09-18.md`.
- Dès que `scrollshow_rows` existe, tout passe par le moteur lignes ; le document `scrollshow_state`
  n'est plus lu. La bascule est atomique et **vérifiée** avant commit ; retour arrière : `--back`.
- **Toute lecture ou écriture sur un chemin sollicité porte un `userId`** :
  `readStoreSlice(keys, { userId })`, `updateStoreSlice(keys, fn, { userId })`. Sans lui la
  collection entière est lue et verrouillée — réservé au cron, aux webhooks, à la sauvegarde, à la
  suppression de compte. Une écriture portée qui touche la ligne d'un autre lève
  `store_scope_violation_*` ; une valeur globale (`operations`, `rateLimits`, `mediaDeletionQueue`,
  `videoStats`…) ne se modifie que sans portée (`store_scope_unsupported_*`). Les moteurs fichier et
  document appliquent la **même** sémantique : les tests attrapent une portée mal posée.
- Recherches par valeur : `findStoreRows("apiKeys", "hash", h)`, `findStoreRows("users", "email", e)`
  (index partiels). Ne jamais relire toute une collection pour trouver une ligne.
- L'ordre n'a de sens qu'**au sein d'un utilisateur** (`channels[0]` = son premier compte) ;
  l'entrelacement entre utilisateurs est arbitraire.
- `safeJson` : Postgres refuse un demi-caractère (emoji coupé par un `slice`) et le caractère nul ;
  le moteur nettoie. Ne jamais insérer `${texte}::jsonb` avec postgres.js (double encodage).
- Modules qui écrivent leur propre SQL contre le store : `lib/research/storage.ts` et le repli de
  `lib/rate-limit.ts` testent `usingRowsEngine()`. Tout nouveau SQL direct doit faire pareil.

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
- Le document unique était la limite (quelques centaines d'utilisateurs) : le moteur lignes la lève,
  voir la section « Store : une ligne par enregistrement ».

## À qui est un compte : connecté, suivi, ou trouvé par la Recherche
`lib/account-origin.ts` (tests : `tests/account-origin.test.ts`). La collection `accounts` mélangeait
deux choses : les comptes **suivis exprès** (formulaire, raccourci iOS) et les **concurrents trouvés
par le moteur de Recherche**. Chaque recherche ajoutait donc ses comptes à l'Overview, au calendrier,
au composeur et à l'agent : 94 des 99 « comptes » d'Amine venaient de « sleepmaxing », « football »…
- `Account.origin` : `"research"` (posé par `lib/research/jobs.ts` et `lib/research.ts`) ou `"manual"`
  (`lib/library-add.ts`). Suivre exprès un compte déjà trouvé le repasse en `manual`.
- **Partout où l'on montre « les comptes de l'utilisateur », filtrer par `isFollowedAccount`** :
  `ownedChannels` (Overview, calendrier, composeur, agent), `GET /api/accounts` (Overview, Shadowban,
  Comptes suivis), part du réseau des insights, analyse Shadowban en lot. Seuls la page Recherche
  (`researchLibrary`) et le gestionnaire (onglet « Recherche », pour purger) voient les autres.
- Données antérieures : `backfillAccountOrigins` (couverture de recherche, ou `niche` = mot-clé d'une
  recherche du même utilisateur). Local : `scripts/backfill-account-origin.ts --apply` ; production :
  route d'admin `{"action":"origins"}`.
- L'éventail trie les comptes **connectés d'abord**.

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
  budget par utilisateur ni de ligne dans le registre d'usage. Budget **par offre** : mensuel 120,
  annuel 80, à vie 40 appels payés/jour (`METRICS_*_DAILY_LIMIT`), plus 1 500/mois ; un email
  d'alerte par jour au-delà de `METRICS_ALERT_DAILY_CALLS` (500) vers `OPS_ALERT_EMAIL`.
- **Mode direct actif** (`METRICS_API_MODE=direct`, base `https://api.tikhub.io`) : un GET **sans**
  `Content-Type` (la source répond 400 sinon). Une page = ~33 posts, pas 50.
- **Jamais de boucle « tant qu'il reste des pages » déclenchée par un affichage.** L'Overview lit
  2 pages en automatique, 6 par clic. Ouvrir @nike aspirait tout l'historique, page payante
  après page payante.
- Avec postgres.js, un objet JSON s'insère par `sql.json(valeur)`, jamais `${texte}::jsonb` (la
  colonne recevrait une chaîne JSON).
- Les API officielles TikTok ne donnent que les vidéos du compte **connecté** : elles ne peuvent
  pas remplacer le fournisseur pour des comptes tiers ni pour la recherche.

## Recréer un TikTok depuis son lien (banque d'images)
`lib/image-bank.ts` (tests : `tests/image-bank.test.ts`) + outils MCP `view_slides`, `find_images`,
`gallery_add`, `gallery_search` + section « Recreate a TikTok from its link » du skill.
Mesures, coûts et décisions : `docs/previsionnel-recreation-tiktok-2026-09-18.md`.
- **On recrée le format, pas la photo** (décision d'Amine) : nombre de slides, format, textes (place,
  taille, style) identiques ; l'image doit être belle et vraie, illustrer le texte, laisser de la place
  au texte, rester cohérente. Ne pas revenir à une recherche « même pose ».
- **L'agent doit voir** : ces outils renvoient une **image** (planche numérotée, slide avec grille en %),
  jamais seulement des URL. Aucun LLM serveur : le serveur filtre, l'agent de l'utilisateur juge à l'œil.
- **Recherche d'images = requête publique Pinterest, en direct, gratuite** (`searchPinterest`). Sans
  l'en-tête `X-Pinterest-PWS-Handler` elle répond 403. Testée depuis Vercel (15/15). Apify coûtait
  0,002 $/image (0,60 $ le TikTok) pour faire la même requête : ne pas y revenir sauf blocage.
- **Filtre qualité** (`keepCandidate`) : Pinterest est inondé d'images IA non étiquetées (60 % des
  résultats créés dans l'année, la moitié à ≤ 2 réactions). On écarte pubs, boutiques, vidéos,
  largeur < 700, et les épingles récentes sans réaction. Le filtre ne suffit pas : la règle « rejette
  ce qui a l'air IA » vit dans le skill. Les mots-clés « candid », « iphone photo » changent tout.
- Banque = `MediaItem` enrichi (`source`, `sourceUrl`, `tags`, `note`, `width`, `height`). Les rendus
  sont marqués `source: "render"` et exclus de la banque. Certaines originales Pinterest sont en
  HEIF (illisible par sharp) : `galleryAdd` retombe sur `fallback` (736 px).
- Rendu : `aspect` par slide (`9:16`, `3:4`, `4:5`, `1:1`, largeur toujours 1080), `crop` focal,
  `textStyle` (`outline` historique, `shadow` = texte natif TikTok), `strokeColor`/`strokeWidth`
  (gros contour TikTok), police TikTok Sans. Pas d'emoji. Les défauts restent les anciens.
- **Slides « design »** (fond blanc + objets détourés, infographies) : aucune recherche photo ne les
  produit. L'agent les génère avec un outil d'images connecté chez l'utilisateur (MCP Higgsfield, à
  ses frais) puis `gallery_add`. Pas de clé tierce stockée chez nous.
- OAuth = **tout le compte** (plus de sélecteur de projet) : `list_projects` / `switch_project`
  changent le projet courant de l'autorisation. Une clé API reste liée à un projet.
- Le skill (`.cursor/skills/scrollshow/SKILL.md` = `public/skill.md`) et les `instructions` du serveur
  MCP décrivent ce parcours : tout changement d'outil s'y répercute, sinon les utilisateurs n'ont
  pas les mêmes résultats que nous.

## Build et vérification
`npm run typecheck`, `npm test` (317 tests) — et, avec un Postgres isolé, `scripts/test-store-rows.mts`, puis build isolé
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

## Raccourci iOS (Partager → ScrollShow) → recréation par l'agent
`lib/shortcut-recreate.ts` (tests : `tests/shortcut-recreate.test.ts`) + `app/api/v1/shortcut` +
`app/api/studio/shortcut` + `components/studio/ShortcutSettings.tsx` (Réglages > API) + outils MCP
`list_recreation_requests`, `claim_recreation`, `complete_recreation` et prompt `recreate_tiktok`.
Doc : `docs/raccourci-recreation-2026-09-24.md`.
- `scripts/build-ios-shortcut.py` génère et signe `public/ScrollShow.shortcut` (fr) et
  `public/ScrollShow-en.shortcut` (en) : clé API (question d'import), `GET /api/v1/shortcut` (préférence),
  liste « Recréer / Enregistrer » **seulement si** `ask` a une valeur, `POST /api/v1/shortcut { url, mode }`,
  notification `title` + `message`, puis ouvre `openUrl` s'il existe. Tout changement d'endpoint =
  regénérer les deux fichiers. L'ancien `POST /api/v1/library` reste pour les raccourcis déjà installés.
- Préférence `User.shortcutMode` (`ask` par défaut, `recreate`, `save`), réglée dans la carte : un `mode`
  vide dans le POST applique la préférence ; le choix fait sur le téléphone gagne toujours.
- Clé du raccourci : `rotateShortcutKey` (nom « Raccourci iPhone », **un an**, une seule par projet : la
  nouvelle révoque l'ancienne). Les autres clés restent à 90 jours.
- Bibliothèque : badges « À recréer / Recréation en cours / Recréé → brouillon » sur la source et
  « Recréation » sur le brouillon (`recreation` et `recreationOf` masqués sur les formats publics).
- `/api/v1/shortcut` répond **toujours 200** avec `title` et `message` (clé expirée, abonnement, erreur) :
  un code d'erreur donnait une notification vide.
- **Compte ouvert sur le téléphone** = `webapp.reflow.global.shareUser` dans la page d'un lien de partage
  court (vm.tiktok.com / tiktok.com/t/). Absent = `unknown`, jamais « non lié ». `placeSharer` : connecté
  → cible ce compte ; lié à un **autre projet** → la demande y est rangée ; suivi → brouillon seulement ;
  inconnu de ScrollShow → avertissement dans le **titre** de la notification.
- La demande vit sur le post importé (`StudioPost.recreation`, une par post), pas dans une collection.
  `claim_recreation` = bail exclusif de 30 min ; un refus n'écrit rien. `complete_recreation` pose
  `recreationOf`, met le brouillon au calendrier (jamais publié ni programmé) et envoie une notification push.
- Livraison : routine Claude (API `/fire`, jeton scellé AES-GCM, sous-clé HKDF d'`AUTH_SECRET`, jamais
  rendu au navigateur) → sinon `claude.ai/new?q=` si une autorisation OAuth vit → sinon page Agents.
  L'URL de routine est validée strictement (`api.anthropic.com/.../trig_…/fire`) : pas de SSRF.
- Aucun LLM serveur : c'est l'agent de l'utilisateur qui recrée, avec le parcours du skill.

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
