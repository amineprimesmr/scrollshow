/** TikTok covers and avatars are hotlink-protected: always go through our own proxy. */
export function coverSrc(url: string) {
  if (!url) return "";
  if (!/^https:\/\//.test(url)) return url;
  return `/api/studio/tiktok/cover?url=${encodeURIComponent(url)}`;
}
