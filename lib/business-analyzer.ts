import { fetchAccountVideos, metricsEnabled } from "./metrics";
import { fetchTikTokProfile, normalizeHandle } from "./tiktok-profile";
import type { BusinessKind, BusinessProfile, BusinessSocial } from "./types";
import { safeFetchBytes } from "./safe-fetch";

/**
 * Turns a business link into a BusinessProfile without any LLM: we fetch the
 * page, read its metadata and structure, detect the business model from
 * concrete signals, and enrich with the brand's public TikTok when we find one.
 * Handles websites, Shopify stores, App Store / Play Store listings and
 * TikTok profiles.
 */

export class AnalyzeError extends Error {
  code: "invalid_url" | "unreachable" | "blocked";
  constructor(code: AnalyzeError["code"], message?: string) {
    super(message || code);
    this.code = code;
  }
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export function normalizeBusinessUrl(raw: string): URL {
  let value = raw.trim();
  if (!value) throw new AnalyzeError("invalid_url");
  if (/^@?[a-z0-9._]{2,24}$/i.test(value) && !value.includes(".")) {
    value = `https://www.tiktok.com/@${value.replace(/^@/, "")}`;
  } else if (value.startsWith("@")) {
    value = `https://www.tiktok.com/${value}`;
  }
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AnalyzeError("invalid_url");
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) throw new AnalyzeError("invalid_url");
  if (/^(localhost|127\.|10\.|192\.168\.|0\.)/.test(url.hostname)) throw new AnalyzeError("invalid_url");
  return url;
}

async function fetchHtml(url: URL, lang = "fr-FR,fr;q=0.9,en;q=0.8"): Promise<{ html: string; finalUrl: URL }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await safeFetchBytes(url, { maxBytes: 1_500_000, headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": lang } });
    return { html: res.bytes.toString("utf8"), finalUrl: new URL(res.url) };
  } catch (error) {
    if (error instanceof AnalyzeError) throw error;
    throw new AnalyzeError("unreachable");
  } finally {
    clearTimeout(timer);
  }
}

/* ── tiny HTML helpers (no DOM on the server) ─────────────────────────── */

function decode(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html: string, key: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decode(match[1]);
  }
  return "";
}

function tag(html: string, name: string): string {
  const match = html.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decode(match[1].replace(/<[^>]+>/g, " ")) : "";
}

function allTags(html: string, name: string, limit = 12): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && out.length < limit) {
    const text = decode(match[1].replace(/<[^>]+>/g, " "));
    if (text.length > 2 && text.length < 140) out.push(text);
  }
  return out;
}

function linkHref(html: string, relPattern: string): string {
  const re = new RegExp(`<link[^>]+rel=["'][^"']*${relPattern}[^"']*["'][^>]*>`, "gi");
  let best = "";
  let bestSize = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const href = match[0].match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const size = Number(match[0].match(/sizes=["'](\d+)/i)?.[1] || 0);
    if (!best || size > bestSize) {
      best = href;
      bestSize = size;
    }
  }
  return best;
}

function absolute(base: URL, href: string): string {
  if (!href) return "";
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

const SOCIAL_RE: { platform: BusinessSocial["platform"]; re: RegExp }[] = [
  { platform: "tiktok", re: /https?:\/\/(?:www\.)?tiktok\.com\/@([a-z0-9._]{2,24})/gi },
  { platform: "instagram", re: /https?:\/\/(?:www\.)?instagram\.com\/([a-z0-9._]{2,30})\/?/gi },
  { platform: "youtube", re: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)([a-z0-9._-]{2,40})/gi },
  { platform: "x", re: /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([a-z0-9_]{2,20})\b/gi },
  { platform: "linkedin", re: /https?:\/\/(?:[a-z]{2}\.)?linkedin\.com\/(?:company|in)\/([a-z0-9._-]{2,60})/gi },
  { platform: "facebook", re: /https?:\/\/(?:www\.)?facebook\.com\/([a-z0-9.]{3,50})\/?/gi },
];
const SOCIAL_NOISE = new Set(["share", "sharer", "intent", "home", "login", "explore", "p", "reel", "watch", "embed", "hashtag", "search", "privacy", "policy", "legal", "help", "about", "tag", "i"]);

function findSocials(html: string): BusinessSocial[] {
  const found = new Map<string, BusinessSocial>();
  for (const { platform, re } of SOCIAL_RE) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) && found.size < 12) {
      const handle = match[1].replace(/\/$/, "");
      if (SOCIAL_NOISE.has(handle.toLowerCase())) continue;
      const key = `${platform}:${handle.toLowerCase()}`;
      if (!found.has(key)) found.set(key, { platform, url: match[0], handle });
    }
  }
  // One per platform is enough for a profile.
  const perPlatform = new Map<string, BusinessSocial>();
  for (const social of found.values()) if (!perPlatform.has(social.platform)) perPlatform.set(social.platform, social);
  return [...perPlatform.values()];
}

function keywordsFrom(text: string, limit = 8): string[] {
  const stop = new Set(
    "the and for with your you our are this that from more les des une pour avec vous nous votre vos est sur dans par plus tout tous the a an to of in on at by or de la le et du en un au".split(" "),
  );
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word.length < 4 || stop.has(word) || /^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function detectKind(url: URL, html: string, signals: string[]): BusinessKind {
  const host = url.hostname.replace(/^www\./, "");
  const lower = html.toLowerCase();
  if (host === "apps.apple.com" || host === "play.google.com") return "mobile_app";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "creator";
  if (/cdn\.shopify\.com|shopify\.theme|woocommerce|bigcommerce|prestashop|add-to-cart|ajouter au panier|add to cart|checkout/.test(lower)) {
    signals.push(/shopify/.test(lower) ? "shopify" : "shop");
    return "ecommerce";
  }
  const hasStore = /apps\.apple\.com|play\.google\.com\/store/.test(lower);
  if (hasStore) signals.push("app-store");
  const saasy = /\/pricing|\/tarifs|\bpricing\b|sign ?up|start free|essai gratuit|free trial|\bapp\.[a-z0-9-]+\./.test(lower);
  if (saasy) signals.push("pricing-page");
  if (hasStore && !saasy) return "mobile_app";
  if (saasy) return "saas";
  if (/\bagence\b|\bagency\b|nos clients|our clients|case stud|études de cas/.test(lower)) return "agency";
  if (/\bpodcast\b|\bnewsletter\b|\bblog\b|\bmagazine\b|\bmedia\b|\bmédia\b/.test(lower) && /article|episode|épisode/.test(lower)) return "media";
  if (/prendre rendez-vous|book a call|devis|quote|consultation|nos services|our services/.test(lower)) return "service";
  return "other";
}

/* ── store listings ───────────────────────────────────────────────────── */

function appStoreProfile(url: URL, html: string): Partial<BusinessProfile> {
  const title = (meta(html, "og:title") || tag(html, "title")).replace(/\s*(on the App Store|dans l’App Store|dans l'App Store|- Apps on Google Play|– Applications sur Google Play|- Applications sur Google Play).*$/i, "");
  return {
    name: title,
    tagline: meta(html, "description") || meta(html, "og:description"),
    logo: meta(html, "og:image"),
  };
}

/**
 * Une fiche App Store passe par l'API publique d'Apple plutot que par le HTML :
 * la page est protegee (404 sur un slug perime, 429 des deux requetes de suite)
 * alors que l'API repond toujours a partir du seul identifiant de l'app.
 */
async function appleLookup(url: URL): Promise<Partial<BusinessProfile> | null> {
  const id = url.pathname.match(/\/id(\d{6,})/)?.[1];
  if (!id) return null;
  const country = url.pathname.match(/^\/([a-z]{2})\//)?.[1] || "us";
  try {
    const res = await safeFetchBytes(
      new URL(`https://itunes.apple.com/lookup?id=${id}&country=${country}`),
      { maxBytes: 400_000, headers: { Accept: "application/json" } },
    );
    const data = JSON.parse(res.bytes.toString("utf8")) as {
      results?: { trackName?: string; description?: string; artworkUrl512?: string; artworkUrl100?: string; sellerUrl?: string; genres?: string[] }[];
    };
    const app = data.results?.[0];
    if (!app?.trackName) return null;
    return {
      name: app.trackName,
      tagline: (app.description || "").split("\n").find((line) => line.trim().length > 20)?.trim() || "",
      logo: app.artworkUrl512 || app.artworkUrl100,
      keywords: (app.genres || []).slice(0, 8),
    };
  } catch {
    return null;
  }
}

/* ── main ─────────────────────────────────────────────────────────────── */

export async function analyzeBusiness(rawUrl: string): Promise<BusinessProfile> {
  const url = normalizeBusinessUrl(rawUrl);
  const host = url.hostname.replace(/^www\./, "");
  const now = new Date().toISOString();

  // TikTok profile as the business itself (creators, UGC brands).
  if (host === "tiktok.com" && url.pathname.startsWith("/@")) {
    const handle = normalizeHandle(url.pathname.slice(1));
    const tiktok = await enrichTikTok(handle);
    return {
      name: tiktok?.nickname || `@${handle}`,
      url: `https://www.tiktok.com/@${handle}`,
      kind: "creator",
      logo: tiktok?.avatar,
      tagline: "",
      keywords: [],
      socials: [{ platform: "tiktok", url: `https://www.tiktok.com/@${handle}`, handle }],
      signals: ["tiktok-profile"],
      tiktok,
      analyzedAt: now,
    };
  }

  // Apple sert des 404/429 aux robots : on interroge son API avant la page, et
  // la fiche reste analysable meme quand le HTML est refuse.
  const apple = host === "apps.apple.com" ? await appleLookup(url) : null;
  let page: { html: string; finalUrl: URL };
  try {
    page = await fetchHtml(url);
  } catch (error) {
    if (!apple) throw error;
    page = { html: "", finalUrl: url };
  }
  const { html, finalUrl } = page;
  const signals: string[] = [];
  const kind = detectKind(finalUrl, html, signals);
  const store = apple
    ? { ...appStoreProfile(finalUrl, html), ...Object.fromEntries(Object.entries(apple).filter(([, value]) => (Array.isArray(value) ? value.length : value))) }
    : kind === "mobile_app" && /apps\.apple\.com|play\.google\.com/.test(finalUrl.hostname)
      ? appStoreProfile(finalUrl, html)
      : {};

  const siteName = meta(html, "og:site_name") || meta(html, "application-name");
  const title = meta(html, "og:title") || tag(html, "title");
  const name =
    store.name ||
    siteName ||
    title.split(/\s[|–—-]\s/)[0].trim() ||
    host.split(".")[0];
  const tagline = store.tagline || meta(html, "description") || meta(html, "og:description") || allTags(html, "h1", 1)[0] || "";
  const iconHref = linkHref(html, "apple-touch-icon") || linkHref(html, "icon");
  const logo = store.logo || absolute(finalUrl, iconHref) || `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
  const language = (html.match(/<html[^>]+lang=["']([a-z]{2})/i)?.[1] || meta(html, "og:locale").slice(0, 2) || "").toLowerCase();
  const brandColor = meta(html, "theme-color").match(/#[0-9a-f]{3,8}/i)?.[0] || "";
  const headings = [...allTags(html, "h1", 3), ...allTags(html, "h2", 6)];
  const keywords = store.keywords?.length
    ? store.keywords
    : meta(html, "keywords")
    ? meta(html, "keywords").split(/\s*,\s*/).filter(Boolean).slice(0, 8)
    : keywordsFrom([tagline, ...headings].join(" "));
  const socials = findSocials(html);
  const tiktokHandle = socials.find((item) => item.platform === "tiktok")?.handle;
  const tiktok = tiktokHandle ? await enrichTikTok(tiktokHandle).catch(() => null) : null;

  return {
    name: name.slice(0, 60),
    url: finalUrl.toString(),
    kind,
    logo,
    tagline: tagline.slice(0, 200),
    description: headings.slice(0, 5).join(" · ").slice(0, 400),
    language,
    brandColor,
    keywords,
    socials,
    signals,
    tiktok,
    analyzedAt: now,
  };
}

/** Public TikTok stats for the brand: profile page first, metrics provider for recent posts when configured. */
export async function enrichTikTok(rawHandle: string): Promise<BusinessProfile["tiktok"]> {
  const handle = normalizeHandle(rawHandle);
  if (!handle) return null;
  let profile;
  try {
    profile = await fetchTikTokProfile(handle);
  } catch {
    return null;
  }
  let avgViews = 0;
  let photoShare = 0;
  let source: "tiktok" | "api" = "tiktok";
  if (metricsEnabled()) {
    try {
      const videos = await fetchAccountVideos(handle, 1);
      if (videos.length) {
        avgViews = Math.round(videos.reduce((sum, item) => sum + item.views, 0) / videos.length);
        photoShare = Math.round((videos.filter((item) => item.kind === "photo").length / videos.length) * 100);
        source = "api";
      }
    } catch {
      /* The metrics provider is an enrichment, never a blocker. */
    }
  }
  return {
    handle: profile.handle,
    nickname: profile.nickname,
    avatar: profile.avatar,
    followers: profile.followers,
    likes: profile.likes,
    videos: profile.videos,
    avgViews,
    photoShare,
    source,
  };
}
