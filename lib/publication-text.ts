import type { AccountVideo, PublicationSlideText, StoreData } from "./types";
import { allowedCoverUrl } from "./tiktok-cover";

/** Signed CDN query parameters can expire without changing the image itself. */
export function publicationImageKey(image: string) {
  try { const u = new URL(image); return allowedCoverUrl(image) ? `${u.origin}${u.pathname}` : u.toString(); }
  catch { return image.split(/[?#]/)[0]; }
}

export function publicationImages(video: AccountVideo) {
  return video.kind === "photo" && video.images?.length ? video.images.slice(0, 35) : video.cover ? [video.cover] : [];
}

export function normalizeSlideSearch(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** All words must occur on the same slide. Captions, bios and hashtags are excluded. */
export function matchingSlide(video: AccountVideo, query: string, hookOnly = false): PublicationSlideText | undefined {
  const words = normalizeSlideSearch(query).split(/\s+/).filter(Boolean);
  if (!words.length) return undefined;
  return video.slideTexts?.find(slide => (!hookOnly || slide.index === 0) &&
    words.every(word => normalizeSlideSearch(slide.text).includes(word)));
}

export function withPublicationText(video: AccountVideo, userId: string, store: StoreData): AccountVideo {
  const post = store.posts.find(p => p.userId === userId && p.status === "published" && (p.tiktokId === video.id || p.id === video.id));
  const cached = store.publicationText?.filter(p => p.userId === userId && p.postId === video.id) || [];
  const images = publicationImages(video);
  return { ...video, slideTexts: images.map((image, index) => {
    const imageKey = publicationImageKey(image);
    const saved = cached.find(s => s.index === index && s.imageKey === imageKey);
    // Known overlays are exact text. OCR still reads any words baked into the background image.
    const overlay = post?.recipe?.slides[index]?.overlays?.map(o => o.text).join("\n") || "";
    const text = [overlay, saved?.text].filter(Boolean).join("\n");
    return { index, imageKey, text, status: saved?.status || "pending", confidence: saved?.confidence ?? null, updatedAt: saved?.updatedAt };
  }) };
}

export function publicationTextProgress(videos: AccountVideo[]) {
  const slides = videos.flatMap(v => v.slideTexts || []);
  return { total: slides.length, done: slides.filter(s => s.status !== "pending").length,
    pending: slides.filter(s => s.status === "pending").length,
    failed: slides.filter(s => s.status === "failed").length,
    uncertain: slides.filter(s => s.status === "uncertain").length };
}
