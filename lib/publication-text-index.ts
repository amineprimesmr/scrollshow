import { accountInsights } from "./insights";
import { readStore, updateStore } from "./store";
import { publicationImages, publicationTextProgress } from "./publication-text";
import { allowedCoverUrl } from "./tiktok-cover";
import { safeFetchBytes } from "./safe-fetch";
import { readSlideBytes } from "./media-files";
import type { SessionUser } from "./types";

const pending = new Map<string, Promise<Awaited<ReturnType<typeof advance>>>>();
export function indexPublicationText(user: SessionUser, key: string, days: number | null, retryFailed = false, priorityPostId?: string) {
  const lock = `${user.id}:${key}:${days}`;
  const current = pending.get(lock);
  if (current) return current;
  const task = advance(user, key, days, retryFailed, priorityPostId).finally(() => pending.delete(lock));
  pending.set(lock, task);
  return task;
}

async function advance(user: SessionUser, key: string, days: number | null, retryFailed: boolean, priorityPostId?: string) {
  const insights = await accountInsights(user, key, days);
  if (!insights) throw new Error("missing");
  if (retryFailed) await updateStore(store => {
    const ids = new Set(insights.videos.map(v => v.id));
    store.publicationText = store.publicationText?.filter(s => !(s.userId === user.id && ids.has(s.postId) && s.status === "failed"));
  });
  const work = insights.videos.flatMap(video => (video.slideTexts || []).filter(slide => slide.status === "pending" || (retryFailed && slide.status === "failed"))
    .map(slide => ({ video, slide, image: publicationImages(video)[slide.index] })))
    .sort((a, b) => Number(b.video.id === priorityPostId) - Number(a.video.id === priorityPostId) || a.slide.index - b.slide.index || b.video.views - a.video.views).slice(0, 2);
  const { readPublicationImageText } = await import("./publication-text-ocr");
  for (const { video, slide, image } of work) {
    let result: { text: string; confidence: number | null; status: "read" | "uncertain" | "failed" };
    try {
      let file;
      if (allowedCoverUrl(image)) file = await safeFetchBytes(image, { maxBytes: 8000000, timeoutMs: 12000, headers: { Referer: "https://www.tiktok.com/" } });
      else {
        // Non-TikTok images must belong to the user's own published recipe.
        const data = await readStore();
        const owned = data.posts.some(p => p.userId === user.id && p.status === "published" && (p.id === video.id || p.tiktokId === video.id) &&
          (p.image === image || p.recipe?.slides.some(s => s.image === image)));
        if (!owned) throw new Error("invalid_image");
        file = await readSlideBytes(image);
      }
      if (!file || !file.contentType.startsWith("image/") || file.bytes.length > 8000000) throw new Error("invalid_image");
      result = await readPublicationImageText(file.bytes);
    } catch (error) {
      if (error instanceof Error && error.message === "text_reader_busy") throw error;
      result = { text: "", confidence: null, status: "failed" };
    }
    await updateStore(data => {
      const target = key.startsWith("ch:") ? data.channels : data.accounts;
      if (!target.some(a => a.id === key.slice(3) && a.userId === user.id)) return;
      const entries = data.publicationText ||= [];
      const previous = entries.findIndex(s => s.userId === user.id && s.postId === video.id && s.index === slide.index);
      const entry = { userId: user.id, postId: video.id, index: slide.index, imageKey: slide.imageKey, ...result, updatedAt: new Date().toISOString() };
      if (previous < 0) entries.push(entry); else entries[previous] = entry;
    });
  }
  const fresh = await accountInsights(user, key, days);
  if (!fresh) throw new Error("missing");
  return { updates: fresh.videos.map(v => ({ id: v.id, slideTexts: v.slideTexts })),
    progress: publicationTextProgress(fresh.videos), hooks: fresh.hooks };
}
