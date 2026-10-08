import assert from "node:assert/strict";
import test from "node:test";
import { agentProposal, isCreatorApproved } from "../lib/tiktok-compliance";

test("only options chosen on the Post to TikTok page count as the creator's approval", () => {
  const chosen = { privacy: "SELF_ONLY" };
  assert.equal(isCreatorApproved({ tiktok: chosen, tiktokApprovedAt: "2026-09-22T10:00:00.000Z", createdAt: "2026-09-22T09:00:00.000Z" }), true);
  assert.equal(isCreatorApproved({ tiktok: chosen, createdAt: "2026-09-22T09:00:00.000Z" }), false, "an agent-supplied privacy is not an approval");
  assert.equal(isCreatorApproved({ tiktok: chosen, createdAt: "2026-09-10T09:00:00.000Z" }), false, "legacy posts also require creator approval");
  assert.equal(isCreatorApproved({ tiktok: { privacy: "" }, tiktokApprovedAt: "2026-09-22T10:00:00.000Z" }), false);
});

test("an agent may only pre-fill the editable title, never privacy, comments or disclosure", () => {
  const proposal = agentProposal({ title: "Hello", privacy: "PUBLIC_TO_EVERYONE", allowComment: true, commercial: true, brandContent: true }, "caption");
  assert.deepEqual(proposal, { title: "Hello", privacy: "", allowComment: false, autoAddMusic: false, commercial: false, brandOrganic: false, brandContent: false });
  assert.equal(agentProposal(null, "fallback caption").title, "fallback caption");
});

test("Upload to TikTok (inbox) only needs a title and sends MEDIA_UPLOAD-sized post_info", async () => {
  const { EMPTY_OPTIONS, validatePostOptions, photoPostInfo, coerceOptions } = await import("../lib/tiktok-compliance");
  const inbox = { ...EMPTY_OPTIONS, mode: "inbox" as const };
  assert.equal(validatePostOptions(inbox, null), "title_required");
  assert.equal(validatePostOptions({ ...inbox, title: "Hi" }, null), null, "privacy is chosen in the TikTok app");
  assert.deepEqual(photoPostInfo({ ...inbox, title: "Hi", privacy: "PUBLIC_TO_EVERYONE" }, "desc"), { title: "Hi", description: "desc" });
  assert.equal(coerceOptions({ ...inbox, title: "Hi" }).mode, "inbox");
  assert.equal(coerceOptions({ title: "Hi" }).mode, undefined, "legacy posts stay Direct Post");
  assert.equal(isCreatorApproved({ tiktok: { mode: "inbox", privacy: "" } as never, tiktokApprovedAt: "2026-10-08T10:00:00Z" }), true);
  assert.equal(isCreatorApproved({ tiktok: { mode: "inbox", privacy: "" } as never }), false, "still needs the studio approval");
});
