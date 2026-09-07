# ScrollShow — prompt d'installation MCP universel

Copie tout le bloc ci-dessous (avec ta clé) et colle-le dans le chat de ton IA
(Claude Code, Claude Desktop, Cursor, Codex CLI...). L'IA doit avoir accès à
ton système de fichiers (agent en mode CLI/desktop, pas un chat web classique).

---

```
Tu es un agent IA avec accès au système de fichiers local. Configure le serveur MCP "scrollshow" pour moi, automatiquement, sans me demander de le faire à la main.

Infos :
- URL MCP : https://scrollshow.io/api/mcp
- Clé API : ss_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
- Header attendu : Authorization: Bearer <clé>

Étapes à suivre :
1. Détecte quel outil tu es actuellement (Claude Code, Claude Desktop, Cursor, Codex CLI, etc.) à partir de ton contexte d'exécution.
2. Trouve ou crée le fichier de config MCP correspondant à cet outil :
   - Claude Code (projet) : ./.mcp.json
   - Claude Desktop (macOS) : ~/Library/Application Support/Claude/claude_desktop_config.json
   - Cursor : ~/.cursor/mcp.json (ou ./.cursor/mcp.json si un projet est ouvert)
   - Codex CLI : cherche son fichier de config MCP (souvent ~/.codex/config.toml ou équivalent JSON) ; si tu ne le trouves pas, dis-le moi au lieu de deviner.
3. Ajoute/mets à jour une entrée "scrollshow" pointant vers l'URL ci-dessus, avec le header Authorization en Bearer avec la clé fournie. Respecte le format JSON/TOML déjà utilisé dans ce fichier (ne casse pas les autres entrées existantes).
4. Si l'outil nécessite un redémarrage ou une reconnexion pour prendre en compte le nouveau MCP, dis-le moi clairement.
5. Une fois connecté, appelle l'outil MCP "whoami" du serveur scrollshow pour vérifier que ça fonctionne, et affiche-moi le résultat (utilisateur, plan, statut TikTok).
6. Si "whoami" échoue, affiche l'erreur brute et n'invente rien.
```

---

## Génère une clé fraîche pour toi

```bash
node scripts/provision-mcp.mjs
```

Ce script régénère une clé, met à jour `~/.cursor/mcp.json` et
`~/Library/Application Support/Claude/claude_desktop_config.json`, et écrit
`SCROLLSHOW_API_KEY` dans `.env.local`. Remplace la clé `ss_live_XXXX...` du
prompt ci-dessus par celle affichée en sortie (`prefix`, ou lis le fichier
`~/.scrollshow/api-key`).

## Limite connue

Une fois la clé injectée dans `.mcp.json`/`.env.local`, une session déjà
ouverte (comme une session Claude Code en cours) ne recharge pas la variable
d'environnement à chaud — il faut redémarrer la session pour que la nouvelle
clé soit prise en compte.
