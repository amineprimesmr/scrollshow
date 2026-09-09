import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyStore, readStore } from "../lib/store";
import { syncAccountPosts, officialAccountVideo } from "../lib/account-sync";
import { listVideoPage } from "../lib/tiktok";
import { accountInsights } from "../lib/insights";
import { fetchAccountVideoPage } from "../lib/metrics";

const user = { id: "owner", email: "owner@example.invalid", name: "Owner", plan: "pro" } as const;
async function fixture() {
  delete process.env.DATABASE_URL; delete process.env.SCROLLSHOW_USE_BLOB; delete process.env.VERCEL;
  delete process.env.METRICS_API_KEY; delete process.env.METRICS_API_BASE;
  process.env.SCROLLSHOW_DATA_DIR = await mkdtemp(join(tmpdir(), "account-sync-"));
  const store = emptyStore();
  store.channels.push({ id: "channel", userId: user.id, name: "Creator", handle: "creator", platform: "tiktok", avatar: "", connected: true, accessToken: "test", expiresAt: Date.now() + 3600000 });
  await writeFile(join(process.env.SCROLLSHOW_DATA_DIR, "store.json"), JSON.stringify(store));
}
const raw = (id: string) => ({ id, create_time: Math.floor(Date.now() / 1000), view_count: 100, like_count: 10, comment_count: 2, share_count: 1 });
const response = (videos: unknown[], has_more: boolean, cursor = 0) => Response.json({ data: { videos, has_more, cursor }, error: { code: "ok" } });

test("all 340 publications survive pagination and have lifetime metrics on first sync", async t => {
  await fixture();
  let page = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (String(url).includes("user/info")) return Response.json({data:{user:{follower_count:1200}}});
    const body = JSON.parse(String(init.body));
    assert.equal(body.cursor, page ? 100000 - page : undefined);
    const videos = Array.from({length:20}, (_, i) => raw(String(page * 20 + i)));
    page++;
    return response(videos, page < 17, 100000 - page);
  });
  for (let i=0; i<17; i++) await syncAccountPosts(user.id, "ch:channel");
  const result = await accountInsights(user as never, "ch:channel", 30);
  assert.equal(result!.videos.length,340);
  assert.equal(result!.stats.views,34000);
  assert.equal(result!.stats.followers,1200);
  assert.equal(result!.formats[0].id,"video");
  assert.equal(result!.sync!.complete,true);
  assert.equal("revenue" in result!,false);
  assert.equal(await accountInsights({...user,id:"other"} as never,"ch:channel",null),null);
  await assert.rejects(syncAccountPosts("other","ch:channel"),/missing/);
});

test("failed page preserves cache and resumes at the same cursor; refresh removes unavailable posts", async t => {
  await fixture();
  let fail = false;
  const cursors: unknown[] = [];
  t.mock.method(globalThis,"fetch",async (url: string, init: RequestInit) => {
    if (String(url).includes("user/info")) return Response.json({error:{code:"scope_not_authorized"}});
    const {cursor}=JSON.parse(String(init.body)); cursors.push(cursor);
    if(fail) return Response.json({error:{code:"rate_limit_exceeded"}},{status:429});
    return cursor ? response([raw("b")],false) : response([raw("a")],true,1000);
  });
  await syncAccountPosts(user.id,"ch:channel");
  fail=true;
  await assert.rejects(syncAccountPosts(user.id,"ch:channel"),/rate_limit_exceeded/);
  assert.equal((await readStore()).channels[0].videos!.length,1);
  fail=false;
  await syncAccountPosts(user.id,"ch:channel");
  assert.deepEqual(cursors,[undefined,1000,1000]);
  assert.equal((await readStore()).channels[0].videos!.length,2);
  t.mock.restoreAll();
  t.mock.method(globalThis,"fetch",async (url: string) => String(url).includes("user/info") ? Response.json({data:{user:{}}}) : response([raw("b")],false));
  await syncAccountPosts(user.id,"ch:channel",true);
  assert.deepEqual((await readStore()).channels[0].videos!.map(v=>v.id),["b"]);
});

test("pagination rejects a stuck cursor but continues through an empty intermediate page", async t => {
  t.mock.method(globalThis,"fetch",async()=>response([],true,900));
  assert.equal((await listVideoPage("test",1000)).hasMore,true);
  await assert.rejects(listVideoPage("test",900),/Pagination/);
});

test("public nested pagination recognizes numeric false and classifies photos",async t=>{
  process.env.METRICS_API_KEY="fixture";process.env.METRICS_API_BASE="https://metrics.example.invalid";
  t.mock.method(globalThis,"fetch",async()=>Response.json({output:{data:{data:{aweme_list:[{aweme_id:"photo",image_post_info:{},statistics:{play_count:55}}],has_more:0,max_cursor:0}}}}));
  const page=await fetchAccountVideoPage("creator");
  assert.equal(page.hasMore,false);assert.equal(page.videos[0].kind,"photo");assert.equal(page.videos[0].views,55);
});

test("official posts use lifetime counters and share URL format",()=>{
  const video=officialAccountVideo({...raw("1"),share_url:"https://www.tiktok.com/@creator/photo/1"},"creator");
  assert.equal(video.kind,"photo");assert.equal(video.views,100);
});
