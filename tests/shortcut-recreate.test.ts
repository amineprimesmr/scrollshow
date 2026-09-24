import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyStore, readStoreSlice } from "../lib/store";
import {
  agentPrompt, claimRecreation, completeRecreation, findPostLink, fireRoutine, listRecreations, openToken, parseShareUser,
  agentKeyActive, placeSharer, planDelivery, recreationState, resolveMode, sealToken, shortcutMessage, shortcutMode, validRoutine, RECREATION_LEASE_MS,
} from "../lib/shortcut-recreate";
import type { StoreData } from "../lib/types";

const shareHtml = (user: Record<string, unknown>) =>
  `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: { "webapp.reflow.global.shareUser": { shareUser: user } } })}</script></html>`;

test("le compte qui a partage est lu dans la page du lien de partage", () => {
  assert.deepEqual(parseShareUser(shareHtml({ uniqueId: "Amine.Studio", nickname: "Amine", id: "123", avatarThumb: "https://p16.tiktokcdn.com/a.jpg" })), {
    handle: "amine.studio", nickname: "Amine", avatar: "https://p16.tiktokcdn.com/a.jpg", id: "123",
  });
  // Forme brute hors du bloc JSON (celle que lisent les outils publics).
  const inline = `x "webapp.reflow.global.shareUser":{"shareUser":{"uniqueId":"brand_x","nickname":"B","avatarLarger":"https:\\u002F\\u002Fcdn\\u002Fa.jpg","stats":{"x":1}}} y`;
  assert.equal(parseShareUser(inline)?.handle, "brand_x");
});

test("sans shareUser, le compte est inconnu, jamais invente", () => {
  assert.equal(parseShareUser("<html></html>"), null);
  assert.equal(parseShareUser(shareHtml({ uniqueId: "" })), null);
  assert.equal(parseShareUser(shareHtml({ uniqueId: "../../etc" })), null);
});

test("un lien de post, complet ou court, est trouve ; un profil ne l'est pas", () => {
  assert.equal(findPostLink("Regarde https://www.tiktok.com/@nike/photo/7658332028584168717?_t=8x&_r=1 !"), "https://www.tiktok.com/@nike/photo/7658332028584168717?_t=8x&_r=1");
  assert.equal(findPostLink("https://vm.tiktok.com/ZMabc123/"), "https://vm.tiktok.com/ZMabc123/");
  assert.equal(findPostLink("https://www.tiktok.com/@nike"), null);
  assert.equal(findPostLink(""), null);
});

const data = {
  users: [{ id: "u1" }],
  projects: [
    { id: "p1", userId: "u1", name: "Process", createdAt: "2026-01-01" },
    { id: "p2", userId: "u1", name: "Glow", createdAt: "2026-02-01" },
    { id: "p3", userId: "u1", name: "Old", createdAt: "2026-03-01", archivedAt: "2026-04-01" },
  ],
  channels: [
    { id: "c1", userId: "u1", projectId: "p1", platform: "tiktok", handle: "process.app", name: "", avatar: "", connected: true, accessToken: "t" },
    { id: "c2", userId: "u1", projectId: "p2", platform: "tiktok", handle: "glow.daily", name: "", avatar: "", connected: true, accessToken: "t" },
    { id: "c3", userId: "u1", projectId: "p3", platform: "tiktok", handle: "archived.acc", name: "", avatar: "", connected: true, accessToken: "t" },
    { id: "c4", userId: "u1", projectId: "p1", platform: "tiktok", handle: "glow.daily", name: "", avatar: "", connected: false },
  ],
  accounts: [
    { id: "a1", userId: "u1", projectId: "p1", handle: "followed.one", origin: "manual" },
    { id: "a2", userId: "u1", projectId: "p1", handle: "competitor", origin: "research" },
  ],
} as unknown as StoreData;

test("le compte qui partage decide du projet et du compte cible", () => {
  assert.deepEqual(placeSharer(data, "u1", "p1", "process.app"), { link: "connected", projectId: "p1", channelId: "c1", routed: false });
  // Lie a un autre projet : la demande y part (un compte deconnecte du projet courant ne compte pas).
  assert.deepEqual(placeSharer(data, "u1", "p1", "@Glow.Daily"), { link: "connected", projectId: "p2", channelId: "c2", routed: true });
  assert.deepEqual(placeSharer(data, "u1", "p1", "followed.one"), { link: "tracked", projectId: "p1", channelId: "a1", routed: false });
  // Un concurrent trouve par la Recherche n'est pas « son » compte ; un projet archive non plus.
  assert.equal(placeSharer(data, "u1", "p1", "competitor").link, "unlinked");
  assert.equal(placeSharer(data, "u1", "p1", "archived.acc").link, "unlinked");
  assert.deepEqual(placeSharer(data, "u1", "p1", null), { link: "unknown", projectId: "p1", routed: false });
  // Le compte d'un autre utilisateur ScrollShow ne donne rien.
  assert.equal(placeSharer(data, "u2", "p9", "process.app").link, "unlinked");
});

test("le choix du raccourci : seul « enregistrer » ne recree pas", () => {
  assert.equal(shortcutMode("Recréer pour mon business"), "recreate");
  assert.equal(shortcutMode("Enregistrer seulement"), "save");
  assert.equal(shortcutMode("Just save it"), "save");
  assert.equal(shortcutMode(undefined), "recreate");
});

test("sans choix sur le telephone, la preference du compte s'applique", () => {
  assert.equal(resolveMode("", "save"), "save");
  assert.equal(resolveMode("", "recreate"), "recreate");
  assert.equal(resolveMode(undefined, "ask"), "recreate");
  assert.equal(resolveMode(undefined, undefined), "recreate");
  assert.equal(resolveMode("Enregistrer seulement", "recreate"), "save", "le choix fait sur le telephone gagne");
});

test("livraison : routine d'abord, sinon Claude, sinon connecter l'agent", () => {
  const base = { mode: "recreate" as const, kind: "photo", hasTrigger: false, agentConnected: false };
  assert.equal(planDelivery({ ...base, hasTrigger: true, agentConnected: true }), "routine");
  assert.equal(planDelivery({ ...base, agentConnected: true }), "claude");
  assert.equal(planDelivery(base), "connect_agent");
  assert.equal(planDelivery({ ...base, agentByKey: true }), "agent_later", "un agent par cle n'est pas ouvrable depuis le telephone");
  assert.equal(planDelivery({ ...base, kind: "video", hasTrigger: true }), "video");
  assert.equal(planDelivery({ ...base, mode: "save", hasTrigger: true }), "saved");
  assert.equal(planDelivery({ ...base, already: true, hasTrigger: true }), "already");
});

test("un agent par cle compte s'il a servi ces 30 jours, jamais la cle du raccourci", () => {
  const now = Date.parse("2026-09-24T00:00:00Z");
  const key = (name: string, lastUsedAt?: string, expiresAt?: string) => ({ id: name, userId: "u1", name, prefix: "", hash: "", createdAt: "", lastUsedAt, expiresAt });
  assert.equal(agentKeyActive({ apiKeys: [key("Claude Code", "2026-09-20T00:00:00Z")] }, "u1", now), true);
  assert.equal(agentKeyActive({ apiKeys: [key("Claude Code", "2026-07-01T00:00:00Z")] }, "u1", now), false);
  assert.equal(agentKeyActive({ apiKeys: [key("Raccourci iPhone", "2026-09-23T00:00:00Z")] }, "u1", now), false);
  assert.equal(agentKeyActive({ apiKeys: [key("Cursor", "2026-09-23T00:00:00Z", "2026-09-01T00:00:00Z")] }, "u1", now), false);
  assert.equal(agentKeyActive({ apiKeys: [key("Cursor", "2026-09-23T00:00:00Z")] }, "u2", now), false);
});

test("un bail expire rend la demande de nouveau prenable", () => {
  const now = 1_000_000;
  assert.equal(recreationState(undefined, now), "none");
  assert.equal(recreationState({ status: "running", leaseUntil: now + 1, via: "shortcut", requestedAt: "", link: "unknown" }, now), "running");
  assert.equal(recreationState({ status: "running", leaseUntil: now - 1, via: "shortcut", requestedAt: "", link: "unknown" }, now), "queued");
});

test("les avertissements de compte sont dans le titre de la notification", () => {
  const unlinked = shortcutMessage({ delivery: "routine", english: false, author: "nike", slides: 7, sharer: "perso", placement: { link: "unlinked", projectId: "p1", routed: false } });
  assert.match(unlinked.title, /@perso n'est pas lié/);
  assert.match(unlinked.message, /Ton agent recrée le carrousel de @nike \(7 slides\)/);
  const routed = shortcutMessage({ delivery: "claude", english: false, author: "nike", sharer: "glow.daily", projectName: "Glow", placement: { link: "connected", projectId: "p2", routed: true } });
  assert.match(routed.title, /Rangé dans « Glow »/);
  const saved = shortcutMessage({ delivery: "saved", english: false, author: "nike", sharer: "perso", placement: { link: "unlinked", projectId: "p1", routed: false } });
  assert.equal(saved.title, "ScrollShow", "un simple enregistrement n'a pas besoin d'avertir");
  assert.match(shortcutMessage({ delivery: "video", english: true, author: "x", placement: { link: "unknown", projectId: "p", routed: false } }).message, /photo carousels only/);
});

test("routine : URL et jeton stricts, jeton scelle par utilisateur", () => {
  process.env.AUTH_SECRET ||= "test-secret-for-shortcut-recreate-000000";
  assert.equal(validRoutine("https://api.anthropic.com/v1/claude_code/routines/trig_01ABCDEFGHJK/fire", "sk-ant-oat01-abcdefghijklmnopqrstuvwxyz"), true);
  assert.equal(validRoutine("https://evil.example/v1/claude_code/routines/trig_01ABCDEFGHJK/fire", "sk-ant-oat01-abcdefghijklmnopqrstuvwxyz"), false);
  assert.equal(validRoutine("https://api.anthropic.com/v1/claude_code/routines/trig_01ABCDEFGHJK/fire", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"), false);
  const sealed = sealToken("sk-ant-oat01-secret", "u1");
  assert.ok(!sealed.includes("secret"));
  assert.equal(openToken(sealed, "u1"), "sk-ant-oat01-secret");
  assert.throws(() => openToken(sealed, "u2"), /trigger_token_invalid/);
});

test("le message pour Claude nomme la demande et le parcours MCP", () => {
  assert.match(agentPrompt("post-1", false), /claim_recreation\("post-1"\)/);
  assert.match(agentPrompt("post-1", true), /complete_recreation/);
});

test("fireRoutine envoie le texte comme donnee et traduit les refus", async t => {
  process.env.AUTH_SECRET ||= "test-secret-for-shortcut-recreate-000000";
  const trigger = { url: "https://api.anthropic.com/v1/claude_code/routines/trig_01ABCDEFGHJK/fire", tokenSealed: sealToken("sk-ant-oat01-abcdefghijklmnopqrstuvwxyz", "u1"), tokenHint: "…wxyz", createdAt: "" };
  const calls: Array<{ url: string; init: RequestInit }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return calls.length === 1 ? Response.json({ type: "routine_fire", claude_code_session_url: "https://claude.ai/code/session_1" }) : Response.json({ type: "error" }, { status: 401 });
  });
  assert.deepEqual(await fireRoutine(trigger, "u1", "ScrollShow recreation request p1"), { ok: true, sessionUrl: "https://claude.ai/code/session_1" });
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer sk-ant-oat01-abcdefghijklmnopqrstuvwxyz");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { text: "ScrollShow recreation request p1" });
  assert.deepEqual(await fireRoutine(trigger, "u1", "x"), { ok: false, error: "token_revoked" });
  // Jeton scelle pour un autre compte : on n'appelle meme pas l'API.
  assert.deepEqual(await fireRoutine(trigger, "u2", "x"), { ok: false, error: "token_unreadable" });
  assert.equal(calls.length, 2);
});

test("file de recreation : liste, prise exclusive, projet, fin", async () => {
  delete process.env.DATABASE_URL; delete process.env.SCROLLSHOW_USE_BLOB; delete process.env.VERCEL;
  process.env.SCROLLSHOW_DATA_DIR = await mkdtemp(join(tmpdir(), "shortcut-recreate-"));
  const store = emptyStore();
  store.users.push({ id: "u1", email: "u1@example.invalid", name: "U", plan: "pro", createdAt: "2026-01-01" } as never);
  store.projects = [
    { id: "p1", userId: "u1", name: "Process", createdAt: "2026-01-01", completedAt: "2026-01-01" },
    { id: "p2", userId: "u1", name: "Glow", createdAt: "2026-02-01", completedAt: "2026-02-01" },
  ] as never;
  const post = (id: string, projectId: string, extra: Record<string, unknown> = {}) => ({
    id, userId: "u1", projectId, channelIds: [], body: "", date: "2026-09-24", time: "18:00", status: "draft", image: "", views: 0, likes: 0, comments: 0, shares: 0, origin: "import", kind: "photo", authorHandle: "nike", tiktokUrl: `https://www.tiktok.com/@nike/photo/${id}`, ...extra,
  });
  (store.posts.push as (...rows: unknown[]) => number)(
    post("src1", "p1", { recreation: { status: "queued", via: "shortcut", requestedAt: "2026-09-24T10:00:00Z", link: "connected", channelId: "c1", attempts: 0 } }),
    post("src2", "p2", { recreation: { status: "queued", via: "shortcut", requestedAt: "2026-09-24T11:00:00Z", link: "unlinked", sharer: { handle: "perso" }, attempts: 0 } }),
    post("vid", "p1", { kind: "video" }),
    post("mine", "p1", { origin: "ai", inCalendar: false }),
    { ...post("other", "p9"), userId: "u2" },
  );
  await writeFile(join(process.env.SCROLLSHOW_DATA_DIR, "store.json"), JSON.stringify(store));
  const u1 = { id: "u1", email: "u1@example.invalid", name: "U", plan: "pro" as const, projectId: "p1" };

  const listed = await listRecreations(u1);
  assert.deepEqual(listed.requests.map(r => [r.id, r.inCurrentProject]), [["src1", true], ["src2", false]]);
  assert.equal(listed.requests[1].target.link, "unlinked");

  const claimed = await claimRecreation(u1, "src1");
  assert.equal(claimed.request.status, "running");
  assert.ok(claimed.steps.some(step => step.includes('channelId "c1"')));
  await assert.rejects(claimRecreation(u1, "src1"), /recreation_in_progress/);
  await assert.rejects(claimRecreation(u1, "src2"), /switch_project_required.*p2/);
  await assert.rejects(claimRecreation(u1, "vid"), /recreation_video_unsupported/);
  await assert.rejects(claimRecreation(u1, "other"), /recreation_missing/);
  const inP2 = await claimRecreation({ ...u1, projectId: "p2" }, "src2");
  assert.ok(inP2.steps.some(step => step.includes("@perso") && step.includes("not linked")));

  await assert.rejects(completeRecreation(u1, { id: "src1", postId: "src2" }), /result_is_an_import/);
  await assert.rejects(completeRecreation(u1, { id: "src1", postId: "other" }), /result_post_missing/);
  assert.deepEqual((await completeRecreation(u1, { id: "src1", postId: "mine" })).status, "done");
  const after = await readStoreSlice(["posts"], { userId: "u1" });
  const mine = after.posts.find(p => p.id === "mine")!;
  assert.equal(mine.recreationOf, "src1");
  assert.equal(mine.inCalendar, true);
  assert.equal(mine.status, "draft", "terminer ne publie ni ne programme rien");
  await assert.rejects(claimRecreation(u1, "src1"), /recreation_done.*mine/);
  assert.equal((await claimRecreation(u1, "src1", true)).request.status, "running");

  assert.equal((await completeRecreation({ ...u1, projectId: "p2" }, { id: "src2", error: "no image tool" })).status, "failed");
  assert.deepEqual((await listRecreations(u1)).requests.map(r => r.id), ["src1"]);
  assert.ok(RECREATION_LEASE_MS >= 15 * 60 * 1000);
});

test("la cle du raccourci vit un an et remplace la precedente", async () => {
  delete process.env.DATABASE_URL; delete process.env.SCROLLSHOW_USE_BLOB; delete process.env.VERCEL;
  process.env.SCROLLSHOW_DATA_DIR = await mkdtemp(join(tmpdir(), "shortcut-key-"));
  const store = emptyStore();
  store.users.push({ id: "u1", email: "u1@example.invalid", name: "U", plan: "pro", createdAt: "2026-01-01", emailVerifiedAt: "2026-01-01" } as never);
  store.projects = [{ id: "p1", userId: "u1", name: "Process", createdAt: "2026-01-01", completedAt: "2026-01-01" }] as never;
  await writeFile(join(process.env.SCROLLSHOW_DATA_DIR, "store.json"), JSON.stringify(store));
  const { rotateShortcutKey, resolveApiKey, SHORTCUT_KEY_NAME } = await import("../lib/api-keys");
  const first = await rotateShortcutKey("u1", "p1");
  const second = await rotateShortcutKey("u1", "p1");
  assert.ok(first && second);
  assert.equal(await resolveApiKey(first.token), null, "l'ancienne cle du raccourci est revoquee");
  assert.equal((await resolveApiKey(second.token))?.id, "u1");
  const days = (Date.parse(second.key.expiresAt!) - Date.now()) / 86400000;
  assert.ok(days > 364 && days <= 365, `expire dans ${days} jours`);
  const keys = (await readStoreSlice(["apiKeys"], { userId: "u1" })).apiKeys.filter(k => k.name === SHORTCUT_KEY_NAME);
  assert.equal(keys.length, 1);
});
