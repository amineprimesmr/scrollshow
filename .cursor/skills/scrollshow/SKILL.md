---
name: scrollshow
description: Use the ScrollShow MCP server to create, schedule, and publish TikTok photo carousels, import TikToks into the marketplace, reconstruct them as editable layers, read analytics, search the research library, and write performance reports. Reach for this when the user mentions ScrollShow, TikTok carousels, studio calendar, marketplace recipes, or publishing from Cursor.
---

# ScrollShow

You are connected to the user's ScrollShow workspace over MCP at `https://scrollshow.io/api/mcp`.

Call `whoami` first. If TikTok is not connected, tell them to open ScrollShow → Connexions and connect TikTok. Do not invent a publish.

## Marketplace

Private = the user's library. Public = formats shared with other ScrollShow users, sorted by views.

- `import_tiktok` — paste a public TikTok URL. This **copies** the original slides (text is still baked into the JPEGs).
- `reconstruct_post` — **required** to make an import editable. Vision rebuilds each slide as background + text overlays (font, size, color, position). After this, `recipe.editable` is true and overlay texts can be changed.
- `import_tiktok` with `reconstruct=true` does copy + reconstruct in one call.
- `list_marketplace` — `tab=private` or `tab=public`
- `set_visibility` — publish a format to public, or make it private
- `fork_post` — clone a public format into the user's private library
- `get_recipe` / `update_recipe` — edit in place

Do **not** tell the user an imported TikTok is editable until `reconstruct_post` has run (or `recipe.editable` is true). Changing caption only does not change the text on the slides.

## Edit an imported TikTok

1. `import_tiktok` with the URL (or `list_marketplace` to find it).
2. `reconstruct_post` with the post id.
3. Change overlay `text` / `fontSize` / `color` / `x` / `y`, or `backgroundColor`, via `update_recipe`. Keep positions unless they asked to move them.
4. To publish live, `publish_now` with `id` of the post so overlays are rasterized into fresh PNGs.

## Existing editable TikToks

1. `get_recipe` with the post id / shareId.
2. Keep `fontFamily`, overlay positions, `html` and `css` unless asked otherwise.
3. Change only the texts or images they asked for, then `update_recipe`.
4. A share link `/r/{shareId}` dumps the same recipe as JSON.

## Tools

- `whoami` — workspace, plan, TikTok connection
- `list_channels` / `list_media` / `list_posts` / `list_marketplace`
- `import_tiktok` / `reconstruct_post` / `get_recipe` / `update_recipe` / `fork_post` / `set_visibility`
- `create_post` — draft or schedule a carousel (`status=draft` or `scheduled`). Include `recipe` when you have the source.
- `update_post` / `delete_post`
- `publish_now` — live TikTok Direct Post. Only when they explicitly asked to publish now. Pass `id` to rasterize an editable recipe.
- `get_analytics` / `get_report`
- `search_library` / `get_account`

## How to report

Present findings in plain language with a short table. Never dump raw JSON. `get_report` is the right call when they want the full picture.
