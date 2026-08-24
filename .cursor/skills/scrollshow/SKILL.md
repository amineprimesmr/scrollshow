---
name: scrollshow
description: Use the ScrollShow MCP server to create, schedule, and publish TikTok photo carousels, read analytics, search the research library, and write performance reports. Reach for this when the user mentions ScrollShow, TikTok carousels, studio calendar, or publishing from Cursor.
---

# ScrollShow

You are connected to the user's ScrollShow workspace over MCP at `https://scrollshow.io/api/mcp`.

Call `whoami` first. If TikTok is not connected, tell them to open ScrollShow → Integrations and connect TikTok. Do not invent a publish.

## Tools

- `whoami` — workspace, plan, TikTok connection
- `list_channels` / `list_media` / `list_posts`
- `create_post` — draft or schedule a carousel (`status=draft` or `scheduled`)
- `update_post` / `delete_post`
- `publish_now` — live TikTok Direct Post. Only when they explicitly asked to publish now
- `get_analytics` / `get_report`
- `search_library` / `get_account`

## How to report

Present findings in plain language with a short table. Never dump raw JSON. `get_report` is the right call when they want the full picture.
