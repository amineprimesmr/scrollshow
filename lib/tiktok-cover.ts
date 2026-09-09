/**
 * TikTok covers live on signed CDN URLs the browser often refuses to load
 * (hotlink protection, our no-referrer policy). The studio proxies them, so the
 * allowlist below is what keeps that proxy from becoming an open relay.
 */
const HOSTS = [
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "tiktokcdn-eu.com",
  "tiktokcdn-in.com",
  "ttwstatic.com",
  "ibyteimg.com",
  "byteoversea.com",
  "muscdn.com",
];

export const COVER_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];

/** The URL to fetch, or null when it is not a TikTok image host over https. */
export function allowedCoverUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? url : null;
  } catch {
    return null;
  }
}
