import { savePublicImage } from "./media-files";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

export type ImportedTikTok = {
  url: string;
  tiktokId: string;
  caption: string;
  authorHandle: string;
  authorName: string;
  authorAvatar: string;
  musicTitle: string;
  musicAuthor: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  kind: "photo" | "video";
  images: string[];
};

function tiktokHeaders(extra?: Record<string, string>): HeadersInit {
  return {
    "User-Agent": UA,
    Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
    Referer: "https://www.tiktok.com/",
    ...extra,
  };
}

export function parseTikTokUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) throw new ImportError("url_required");
  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new ImportError("invalid_url");
  }
  const host = url.hostname.replace(/^www\./, "");
  if (!["tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "m.tiktok.com"].includes(host) && !host.endsWith(".tiktok.com")) {
    throw new ImportError("not_tiktok");
  }
  return url.toString();
}

async function resolveUrl(input: string) {
  const start = parseTikTokUrl(input);
  const res = await fetch(start, {
    headers: tiktokHeaders(),
    redirect: "follow",
  });
  return res.url || start;
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function scriptJson(html: string, id: string) {
  const match = html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`));
  if (!match?.[1]) return null;
  try {
    return JSON.parse(decodeHtml(match[1].trim()));
  } catch {
    return null;
  }
}

function urlList(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return urlList(record.urlList || record.url_list || record.urls || record.url);
  }
  return [];
}

function firstUrl(value: unknown) {
  return urlList(value)[0] || "";
}

function walkImages(node: unknown, found: string[], seen = new Set<unknown>(), depth = 0) {
  if (!node || found.length > 80 || depth > 8 || seen.has(node)) return;
  if (typeof node === "object") seen.add(node);
  if (Array.isArray(node)) {
    node.forEach((item) => walkImages(item, found, seen, depth + 1));
    return;
  }
  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const keys = ["imageURL", "imageUrl", "displayImage"];
  for (const key of keys) {
    const url = firstUrl(record[key]);
    if (url.startsWith("http")) found.push(url);
  }
  if (record.images) walkImages(record.images, found, seen, depth + 1);
  if (record.imagePost) walkImages(record.imagePost, found, seen, depth + 1);
}

function pickItem(data: any): any {
  if (!data) return null;
  const scope = data.__DEFAULT_SCOPE__ || data;
  return (
    scope?.["webapp.reflow.video.detail"]?.itemInfo?.itemStruct ||
    scope?.["webapp.video-detail"]?.itemInfo?.itemStruct ||
    scope?.["webapp.photo-detail"]?.itemInfo?.itemStruct ||
    data?.itemInfo?.itemStruct ||
    data?.itemStruct ||
    Object.values(data?.ItemModule || {})[0] ||
    null
  );
}

function fromItem(item: any, canonical: string): Omit<ImportedTikTok, "images"> & { imageUrls: string[] } {
  const imagePost = item?.imagePost || item?.image_post || {};
  const slides = Array.isArray(imagePost.images)
    ? imagePost.images.map((image: any) => firstUrl(image?.imageURL || image?.imageUrl || image)).filter(Boolean)
    : [];
  const cover = firstUrl(
    imagePost.cover?.imageURL ||
      item?.video?.cover ||
      item?.video?.originCover ||
      item?.video?.dynamicCover ||
      item?.covers,
  );
  const imageUrls = slides.length ? slides : cover ? [cover] : [];
  const stats = item?.stats || item?.statsV2 || {};
  const author = item?.author || {};
  const music = item?.music || {};
  const id = String(item?.id || item?.aweme_id || "");
  return {
    url: canonical,
    tiktokId: id,
    caption: String(item?.desc || item?.description || imagePost.title || "").trim(),
    authorHandle: String(author.uniqueId || author.unique_id || author.unique_name || "").replace(/^@/, ""),
    authorName: String(author.nickname || author.nickName || author.uniqueId || ""),
    authorAvatar: firstUrl(author.avatarLarger || author.avatarMedium || author.avatarThumb),
    musicTitle: String(music.title || music.songName || ""),
    musicAuthor: String(music.authorName || music.author || ""),
    views: Number(stats.playCount || stats.play_count || 0),
    likes: Number(stats.diggCount || stats.digg_count || stats.likeCount || 0),
    comments: Number(stats.commentCount || stats.comment_count || 0),
    shares: Number(stats.shareCount || stats.share_count || 0),
    kind: slides.length ? "photo" : "video",
    imageUrls,
  };
}

async function oembed(url: string) {
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  const res = await fetch(endpoint, { headers: tiktokHeaders({ Accept: "application/json" }) });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as {
    title?: string;
    author_name?: string;
    author_url?: string;
    thumbnail_url?: string;
  } | null;
}

async function downloadImage(url: string) {
  const res = await fetch(url, { headers: tiktokHeaders({ Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" }) });
  if (!res.ok) throw new ImportError("image_download_failed");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 32) throw new ImportError("image_download_failed");
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return savePublicImage(bytes, contentType, url);
}

export async function importTikTokFromUrl(input: string): Promise<ImportedTikTok> {
  const canonical = await resolveUrl(input);
  const page = await fetch(canonical, { headers: tiktokHeaders() });
  const html = await page.text();
  const item =
    pickItem(scriptJson(html, "__UNIVERSAL_DATA_FOR_REHYDRATION__")) ||
    pickItem(scriptJson(html, "SIGI_STATE")) ||
    pickItem(scriptJson(html, "__NEXT_DATA__"));

  let parsed = item ? fromItem(item, canonical) : null;
  if (!parsed?.imageUrls.length) {
    const found: string[] = [];
    walkImages(item || scriptJson(html, "__UNIVERSAL_DATA_FOR_REHYDRATION__"), found);
    const unique = [...new Set(found)].filter((url) => url.startsWith("http"));
    if (unique.length) {
      parsed = parsed || {
        url: canonical,
        tiktokId: canonical.match(/\/(video|photo)\/(\d+)/)?.[2] || "",
        caption: "",
        authorHandle: canonical.match(/@([^/]+)/)?.[1] || "",
        authorName: "",
        authorAvatar: "",
        musicTitle: "",
        musicAuthor: "",
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        kind: unique.length > 1 ? "photo" : "video",
        imageUrls: unique,
      };
      parsed.imageUrls = unique.length > parsed.imageUrls.length ? unique : parsed.imageUrls;
      if (unique.length > 1) parsed.kind = "photo";
    }
  }

  const embed = await oembed(canonical).catch(() => null);
  if (!parsed) {
    if (!embed?.thumbnail_url) throw new ImportError("tiktok_not_found");
    parsed = {
      url: canonical,
      tiktokId: canonical.match(/\/(video|photo)\/(\d+)/)?.[2] || "",
      caption: embed.title || "",
      authorHandle: (embed.author_url || "").split("@")[1]?.split("/")[0] || "",
      authorName: embed.author_name || "",
      authorAvatar: "",
      musicTitle: "",
      musicAuthor: "",
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      kind: "video",
      imageUrls: [embed.thumbnail_url],
    };
  } else {
    parsed.caption = parsed.caption || embed?.title || "";
    parsed.authorName = parsed.authorName || embed?.author_name || "";
    if (!parsed.imageUrls.length && embed?.thumbnail_url) parsed.imageUrls = [embed.thumbnail_url];
  }

  if (!parsed.imageUrls.length) throw new ImportError("no_slides");
  const images: string[] = [];
  for (const url of parsed.imageUrls.slice(0, 35)) {
    try {
      images.push(await downloadImage(url));
    } catch {
      // skip a single expired CDN url
    }
  }
  if (!images.length) throw new ImportError("image_download_failed");

  return {
    url: parsed.url,
    tiktokId: parsed.tiktokId,
    caption: parsed.caption.slice(0, 2200),
    authorHandle: parsed.authorHandle,
    authorName: parsed.authorName,
    authorAvatar: parsed.authorAvatar,
    musicTitle: parsed.musicTitle,
    musicAuthor: parsed.musicAuthor,
    views: parsed.views,
    likes: parsed.likes,
    comments: parsed.comments,
    shares: parsed.shares,
    kind: images.length > 1 ? "photo" : parsed.kind,
    images,
  };
}
