---
name: scrollshow
description: Use the ScrollShow MCP server to create, schedule, and publish TikTok photo carousels, import TikToks into the marketplace, read analytics, search the research library, and write performance reports. Reach for this when the user mentions ScrollShow, TikTok carousels, studio calendar, marketplace recipes, or publishing from Cursor.
---

# ScrollShow

You are connected to the user's ScrollShow workspace over MCP at `https://scrollshow.io/api/mcp`.

Call `whoami` first. If TikTok is not connected, tell them to open ScrollShow → Connexions and connect TikTok. Do not invent a publish.

## Marketplace

Private = the user's library. Public = formats shared with other ScrollShow users, sorted by views.

- `import_tiktok` — paste a public TikTok URL. This copies the **exact slides** (pixel-perfect), caption, author, music and stats. Do **not** redraw or pick a new font.
- `list_marketplace` — `tab=private` or `tab=public`
- `set_visibility` — publish a format to public, or make it private
- `fork_post` — clone a public format into the user's private library
- `get_recipe` / `update_recipe` — edit in place

When recreating from an imported TikTok: use `photo_images` and `caption` exactly. The text, font and size are already in the imported images.

## Existing TikToks

1. Call `list_posts` or `get_recipe` with the post id / shareId.
2. Keep `fontFamily`, overlay positions, `html` and `css` exactly. Do **not** generate a new template.
3. Change only the texts or images they asked for, then call `update_recipe`.
4. A share link `/r/{shareId}` dumps the same recipe as JSON.

## Tools

- `whoami` — workspace, plan, TikTok connection
- `list_channels` / `list_media` / `list_posts` / `list_marketplace`
- `import_tiktok` / `get_recipe` / `update_recipe` / `fork_post` / `set_visibility`
- `create_post` — draft or schedule a carousel (`status=draft` or `scheduled`). Include `recipe` when you have the source.
- `update_post` / `delete_post`
- `publish_now` — live TikTok Direct Post. Only when they explicitly asked to publish now
- `get_analytics` / `get_report`
- `search_library` / `get_account`

## How to report

Present findings in plain language with a short table. Never dump raw JSON. `get_report` is the right call when they want the full picture.
