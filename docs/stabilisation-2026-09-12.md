# ScrollShow — bilan des corrections, 12–13 septembre 2026

Ce document actualise l’audit global du 12 septembre. Il distingue les corrections implémentées, les vérifications réalisées et les dépendances externes. L’audit original et ses annexes restent l’état historique avant réparation. « Testé » décrit une preuve précise ; cela ne certifie pas tous les appareils, tous les comptes ni tous les fournisseurs.

## Pourquoi la connexion était cassée et les alertes se répétaient

1. **Neon avait suspendu les requêtes après dépassement du quota de transfert Free**, avec erreur PostgreSQL 53000. Le document de production mesuré pendant la réparation pèse environ 6,45 Mo. Authentifier une session ou une clé pouvait charger ou réécrire ce document entier. Répéter ces opérations via le studio, MCP et les tâches automatiques épuisait le quota.
2. **Le forfait Launch validé par le propriétaire a rétabli la base.** Un SELECT réel a réussi ; l’endpoint de connexion a de nouveau distingué un mauvais identifiant (401) d’un service indisponible (503). Une connexion par mot de passe avec un compte synthétique a ensuite été exercée dans le navigateur local.
3. **L’email fourni était une alerte GitHub Actions** : « Publish scheduled posts », jobs publication et recherche. Ces requêtes échouaient régulièrement pendant la suspension de Neon. La dernière erreur Vercel examinée, du 9 septembre, venait d’un type TypeScript incompatible dans l’onboarding ; elle avait déjà été corrigée. Le déploiement qui servait le domaine était READY.
4. Les tâches GitHub ont été temporairement suspendues pendant la réparation, puis réactivées après déploiement, sauvegarde vérifiée et état de santé sain. Les trois workflows publication/recherche, maintenance et analytics ont été exécutés avec succès. Le paiement de Neon rétablit la disponibilité ; la réduction des transferts évite de reproduire la même consommation inutile.

## Corrections par constat d’audit

| Audit | Correction livrée dans le code | Preuve / limite |
|---|---|---|
| A01 | Base Launch réactivée ; distinction entre panne DB, mauvais identifiants et erreur de build | SQL et endpoint de connexion vérifiés ; contrôles du nouveau déploiement consignés plus bas |
| A02 | Auth, clés, OAuth, studio et projets en lectures partielles ; activité des clés regroupée ; écritures JSONB atomiques par collection ; absence d’écriture si aucun changement ; polling 30 s avec recul sur erreur | Branche Neon schema-only : 8 contrôles réels, caches préservés, 12 écritures concurrentes. Fixture de 1 Mo : partie auth 107 octets. Certaines opérations de recherche/validation chargent encore une collection complète ; le store reste un document global, pas une base relationnelle normalisée |
| A03 | JSON intégré aux pages partagées échappé | Test de fermeture de balise script et reconstruction JSON exacte |
| A04 | Propriété originale des médias, noms exacts, contrôle entrée/lecture/rendu/OCR/export ; fork copie ses fichiers | Tests interutilisateurs, interprojets et HTTP upload/export ; connaître une URL privée n’autorise pas sa réutilisation |
| A05 | OAuth consenti sur un projet ; tokens de projets archivés refusés ; refresh atomique avec détection du rejeu | Tests de rotation concurrente et archivage ; les anciens consentements sans projet doivent être renouvelés |
| A06–A07 | Recherche attachée à utilisateur + projet + handle ; recette privée soumise au même scope ; worker passe le projet du job | Tests de projets et contrôle HTTP interprojets |
| A08 | Reset du mot de passe, changement d’adresse et restauration coupent les accès prévus ; clés et OAuth révoqués ; restauration en quarantaine | Tests de révocation et de quarantaine ; changement d’adresse dissocie les anciennes identités sociales |
| A09 | Fork crée un brouillon sans publishId, statut de publication ni statistiques héritées ; partage fermé ; médias indépendants | Construction explicite du nouveau post ; tests d’accès média |
| A10 | Prévalidation avant INITIATING ; refus certain réparable ; état incertain bloqué ; échec final libère le publishId en conservant son historique | Test simulant prévalidation, refus TikTok, timeout, anti-rejeu et FAILED final. Une initialisation réellement ambiguë nécessite toujours une vérification externe ; aucun renvoi automatique |
| A11 | Déconnexion exige l’identifiant exact du compte choisi | Route et client cohérents ; pas de fallback vers le premier compte |
| A12 | Profil TikTok tardif persisté dans le business courant ; réédition d’un business terminé ; limite logo cohérente | Code et parcours HTTP onboarding ; pas de déconnexion automatique sur erreur réseau |
| A13–A14 | Valeurs inconnues exclues des verdicts et agrégats ; caches, images et provenance de recherche fusionnés sans effacement | Tests des mesures absentes et fusion ; courbes non affichées lorsque leur échantillon manque de mesures |
| A15 | Upload JPEG/PNG/WebP 3 Mo, décodage sécurisé, dimensions bornées, métadonnées retirées ; slide vierge possible | Test multipart réel, lecture privée, sauvegarde et ZIP. WebP normalisé en PNG pour le moteur de composition ; slides vierges sans image de démonstration |
| A16 | Sauvegarde chiffrée segmentée, manifeste publié après vérification des parties ; logos projets inclus ; nettoyage indépendant | Test de 502 médias, partie manquante refusée et restauration idempotente ; limite par fichier conservée, sans plafond global de 500 médias |
| A17 | Réglages, bibliothèque, push, stockage et comptes suivis vérifient les réponses HTTP ; erreurs visibles et busy libéré | Revue des handlers et essais HTTP ; validation sur navigateur/appareil des notifications à compléter |
| A18 | Studio remonte au changement de projet ; caches/filtres/éditeur réinitialisés | Tests HTTP : export et média refusés dans le projet B puis accessibles en revenant à A |
| A19 | Réordre, undo/redo limité à 50, coordonnées/largeur/alignement des textes, ajout à vide, garde de fermeture, focus de modale | Recette desktop/mobile : création, import, réordre, undo/redo, fermeture protégée, sauvegarde. Alignement conserve la boîte du texte ; hooks et confirmation intégrée corrigés |
| A20 | Déduplication avant téléchargement et sous transaction ; nombre attendu/importé, échecs et miniature vidéo explicites ; fichiers abandonnés mis en nettoyage | Revue des branches d’import ; résultat dépend de l’accessibilité des médias TikTok |
| A21 | Budget fournisseur central ; limites utilisateur sur sync/shadowban et concurrence bornée | Compteurs atomiques testés ; budget configurable, pas une mesure de facture fournisseur |
| A22 | Requêtes de profil et suppression Blob sorties du verrou ; suppression avec claim et accusé de résultat | Code transactionnel ; propriétaires et références recontrôlés |
| A23 | Observations analytics quotidiennes déclenchées par worker horaire ; lots bornés et rotation entre projets ; retry des reçus | Historique à partir des observations réellement obtenues ; jamais rétroactif ni garanti sans scopes/compte connecté |
| A24 | Export versionné avec projets ; suppression persistante avec checkpoints Stripe/TikTok, bail, reprise et purge des références OAuth/logos/outbox | Test d’interruption : annulation et révocation déjà réussies non répétées, autre utilisateur préservé. Jeton TikTok expiré : rafraîchissement persisté avant révocation, ou fin de suppression lorsque le refresh est lui aussi expiré ; anciennes collections purgées |
| A25 | Scripts de bascule Stripe explicites par environnement/compte, simulation par défaut, ancien script dangereux retiré | Contrôle des scripts et tests Stripe ; portail et signatures webhook distincts pour l’ancien compte Stripe. Portail créé avec succès pour le client conservé, sans modifier son abonnement ni effectuer un paiement |
| A26 | Outbox RevenueCat durable, baux, backoff, accusé lié à une révision | Test panne → retry → succès et événement concurrent non perdu |
| A27 | Budgets IP/globaux auth ; validation du token avant bcrypt ; erreurs publiques sans détails DB | Tests sécurité + HTTP ; Google/GitHub nécessitent leur configuration externe valide |
| A28 | Navigation « Comptes suivis », guides sans garantie US, vitrine limitée aux capacités réelles, catalogue sans faux portefeuille, retrait des témoignages fictifs, review noindex, skills synchronisées | Revue du code et des textes ; une vidéo de présentation et des témoignages réels restent des contenus à produire |

## Fonctionnalités réellement présentes après correction

| Domaine | Ce que le produit sait réellement faire | Conditions et limites |
|---|---|---|
| Compte | Inscription, connexion email, Google/GitHub, vérification email, reset, double confirmation de changement d’adresse, préférences, export et suppression | Emails et OAuth dépendent des fournisseurs ; réception email et parcours sociaux réels à recetter avant ouverture commerciale |
| Business et projets | Analyser les informations d’un site/app/profil, corriger le business, logo, plusieurs projets, sélection/renommage/archivage | Un propriétaire par compte ; aucune équipe avec rôles ni invitations |
| Connexion TikTok | OAuth/QR selon configuration, plusieurs comptes, rafraîchissement de tokens, déconnexion précise | Scopes et accès TikTok nécessaires ; la publication reste en attente de validation |
| Comptes suivis | Ajouter un @compte public, synchroniser le profil, notes/verdicts, consulter ses publications | Ce n’est pas un programme de recrutement/rémunération de clippers |
| Recherche | Découverte multirequête, analyse paginée, filtres, jobs durables, pause/reprise/arrêt, comparaison et export | Service de données configuré et quotas ; collecteur navigateur facultatif ; résultats non garantis |
| Études de formats | Sources, images, OCR, texte des slides, études sauvegardées et comparaisons | L’assistant externe interprète ; OCR et causalité restent incertains |
| Bibliothèque | Inspirations privées, formats publics, recherche, duplication, partage révocable, ajout au calendrier | Aucun commerce de templates ni rémunération des auteurs |
| Import TikTok | Images accessibles, légende et métadonnées, déduplication, signalement des manques | Un import vidéo peut n’être qu’une miniature, clairement annoncé ; aucun montage vidéo |
| Création / édition | Images personnelles, slides vierges, textes, fonds, polices, position, taille, largeur/alignement, ordre, annuler/rétablir, brouillon | Éditeur de carrousels ; pas un équivalent complet de Canva. Reconstruction d’un texte incrusté approximative |
| Export | ZIP des slides rendues, légende et recette, fichiers liés au projet | Recettes HTML rejetées ; plafonds de taille/quantité explicites ; téléchargement authentifié |
| Calendrier | Vues jour/semaine/mois, filtres, dates/fuseaux, déplacement, suppression et brouillons | Pas de récurrence ou édition de masse native |
| Programmation / publication | File durable PHOTO TikTok, options créateur, anti-doublon, suivi du statut final, erreurs réparables | Désactivée par défaut jusqu’à activation après validation TikTok ; aucun post réel envoyé pendant ces travaux |
| Analytics | Mesures disponibles de profils/publications, fenêtres, comparaisons, observations historiques | Cumul des compteurs distinct de croissance ; sans attribution des ventes, ROI/ROAS ou données rétroactives |
| Shadowban | Heuristique de baisse de diffusion sur mesures connues | Ni preuve de sanction ni outil de déblocage TikTok |
| Guide US | Guide et checklist persistée | Aucune garantie géographique, aucun réglage automatique du téléphone/réseau |
| Assistants / API | MCP, OAuth par projet, 38 outils, prompt de démarrage, clés REST à durée limitée | Abonnement Claude/Codex/Cursor séparé ; pas de chatbot générateur autonome inclus |
| Facturation | Offres mensuelle et à vie, Checkout, webhook signé, portail, rapprochement ; offre annuelle codée mais désactivée | Vérifier paiement, annulation et remboursement dans Stripe test avant lancement ; Stripe reste source des droits |
| Notifications | Inscription push, appareils, préférences et événements de publication | Recette sur vrais navigateurs/iPhone et permissions utilisateur requises |
| Stockage / exploitation | Médias privés, file de nettoyage, sauvegardes chiffrées, restauration contrôlée, santé, reprise RevenueCat et suppressions | Les sauvegardes doivent être régulièrement restaurées sur une cible isolée ; la normalisation du store en tables reste une amélioration d’échelle |
| Support / vitrine | FAQ, support email, pages légales, aperçu du studio, catalogue informatif | Pas de ticketing/SLA intégré. Comptes warmés verrouillés. Pas de publication Instagram/YouTube/X/Snapchat |

## Vérifications et publication de cette correction

- Base de test Neon créée schema-only, aucune donnée client copiée, expiration automatique.
- Commits de livraison : `31886d8`, `e2f7a06`, `9c2d312`. **150/150 tests unitaires/intégration**, **56/56 contrôles HTTP/MCP**, build Next.js et TypeScript réussis. Audit npm de production : aucune vulnérabilité signalée. **38 outils MCP** exposés et authentifiés.
- Export réellement décompressé : trois slides, texte visible à 1080 × 1920, photo WebP compositée, fond uni exact, légende conservée. Les permissions interutilisateurs et interprojets sont testées.
- Navigateur : connexion email avec un compte synthétique, calendrier et bibliothèque en 390 × 844, création/sauvegarde mobile, relecture desktop en mode clair ; mode sombre également inspecté. Alignement gauche convertit correctement x=50 en x=7 pour une boîte de 86 %. Pas d’erreur JavaScript observée. Le navigateur intégré n’a pas remonté son événement de téléchargement ; le ZIP a été validé directement par HTTP.
- Régression navigateur détectée et corrigée avant déploiement : hooks de l’éditeur ; un dialogue natif a temporairement bloqué l’outil de test, remplacé par une confirmation intégrée.
- Aucun achat Stripe, message à des tiers ni publication TikTok effectué pour valider l’application.
- Première livraison de production `612ecce` puis correctif de suppression `e2f7a06` : READY. Le domaine répond, `/api/health` renvoie 200 sans problème, l’auth distingue un mauvais identifiant (401) d’une panne. Livraison finale `9c2d3121288e88a9c8ce110317b796d30ff19628` : **READY sur scrollshow.io**, déploiement `dpl_HY5j526ZMZ6YUPeBdfxbZAvegSSW`. [CI du commit final](https://github.com/amineprimesmr/scrollshow/actions/runs/34766160267) réussie (tests, types, audit, build, smoke).
- Workflows GitHub réactivés : [publication/recherche](https://github.com/amineprimesmr/scrollshow/actions/runs/34726654293), [sauvegarde/santé](https://github.com/amineprimesmr/scrollshow/actions/runs/34726655149), [analytics](https://github.com/amineprimesmr/scrollshow/actions/runs/34726655964) : succès. Publication sans envoi, réponse explicite `tiktok_approval_pending`.
- Sauvegarde réelle avant nettoyage : format v2, 9 319 728 octets chiffrés, manifeste et partie relus, déchiffrés et restauration en mémoire validée. Sauvegarde et nettoyage de production exécutés ensuite avec succès.
- Fournisseur réel : une recherche a renvoyé 20 carrousels / 17 comptes ; une page de compte 34 publications avec compteurs disponibles. Un autre compte public a dépassé le délai de 40 s : les services externes restent une dépendance, pas une garantie de résultat.

## Nettoyage demandé par le propriétaire

- **6 comptes avant, 1 client ScrollShow conservé, 5 comptes supprimés.** Les projets, clés, comptes TikTok et contenus des comptes supprimés ont été purgés ; les médias non référencés ont été nettoyés. Une ancienne automation orpheline a également été retirée.
- Les historiques des deux comptes Stripe utilisés par le projet ont été vérifiés. L’ancien compte contient 12 paiements et 165 sessions examinés ; le nouveau n’avait aucun paiement au moment du contrôle. La sélection s’appuie sur le produit, les identifiants client/utilisateur et la facture, pas uniquement sur le nom ou le plan affiché.
- Un paiement trouvé sur une même adresse concernait une autre application : il n’a pas été compté comme un achat ScrollShow. Le client conservé a un abonnement **ScrollShow actif**, avec une facture effectivement payée. Aucun abonnement ni paiement de ce client n’a été annulé.
- Les données du client conservé ont été comparées à la sauvegarde avant nettoyage. Son compte, son projet, ses médias, comptes suivis et clés ont été préservés. Les éventuelles nouvelles observations analytics sont le fonctionnement normal des tâches réactivées.
- L’ancien compte Stripe était encore nécessaire pour ce client : routage du portail et des événements signés vers le bon compte, tout en gardant le compte Stripe actuel pour les nouveaux achats. Le portail a été créé avec succès ; signature de l’ancien webhook vérifiée en production, ancien webhook réactivé. RevenueCat lié au compte actuel ne reçoit pas les identifiants de l’ancien compte.
- **Contrôle final, 13 septembre à 15:39 UTC** : un compte restant, cinq suppressions terminées, aucune suppression en attente ; comparaison avec la sauvegarde réussie pour les collections du client conservé (utilisateur, projets, comptes suivis, posts, médias, clés). Santé de production 200, aucun problème. Les changements de facturation n’ont ni modifié ni annulé son abonnement.

## Ce qui reste avant le lancement commercial

1. Recevoir l’approbation TikTok puis recetter avec les scopes et comptes autorisés : consentement, options, premier envoi contrôlé et statut final. Activer explicitement la publication seulement ensuite.
2. Vérifier sur les comptes/appareils cibles la délivrabilité email, les callbacks Google/GitHub et les notifications push ; tester le paiement complet et le remboursement en Stripe test.
3. Élargir la recette aux appareils réels de lancement (Safari/iPhone, Android, grands carrousels) : la recette responsive sur Chromium est passée, sans certifier toutes les combinaisons de navigateur, contenu et réseau.
4. Produire une vraie démonstration et de vrais témoignages si souhaités. Choisir séparément les extensions (équipe, autres réseaux, vidéo, marketplace commerciale, clippers, comptes warmés) : elles ne sont pas livrées par cette stabilisation.
5. À l’augmentation du volume : tables PostgreSQL séparées, verrous par projet, observations et sauvegardes dimensionnées sur charge réelle. Les corrections actuelles réduisent les transferts et les blocages ; elles ne constituent pas un benchmark à grande échelle.
