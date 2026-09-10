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

## Build et vérification
`npm run typecheck`, `npm test` (111 tests), puis build isolé
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
  RevenueCat `ScrollShow` (`0d6bdeb6`, config `app68f82b22c2`). État et étapes
  restantes : `docs/revenuecat-2026-09-10.md`.
