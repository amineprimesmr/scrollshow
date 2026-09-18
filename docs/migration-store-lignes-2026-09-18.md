# Store : du document unique aux lignes par enregistrement (18 septembre 2026)

## Pourquoi
`scrollshow_state` est UN document JSONB pour tous les utilisateurs. Toute écriture prend le seul
verrou du produit, réécrit des Mo, invalide le cache de toutes les instances ; 1 à 4 Mo par
utilisateur actif ; mur dur ~255 Mo. Il tient quelques centaines de comptes, pas des milliers.

## Ce qui change
`lib/store-rows.ts` : chaque élément d'une collection devient une ligne de `scrollshow_rows`
(`collection`, `rid`, `user_id`, `ord`, `data jsonb`), indexée par collection et par propriétaire.
`lib/store.ts` garde **la même API** (`readStore`, `readStoreSlice`, `updateStore`,
`updateStoreSlice`, `readRowVideos`, `readUserScope`) et aiguille vers ce moteur dès que la table existe.

- **Portée par utilisateur** : `readStoreSlice(keys, { userId })` / `updateStoreSlice(keys, fn, { userId })`
  ne lisent, n'écrivent et ne verrouillent que les lignes de cet utilisateur. Deux utilisateurs ne
  s'attendent plus. Sans `userId`, comportement d'avant (toute la collection) pour cron, webhooks,
  sauvegarde, suppression de compte.
- **Diff par ligne** : une écriture ne réécrit que les lignes qui ont changé (ou changé de rang).
- **Index d'authentification** : `findStoreRows("apiKeys", "hash", …)`, `findStoreRows("users", "email", …)`.
- Les valeurs qui ne sont pas des listes d'objets (drapeaux, dictionnaires, listes de chaînes,
  tableaux vides) vivent dans la collection `@meta` ; une portée utilisateur peut les lire, pas les modifier.
- Les moteurs **fichier** (dev, tests) et **document** appliquent la même sémantique de portée : les
  207 tests attrapent une portée mal posée sans base.
- Le JSON envoyé est toujours accepté par Postgres (`safeJson` : demi-caractères, caractère nul).

## Validation faite
- `scripts/test-store-rows.mts` sur un **PostgreSQL 18 réel** avec **ton store réel** (15 Mo, 26
  collections, 3 298 lignes) : 16 opérations rejouées sur l'ancien et le nouveau moteur, stores
  identiques après chacune ; lectures portées, vidéos par ligne, index, garde-fous de portée ;
  **concurrence** : 40 écrivains parallèles sur 5 utilisateurs + 12 incréments concurrents sur une
  même ligne + portée contre sans-portée, rien de perdu ; **bascule à chaud** : un écrivain parti en
  mode document pendant la migration attend le verrou puis rejoue sur les lignes.
- L'application entière lancée sur le moteur lignes : Overview, insights, gestionnaire (masquer /
  réafficher), création et suppression de post, shadowban, recherche — lectures ~40 ms, écritures ~100 ms.

## Bascule en production — pas à pas

> Neon n'accepte que les connexions de Vercel (liste d'IP) : depuis un poste, `npm run db:rows`
> échoue en `ECONNRESET`. La même logique est exposée par la route d'administration
> `POST /api/admin/store-rows` (secret des crons), à appeler **après** déploiement du code :
> ```bash
> curl -s -X POST https://scrollshow.io/api/admin/store-rows -H "Authorization: Bearer $CRON_SECRET" \
>   -H "Content-Type: application/json" -d '{"action":"dry-run"}'      # puis "apply", "status", "back"
> ```

Aucune fenêtre de maintenance nécessaire : la migration tient le verrou du document pendant toute la
copie (quelques secondes), la table n'apparaît qu'au commit, déjà complète et **vérifiée** ligne à ligne.
Les instances basculent à leur requête suivante. `scrollshow_state` n'est ni modifié ni supprimé.

1. Déployer ce code (il tourne en mode document tant que la table n'existe pas).
2. `vercel env pull` (ou exporter `DATABASE_URL_UNPOOLED` de Neon), puis :
   ```bash
   npm run db:rows -- --status
   ```
3. Essai à blanc (tout est fait puis annulé, rien n'est modifié) :
   ```bash
   npm run db:rows
   ```
4. Bascule réelle :
   ```bash
   npm run db:rows -- --apply
   ```
5. Vérifier : `npm run db:rows -- --status` (table présente, comptes par collection), ouvrir le studio,
   `npm run readiness` / `node scripts/verify-database.mjs`.
6. Retour arrière si besoin (reconstruit le document depuis les lignes, retire la table) :
   ```bash
   npm run db:rows -- --back --apply
   ```
   puis redéployer (une instance qui a vu la table la garde en mémoire).

Droits requis sur le rôle Neon : `CREATE TABLE`, `CREATE INDEX` (mêmes droits que pour
`scrollshow_rate_limits`, déjà créée à la volée).

## Après la bascule
- `npm run db:rows -- --status` régulièrement : la taille par collection dit où va le poids.
- Les chemins encore **sans portée** (lus/écrits sur toute la collection) : cron de publication et de
  recherche, webhook Stripe, onboarding, OAuth/MCP (`lib/oauth.ts`, `lib/agent.ts`), suppression de
  compte, sauvegarde. Ils marchent ; ils restent les candidats suivants si leur charge monte
  (`grep -n "readStoreSlice(\[" lib app | grep -v userId`).
- `researchJobs` (660 Ko par tâche) et `publicationText` ne sont toujours pas purgés : la ligne par
  enregistrement rend la purge triviale (`DELETE … WHERE collection = 'researchJobs' AND updated_at < …`).
- `scrollshow_state` peut être archivé puis supprimé après quelques semaines de bascule sans incident.
