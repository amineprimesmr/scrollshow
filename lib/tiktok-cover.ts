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

/** Largeurs servies. Une liste fermee : un appelant ne peut pas faire fabriquer
 * (et mettre en cache) mille variantes de la meme image. */
export const COVER_WIDTHS = [96, 240, 480, 960] as const;

/** La plus petite largeur servie qui couvre la demande ; `null` = image d'origine. */
export function coverWidth(raw: string | null): number | null {
  const wanted = Number(raw);
  if (!raw || !Number.isFinite(wanted) || wanted <= 0) return null;
  return COVER_WIDTHS.find((w) => w >= wanted) ?? COVER_WIDTHS[COVER_WIDTHS.length - 1];
}

/** L'image est identifiee par son chemin CDN : la signature et la date
 * d'expiration de la requete changent a chaque lecture du compte, pas l'image. */
export function coverCacheKey(url: URL, width: number | null) {
  return `${url.hostname.toLowerCase()}${url.pathname}|${width ?? "raw"}`;
}

/** Les URL du CDN TikTok sont signees et datees (`x-expires`, en secondes). */
export function coverExpired(url: URL, now = Date.now()) {
  const expires = Number(url.searchParams.get("x-expires") || 0);
  return expires > 0 && expires * 1000 <= now;
}
