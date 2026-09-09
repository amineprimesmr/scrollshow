import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyStore } from "../lib/store";
import { matchingSlide, publicationImageKey, publicationTextProgress, withPublicationText } from "../lib/publication-text";
import { accountInsights } from "../lib/insights";
import { indexPublicationText } from "../lib/publication-text-index";
import type { AccountVideo, PublicationSlideText, StudioPost } from "../lib/types";

const image = "https://p16.tiktokcdn.com/photo.jpg?signature=old";
const video: AccountVideo = { id: "post1", title: "CAPTION SECRET", caption: "caption secret", cover: image, images: [image, image.replace("photo", "slide2")], kind: "photo", views: 100, likes: 5, comments: 2, shares: 1, createdAt: Math.floor(Date.now() / 1000), url: "" };
const text = (index: number, words: string): PublicationSlideText => ({ index, imageKey: publicationImageKey(video.images![index]), text: words, confidence: 90, status: "read" });

test("search reads words on each slide, ignoring accents, case and punctuation, never captions", () => {
  const post = { ...video, slideTexts: [text(0, "Comment glow up ?"), text(1, "Éliminer la rétention d’eau !")] };
  assert.equal(matchingSlide(post, "retention EAU")?.index, 1);
  assert.equal(matchingSlide(post, "RETENTION eau", true), undefined);
  assert.equal(matchingSlide(post, "glow up", true)?.index, 0);
  assert.equal(matchingSlide(post, "caption secret"), undefined);
  assert.equal(matchingSlide(post, "glow retention"), undefined);
  assert.equal(matchingSlide(post, "?!"), undefined);
});

test("cached text survives signed URL renewal and is isolated by owner, post and image", () => {
  const store = emptyStore();
  store.publicationText = [{ userId: "owner", postId: "post1", ...text(0, "Hook image") }];
  const renewed = { ...video, images: [image.replace("old", "new"), video.images![1]] };
  assert.equal(withPublicationText(renewed, "owner", store).slideTexts![0].text, "Hook image");
  assert.equal(withPublicationText(renewed, "foreign", store).slideTexts![0].text, "");
  assert.equal(withPublicationText({ ...renewed, id: "different" }, "owner", store).slideTexts![0].text, "");
  assert.equal(withPublicationText({ ...renewed, images: [image.replace("photo", "newphoto")] }, "owner", store).slideTexts![0].status, "pending");
  assert.deepEqual(publicationTextProgress([withPublicationText(renewed, "owner", store)]), { total: 2, done: 1, pending: 1, failed: 0, uncertain: 0 });
});

test("published recipe overlay words are searchable immediately, body copy and other users' overlays are excluded", () => {
  const store = emptyStore();
  store.posts = [{ id: "studio1", userId: "owner", status: "published", tiktokId: "post1", body: "Caption only", recipe: { slides: [{ image, overlays: [{ text: "Hook écrit avec Claude" }] }] } } as StudioPost];
  const result = withPublicationText(video, "owner", store);
  assert.equal(matchingSlide(result, "claude")?.index, 0);
  assert.equal(matchingSlide(result, "caption"), undefined);
  assert.equal(matchingSlide(withPublicationText(video, "foreign", store), "claude"), undefined);
});

test("insights expose indexed image hooks and refuse indexing another workspace", async () => {
  const directory = await mkdtemp(join(tmpdir(), "publication-text-"));
  const previous = { ...process.env };
  try {
    delete process.env.DATABASE_URL; delete process.env.SCROLLSHOW_USE_BLOB; delete process.env.VERCEL;
    process.env.SCROLLSHOW_DATA_DIR = directory;
    const store = emptyStore();
    store.channels = [{ id: "channel", userId: "owner", handle: "creator", name: "Creator", platform: "tiktok", avatar: "", videos: [video] }];
    store.publicationText = [{ userId: "owner", postId: "post1", ...text(0, "Comment glow up rapidement") }, { userId: "owner", postId: "post1", ...text(1, "La rétention d’eau") }];
    await writeFile(join(directory, "store.json"), JSON.stringify(store));
    const user = { id: "owner", email: "owner@example.invalid", name: "Owner", plan: "pro" } as const;
    const insights = await accountInsights(user, "ch:channel", null);
    assert.equal(insights!.hooks[0].hook, "comment glow up rapidement");
    assert.equal(matchingSlide(insights!.videos[0], "retention")?.index, 1);
    await assert.rejects(indexPublicationText({ ...user, id: "foreign" }, "ch:channel", null), /missing/);
    const cached = await indexPublicationText(user, "ch:channel", null);
    assert.equal(cached.progress.done, 2);
    assert.equal(cached.updates[0].slideTexts![1].text, "La rétention d’eau");
  } finally {
    for (const key of ["DATABASE_URL", "SCROLLSHOW_USE_BLOB", "VERCEL", "SCROLLSHOW_DATA_DIR"]) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    await rm(directory, { recursive: true, force: true });
  }
});
