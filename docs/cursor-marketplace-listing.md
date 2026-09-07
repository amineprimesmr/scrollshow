# ScrollShow — fiche pour le Cursor Marketplace

Cursor gère son marketplace via son propre process de soumission (compte développeur
Cursor + review), pas par un fichier dans ce repo. Cette fiche contient tout le
contenu prêt à coller dans leur formulaire — la soumission elle-même se fait sur
https://cursor.com (chercher "submit a plugin" / "publish to marketplace" dans leurs
docs, ça évolue régulièrement donc vérifie l'URL exacte au moment de soumettre).

## Identité

- **Nom** : ScrollShow
- **Slogan** : Generate and publish TikTok photo carousels using ScrollShow MCP from Cursor.
- **Logo** : `/logo.png` (ScrollShow, fond blanc, 512×512 recommandé pour le marketplace)
- **Lien "View Source"** : https://scrollshow.io (ou le repo si Cursor exige un repo public)

## Description longue

Connect Cursor to your ScrollShow workspace: create and schedule TikTok photo
carousels, read TikTok analytics, search your saved research library, reuse
exact carousel recipes (fonts, overlays, images), and publish live to TikTok —
all from a prompt.

## Commande d'installation (slash command, comme `/add-plugin higgsfield`)

```
/add-plugin scrollshow
```

## Bloc MCP (ce que Cursor doit enregistrer)

```json
{
  "mcpServers": {
    "scrollshow": {
      "url": "https://scrollshow.io/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_SCROLLSHOW_API_KEY"
      }
    }
  }
}
```

L'utilisateur récupère sa clé (`ss_live_...`) sur scrollshow.io → Réglages → MCP.
C'est un Bearer token par utilisateur (voir `resolveApiKey` dans
[lib/api-keys.ts](../lib/api-keys.ts)), pas un OAuth flow — donc pas de "Connecter et se
connecter" en un clic comme Higgsfield ; l'utilisateur colle sa clé une fois.

## Commande listée (équivalent du "higgs" de Higgsfield)

- **Nom** : `scrollshow`
- **Description courte** : Create, schedule, and publish TikTok carousels with the current ScrollShow MCP tools.

## Ce qui reste à faire, côté toi

1. Créer/te connecter à un compte développeur sur cursor.com.
2. Ouvrir leur flow de soumission marketplace et coller le contenu ci-dessus.
3. Nous donner l'URL finale (`cursor.com/marketplace/scrollshow`) une fois publiée
   — je mettrai à jour l'onglet Cursor de [DeveloperAccess.tsx](../components/studio/DeveloperAccess.tsx)
   pour pointer vers cette page en plus du deeplink direct actuel.
