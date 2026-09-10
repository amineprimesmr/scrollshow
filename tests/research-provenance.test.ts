import test from "node:test";
import assert from "node:assert/strict";
import { authorAvatar, parseSearch } from "../lib/research/normalize";
import { filtersSchema } from "../lib/research/model";
import { evaluateResearch } from "../lib/research/statistics";
import type { AccountVideo } from "../lib/types";

const now = Date.parse("2026-09-10T12:00:00Z");
const photo = (id: string, views = 500): AccountVideo => ({
  id, title: "x", caption: "x", cover: "", views, likes: 1, comments: 1, shares: 1, saves: 1,
  createdAt: now / 1000 - 86400, kind: "photo", url: "", images: [], measuredAt: new Date(now).toISOString(),
});

/** Reponse de recherche minimale, dans les deux formes que renvoie le fournisseur. */
function searchResponse(author: Record<string, unknown>) {
  return {
    item_list: [{
      aweme_id: "7000000000000000001",
      desc: "hook",
      image_post_info: { images: [{ display_image: { url_list: ["https://p16.tiktokcdn.com/a.jpg"] } }] },
      statistics: { play_count: 1000, digg_count: 10, comment_count: 1, share_count: 1, collect_count: 1 },
      create_time: Math.round(now / 1000),
      author: { uniqueId: "someone", nickname: "Some One", signature: "bio", ...author },
      authorStats: { followerCount: 4321 },
    }],
    has_more: 0,
    cursor: 20,
  };
}

test("the avatar comes from the search response, in either shape, and only from a TikTok host", () => {
  const web = parseSearch(searchResponse({ avatarThumb: "https://p16-common-sign.tiktokcdn-eu.com/av.jpg" }), "glow up");
  assert.equal(web.candidates[0].avatar, "https://p16-common-sign.tiktokcdn-eu.com/av.jpg");

  const app = parseSearch(searchResponse({ avatar_thumb: { url_list: ["https://p19.tiktokcdn.com/av.jpg"] } }), "glow up");
  assert.equal(app.candidates[0].avatar, "https://p19.tiktokcdn.com/av.jpg");

  // Le proxy d'images est une allowlist : une URL etrangere ne doit pas y entrer.
  const foreign = parseSearch(searchResponse({ avatarThumb: "https://evil.example.com/av.jpg" }), "glow up");
  assert.equal(foreign.candidates[0].avatar, "");

  const missing = parseSearch(searchResponse({}), "glow up");
  assert.equal(missing.candidates[0].avatar, "");
  assert.equal(missing.candidates[0].followers, 4321, "les autres champs de l'auteur restent lus");
});

test("authorAvatar tolerates every wrapper shape and never invents a URL", () => {
  assert.equal(authorAvatar({ avatarLarger: "https://p16.tiktokcdn.com/l.jpg" }), "https://p16.tiktokcdn.com/l.jpg");
  assert.equal(authorAvatar({ avatar_medium: { urlList: ["https://p16.ibyteimg.com/m.jpg"] } }), "https://p16.ibyteimg.com/m.jpg");
  assert.equal(authorAvatar({ avatarThumb: "http://p16.tiktokcdn.com/insecure.jpg" }), "", "http simple refuse");
  assert.equal(authorAvatar(undefined), "");
  assert.equal(authorAvatar({}), "");
});

test("the follower threshold defaults to 2000 and actually rejects", () => {
  assert.equal(filtersSchema.parse({}).minFollowers, 2000, "le seuil par defaut existe cote serveur, pas seulement dans l'UI");

  const filters = filtersSchema.parse({ minTotalViews: 0, minPosts: 1 });
  const posts = [photo("1"), photo("2")];
  assert.equal(evaluateResearch(posts, 87, filters, now).accepted, false);
  assert.ok(evaluateResearch(posts, 87, filters, now).reasons.includes("followers_below_filter"));
  assert.equal(evaluateResearch(posts, 5000, filters, now).accepted, true);

  // Un seuil explicitement remis a zero laisse tout passer : le defaut n'est pas un plancher dur.
  const open = filtersSchema.parse({ minTotalViews: 0, minPosts: 1, minFollowers: 0 });
  assert.equal(evaluateResearch(posts, 87, open, now).accepted, true);
});
