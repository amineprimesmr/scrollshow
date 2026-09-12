import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyStore, readStore, updateStore, updateStoreSlice, readStoreSlice } from "../lib/store";
import { backfillProjects, createProject, archiveProject } from "../lib/projects";
import { issueTokens, resolveOAuthUser, rotateRefreshToken, revokeAllForUser, MCP_RESOURCE } from "../lib/oauth";
import { createApiKey, resolveApiKey } from "../lib/api-keys";
import { htmlSafeJson } from "../lib/safe-json";
import { mayReadMedia, assertMediaReferences } from "../lib/media-permissions";
import { quarantineRestoredStore } from "../lib/backup-media";
import { analyzeShadowban } from "../lib/shadowban";
import { toTikTokVideo } from "../lib/shadowban-check";
import { mergeAccountVideo } from "../lib/account-sync";
import type { AccountVideo, StudioPost, User } from "../lib/types";

async function fixture(fn: (dir: string) => Promise<void>) {
  delete process.env.DATABASE_URL; delete process.env.VERCEL; delete process.env.SCROLLSHOW_USE_BLOB;
  const dir = await mkdtemp(path.join(os.tmpdir(), "scrollshow-security-"));
  process.env.SCROLLSHOW_DATA_DIR = dir;
  const data = emptyStore();
  data.users = ["u", "v"].map(id => ({ id, email: `${id}@example.test`, name: id, plan: "pro", emailVerifiedAt: "2026-01-01", createdAt: "2026-01-01" } as User));
  backfillProjects(data);
  data.accounts.push({ id: "a", userId: "u", projectId: "prj_u_1", videos: [{ id: "video", views: 100, matchedKeywords: ["test"] }] } as never);
  await writeFile(path.join(dir, "store.json"), JSON.stringify(data));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test("partial writes preserve unrelated caches and persist the restoration guard", async () => fixture(async () => {
  const before = (await readStore()).accounts;
  await updateStoreSlice(["apiKeys"], data => { data.users[0].name = "Changed"; data.restoreReviewRequired = true; });
  assert.deepEqual((await readStore()).accounts, before);
  assert.equal((await readStoreSlice([])).restoreReviewRequired, true);
  await assert.rejects(updateStoreSlice(["apiKeys"], data => data.accounts.push({} as never)), /store_slice_missing_accounts/);
}));

test("OAuth is bound to the consented workspace and refresh rotation cannot resurrect a replayed grant", async () => fixture(async () => {
  const tokens = await issueTokens({ clientId: "c", userId: "u", projectId: "prj_u_1", resource: MCP_RESOURCE, scope: "scrollshow" });
  await updateStore(data => { createProject(data, data.users[0], { name: "Second" }); });
  assert.equal((await resolveOAuthUser(tokens.accessToken, MCP_RESOURCE))?.projectId, "prj_u_1");
  const [a,b] = await Promise.all([rotateRefreshToken(tokens.refreshToken, "c"), rotateRefreshToken(tokens.refreshToken, "c")]);
  const success = "tokens" in a ? a : "tokens" in b ? b : null;
  assert.ok(success);
  assert.equal(await resolveOAuthUser(success.tokens.accessToken, MCP_RESOURCE), null);
  assert.equal((await readStore()).oauthTokens?.length, 0);
}));

test("archived workspace keys and OAuth grants fail closed instead of following the last workspace", async () => fixture(async () => {
  const key = await createApiKey("u", "test", "prj_u_1");
  const token = await issueTokens({ clientId: "c", userId: "u", projectId: "prj_u_1", resource: MCP_RESOURCE, scope: "scrollshow" });
  await updateStore(data => { createProject(data, data.users[0], { name: "Second" }); archiveProject(data, "u", "prj_u_1"); });
  assert.equal(await resolveApiKey(key!.token), null);
  assert.equal(await resolveOAuthUser(token.accessToken, MCP_RESOURCE), null);
  assert.equal(await createApiKey("u", "invalid", "prj_v_1"), null);
}));

test("recovery and backup restore invalidate every agent credential", async () => fixture(async () => {
  await createApiKey("u", "test", "prj_u_1");
  await issueTokens({ clientId: "c", userId: "u", projectId: "prj_u_1", resource: MCP_RESOURCE, scope: "scrollshow" });
  const data = await readStore();
  const quarantined = quarantineRestoredStore(data);
  assert.equal(quarantined.oauthTokens?.length, 0);
  assert.equal(quarantined.apiKeys.length, 0);
  revokeAllForUser(data, "u");
  assert.equal(data.oauthTokens?.length, 0);
  assert.equal(data.apiKeys.length, 0);
}));

test("a malicious caption cannot terminate the embedded JSON script", () => {
  const payload = { caption: '</script><script>alert("x")</script>&' };
  const serialized = htmlSafeJson(payload);
  assert.equal(serialized.includes("<"), false);
  assert.deepEqual(JSON.parse(serialized), payload);
});

test("copying a private image URL into a public post does not grant access", () => {
  const data = emptyStore();
  data.media = [{ id: "m", userId: "victim", projectId: "private", url: "/api/i/private.png", name: "private", createdAt: "2026-01-01" }];
  data.posts = [{ id: "attack", userId: "attacker", projectId: "other", image: "/api/i/private.png", visibility: "public", createdAt: "2026-02-01" } as StudioPost];
  const attacker = { id: "attacker", projectId: "other" };
  assert.equal(mayReadMedia(data, "private.png", attacker), false);
  assert.equal(mayReadMedia(data, "private.png", null), false);
  assert.equal(mayReadMedia(data, "private.png", { id: "victim", projectId: "private" }), true);
  assert.equal(mayReadMedia(data, "private.png", { id: "victim", projectId: "other" }), false);
  assert.throws(() => assertMediaReferences(data, { image: "/api/i/private.png" }, attacker), /media_access_denied/);
});

test("missing views never create a suppression verdict, and refresh retains research evidence", () => {
  const base = { id: "v", createdAt: Math.floor(Date.now()/1000)-864000, title: "", views: 0, likes: 0, comments: 0, shares: 0, cover: "", url: "", kind: "photo", missingMetrics: ["views"] } as AccountVideo;
  const videos = Array.from({ length: 10 }, (_,i) => toTikTokVideo({ ...base, id: String(i) }));
  assert.equal(analyzeShadowban(videos, { followers: 10000 }).verdict, "insufficient_data");
  const refreshed = mergeAccountVideo({ ...base, matchedKeywords: ["research"], images: ["a.png"] }, { ...base, views: 999, missingMetrics: [] });
  assert.deepEqual(refreshed.matchedKeywords, ["research"]);
  assert.deepEqual(refreshed.images, ["a.png"]);
  assert.equal(refreshed.views, 999);
});


test("media grants match whole file names and project logos retain their owner", () => {
  const data = emptyStore();
  data.media = [{ id: "m", userId: "victim", projectId: "private", url: "/api/i/private.png", name: "private", createdAt: "2026-01-01" }];
  data.posts = [{ userId: "victim", projectId: "private", image: "/api/i/private.png-preview.png", visibility: "public" } as StudioPost];
  assert.equal(mayReadMedia(data, "private.png", null), false);
  data.projects = [{ id: "p", userId: "victim", logo: "/api/i/logo.png" } as never];
  assert.equal(mayReadMedia(data, "logo.png", { id: "victim", projectId: "p" }), true);
  assert.equal(mayReadMedia(data, "logo.png", { id: "victim", projectId: "other" }), false);
});
