# Livraison SaaS — configuration et recette

## Refonte du parcours d'acquisition — 8 septembre 2026

- Les CTA de création ouvrent `/signup`, avec Google/email ; l'authentification existante reprend l'état réel du compte. Confirmation email requise avant onboarding et paiement.
- Onboarding : profil, business automatique ou manuel, assistant facultatif, provenance facultative, offre intégrée. Étape sauvegardée côté serveur ; les comptes ayant terminé reprennent directement l'activation.
- Dernière étape : 29 EUR/mois ou 99 EUR à vie, consentement explicite aux conditions, ouverture directe de Stripe. Aucun appel checkout depuis la page publique Tarifs. Aucun prix imposé dans le formulaire d'inscription.
- Le serveur refuse le checkout sans onboarding terminé. Un retour Stripe annulé reprend l'offre ; une session expirée conserve l'identifiant Stripe pendant la reconnexion. Un paiement non confirmé ne débloque pas le studio. Les abonnements existants sont réconciliés plutôt que recréés.
- Plus de rotation automatique de clé MCP au montage de l'onboarding. La préparation/remplacement est explicite et peut être reportée. Les témoignages et chiffres d'affaires non justifiés ont été retirés du panneau d'inscription.
- Vérifications : 35 tests automatisés, 30 contrôles HTTP/MCP isolés, build de production et TypeScript réussis. Parcours navigateur compte fictif → profil → business manuel → assistant reporté → provenance → offre, puis rechargement conservant l'étape, vérifié. Choix d'offre, consentement et erreur de fournisseur testés. Étape finale inspectée en clair/sombre et à 390 px sans débordement horizontal.
- Limite de preuve : pas de nouvelle transaction Stripe terminée ni de nouvelle connexion Google réelle pendant cette refonte. Les tests navigateur sont sur une base fictive, sans identifiants fournisseurs ; ils ne sont pas présentés comme une recette de paiement réelle.
- Les contraintes d'hébergement commercial et les autres vérifications de lancement listées plus bas restent applicables. Cette refonte n'achète aucun abonnement fournisseur.

## État actuel — 8 septembre 2026, après bascule 16 h 06 (Paris)

**Cette section remplace toutes les affirmations historiques ci-dessous. La version est en ligne, mais le lancement commercial à 100 % n'est pas certifié.**

- `scrollshow.io` sert `dpl_E5g3uZT72d75BKsLcknJuoSPhHt8`, commit `6b807af`, région Frankfurt. Une autre session avait poussé tous les changements avant la bascule prévue : une courte maintenance a permis de vérifier l'absence exacte de divergence puis de finaliser la migration, sans perte constatée.
- PostgreSQL production est désormais la source active : 4 utilisateurs et 6 posts conservés. Le post programmé du 24 août sans identifiant de publication est remis en brouillon, avec explication, pour éviter un envoi ancien involontaire. Ne pas revenir à l'ancien déploiement Blob après de nouvelles écritures sans réconciliation.
- Snapshot final privé du 8 septembre à 14:06:19 UTC et archive chiffrée avec les 3 médias importés référencés conservés hors Git. Sauvegarde distante après bascule réussie, nettoyage sans suppression, file de publication vide, contrôle de santé authentifié `ok:true`, aucun problème.
- Workflows GitHub activés avec secret CRON synchronisé : maintenance quotidienne et ordonnanceur toutes les cinq minutes. Exécutions manuelles `34236204464` et `34236209814` terminées avec succès. La livraison d'une alerte d'échec reste à tester ; GitHub cron reste best effort.
- Stripe production : nouveaux prix 29 EUR/mois et 99 EUR à vie configurés ; **aucun essai gratuit pour les nouvelles ventes**. Prix historique explicitement accepté pour préserver les abonnements existants. Webhook étendu aux paiements asynchrones et remboursements. Aucun paiement ni abonnement historique modifié par la recette.
- Resend configuré en production et preview, domaine vérifié et email technique livré. Vérification d'adresse implémentée ; parcours navigateur complet avec email puis paiement encore à valider.
- Médiation explicitement reportée à la demande du propriétaire : aucun médiateur inventé, aucun verrou checkout lié à ce champ. Cela ne constitue pas une validation juridique des ventes.
- Validation : 31 tests automatisés réussis, build distant Ready ; pages publiques `/pricing`, `/signup`, `/terms` HTTP 200 sans promotion d'essai gratuit. Les 22 contrôles HTTP/MCP locaux de l'itération précédente ont réussi ; ils ne remplacent pas une recette complète en production.

### Décision et vérifications restantes avant promotion commerciale

1. Équipe Vercel actuellement **Hobby**, usage personnel non commercial uniquement selon https://vercel.com/docs/plans/hobby. Aucun abonnement payant autorisé ni acheté. L'accès Node.js Hostinger a mené à une page d'achat, pas à un hébergement inclus utilisable. Choisir un hébergement commercial adapté avant d'envoyer une campagne payante.
2. Exercer inscription → réception/vérification email → checkout → paiement confirmé → accès, ainsi que remboursement/annulation, avec le bon compte Stripe de test ou une opération réelle expressément autorisée. Les tests métier ne prouvent pas une transaction externe terminée.
3. Brave : plafond fournisseur « Free credits only » confirmé ; découverte par mots-clés non activée, faute de droits de conservation/réutilisation validés. Ne pas annoncer cette fonctionnalité comme opérationnelle. Analyse de profils distincte.
4. Publication TikTok réelle non testée ni autorisée ; vérifier le parcours sur un contenu appartenant au propriétaire. Aucun post publié pendant la bascule.
5. Restauration distante complète avec médias et réconciliation des services externes, alerte indépendante, reprise après interruption de suppression de compte, charge et mobile/Safari restent à exercer. Les plafonds gratuits et les limites d'archive restent applicables.

## Historique détaillé — ne pas utiliser les anciens états pour décider une bascule

## État constaté au 8 septembre 2026 — mise à jour prioritaire

### Complément après durcissement de la reprise

Validation de cette itération : **30 tests métier, 22 contrôles HTTP/MCP, build Next.js et TypeScript réussis ; `git diff --check` sans erreur**. La vérification email est exercée via HTTP avec un lien de fixture, session renouvelée et rejeu refusé ; le transport Resend a été vérifié séparément par le message livré. Cela ne remplace pas le parcours complet d'inscription navigateur sur un déploiement distant.

- Les nouvelles sauvegardes embarquent maintenant les octets des médias importés référencés (`/api/i/…`), avec empreinte SHA-256, dans l'archive chiffrée. Une référence manquante fait échouer la sauvegarde. Limites explicites : 500 fichiers et 64 Mio de médias par archive ; dépasser ces limites exige une sauvegarde segmentée avant montée en charge. Les ressources tierces distantes et les assets versionnés du dépôt ne sont pas archivés par ce mécanisme.
- La restauration valide le manifeste, refuse d'écraser un fichier différent et relit chaque fichier restauré. Le bucket cible doit être fourni explicitement via `RESTORE_TARGET_BLOB_TOKEN` avec `--confirm-target-media-store`. Une interruption peut laisser des fichiers déjà copiés, mais la reprise accepte les octets identiques. La transaction refuse toute base contenant déjà un store.
- Toute restauration marque `restoreReviewRequired=true`, révoque les clés API et les sessions antérieures et supprime les liens de récupération/vérification en attente. Sessions, appels API et publications restent bloqués jusqu'à réconciliation opérateur. Ne pas retirer ce verrou avant vérification des suppressions de compte, paiements, tokens et publications externes. Les anciennes archives sans médias ne permettent pas une restauration complète si elles contiennent des références importées.
- Compatibilité Stripe historique ajoutée via `STRIPE_LEGACY_MONTHLY_PRICE_IDS`. Après vérification du compte Stripe, configurer `price_1U9MLv3yrYjpyuOyaU2ZWKf5` pour préserver l'ancien abonnement à 19,99 EUR sans le reproposer aux nouveaux clients. Aucun tarif de production n'a été changé.
- Brave : l'utilisateur a créé la clé `ScrollShow staging`. Le plafond fournisseur a été configuré et confirmé **Free credits only**. La clé n'est pas encore enregistrée dans Vercel. La bibliothèque exige désormais également `BRAVE_SEARCH_LIBRARY_LICENSE_CONFIRMED=1` ; ne pas activer ce drapeau sans droits adaptés.
- L'archive chiffrée a été revalidée sur le staging réel vide. Les tests de copie/restauration de médias utilisent des fixtures isolées ; une simulation distante complète avec un bucket de restauration séparé reste à faire.
- Médiateur : CM2C affiche 48 EUR pour trois ans jusqu'à dix personnes et 36 EUR par médiation à distance au 8 septembre 2026. Compatibilité avec l'activité SaaS et contrat à confirmer ; aucune adhésion ni paiement effectué. Source : https://www.cm2c.net/tarifs.php.

Cette section remplace les états plus anciens ci-dessous. **L'ouverture publique n'est pas validée.** Aucun déploiement de cette version en production, achat client ni post TikTok réel n'a été effectué.

### Réalisé et vérifié

- PostgreSQL Neon gratuit `scrollshow-staging`, région Frankfurt, connecté uniquement à preview ; migration d'un store vide réussie. Test réel de restauration en table temporaire, rollback et 20 transactions concurrentes réussi. Aucune donnée de production migrée.
- Blob privé `scrollshow-staging-media`, Frankfurt, isolé du bucket de production. Le code impose `STAGING_READ_WRITE_TOKEN` en preview. Secrets AUTH/CRON/chiffrement distincts ; ventes et publications désactivées en preview.
- Sauvegarde AES-256-GCM du **store JSON uniquement**, upload privé et relecture/déchiffrement vérifiés sur le vrai staging. Nettoyage différé des références supprimées et état de santé des tâches vérifiés. Rétention des sauvegardes : 30 jours. **Les octets des médias ne sont pas sauvegardés par ce mécanisme** ; un plan de reprise complet doit encore couvrir les médias.
- Resend : compte `contact@usev2.xyz`, domaine `mail.scrollshow.io` vérifié, région Ireland. Trois nouveaux DNS de sous-domaine ajoutés ; MX et messagerie existants préservés. Clé « ScrollShow transactional » limitée à l'envoi sur ce domaine, stockée comme secret Vercel preview uniquement. Expéditeur `ScrollShow <noreply@mail.scrollshow.io>`.
- Email technique à `contact@usev2.xyz` accepté et marqué **delivered** dans Resend : `0a217fcb-9428-4243-9f7c-853c97ea2416`. Cela vérifie le transport, pas encore tout le parcours navigateur inscription → vérification → onboarding.
- Vérification email à l'inscription, expiration et usage unique des liens, changement d'adresse avec double confirmation, révocation des sessions et clés implémentés et testés. Plafond email global : 90/jour et 2700/mois ; un SaaS public peut dépasser rapidement cette capacité gratuite.
- Tarifs Stripe créés dans le compte PROCESS : 29 EUR/mois `price_1UDOo43yrYjpyuOyTXdtTbci`, 99 EUR à vie `price_1UDOo43yrYjpyuOyjFHmPujl`. Aucun paiement effectué. Les variables de production et les abonnements historiques n'ont pas été modifiés.
- Mentions PROCESS et brouillons CGV/confidentialité renseignés depuis les documents professionnels autorisés ; aucune pièce d'identité publiée. Le checkout exige acceptation des CGV et reste verrouillé sans `SALES_ENABLED=1` et médiateur effectivement configuré.
- 25 tests métier réussis après correction d'un test de concurrence dépendant d'un délai arbitraire. Les tâches simultanées sont maintenant testées avec une barrière explicite.
- Revalidation finale de cette étape : build Next.js 15.5.25 réussi, 15 contrôles HTTP/MCP réussis sur un serveur de production isolé, 28 outils MCP exposés et audit npm production à zéro vulnérabilité signalée.

### Blocages encore réels

1. **Brave non activé** : compte connecté, choix Free sans recharge automatique préparé, mais conditions non acceptées et aucune clé créée. Les conditions du 1 septembre 2026 limitent notamment stockage/cache/réutilisation des résultats. Vérifier les droits adaptés à la bibliothèque persistante avant de connecter la découverte ; ne pas présenter le compte comme une intégration opérationnelle. Source : https://api-dashboard.search.brave.com/terms-of-service (section 3).
2. **Médiation consommateurs** : PROCESS n'a pas de contrat. Ne jamais afficher un médiateur auquel PROCESS n'adhère pas. Le fait que la médiation soit gratuite pour le consommateur ne démontre pas qu'une adhésion est gratuite pour l'entreprise. Validation juridique des CGV, garanties numériques, rétractation et offre à vie encore nécessaire.
3. **Stripe** : recette avec les identifiants test du bon compte PROCESS, webhooks et idempotence à exercer de bout en bout ; stratégie explicite pour le tarif historique 19,99 EUR/mois. Ne pas utiliser la session Stripe CLI d'un autre projet.
4. **Production** : créer/configurer la base de production, sauvegarder puis migrer le store historique et vérifier les données avant bascule. Aucun transfert de secrets preview vers production par défaut. Configurer URL de préproduction, emails et callbacks correctement avant recette distante.
5. **Exploitation** : workflows de maintenance/supervision présents localement mais non poussés ni activés ; variable GitHub `PRODUCTION_AUTOMATIONS_ENABLED` reste une barrière. Pas encore d'alerte indépendante testée, ni de scénario de panne/restauration complet incluant médias, comptes supprimés, abonnements et publications externes. Le script de restauration refuse une cible non vide, mais ne dispense pas de cette réconciliation.
6. **Suppression de compte** : une panne après marquage `deletionPendingAt` peut nécessiter une reprise opérateur ; aucun worker de reprise automatique certifié. Les intégrations autres que TikTok doivent être déconnectées avant suppression. Les fichiers non référencés sont éligibles au nettoyage après 48 heures, ce qui doit être réconcilié avec d'anciennes sauvegardes.
7. **TikTok** : pas de compte ni de post de test validé pour une publication réelle. Aucune publication n'est autorisée par défaut. Restent les validations créateur, droits médias, token expiré et résultat final côté TikTok.
8. **Qualité produit** : recette complète mobile/Safari/accessibilité et charge, livraison des offres warmés/clippers et droits des données externes non validés. Le SaaS web n'est pas une application macOS pilotant Chrome comme le produit de référence.

### Scripts et secrets

Les fichiers `.data/operations/*` contiennent des secrets locaux de préproduction (permissions 0600), exclus de Git et du déploiement. Ne pas les partager ni les joindre aux diagnostics. `scripts/configure-preview-email.mjs --browser` reçoit une nouvelle clé via un formulaire local temporaire, à nonce, limité à loopback, puis configure uniquement Vercel preview. Ne pas relancer la création de clé si la configuration existe déjà. Les exports temporaires d'environnement opérateur doivent être conservés de manière sécurisée ou supprimés après la bascule.

---

## Historique du premier audit (les états ci-dessus font foi)

## Fonctionnalités développées

- Offres 29 EUR/mois (3 jours d'essai pour nouveaux abonnés) et 99 EUR à vie. Choix explicite avant paiement. Aucun tarif Stripe de secours codé en dur.
- Transactions PostgreSQL sur un document JSONB de compatibilité ; verrou inter-processus + remplacement atomique du fichier local ; aucun échec de sauvegarde caché.
- Droits de session relus sur le serveur, révocation par version de session, récupération de compte par email.
- Un compte TikTok destinataire par post, publication verrouillée et résultat ambigu nécessitant vérification.
- Recherche de comptes réels, bibliothèque comparative, médiane et échantillon explicites ; découverte indexée via Brave et métriques publiques via Monid.
- Huit nouveaux outils MCP et skill SaaS identique dans public, Cursor et Claude ; export ZIP de recettes et slides.
- URL de médias privés vérifiées ; liens temporaires pour TikTok ; retour à privé révoquant les liens de partage.
- Requêtes média distantes bornées avec résolution DNS épinglée ; imports bornés ; dépendances actualisées ; polices de l'application embarquées.
- Tests métier, CI qualité et contrôle de configuration.

## Avant déploiement

### Vérifications locales réalisées

- Build de production Next.js réussi ; TypeScript sans erreur.
- 17 tests métier réussis et 15 contrôles HTTP/MCP sur serveur de production isolé, sans identifiants fournisseurs et sans modification des données utilisateur.
- 28 outils exposés par `tools/list` ; négociation MCP, comparaison et brief exécutés avec une clé de test.
- Audit npm des dépendances de production : aucune vulnérabilité connue signalée lors de cette recette.
- Tarifs et Recherche inspectés dans Chrome desktop et viewport mobile 390 px. Cela ne remplace pas une recette Safari/iOS ni un audit complet d'accessibilité.
- Aucun achat, email de récupération, déploiement, migration distante ou post TikTok réel déclenché.

### Configuration

1. Créer une base PostgreSQL et configurer DATABASE_URL dans staging. Exporter une sauvegarde complète du store JSON historique (pas l'export utilisateur partiel). Conserver la sauvegarde chiffrée hors dépôt.
2. Exécuter `npm run db:migrate -- /chemin/backup.json` avec DATABASE_URL. Le script refuse d'écraser une ligne existante. Vérifier les comptes, posts, canaux et clés après migration. Les écritures vers l'ancien Blob sont volontairement désactivées.
3. Configurer le stockage privé Blob, AUTH_SECRET (32 caractères aléatoires minimum), URL du site et CRON_SECRET. Pour travailler sur des données de production, utiliser un environnement staging séparé ; ne pas pointer le dev courant vers ces secrets.
4. Configurer Stripe. `npm run billing:provision` affiche les tarifs manquants ; `npm run billing:provision -- --apply` crée les deux produits/tarifs avec la clé explicitement fournie. Le script ne crée pas de souscription. Renseigner STRIPE_PRICE_PRO_MONTHLY et STRIPE_PRICE_LIFETIME. Utiliser une clé test pour la recette. Le checkout vérifie montant, devise et intervalle.
5. Configurer webhook Stripe et son secret : checkout.session.completed, checkout.session.async_payment_succeeded, customer.subscription.updated, customer.subscription.deleted, charge.refunded. Tester achat mensuel, essai, impayé, annulation, achat à vie, remboursement, événements dupliqués et désordonnés. Les anciens abonnements avec d'autres price IDs doivent faire l'objet d'une migration explicite avant activation de leurs webhooks dans cette version.
6. Configurer Brave Search (BRAVE_SEARCH_API_KEY), Monid (MONID_API_KEY), puis Resend (RESEND_API_KEY et EMAIL_FROM avec domaine vérifié). La découverte reste désactivée sans moteur connecté ; les profils peuvent être analysés sans métriques détaillées. La récupération de compte ne peut envoyer de message sans fournisseur email.
7. Vérifier l'approbation de l'application TikTok et du domaine des médias. Recette avec deux comptes pour confirmer le destinataire et le statut final. Tester expiration des tokens, refus créateur et erreur réseau après initialisation. Aucune publication réelle n'a été déclenchée pendant le développement.
8. Exécuter `npm run readiness`, `npm test`, `npm run typecheck`, `npm audit --omit=dev`, `npm run build`. Relancer le serveur après changement d'environnement.

## Points restant à valider / limites explicites

- La migration PostgreSQL n'est pas exercée tant qu'une base de staging n'est pas fournie. Le verrou global JSONB évite les pertes de données mais ne constitue pas encore une architecture à très grande échelle : partitionner par workspace et tables métier avant forte charge.
- Le cron GitHub est best effort. Les publications ont un verrou durable, mais il faut un déclencheur supervisé et un objectif de retard mesuré. Après INITIATING sans résultat, intervention nécessaire ; aucun retry automatique risquant un doublon.
- La découverte est une recherche indexée avec vérification de profils, pas le pilotage local du Chrome de l'utilisateur comme scroll.show. Une app macOS/extension serait un produit complémentaire, absent de ce dépôt web.
- Les recettes HTML/CSS ne sont pas exportées : convertir vers les overlays supportés. Le service refuse explicitement une exportation infidèle.
- La suppression de compte annule l'abonnement connu et retire les références utilisateur. La suppression physique différée des fichiers, les sauvegardes et la révocation confirmée de tous les tokens externes nécessitent encore une politique de rétention et une tâche de nettoyage suivie.
- Vérification email à l'inscription et changement d'email avec double confirmation restent à compléter. Le changement d'email non vérifié est bloqué ; la récupération et Google vérifient le contrôle de l'adresse. Les anciennes sessions sont invalidées lors d'un changement de mot de passe.
- Quotas actuellement définis : recherche 30 comptes/jour, 10 découvertes/jour, 20 reconstructions/jour, 30 rendus/jour, 20 exports/jour, 120 requêtes API/minute. Ajuster selon coûts réels. L'offre à vie ne finance pas un usage serveur illimité.
- Les nouvelles clés API expirent après 90 jours. Les clés historiques sont conservées pour compatibilité ; rotation et scopes fins à organiser. Les URL MCP avec clé restent compatibles : privilégier un en-tête Authorization et filtrer les logs d'accès.
- Contenus privés/publics, droits des médias, conditions de vente, obligations de rétractation, politique à vie et mentions légales doivent être validés pour l'entité qui vend le service.
- Comptes warmés / clippers : fonctionnalités existantes, chaîne opérationnelle de livraison non validée ; ne pas les annoncer comme automatisées sans opérateur.
- À faire avant ouverture large : recette mobile/Safari/accessibilité, tests de charge, sauvegarde/restauration, observabilité avec alertes et service support.

## Positionnement

Le cœur livré est recherche → décision créative avec l'assistant → carrousel → calendrier → mesure. Les métriques ont une provenance et un échantillon. Le SaaS n'annonce pas une garantie de vues ou une probabilité de shadowban scientifiquement validée. Les abonnements Claude/Cursor/Codex sont séparés.

Le site de référence a été consulté pour ses usages, sans reproduire son identité, ses témoignages, ni prétendre disposer de son moteur macOS : https://scroll.show/.
