// Zernio (https://zernio.com/api/v1) publishes through its own audited TikTok
// app, so a carousel can go public without ScrollShow's Direct Post audit.
// Server-side only: ZERNIO_API_KEY must never reach the browser.

const BASE = "https://zernio.com/api/v1";

export class ZernioError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export type ZernioAccount = { id: string; platform: string; username: string };

export type ZernioTikTokOptions = {
  /** true = Creator Inbox draft (MEDIA_UPLOAD); false = public direct post. */
  draft: boolean;
  /** A value from the account's creator_info options; ignored for drafts. */
  privacyLevel?: string;
  allowComment?: boolean;
  autoAddMusic?: boolean;
  commercialContentType?: "none" | "brand_organic" | "brand_content";
};

export function zernioConfigured() {
  return Boolean(process.env.ZERNIO_API_KEY);
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) throw new ZernioError("zernio_not_configured", 503, null);
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: string; message?: string } | null)?.error || (body as { message?: string } | null)?.message || `http_${res.status}`;
    throw new ZernioError(`zernio_${message}`, res.status, body);
  }
  return body as T;
}

export async function listZernioAccounts(): Promise<ZernioAccount[]> {
  const data = await call<{ accounts?: Array<Record<string, unknown>> }>("/accounts");
  return (data.accounts || []).map(a => ({
    id: String(a._id || a.id || ""),
    platform: String(a.platform || ""),
    username: String(a.username || a.displayName || ""),
  }));
}

/** The request body for a TikTok photo carousel; pure so it can be tested. */
export function tiktokCarouselBody(input: { accountId: string; photos: string[]; caption: string; title?: string; scheduledFor?: string; options: ZernioTikTokOptions }) {
  if (!input.photos.length || input.photos.length > 35) throw new ZernioError("zernio_photos_required", 400, null);
  if (!input.options.draft && !input.options.privacyLevel) throw new ZernioError("zernio_privacy_required", 400, null);
  if (input.options.commercialContentType === "brand_content" && input.options.privacyLevel === "SELF_ONLY") throw new ZernioError("zernio_branded_content_private", 400, null);
  return {
    // Photo posts: `content` becomes the 90-char title, `description` the caption.
    content: (input.title || input.caption).slice(0, 90),
    mediaItems: input.photos.map(url => ({ type: "image", url })),
    platforms: [{ platform: "tiktok", accountId: input.accountId }],
    ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : { publishNow: true }),
    tiktokSettings: {
      mediaType: "photo",
      draft: input.options.draft,
      description: input.caption.slice(0, 4000),
      ...(input.options.draft ? {} : { privacyLevel: input.options.privacyLevel }),
      allowComment: input.options.allowComment === true,
      autoAddMusic: input.options.autoAddMusic === true,
      commercialContentType: input.options.commercialContentType || "none",
      photoCoverIndex: 0,
      contentPreviewConfirmed: true,
      expressConsentGiven: true,
    },
  };
}

export async function createTikTokCarousel(input: Parameters<typeof tiktokCarouselBody>[0]) {
  const data = await call<{ post?: { _id?: string; status?: string } }>("/posts", { method: "POST", body: JSON.stringify(tiktokCarouselBody(input)) });
  if (!data.post?._id) throw new ZernioError("zernio_post_missing", 502, data);
  return { id: data.post._id, status: String(data.post.status || "") };
}

export async function getZernioPost(id: string) {
  return call<{ post?: Record<string, unknown> }>(`/posts/${encodeURIComponent(id)}`);
}

/** Uploads bytes to Zernio's storage and returns the public URL to use in a post. */
export async function uploadZernioMedia(bytes: Buffer, filename: string, contentType: string) {
  const { uploadUrl, publicUrl } = await call<{ uploadUrl: string; publicUrl: string }>("/media/presign", {
    method: "POST",
    body: JSON.stringify({ filename, contentType, size: bytes.length }),
  });
  const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new ZernioError(`zernio_upload_http_${res.status}`, res.status, null);
  return publicUrl;
}
