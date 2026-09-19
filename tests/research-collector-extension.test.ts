import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseSearch } from "../lib/research/normalize";

const read = (file: string) => readFileSync(new URL(`../extension/${file}`, import.meta.url), "utf8");

test("the extension only touches TikTok search and the ScrollShow origins", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions.sort(), ["http://localhost:3000/*", "https://scrollshow.io/*", "https://www.tiktok.com/*"]);
  assert.deepEqual(manifest.permissions, ["tabs"]);
  for (const script of manifest.content_scripts.filter((s: { matches: string[] }) => s.matches[0].includes("tiktok")))
    assert.deepEqual(script.matches, ["https://www.tiktok.com/search/*"]);
});

test("page scripts stay inert outside a ScrollShow collection window", () => {
  for (const file of ["hook.js", "collect.js"]) assert.match(read(file), /if \(!location\.hash\.includes\("scrollshow-collect"\)\) return;/);
});

test("the background only talks to allow-listed ScrollShow origins", () => {
  const background = read("background.js");
  assert.match(background, /const ORIGINS = \["https:\/\/scrollshow\.io", "http:\/\/localhost:3000"\]/);
  assert.match(background, /ORIGINS\.includes\(message\.origin\)/);
  assert.equal((background.match(/fetch\(/g) || []).length, 1, "a single outbound call site, to the collector");
});

test("a page slimmed by the extension is still fully readable by the server parser", () => {
  const source = read("collect.js");
  const slim = new Function(`${source.slice(source.indexOf("const keepAuthor"), source.indexOf("window.addEventListener"))}; return slim;`)() as (d: unknown) => unknown;
  const item = { id: "7551320035566832927", desc: "jawline #mewing", createTime: 1750000000, textExtra: [{ hashtagName: "mewing", awemeId: "x" }],
    author: { uniqueId: "looksmaxagent", nickname: "Agent", signature: "bio", avatarThumb: "https://p16-sign.tiktokcdn.com/avatar.jpeg", secUid: "dropped" },
    authorStats: { followerCount: 4200 }, stats: { playCount: 142777, diggCount: 8533, commentCount: 10, shareCount: 5, collectCount: 7 },
    imagePost: { images: [{ imageURL: { urlList: ["https://p16-sign.tiktokcdn.com/a.jpeg"] } }] }, music: { heavy: "x".repeat(5000) }, video: { cover: "", bitrateInfo: ["heavy"] } };
  const raw = { status_code: 403, has_more: 1, cursor: 12, item_list: [item], extra: { big: "x".repeat(5000) } };
  const light = slim(raw);
  assert.ok(JSON.stringify(light).length < JSON.stringify(raw).length / 5);
  const [full, slimmed] = [parseSearch(raw, "jawline"), parseSearch(light, "jawline")];
  const strip = (r: typeof full) => r.candidates.map((c) => ({ ...c, posts: c.posts.map(({ measuredAt: _drop, ...post }) => post) }));
  assert.deepEqual(strip(slimmed), strip(full));
  assert.equal(slimmed.candidates[0].followers, 4200);
  assert.equal(slimmed.candidates[0].posts[0].views, 142777);
});
