# Audit produit et parcours ScrollShow — 12 septembre 2026
> Annexe du [bilan global](/Users/amine/Desktop/scrollshow/docs/audit-global-2026-09-12.md). Les observations de production et résultats de tests consolidés se trouvent dans ce bilan. Les limites propres à ce sous-audit ne remplacent pas ces vérifications globales.


Périmètre : lecture du dépôt local `/Users/amine/Desktop/scrollshow`, sans modifier le code, sans publier, acheter, envoyer de message ou changer un compte. Ce rapport décrit ce que les composants et leurs routes exécutent réellement. « Implémenté » ne signifie pas « vérifié en production » : les jetons, autorisations des plateformes, configuration serveur et tests de bout en bout restent à confronter à l’audit technique. Les numéros de ligne correspondent au dépôt lu pendant cet audit.

## Conclusion produit

ScrollShow possède un vrai noyau produit : un studio de carrousels TikTok pilotable par un assistant externe, un calendrier, une bibliothèque privée/publique, une recherche publique avec collecte progressive, des comptes suivis et connectés, des statistiques par compte, un éditeur basique, la connexion TikTok, des projets multi-business, une configuration OAuth/MCP et des réglages assez complets.

Ce n’est pas encore un produit uniformément fini. Les principaux écarts sont des parcours déconnectés entre eux : informations TikTok non sauvegardées pendant l’onboarding, bouton de réanalyse inopérant, mauvais compte déconnecté depuis les réglages, contrôles qui semblent sauver mais ne le font pas, médias impossibles à téléverser dans l’UI du studio, éditeur trop limité pour la promesse de personnalisation, anciennes promesses multi-réseaux mélangées au périmètre TikTok, et maquettes encore publiques. Plusieurs écrans solides côtoient des anciens composants moins robustes.

## Inventaire réel par surface

| Surface | Ce qui est réellement présent | Limite / statut |
| --- | --- | --- |
| Site public `/` | Landing, aperçu image du studio, explication du workflow, offres, FAQ, témoignages explicitement fictifs, accès au catalogue de connecteurs | La démo n’est pas une vidéo ; plusieurs logos sont du marketing, pas des connexions opérationnelles démontrées |
| Inscription `/signup` | Email puis mot de passe ; connexion email ; Google et GitHub ; vérification email ; renvoi de lien ; mot de passe oublié ; conservation du chemin suivant | Écran essentiellement français, même quand la landing est anglaise ; capacités dépendantes du backend d’auth |
| Onboarding `/onboarding` | Analyse d’URL business, correction manuelle, choix SaaS/app/e-commerce, prénom/entreprise/logo, TikTok facultatif public, instruction de branchement assistant, source d’acquisition, offre et paiement | Le TikTok ajouté tardivement est perdu ; reprise d’un business manuel sans URL fragile ; logo accepté côté navigateur jusqu’à 5 Mo mais limite serveur plus basse |
| Projets | Créer un nouveau business, reprendre un brouillon, basculer de projet, renommer, archiver avec confirmation, empêcher l’archivage du dernier projet | Ré-analyser un projet terminé ne marche pas ; pas de restauration des archives dans l’UI ; états locaux pas réinitialisés systématiquement à la bascule |
| Overview `/app/home` | Éventail de comptes, recherche/liste quand beaucoup de comptes, panneau compte repliable, statistiques, publications, formats, lecteur intégré | Pas d’attribution de ventes ; problèmes de valeurs inconnues affichées comme zéro dans certaines vues |
| Comptes suivis `/app/clippers` | Ajouter un handle public, niche, sync, abonnés/likes/posts, keep/watch/skip, notes, suppression, lien TikTok | La navigation « Devenir clipper » est trompeuse : ce n’est pas un programme de recrutement/gestion des prestations ; vues moyennes prétendument éditables mais ignorées par l’API |
| Analyse de compte | Périodes 30/90 jours/tout ; reprise pagination et actualisation ; moyenne, médiane, meilleur post, engagement, cadence, part réseau, tendances par dates de publication | Ce sont les totaux des publications datées de la fenêtre, pas les vues nouvellement acquises dans la fenêtre ; pas de tracking des ventes |
| Publications du compte | Photo/vidéo/tous ; tri vues/likes/commentaires/partages/engagement/récence ; galerie/liste ; lecteur officiel TikTok ; carrousel natif ; chargement par tranches | La liste et les agrégats filtrés ne traitent pas toujours les compteurs inconnus comme inconnus |
| Recherche de texte | OCR des slides/couvertures, toutes les slides ou première slide, progression, pause/reprise, relire erreurs, ouverture sur la slide correspondante | Recherche dans l’image, pas dans les légendes ; OCR et disponibilité des images conditionnent les résultats |
| Recherche `/app/discover` | Mots-clés séparés par virgules, analyse @handle, vues minimum, période, historique récent, flux de collecte, stop, bibliothèque entière/dernière recherche, mur de carrousels, score relatif, lecteur et OCR | Fournisseur cloud requis pour lancer depuis cette UI ; pas d’UI complète de l’historique des jobs/rejets ; les trois filtres visibles cachent d’autres conditions de sélection |
| Garder une inspiration | Bouton +Bibliothèque ou glisser-déposer ; copie du carrousel TikTok dans la bibliothèque | L’animation et le retrait du mur ont un bug de dépendances React ; ce n’est pas une génération originale automatique |
| Bibliothèque `/app/marketplace` | À moi/Publics ; recherche légende/auteur ; filtres brouillon/planifié/publié ; import TikTok ; créer, éditer, dupliquer/forker, rendre public/privé, partager, ajouter calendrier, télécharger ZIP, copier légende/textes/recette | Actions secondaires souvent sans gestion d’erreur ; pas de dossiers/tags/tri métier ; recherche locale ne cherche pas les textes d’overlays |
| Éditeur carrousel | Légende, police globale, slide sélectionnée, image parmi médias existants, ajout/retrait slide, textes multiples, taille/couleur, fond après reconstruction, vue originale/éditée, date/heure/statut/compte | Pas de téléversement image dans le studio, pas de réordonnancement UI, pas de déplacement texte, pas d’annuler/rétablir, pas de sauvegarde automatique, fermeture sans avertissement |
| Reconstruction import | Extraction et reconstitution de calques éditables, auto-lancée en ouvrant un import non éditable ; bouton de relance ; aperçu original | Dépend du service de reconstruction ; l’UI affiche au client des instructions de carte bancaire Vercel quand la configuration serveur manque |
| Calendrier `/app` | Jour/semaine/mois ; flèches et raccourcis ; bouton aujourd’hui ; filtre compte ; comptages de la période ; création datée ; DnD avec ghost et autoscroll ; corbeille avec confirmation ; blocage des posts publiés/en cours | Pas d’édition en masse, récurrence ou génération d’un planning dans l’UI. L’assistant peut préparer des publications ; le cron les publie ensuite |
| Publication TikTok | Un compte choisi, options créateur, confidentialité/commentaires/commercial/sponsoring, musique auto, Direct Post explicite et suivi de statut ; planification | TikTok seulement dans le composeur et les connexions UI ; les autres réseaux présents dans le modèle ne deviennent pas pour autant publiables |
| Connexion TikTok | OAuth navigateur ; QR depuis le modal d’ajout ; plusieurs comptes ; déconnexion ; affichage abonnés | Les réglages utilisent une version fautive de déconnexion ; vérifier permissions/scopes/token/publication réelle dans l’audit backend |
| Agents `/app/mcp` | Instructions Claude/Codex/Cursor, OAuth, liste des assistants autorisés, révocation, premier prompt, détails MCP | Ce n’est pas un chat IA hébergé dans ScrollShow ; l’utilisateur utilise et paie son assistant externe ; ancien widget de setup mesure mal la connexion OAuth |
| API et iPhone | Création/révocation de clés, nom et affichage unique du secret, exemple d’accès, raccourci iPhone à installer | L’UI et les routes existent ; validation opérationnelle du raccourci à faire sur appareil |
| Shadowban `/app/unshadowban` | Analyse de comptes connectés et suivis à l’ouverture, lookup @handle, signaux, score, graphique log, rounds R0–R4, détail, relance, état erreur | Diagnostic heuristique, aucune action de déblocage d’un compte ; formulation UI parfois catégorique (« shadowban », « aucun risque ») malgré nature indicative |
| Poster aux US `/app/post-us` | Guide à six étapes, cases persistées, progression, reprise, liens, prompt d’agent | Guide opératoire seulement : ne crée pas lui-même téléphone/VPN/compte ; sauvegarde d’échec HTTP actuellement silencieuse |
| Comptes warmés | Catalogue, filtre région/plateforme, formulaire de demande/quantité/niche/note, suivi/cancel implémentés sous le verrou | Route explicitement « Bientôt disponible », arrière-plan inert ; ne pas compter comme offre utilisable |
| Réglages | Projet, profil, sécurité/password/liaisons OAuth, notifications push, langue/fuseau/début semaine/thème/sons, publication, stockage, API, comptes liés, facturation, suppression compte | Beaucoup de handlers anciens ne distinguent pas erreur réseau et succès ; incohérences stockage/push/export |
| Stockage | Liste des médias et tailles connues/inconnues, utilisés/inutilisés, protection médias utilisés, suppression individuel et nettoyage inutilisés, export données JSON | Pas d’upload ; après nettoyage les compteurs et l’affichage peuvent être faux ; export peut télécharger un JSON d’erreur et afficher succès |
| Notifications | Installation service worker, consentement navigateur, activation par appareil, préférences succès/échec, test, révocation | Succès UI possible même si enregistrement serveur échoue |
| Support | FAQ à accordéons, liens internes, mailto avec email compte et promesse réponse un jour ouvré | Aucun ticket, chat support ou suivi interne ; FAQ contient des indications périmées/inexactes |
| Partage `/r/:shareId` | Page publique des slides, métadonnées, légende, recette JSON et instructions pour assistant | Plus technique que client ; soupçon XSS stockée à traiter avec audit sécurité |
| Routes historiques | `/app/analytics`→Overview, `/app/media` et `/app/ugc`→Bibliothèque, `/app/agent`→MCP, `/app/billing`→Réglages | Ces routes ne sont pas des fonctionnalités supplémentaires ; pas de module UGC/analytics/media indépendant |
| Démo review `/review` | Simulation de profil/stats/publication pour présentation TikTok | Factice, indexable par moteurs, bouton réussit sans publier |

Références d’inventaire : `lib/studio-nav.ts:14`, `components/studio/CalendarView.tsx:87`, `components/studio/AccountPanel.tsx:238`, `components/studio/ResearchView.tsx:197`, `components/studio/MarketplaceView.tsx:129`, `components/studio/CreatePostModal.tsx:47`, `components/studio/SettingsView.tsx:72`, `components/studio/DeveloperAccess.tsx:10`, `components/studio/views/ShadowbanView.tsx:277`.

## Constats à corriger, par priorité

### P1 — Le compte TikTok renseigné pendant l’onboarding n’est jamais enregistré

- Scénario : analyser son site, enregistrer le business, compléter prénom/entreprise, saisir un @TikTok à l’étape 2, Continuer, terminer.
- `app/onboarding/page.tsx:285` appelle `post({ action: "tiktok", handle })` puis met à jour seulement `setBusiness` (`:295`).
- `app/api/onboarding/route.ts:167` enrichit et renvoie le compte ; aucune écriture n’existe pour cette action.
- Le bouton suivant à `app/onboarding/page.tsx:575` ne fait que `go(3)` ou `finish()`. `finish` à `:335` envoie uniquement heardFrom ou project.
- Le seul enregistrement de ce BusinessProfile est `saveBusiness` (`:310`) à l’étape précédente ; les branches finish serveur (`app/api/onboarding/route.ts:237` et `:259`) ne récupèrent pas l’état React.
- Conséquence : joli résultat à l’écran, mais agent/projet privé du TikTok ajouté à ce moment. Vaut aussi pour nouveau projet.
- Correction : rendre explicite la sauvegarde de l’enrichissement et tester rechargement + lecture du business final ; gérer les erreurs de `addTikTok` avec catch et message.

### P1 — « Ré-analyser » renvoie au calendrier et ne réanalyse rien

- `components/studio/ProjectSettings.tsx:101` crée `/onboarding?project=<id>&next=/app/settings?tab=project` pour un projet actif complété.
- `app/onboarding/page.tsx:157` fait immédiatement `if (json.project?.completed) { router.replace("/app"); return; }`.
- Le paramètre next ne permet donc pas d’éditer/réanalyser un business existant ; il faut un mode édition explicite.

### P1 — Déconnexion du mauvais TikTok depuis Réglages

- `components/studio/SettingsView.tsx:773` appelle `disconnect(channel.id, platform)` pour la ligne sélectionnée.
- `:307–315` abandonne l’id lorsque c’est TikTok et POST `/api/tiktok/disconnect` sans body.
- La route `app/api/tiktok/disconnect/route.ts:21–24` choisit alors le premier TikTok de l’utilisateur, sans filtre de projet.
- Le token choisi est révoqué et sa ligne supprimée (`:27–29`). On peut donc viser le compte B et déconnecter A, potentiellement d’un autre projet.
- `components/studio/ConnectionsView.tsx:16–22` utilise déjà le bon body `{channelId:id}` : unifier les deux parcours et le scope serveur.

### P1/P2 — Création manuelle impossible à terminer normalement sur une bibliothèque vide

- Recherche exhaustive des inputs fichiers : seul le logo d’onboarding en possède (`app/onboarding/page.tsx:521`). Aucun upload de médias dans CreatePostModal, Bibliothèque ou Stockage.
- Nouveau carrousel : `components/studio/CreatePostModal.tsx:114–120` choisit automatiquement un média existant ou `/assets/tiktoks/01-glowup-188k.png`, une image démo.
- Le bouton + de slide (`:450`) appelle `addSlide` qui retourne silencieusement si `media` est vide (`:224–226`), alors que la première slide de démo existe.
- L’utilisateur ne peut donc ni choisir ses propres images depuis son ordinateur ni ajouter une deuxième slide dans ce cas. Les voies agent/API/import peuvent remplir les médias, mais l’UI ne l’explique pas.
- Correction : bibliothèque de médias téléversable, état vide clair, première slide vide utile, ajout de slide sans dépendre d’un média préalable, indication de parcours agent si celui-ci reste obligatoire.

### P2 — Champ « Vues moyennes » trompeur dans la page Clippers

- `components/studio/views/ClippersView.tsx:235–246` permet de saisir une moyenne puis PATCH `{avgViews}` au blur.
- `app/api/accounts/[id]/route.ts:10–14` accepte uniquement niche/verdict/notes ; Zod élimine ce champ.
- Le contrôle utilise `defaultValue` (`ClippersView.tsx:242`), donc le chiffre tapé reste affiché malgré réponse inchangée. Le serveur a raison de protéger les mesures ; c’est l’UI qui doit devenir lecture seule.
- Le helper `fmt` (`:19–20`) transforme aussi absent en 0 : à remplacer par « — » pour respecter la provenance des chiffres.

### P2 — États de projet localement périmés à la bascule (suspicion non reproduite au navigateur)

- Bascule `ProjectSwitcher.tsx:107–110` = mutation cookie + reload snapshot + router.refresh.
- Shell sans clé de projet (`app/app/layout.tsx:16`) et corps keyed seulement par pathname (`StudioShell.tsx:291`) : React peut préserver les composants sur la même URL.
- `StudioContext.tsx:59` garde activeChannel, `:61–63` garde éditeur/date, sans remise à zéro dans `applySnapshot` (`:65–71`). Un compte filtré du projet A peut laisser un calendrier B vide ; composeur ouvert peut conserver un post A sous le projet B.
- `ClippersView.tsx:52–58`, `ProjectSettings.tsx:30–37`, `ProjectSwitcher.tsx:34–45`, `ShadowbanView.tsx:280–289` chargent leurs listes seulement au montage.
- Le nom du projet de la sidebar peut aussi rester ancien après renommage par ProjectSettings, car chaque composant maintient sa copie et router.refresh préserve le state client.
- Correction : identité de projet dans le contexte, caches/effets indexés par projet et reset des filtres/éditeurs à la bascule ; tests navigateur A→B sans reload manuel.

### P2 — Reconstruction exposant les opérations internes du SaaS au client

- `CreatePostModal.tsx:26–38` explique au client d’activer AI Gateway, d’ajouter une clé Vercel, et de fournir une carte.
- `:412–419` affiche même « Ajouter une carte Vercel » vers le dashboard Vercel.
- Même texte dans `MarketplaceView.tsx:332–342`.
- Ces réglages appartiennent à l’opérateur du SaaS, pas au client. Donner un vrai état de service, une relance et un contact support ; journaliser le diagnostic technique côté opérateur.

### P2 — Limites d’édition réelles à rendre explicites

- Texte : création, suppression, taille et couleur seulement (`CreatePostModal.tsx:503–568`), police globale (`:457–463`). Aucune UI pour x/y, alignement, largeur de bloc, graisse, interligne, rotation, empilement, déplacement à la souris ; `overlayStyle` les supporte en partie (`lib/recipe.ts:279–301`).
- Tous les nouveaux textes sont à `y:22` (`CreatePostModal.tsx:563`) : des blocs supplémentaires se superposent, sans contrôle UI pour les déplacer.
- Slides : sélection et ajout/retrait (`:439–452`, `:465–482`), aucune action de réordonnancement. La FAQ landing promet de modifier leur ordre (`LandingBottom.tsx:94`). Possible via agent/recette, pas via cet éditeur.
- Aucune autosave, undo/redo ou alerte de fermeture. Un clic sur le scrim ferme et jette le travail (`CreatePostModal.tsx:384–389`).
- Modale sans role dialog/aria-modal, focus trap, bouton fermer explicite ou gestion Escape (`:383–630`), contrairement au PostViewer qui possède un vrai traitement du focus.
- Éditer un post publié transforme localement le sélecteur en scheduled (`:99`) et affiche encore actions de sauvegarde/suppression : mieux présenter lecture seule + dupliquer plutôt qu’attendre le refus serveur.
- Le bouton de sauvegarde nouveau affiche « Planifier » même lorsque le statut sélectionné est Brouillon (`:591–605`).

### P2 — Plusieurs actions restent bloquées ou mentent en cas d’erreur HTTP/réseau

- `MarketplaceView.tsx:182–215` import, `:262–320` partage/fork/visibilité/calendrier, `:324–353` reconstruction : pas de catch/finally autour de fetch dans plusieurs chemins, res.ok souvent ignoré ; un fetch rejeté laisse busy ou ne dit rien.
- `CreatePostModal.tsx:331–380` publier maintenant n’a pas de try/finally général : panne pendant rasterize ou publication laisse pending=true ; même défaut sur relance reconstruct (`:239–254`).
- `SettingsView.tsx:201–230` patch préférences, `:318–341` clés, `:344–365` export/portail : nombreux fetch sans catch/finally.
- `SettingsView.tsx:344–356` sérialise la réponse sans vérifier res.ok : une 401/500 JSON peut être téléchargée comme `scrollshow-export.json` avec « Export téléchargé ».
- `SettingsView.tsx:1291–1297` active « Notifications activées » sans vérifier le POST d’inscription serveur : autorisation navigateur ≠ appareil enregistré.
- `PostUSView.tsx:138–146` mémorise une signature comme sauvegardée sur toute réponse HTTP, y compris 500 ; échec réseau avalé sans retour utilisateur. Un rechargement peut faire perdre la progression affichée.
- `MarketplaceView.tsx:224–227`, `:269–279`, `PostUSView.tsx:25–28`, `HeroSkill.tsx:15–31` peuvent afficher Copié même si le presse-papiers a échoué.
- Priorité produit : un utilitaire de mutation commun (busy/finally, parse, res.ok, message, reprise) et tests réseau coupé / 500 / session expirée sur les actions clés.

### P2 — Stockage : affichage faux après nettoyage

- `SettingsView.tsx:1045–1055` supprime un média mais ne décrémente que totals.count, pas bytes/unusedCount/unusedBytes.
- `:1058–1068` envoie toutes les suppressions parallèles, compte les succès, puis enlève de l’UI tous les médias inutilisés, y compris ceux dont la suppression a échoué ; ne recharge pas totals.
- Conséquence : compteur, jauge et liste contredisent l’état serveur ; média en échec peut sembler supprimé puis réapparaître.

### P2 — Les métriques inconnues réapparaissent comme zéros dans Overview

- Bon traitement dans `AccountPanel.tsx:148–150` et `:292–296` via missingMetrics.
- Mais `filteredTotals` (`:171–180`) additionne sans tenir compte de missingMetrics et divise par tous les posts ; la synthèse Publications les affiche (`:385–391`).
- La vue liste affiche également `compact(v.views/likes/comments/shares)` et engagement directement (`:448–461`), donc 0 représentatif de donnée absente devient un chiffre visible. Le calcul d’engagement peut paraître mesuré quand certains compteurs manquent.
- Unifier formatage/dénominateurs des métriques mesurées entre cartes, liste et totaux ; indiquer couverture de mesure.

### P2 — Recherche : retrait du mur retardé et message vide trompeur

- `ResearchView.tsx:322–350` utilise gone, keptIds et leaving mais ne les liste pas dans les dépendances du useMemo (`:350`).
- `keep` change ces états puis retire leaving après 420 ms (`:465–474`) : le tableau wall reste en cache jusqu’au prochain changement items/filtres ; une carte gardée peut réapparaître et ne disparaître qu’au sondage suivant.
- Le message « Tout est déjà dans ta bibliothèque » (`:388–389`) est décidé dès que keptIds.size et items.length sont non nuls, même si le vide vient des filtres/aucun post correspondant, pas du fait d’avoir tout gardé.
- L’UI dit « vues minimum … sans effet sur un compte précis » (`:535–536`) alors que le mur applique le seuil à tous les posts (`:335`) : clarifier comportement analyse vs affichage.
- Filtres supplémentaires opaques : même avec trois réglages visibles, la requête impose au moins 2 posts forts, 50 % de slideshows et 2 000 followers (`:432–438`) ; l’utilisateur voit des résultats absents sans UI claire de motifs/rejets.

### P2/P3 — Widget de démarrage ne mesure pas les vrais jalons

- `SetupWidget.tsx:26–29` considère l’IA branchée s’il existe une clé API ; les connexions usuelles OAuth des Agents sont lues ailleurs (`DeveloperAccess.tsx:12–21`). Un assistant OAuth peut être connecté sans faire passer l’étape.
- `SetupWidget.tsx:40` « Crée et publie depuis ton IA » est achevé dès qu’un post origin=ai existe, même brouillon.
- `:41` « Prépare ton compte pour les US » est achevé dès qu’une case est cochée.
- `:38` TikTok connecté est basé sur n’importe quel channel connecté, sans filter TikTok.
- Refaire les quatre critères sur des faits produit réels, en option pour la préparation US.

### P2 — Promesses, menus et documentation client incohérents

- « Devenir clipper » dans `lib/studio-nav.ts:27` ouvre « Ton réseau de comptes », suivi/annotation sans candidature, missions, contrat, payout, attribution ou messagerie (`ClippersView.tsx:139–145`). Renommer, ou implémenter le vrai programme.
- `SupportView.tsx:130` annonce Instagram/Facebook/X planifiables ; `ConnectionsView.tsx:13` et `AddChannelModal.tsx:14–15` n’exposent que TikTok. `CreatePostModal.tsx:354` publie uniquement sur TikTok.
- `LandingConnections.tsx:5–20` aligne quinze outils/plateformes dont YouTube, Snapchat, Telegram, ElevenLabs, TikTok Shop et SEO ; ce sont des cartes statiques, pas des autorisations/actions effectives.
- `ConnectorRegistry.tsx:60` et `:122` promet 1700+ outils sur un solde ScrollShow facturé à l’usage. Ce composant ne fait qu’un GET catalogue (`:24–35`), et la liste affiche endpoints/prix sans exécution (`:101–117`). La réalité de l’exécution et de la facturation doit être établie par l’audit backend ; ne pas compter chaque carte comme fonctionnalité disponible.
- FAQ support : « crée une clé dans MCP » (`SupportView.tsx:117`) est périmé : Agents est désormais OAuth et les clés vivent dans Réglages > API. « Relance reconstruction ou édite à la main depuis n’importe quel brouillon » (`:110`) oublie que les textes bruts restent verrouillés sans extraction (`CreatePostModal.tsx:493–500`).
- Le site public n’est pas complètement bilingue : `Landing.tsx:195–196`, tout `LandingConnections`, `LandingDemo`, `app/signup/page.tsx`, partage public et portions techniques restent français.
- Le skill distribué/public et `.cursor/skills/scrollshow/SKILL.md` sont identiques ; `.claude/skills/scrollshow/SKILL.md:91` omet uniquement les nouvelles instructions d’interprétation zScore/volatilité/indices shadowban. Écart documentaire ciblé à synchroniser, pas preuve que tout le skill Claude est obsolète.
- Temps marketing « 3 min par semaine » (`Landing.tsx:185`) n’est pas une mesure démontrée par le code. « Poster aux US à 100 % » (`SupportView.tsx:224`) et « aucun risque » shadowban (`ShadowbanView.tsx:435`) sont trop absolus pour des guides/heuristiques.

### P3 — Maquettes publiques à distinguer et sortir de l’index

- Landing : neuf retours fictifs explicitement étiquetés « Maquette » (`LandingBottom.tsx:24–45`) ; c’est honnête mais affaiblit une page commerciale payante. Collecter de vrais retours ou retirer.
- Démo : image agrandie et bouton play décoratif ; « vidéo bientôt disponible » (`LandingDemo.tsx:19–41`). Produire un vrai film montrant résultat, import, correction, planification et preuve publication.
- `/review` : `TikTokReview.tsx:98–116` fait seulement `setDone(true)` puis affiche « PUBLISH_COMPLETE — carrousel envoyé ». `app/review/page.tsx:8` autorise indexation. En faire un sandbox clairement simulé, non indexé, sans message prétendant un envoi.

### À traiter avec l’audit sécurité — JSON non échappé dans la page de partage

- `app/r/[shareId]/page.tsx:93` injecte `JSON.stringify(payload)` via dangerouslySetInnerHTML dans script application/json.
- `lib/recipe.ts:314` inclut post.body contrôlable, et la recette contient des textes contrôlables.
- Une séquence `</script>` peut terminer la balise HTML, même si elle se trouve dans une chaîne JSON. Risque de XSS stockée du lien public ; échapper `<` dans le JSON embarqué et vérifier par un test inerte approprié. Aucun payload n’a été injecté pendant cet audit.

## Points solides à préserver

1. Navigation principale courte, contenus réels mis au premier plan, composants communs de carte/preview ; le design system liquide a des règles explicites et des variantes d’accessibilité.
2. Le calendrier possède un vrai modèle jour/semaine/mois, DnD tactile/souris, confirmation de suppression et mise à jour optimiste avec restauration lors d’erreurs ; ne pas le remplacer par une nouvelle maquette.
3. La lecture de compte est progressive, distingue historique partiel/à jour, conserve les posts chargés et donne une relance ; bonnes protections contre réponses périmées (`AccountPanel.tsx:69–145`).
4. Les vues Research utilisent le composant PostTile partagé et montrent des candidats progressivement ; cloud/backend et UI sont connectés.
5. Le panneau TikTok demande explicitement les options, montre le profil cible et le statut publication ; vraie attention au consentement de publication.
6. Les connexions Agents affichent les grants réels et permettent la révocation, avec gestion d’erreur correcte (`DeveloperAccess.tsx:58–74`).
7. Les états hors connexion/session expirée existent au niveau studio et le refresh s’arrête en onglet caché (`StudioContext.tsx:82–134`).
8. Comptes warmés est honnêtement verrouillé et inert ; ne pas le présenter comme actif avant disponibilité opérationnelle.
9. Les stats Overview disent explicitement que les ventes ne sont pas mesurées (`AccountPanel.tsx:324`) : conserver cette précision.
10. Les anciennes URLs sont redirigées proprement plutôt que d’offrir plusieurs pages incohérentes.

## Capacités à ne pas compter comme acquises

- Création vidéo/UGC, talking head, montage vidéo ou shorts : aucune surface correspondante, route UGC redirigée.
- Publication native Instagram/Facebook/X/YouTube/Snapchat : les logos/OAuth potentiels ne constituent pas ce parcours ; vérifier séparément le backend.
- Agents autonomes qui génèrent des posts à heure fixe sans assistant externe : la génération est pilotée depuis un client MCP ; le cron de publication est une capacité distincte.
- Éditeur Canva complet : les recettes supportent plus que les contrôles visibles actuels.
- Marketplace commerciale payante de templates : l’écran actuel est bibliothèque partagée et forks ; aucune transaction créateur découverte dans cette UI.
- Réseau de clippers contractuel, missions, rémunération, affiliation : le composant route correspond à la gestion de comptes suivis.
- Achat livré de comptes warmés : page verrouillée, formulaire demande derrière inert.
- Attribution des ventes/ROI : expressément absente dans Overview.
- Support avec tickets/SLA suivi : mailto uniquement ; le délai affiché est une promesse opératoire.
- Vidéo de démonstration et témoignages vérifiés : actuellement image/maquette.

## Ordre de travail recommandé

1. Réparer les données/parcours qui échouent malgré interface de succès : onboarding TikTok, réanalyse, déconnexion multi-compte/projet, XSS partage si confirmé.
2. Garantir changement de projet cohérent : scope serveur et remise à zéro de toute l’UI, absence de données précédentes ou d’éditeur de l’ancien projet.
3. Fermer la boucle du premier carrousel sans agent : upload médias, vide exploitable, ajouter/réordonner slides, déplacement des textes, sauvegarde explicite et protection fermeture.
4. Uniformiser erreurs réseau/HTTP et retours succès ; corriger export/push/stockage/copier/progression.
5. Nettoyer le langage produit et les compteurs : vrais chiffres vs inconnus, vraie connexion OAuth, « comptes suivis » au lieu de clipper, catalogue outils séparé de capacités activées.
6. Valider trois parcours complets en environnement contrôlé : nouveau client→business→assistant→brouillon→édition→planification→publication ; recherche→garder→reconstruire→modifier→ZIP/publication ; projet A→B→réanalyse/connexion/déconnexion.
7. Ensuite seulement enrichir : dossiers/tags bibliothèque, édition en masse/récurrence calendrier, analytics évolutifs, expérience mobile/accessibilité complète, offre clippers/warmés après préparation réelle.

## Compléments de la revue croisée

La suspicion XSS de cette annexe a été confirmée par une fixture de rendu et d’exécution locale dans le volet fondations. Les états périmés lors d’un changement de projet restent à reproduire dans le navigateur. Le catalogue de connecteurs ne dispose pas, dans le backend examiné, d’une chaîne universelle d’exécution/facturation.
