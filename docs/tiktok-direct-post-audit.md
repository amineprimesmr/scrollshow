# TikTok Direct Post audit — resubmission kit

App: **ScrollShow** (app id 7673250598694963220). Rejected audit reference: **20260829130012**.
Rejection reason given by TikTok (tooltip on the "Reapply" button):

> Your application did not follow our UX Guidelines. Please refer to point 1/4/5 under
> "Required UX Implementation in Your App" in the Content Sharing Guidelines. All the
> requirements mentioned here need to be shown in the demo video. The demo video should show
> the complete end-to-end flow of the integrations with TikTok and the ending must show that
> had been posted under TikTok.

Guidelines: https://developers.tiktok.com/doc/content-sharing-guidelines/#required_ux_implementation_in_your_app

## 1. What the app now does (guideline → implementation)

| # | TikTok requirement | Where | Status |
|---|---|---|---|
| 1a | Post page shows the creator's **nickname** from a fresh `creator_info` | `TikTokPublishPanel` header (avatar + nickname + @username), fetched on every open, `Cache-Control: no-store` | ✅ |
| 1b | If `creator_info` says the creator cannot post now → stop and say "try again later" | `queryCreatorInfo` maps `spam_risk_*`, `reached_active_user_cap`, `unaudited_client_can_only_post_to_private_accounts` → red banner, publish disabled; server refuses with `creator_*` | ✅ |
| 1c | Video duration ≤ `max_video_post_duration_sec` | N/A — photo carousels only (value is still stored in the snapshot) | n/a |
| 2a | Title field | Required, 90 chars, editable, empty by default | ✅ |
| 2b | Privacy from `privacy_level_options`, **no default**, manual choice | `<select>` with a disabled "Select…" placeholder; server validates against the fresh options | ✅ |
| 2c | "Allow comment" **unchecked by default**, greyed when the creator disabled comments; no Duet/Stitch for photos | Single checkbox, off by default, disabled + hint when `comment_disabled`; duet/stitch fields no longer sent for photos | ✅ |
| 2 note | Declaration before the publish button: *"By posting, you agree to TikTok's Music Usage Confirmation"* | Rendered above the button, linked to the Music Usage Confirmation page | ✅ |
| 3a | Commercial-content toggle **off by default**; reveals "Your brand" / "Branded content"; label prompts | Toggle → sub-checkboxes → *"Your photo will be labeled as 'Promotional content' / 'Paid partnership'"* | ✅ |
| 3a | Toggle on + nothing checked → publish disabled + hover text *"You need to indicate if your content promotes yourself, a third party, or both."* | Button disabled, wrapper `title` tooltip, inline warning | ✅ |
| 3b | Branded content cannot be private | "Only me" option disabled when Branded content is checked (with hint) **and** Branded content disabled when "Only me" is chosen (with hint) | ✅ |
| 4 | Declaration switches to *"…Branded Content Policy and Music Usage Confirmation"* when Branded content is checked | Yes, both links | ✅ |
| 5a | Preview of the content | Slide preview + thumbnails (existing) | ✅ |
| 5b | No watermark; preset text editable | No watermark in the rasterizer; caption, title and every on-slide text are editable | ✅ |
| 5c | Send to TikTok only after explicit consent | Nothing is sent before "Post to TikTok" is clicked; the button is disabled until every rule passes | ✅ |
| 5d | Tell the user it may take a few minutes | Note under the declaration + processing status after publish | ✅ |
| 5e | Poll `publish/status/fetch` | Modal polls `/api/tiktok/publish/status` every 4 s → PROCESSING → "Posted to TikTok · View on TikTok" / failure reason | ✅ |
| — | Intended use: authentic creators, wide audience | Do **not** show `import_tiktok` / marketplace copying in the demo | ⚠️ demo only |

Also removed: global defaults for privacy, comments and disclosure in Settings (they contradicted 2b/2c/3a). The scheduler and the MCP `publish_now` tool now require the creator's explicit choices; a scheduled post without them is held with the error `tiktok_options_required` instead of being posted with guessed settings.

## 2. Demo video script (record in **English**, Settings → language = English)

Record the browser at **https://scrollshow.io** (the domain must match the app's Website URL). One continuous take, no cuts, ~2–3 minutes. Keep the TikTok app / tiktok.com ready on the side.

1. **Open scrollshow.io**, show the URL bar clearly.
2. Sign in, go to **Accounts → Continue with TikTok**. Show the TikTok consent screen listing the scopes (`user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`, `video.publish`, `video.upload`) and accept. Land back in ScrollShow with the account visible (Login Kit, `user.info.*`).
3. Show **Analytics** for 5 seconds (that demonstrates `video.list` + `user.info.stats`). If you don't want to keep those scopes, remove them from the app before submitting — unused scopes delay the review.
4. Click **New post**. Pick 2–3 slides, type an on-slide text, show the **preview** updating (5a/5b). Type a caption.
5. Scroll to the **Post to TikTok** panel. Point the cursor at the **"Will be posted to … @username"** header (1a).
6. Type a **Title** (2a).
7. Open **"Who can view this post"** — show that nothing is preselected, then pick **Everyone** (2b).
8. Hover **"Allow comment"** (off), tick it (2c).
9. Turn on **"Disclose commercial content"**. Show the warning + the disabled button with the hover text. Tick **"Your brand"** → the *"Promotional content"* prompt appears. Tick **"Branded content"** → *"Paid partnership"* and the declaration changes to *Branded Content Policy and Music Usage Confirmation* (3a/4). Open the privacy dropdown to show **"Only me" is unavailable** (3b). Untick Branded content, keep Your brand (or turn the toggle off — your choice for the real post).
10. Read the **declaration** line and the **"may take a few minutes"** note on camera (2 note / 5d).
11. Click **Post to TikTok**. Show the **processing status** appearing, wait for **"Posted to TikTok"** (5e). Do not cut.
12. Click **View on TikTok** (or open the TikTok app) and show the **published carousel on the profile**, with the Promotional-content label if you used it. **End the recording on the TikTok post.**

Before recording: connect the real account (sandbox is only required for never-approved apps; ScrollShow is already Live), make sure the account is not hitting the daily caps, and clear any old failed post from the calendar.

## 3. Text for the "Reapply" form (Content Posting API – Direct Post)

> ScrollShow (scrollshow.io) lets creators design TikTok photo carousels and post them to their own TikTok account with Direct Post. The Post to TikTok page implements the Required UX Implementation in full:
> (1) it fetches creator_info every time it opens, displays the creator's nickname and avatar, and blocks posting with a "try again later" message when creator_info reports the creator cannot post;
> (2) the user enters a title, must manually select the privacy status from the options returned by creator_info (no default), and must opt in to "Allow comment" (off by default, greyed out when disabled in the creator's TikTok settings). Duet/Stitch are not shown because we only post photos. The declaration "By posting, you agree to TikTok's Music Usage Confirmation" is displayed above the publish button;
> (3) commercial content disclosure is off by default; enabling it reveals "Your brand" (labeled "Promotional content") and "Branded content" (labeled "Paid partnership"); publishing is disabled with an explanatory hover text until one is selected, and branded content cannot be combined with private visibility;
> (4) the declaration switches to "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation" when branded content is selected;
> (5) the content is previewed, all text is editable, nothing is sent to TikTok before the user clicks Post, the user is told the post may take a few minutes to appear, and the app polls publish/status/fetch and shows the result with a link to the post.
> No watermark or promotional text is added. Estimated usage: <N> creators / day. The demo video shows the full flow on scrollshow.io, from TikTok login to the post visible on the TikTok profile.

Replace `<N>` with a realistic daily-creator estimate (the creator cap will be set from it).

## 4. Verification done on 7 Sep 2026

- `tsc --noEmit` clean.
- Manual run on localhost: panel renders, privacy has no default, comments off, disclosure toggle off; branded → paid-partnership label, declaration change, "Only me" disabled; "Only me" → branded disabled; toggle-without-choice → disabled button with tooltip; creator API error → "Could not read the TikTok account"; blocked codes → try-again-later banner.
- Not exercised locally: a real Direct Post (the local seed token is fake). Test once on production with the real account before recording.
