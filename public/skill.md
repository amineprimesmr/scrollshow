---
name: scrollshow
description: Research TikTok accounts, compare measured slideshow performance, plan original carousels for a business, edit and export slides, and schedule or publish through the ScrollShow SaaS MCP server. Use for ScrollShow research, content strategy, carousel editing, calendar and analytics.
---

# ScrollShow SaaS

Use the connected ScrollShow MCP server. This is the web studio at https://scrollshow.io, not a local Chrome automation app. Call `whoami` first for the business, plan, capabilities and quotas. Do not claim unavailable capabilities: discovery needs a configured search provider, detailed public-post metrics need a data provider, and live publication needs an authorized TikTok account.


## Install and activate

Installing this skill is free. The tools only answer for a ScrollShow account with active access, so treat setup as two distinct steps.

1. **Install the connector.** Add the MCP server `https://scrollshow.io/api/mcp` to the host (Claude Code: `claude mcp add --transport http scrollshow https://scrollshow.io/api/mcp`; Cursor and Codex: their MCP configuration file). The key goes in the connector configuration, never in chat, a commit or a shell history.
2. **Get the key.** The user creates it at https://scrollshow.io/app/settings, in the developer access section. If they have no account yet, send them to https://scrollshow.io/signup.

Then read the server's answer instead of guessing:

- `payment_required` (HTTP 402): the account exists but has no active access. Tell the user to activate it at https://scrollshow.io/pricing, with the email the refusal names. The skill stays installed and starts working as soon as the payment is confirmed; do not reinstall anything and do not retry in a loop.
- `invalid_key` (HTTP 401): the key is unknown or revoked. Ask the user to issue a new one in their settings and to replace it in the connector configuration.
- No tool at all: the connector is not installed in this host. Help them add it; a pasted URL does not install anything.

Never ask the user to paste a key into the conversation, never invent one, and never present the account as active until a tool call actually succeeds.

## First conversation

Connection setup and a task prompt are different. Keep API keys in connector configuration, never in chat. If tools are absent, help the user enable the connector; do not pretend a pasted URL installs it. If access is refused, ask them to check account activation and credentials in ScrollShow, never to paste a secret into chat.

For the first-carousel request, follow the server's `start_scrollshow` prompt: call `whoami`, `get_content_brief` and `list_posts`; use existing business context and avoid duplicate drafts. Propose three original hooks and save one five-slide editable private draft. Ask only for indispensable missing context. No automatic scheduling, publication or public sharing. Confirm creation only from a successful tool response, with the actual post ID. After an uncertain write, inspect existing posts before retrying.

## Research that leads to useful content

- `analyze_account` reads and saves a named public account. `discover_accounts` searches indexed candidates by niche and verifies up to five profiles. It may take several minutes; `list_runs` retains saved results. Do not fabricate profiles or promise exhaustive TikTok search.
- `compare_accounts` compares saved measurements. Use median views, slideshow share, views per follower, observed cadence and sample size. Dates matter; say when the evidence is old or too small. A missing metric is unknown, not zero.
- `search_library` and `get_account` retrieve saved accounts without another external analysis.
- `get_content_brief` supplies the business, research evidence and existing calendar. Turn those into original hooks, slide outlines, CTAs and an editorial plan. Cite concrete source posts for the observed pattern; label creative recommendations as hypotheses.
- Save requested drafts with `create_post` and `status=draft`. Include actual slide overlays in `recipe`, not just a caption. Offer a compact rationale for the audience, hook and CTA. Do not promise views, US distribution or removal of a shadowban.

## Create and edit

`list_posts`, `list_media`, `list_marketplace`, `get_recipe` find existing work.
`import_tiktok` copies a public slideshow. Only import or republish assets the user has the rights to use.
The text in an imported JPEG is not editable until `reconstruct_post` produces usable overlays. Reconstruction uses OCR by default and may need manual corrections; inspect returned overlays instead of promising exact extraction.

Use `update_recipe` for text, fonts, colors and layout; `update_post` for caption, date, channel and status. Keep unrelated positions and source references. Use `fork_post` to adapt an existing format into a private draft.

Supported publishable source is images, backgrounds and text overlays. HTML/CSS recipes can be previewed but are rejected for export/publication; convert them into supported overlays before proceeding.

`export_post` returns the recipe and a ZIP download link for the user to open while logged into ScrollShow. The archive includes rendered slides and caption. Do not claim it has been downloaded to the user's Mac unless a download actually completed.

## Publish to the correct account

1. Read `list_channels`; identify the intended connected account. Pass its `channelId` explicitly when several accounts exist.
2. Call `get_creator_options` for that channel. Use current available privacy options. Ask the user for any missing publication choice; do not choose privacy or branded-content disclosure for them.
3. For scheduling, `create_post` or `update_post` needs date, time, one channel and `tiktok` options. Dates/times use workspace timezone. Drafting does not authorize scheduling or publishing.
4. For an authorized immediate publication, call `publish_now` with the saved post `id`, `channelId`, caption and explicit privacy/disclosure. The service renders supported overlays and records the submission.
5. `publish_status` reconciles `publish_id`. PROCESSING is not success; only PUBLISH_COMPLETE confirms publication. REVIEW_REQUIRED or an uncertain initialization must be checked before another attempt to avoid duplicates.

`delete_post` removes work; `set_visibility` shares a format publicly or revokes public visibility. Share only when asked. Returning a post to private disables its share link.

## Reports and boundaries

Use `get_analytics` or `get_report` for performance. Explain trends using dated measurements and distinguish lifetime counters from period growth. `shadowban_check` is a heuristic signal, never a calibrated probability or proof of platform enforcement.

Present a short comparison plus a recommendation and the next useful action. Link account handles and source posts. Never include API credentials in a report, shared recipe, screenshot or public link. API access is not authorization for unrelated account changes, payments or publication.

The assistant writes strategy and content using the user's chosen AI service. ScrollShow stores evidence and executes supported actions; it does not include the user's Claude/Cursor/Codex subscription.
