import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyStore, readStoreSlice, updateStoreSlice } from "../lib/store";
import { backfillProjects } from "../lib/projects";
import { recipeFromPhotos } from "../lib/recipe";
import { agentUpdateRecipe, agentUpdatePost, agentPublish } from "../lib/agent";
import { dispatchPost } from "../lib/publication-jobs";
import { directPostPhotos, validateStudioSchedule } from "../lib/tiktok-publish";
import { EMPTY_OPTIONS, isCreatorApproved, normalizeCreator, validatePostOptions } from "../lib/tiktok-compliance";
import { allowedCoverUrl } from "../lib/tiktok-cover";
import type { SessionUser, StudioPost, User } from "../lib/types";

test("approval binds the reviewed post: agent edits and legacy posts cannot reach TikTok", async () => {
  for (const key of ["DATABASE_URL", "VERCEL", "SCROLLSHOW_USE_BLOB", "VERCEL_ENV"]) delete process.env[key];
  const dir = await mkdtemp(join(tmpdir(), "scrollshow-audit-test-"));
  process.env.SCROLLSHOW_DATA_DIR = dir;
  process.env.TIKTOK_PUBLISH_ENABLED = "1";
  process.env.NEXT_PUBLIC_SITE_URL = "https://scrollshow.io";
  process.env.AUTH_SECRET = "synthetic-audit-test-only";
  const data = emptyStore();
  const user = { id: "audit-user", email: "audit@example.invalid", name: "Audit", plan: "lifetime", createdAt: "2026-09-20", emailVerifiedAt: "2026-09-20", emailVerified: true, projectId: "prj_audit-user_1" } as unknown as SessionUser;
  data.users = [{ ...user, settings: { autoAddMusic: true } } as unknown as User];
  backfillProjects(data);
  data.channels = [{ id: "audit-channel", userId: user.id, projectId: user.projectId, platform: "tiktok", accessToken: "synthetic-only", connected: true } as never];
  const original = { id: "p", userId: user.id, projectId: user.projectId, channelIds: ["audit-channel"], body: "Approved caption", status: "scheduled", date: "2026-09-20", time: "18:00", recipe: recipeFromPhotos(["https://scrollshow.io/approved.jpg"], "manual"), tiktok: { ...EMPTY_OPTIONS, title: "Approved title", privacy: "SELF_ONLY" }, tiktokApprovedAt: "2026-09-20T10:00:00Z", createdAt: "2026-09-20T09:00:00Z" } as StudioPost;
  data.posts = [original];
  const oldFetch = globalThis.fetch;
  let sent: { post_info: { auto_add_music: boolean }; source_info: { photo_images: string[] } } | undefined;
  let privacyOptions = ["SELF_ONLY"];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("creator_info")) return Response.json({ error: { code: "ok" }, data: { privacy_level_options: privacyOptions } });
    if (url.includes("content/init")) { sent = JSON.parse(String(init?.body)); return Response.json({ error: { code: "ok" }, data: { publish_id: "synthetic-publish" } }); }
    throw new Error("Unexpected network request in isolated test");
  };
  const reset = () => updateStoreSlice(["posts"], d => { d.posts = [structuredClone(original)]; sent = undefined; });
  const post = async () => (await readStoreSlice(["posts"])).posts[0];
  try {
    await writeFile(join(dir, "store.json"), JSON.stringify(data));
    await agentUpdateRecipe(user, "p", { caption: "Changed after approval" });
    assert.equal((await post()).status, "draft"); assert.equal(isCreatorApproved(await post()), false);
    await assert.rejects(dispatchPost(user.id, "p"), /tiktok_options_required|tiktok_approval_required/);
    assert.equal(sent, undefined);
    await reset(); await updateStoreSlice(["posts"], d => { d.posts[0].tiktokApprovedAt = undefined; });
    await agentUpdatePost(user, "p", { caption: "Legacy edit", status: "scheduled" });
    assert.equal((await post()).status, "draft"); assert.equal(isCreatorApproved(await post()), false);
    await reset(); await updateStoreSlice(["posts"], d => { d.posts[0].status = "draft"; });
    await agentUpdatePost(user, "p", { status: "scheduled" });
    assert.equal((await post()).status, "draft");
    await reset();
    await agentPublish(user, { id: "p", channelId: "audit-channel", caption: "New caption", title: "New title", privacy_level: "SELF_ONLY", photo_images: ["https://scrollshow.io/new-preview.jpg"] }, "studio");
    assert.deepEqual(sent!.source_info.photo_images, ["https://scrollshow.io/new-preview.jpg"]);
    assert.equal(sent!.post_info.auto_add_music, false, "account settings cannot silently add music");
    await reset();
    const reviewed = recipeFromPhotos(["https://scrollshow.io/reviewed-recipe.jpg"], "manual");
    await agentPublish(user, { id: "p", channelId: "audit-channel", caption: "Reviewed", title: "Reviewed", privacy_level: "SELF_ONLY", auto_add_music: true, recipe: reviewed }, "studio");
    assert.deepEqual(sent!.source_info.photo_images, ["https://scrollshow.io/reviewed-recipe.jpg"]);
    assert.equal(sent!.post_info.auto_add_music, true);
    await assert.rejects(directPostPhotos(user.id, { photos: ["https://scrollshow.io/new-preview.jpg"], description: "No consent", options: original.tiktok!, channelId: "audit-channel", projectId: user.projectId }), /tiktok_approval_required/);
    await reset(); privacyOptions = [];
    await assert.rejects(dispatchPost(user.id, "p"), /privacy_not_allowed/); assert.equal(sent, undefined);
    await assert.rejects(validateStudioSchedule(user.id, { status: "scheduled", channelIds: ["audit-channel"], tiktok: original.tiktok }, user.projectId), /privacy_not_allowed/);
    privacyOptions = ["SELF_ONLY"];
    await reset(); await updateStoreSlice(["posts"], d => { d.posts[0].recipe = recipeFromPhotos(["https://unverified.example/photo.jpg"], "manual"); });
    await assert.rejects(dispatchPost(user.id, "p"), /media_domain_not_verified/); assert.equal(sent, undefined);
  } finally { globalThis.fetch = oldFetch; await rm(dir, { recursive: true, force: true }); }
});

test("official EEA covers are allowed without opening the proxy to arbitrary domains", () => {
  assert.ok(allowedCoverUrl("https://p0-common-image-private-useastred.tiktokv.eu/photo.webp"));
  assert.equal(allowedCoverUrl("https://p0-common-image-private-useastred.tiktokv.eu.evil.example/photo.webp"), null);
  assert.equal(allowedCoverUrl("https://unknown.tiktokv.eu/photo.webp"), null);
  assert.equal(validatePostOptions({ ...EMPTY_OPTIONS, title: "x", privacy: "SELF_ONLY" }, normalizeCreator({})), "privacy_not_allowed");
});
