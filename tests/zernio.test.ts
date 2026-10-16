import assert from "node:assert/strict";
import test from "node:test";
import { tiktokCarouselBody } from "../lib/zernio";

const base = { accountId: "acc", photos: ["https://scrollshow.io/a.webp"], caption: "Long caption", title: "Title" };

test("a public carousel needs an explicit privacy and maps to Zernio's photo shape", () => {
  assert.throws(() => tiktokCarouselBody({ ...base, options: { draft: false } }), /privacy_required/);
  const body = tiktokCarouselBody({ ...base, options: { draft: false, privacyLevel: "PUBLIC_TO_EVERYONE" } });
  assert.equal(body.content, "Title");
  assert.equal(body.tiktokSettings.description, "Long caption");
  assert.equal(body.tiktokSettings.privacyLevel, "PUBLIC_TO_EVERYONE");
  assert.equal(body.tiktokSettings.allowComment, false);
  assert.equal("publishNow" in body, true);
});

test("drafts need no privacy, schedules carry scheduledFor, branded content cannot be private", () => {
  const draft = tiktokCarouselBody({ ...base, scheduledFor: "2026-10-17T16:00:00.000Z", options: { draft: true } });
  assert.equal(draft.tiktokSettings.draft, true);
  assert.equal("privacyLevel" in draft.tiktokSettings, false);
  assert.equal("scheduledFor" in draft && draft.scheduledFor, "2026-10-17T16:00:00.000Z");
  assert.throws(() => tiktokCarouselBody({ ...base, options: { draft: false, privacyLevel: "SELF_ONLY", commercialContentType: "brand_content" } }), /branded_content_private/);
  assert.throws(() => tiktokCarouselBody({ ...base, photos: [], options: { draft: true } }), /photos_required/);
});
