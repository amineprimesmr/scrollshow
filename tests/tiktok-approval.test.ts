import assert from "node:assert/strict";
import test from "node:test";
import { agentProposal, isCreatorApproved } from "../lib/tiktok-compliance";

test("only options chosen on the Post to TikTok page count as the creator's approval", () => {
  const chosen = { privacy: "SELF_ONLY" };
  assert.equal(isCreatorApproved({ tiktok: chosen, tiktokApprovedAt: "2026-09-22T10:00:00.000Z", createdAt: "2026-09-22T09:00:00.000Z" }), true);
  assert.equal(isCreatorApproved({ tiktok: chosen, createdAt: "2026-09-22T09:00:00.000Z" }), false, "an agent-supplied privacy is not an approval");
  assert.equal(isCreatorApproved({ tiktok: chosen, createdAt: "2026-09-10T09:00:00.000Z" }), true, "posts saved before the marker keep working");
  assert.equal(isCreatorApproved({ tiktok: { privacy: "" }, tiktokApprovedAt: "2026-09-22T10:00:00.000Z" }), false);
});

test("an agent may only pre-fill the editable title, never privacy, comments or disclosure", () => {
  const proposal = agentProposal({ title: "Hello", privacy: "PUBLIC_TO_EVERYONE", allowComment: true, commercial: true, brandContent: true }, "caption");
  assert.deepEqual(proposal, { title: "Hello", privacy: "", allowComment: false, commercial: false, brandOrganic: false, brandContent: false });
  assert.equal(agentProposal(null, "fallback caption").title, "fallback caption");
});
