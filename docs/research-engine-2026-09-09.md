# Moteur de recherche ScrollShow — 9 septembre 2026

Cette implémentation est propre à ScrollShow.io. Elle reprend les usages observables du produit concurrent sans embarquer son code. Le moteur sert le studio, les agents MCP, l’API REST et un collecteur Chrome optionnel.

## Chaîne opérationnelle

1. Définir une niche, plusieurs mots-clés, une période de publication et des critères mesurables.
2. Rechercher des publications photo natives et dédupliquer les comptes candidats.
3. Parcourir les publications de chaque compte, en sauvegardant chaque page et son curseur.
4. Séparer carrousels et vidéos, distinguer valeurs inconnues et zéro, mesurer l’échantillon.
5. Retenir ou rejeter chaque compte avec des motifs explicites. Conserver les exemples rejetés pour éviter de présenter une sélection opaque.
6. Ouvrir un carrousel, conserver ses images, sa légende, sa source et la date des compteurs ; tenter une transcription OCR.
7. L’assistant connecté inspecte les images, compare les exemples et sauvegarde une interprétation sourcée : accroche, narration, audience, émotion, composition, appel à l’action et adaptation originale.
8. Comparer les familles étudiées avec les médianes de comptes ; transformer les hypothèses utiles en publications originales dans le calendrier existant.

## Collecte, reprise et limites

Le moteur cloud utilise le service de métriques configuré. La recherche photo est native, distincte d’une recherche web de profils. La tâche contient mots-clés, curseurs, candidats, pages mesurées, filtres, résultats, historique et erreurs. Chaque étape possède un bail exclusif de 180 secondes ; une réponse tardive ne peut pas écraser un arrêt ou une reprise. Un identifiant de requête fourni évite les démarrages dupliqués.

Chaque étape cloud collecte une page. Les bornes par défaut sont 10 comptes retenus, 3 pages par compte, 2 pages de recherche par mot-clé et 30 jours. Les plafonds sont 50 retenus, 200 candidats, 10 pages par compte et 30 mots-clés. Le pivot de hashtags est optionnel et borné. Atteindre la profondeur maximale produit une couverture partielle, pas une prétendue analyse exhaustive.

Le client peut mettre en pause, reprendre, arrêter, ou modifier les filtres sans perdre les mesures. Élargir la période d’un résultat déjà mesuré invalide sa couverture complète : une nouvelle mesure est nécessaire. Un CAPTCHA ou une connexion demandée au collecteur place la tâche en attente d’intervention ; aucun contournement automatique n’est implémenté.

Les tâches avancent après la réponse HTTP, par l’action explicite d’un agent, ou par le job GitHub de recherche toutes les cinq minutes. Le déclenchement GitHub n’est pas une garantie de délai exact. Le cron Vercel de recherche n’est pas utilisé sur Hobby. Le job GitHub existant doit avoir `PRODUCTION_AUTOMATIONS_ENABLED=true` et son secret `CRON_SECRET`.

## Ce que signifient les mesures

- Vues totales, moyenne, médiane et quartiles : uniquement les photos dont le compteur est connu, parmi les publications de la période.
- Part de carrousels : photos / publications observées dans la période.
- Vues médianes / abonné : disponible uniquement si le nombre d’abonnés est positif.
- Engagement : likes + commentaires + partages / vues, sur les seuls posts aux compteurs connus. Les enregistrements sont mesurés séparément.
- Concentration : poids du meilleur post dans les vues observées. Une concentration supérieure à 60 % est signalée.
- Taille d’échantillon : moins de 5 carrousels est insuffisant ; 5 à 19 reste limité ; 20 et plus est utile, sans devenir statistiquement représentatif de TikTok.
- Régularité : dispersion des intervalles de publication ; ce n’est pas une mesure de répétabilité virale.
- Lift d’un exemple : vues du post / médiane des photos mises en cache du même compte, avec au moins 5 observations. Cette comparaison utilise des compteurs cumulés, potentiellement d’âges différents.

Le service ne mesure pas la croissance des vues entre deux dates, les conversions, la rétention slide par slide, les impressions complètes de TikTok ou la causalité d’un format. Une absence de données ne devient pas un zéro réel.

Une famille est une structure récurrente à partir de 3 études réparties sur 2 comptes. Un signal de performance prometteur exige également au moins 3 lifts mesurés sur 2 comptes et une médiane supérieure à 1. Ces seuils sont heuristiques. La sélection des études crée un biais ; comparer aussi des exemples ordinaires et faibles, puis tester des créations originales.

## Lecture des slides et intelligence

Tesseract local réalise une première lecture et, sous 70 de confiance, une seconde avec segmentation de texte dispersé. Les transcriptions restent brutes ; aucun texte supposé n’est inventé. Sous 70, la slide est marquée incertaine et l’étude partielle. Le score OCR n’est pas une probabilité calibrée.

Le test réel a rencontré un collage esthétique avec texte décoratif que les deux traitements lisent mal (scores 43 et 56). Les images originales restent donc indispensables. Le serveur ne prétend pas comprendre automatiquement leur composition : l’assistant visuel connecté effectue cette analyse et enregistre une interprétation avec les numéros de slides servant de preuves. Aucune clé de modèle visuel serveur n’était configurée pendant cette validation.

L’étude fournit les images, la légende, les statistiques, la médiane et des exemples faibles/médians/forts du compte. L’export ZIP contient toutes les slides disponibles, `study.json`, `caption.txt` et une notice. Une erreur de téléchargement interrompt l’export plutôt que de livrer un ZIP prétendu complet. Limites : 35 slides, 8 Mo par fichier, 50 Mo au total. Les URL CDN peuvent expirer ; remesurer le compte et rouvrir l’étude actualise les URL.

## Interfaces

Studio : `/app/discover`, onglets Comptes, Recherches et Formats étudiés. Critères avancés, historique des tâches, contrôle de reprise, motifs de sélection, études et export.

MCP : `start_research`, `get_research_job`, `advance_research`, `control_research`, `study_carousel`, `get_format_study`, `save_format_analysis`, `compare_formats`, `export_research`. `analyze_account` et `discover_accounts` créent désormais une tâche et renvoient son identifiant ; il faut suivre cet identifiant au lieu de supposer un résultat final immédiat.

REST authentifié : `GET/POST /api/v1/research-jobs`, `GET/POST /api/v1/research-jobs/:id`, `GET/POST /api/v1/format-studies`, `GET/POST /api/v1/format-studies/:id`, `GET /api/v1/format-studies/:id/export`. Une action POST sur une tâche accepte `pause`, `resume`, `stop`, `advance`. Une étude accepte `interpretation` pour la sauvegarde ; sans interprétation, POST avance l’OCR. Les anciennes routes recherche/runs démarrent également les nouvelles tâches.

Le skill public et les copies Cursor, Claude et Codex décrivent la méthode : observer, mesurer, inspecter, comparer, justifier, adapter et déposer le contenu fini dans le calendrier selon la demande.

## Collecteur Chrome optionnel

Voir `public/research-collector.md`. Commandes :

```sh
npm run research:browser -- --login
npm run research:browser -- --job ID_DE_RECHERCHE
```

`SCROLLSHOW_COLLECTOR_TOKEN` est une clé de l’espace ScrollShow fournie par l’environnement, jamais dans une URL. Le profil dédié `~/.scrollshow/research-chrome` conserve la session TikTok localement ; il ne lit pas le profil Chrome personnel. Seuls les résultats normalisés repartent vers ScrollShow via HTTPS. Le collecteur n’ouvre pas de serveur local et ne like, ne suit et ne publie rien. Les comptes et études sont isolés par utilisateur. La suppression du compte ScrollShow retire également ses tâches et études.

Ce collecteur a été vérifié par types, validation des entrées, logique de bail et aide CLI. Le parcours TikTok connecté n’a pas été validé de bout en bout : il dépend d’une session TikTok dans ce profil dédié. Ce composant est un script Node/Chrome, pas une application desktop distribuée et signée.

## Configuration et coûts

`METRICS_API_KEY` et `METRICS_API_BASE` activent la collecte cloud. `RESEARCH_PROVIDER_DAILY_LIMIT` borne les étapes facturables (défaut 1000) ; le tarif par requête dépend du service configuré. Un premier appel réel de recherche photo a coûté 0,0015 USD ; ne pas extrapoler ce tarif à toutes les opérations. Plafonds supplémentaires : 30 démarrages/jour/utilisateur, 3 tâches actives, 120 appels OCR/jour/utilisateur, 20 exports/jour/utilisateur.

La persistance utilise le stockage existant (JSON local ou état JSONB verrouillé en base). Les reprises sont durables mais ce n’est pas encore un entrepôt analytique partitionné pour des millions de publications. Un débit massif nécessiterait des tables indexées et une file de workers dédiée. Aucun débit « ultra performant » non mesuré n’est annoncé.

## Validation effectuée

- 66 tests passent, dont les tests du moteur sur dates, valeurs inconnues, déduplication, pics isolés, normalisation web/app, pagination, baux, isolation, reprise, filtres élargis, sources d’études et export de schémas.
- Vérification TypeScript ciblée réussie ; configuration séparée pour éviter les doublons de types générés par des builds concurrents.
- Build de production isolé final réussi (Next.js 15.5.25, routes et pages générées).
- Test cloud réel : recherche `study tips`, 16 candidats, 3 profils mesurés, compte retenu `yummie4ever` avec 66 publications mises en cache dont 56 photos, 15 photos correspondant à la période de la tâche. Deux comptes sont rejetés pour absence de posts dans la période.
- Une étude de 8 slides et son ZIP de 1 121 546 octets ont été produits réellement. Le test OCR a révélé et documenté les limites sur texte décoratif.
- Le studio local affiche les comptes, les motifs de rejet, l’historique, les statistiques du carrousel, les slides et son lien d’export.
- Test HTTP sur le build final : rejet 401 sans authentification, création/lecture de tâche REST, pause/reprise, attribution et validation d’étape du collecteur, rejet d’un compte sans preuves, lecture d’une étude avec ses 8 slides et exemples de comparaison. Clé éphémère locale révoquée après test.
- Le skill passe son validateur.

Les résultats de test sont dans un stockage temporaire isolé, jamais injectés dans la bibliothèque d’un client. La validation du collecteur connecté, la robustesse face aux changements futurs de TikTok, la qualité de chaque interprétation d’assistant et la tenue à grande charge ne sont pas garanties par ces tests.

## Livraison

La release consolidée a été promue sur `https://scrollshow.io` : déploiement `dpl_HdJMryxBXPqFZMPLJqpFSSeZJKF7`, source figée `/tmp/scrollshow-final-release-tP08tUri`. Le build contient le manifeste recherche final ainsi que les changements QR, Agents et lecteur de carrousels. Le skill et le guide collecteur publics correspondent aux fichiers finaux. Les endpoints privés refusent les requêtes anonymes. Voir également `docs/deploiement-2026-09-09.md`.
