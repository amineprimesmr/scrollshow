import sharp from "sharp";
import { consumeLimit } from "./rate-limit";
import { savePublicImage, readSlideBytes } from "./media-files";
import { withMediaUser } from "./media-permissions";
import { inScope } from "./projects";
import { safeFetchBytes } from "./safe-fetch";
import { updateStoreSlice, readStoreSlice } from "./store";
import type { MediaItem, SessionUser } from "./types";

/**
 * Banque d'images du projet + recherche d'images.
 * Ordre voulu par le produit : la banque d'abord (gratuite), puis la recherche Pinterest publique
 * (gratuite aussi : c'est la requete que fait le site sans connexion). Aucun LLM ici : le serveur
 * filtre sur des signaux mesures, c'est l'agent de l'utilisateur qui juge les images a l'oeil.
 * Mesures et decisions : docs/previsionnel-recreation-tiktok-2026-09-18.md.
 */

export type ImageCandidate = {
  id: string;
  /** Page d'origine, conservee avec l'image. */
  page: string;
  image: string;
  preview: string;
  thumb: string;
  width: number;
  height: number;
  reactions: number;
  created: string;
  followers: number;
  domain: string;
  promoted: boolean;
  video: boolean;
};

const SHOP = /amazon|etsy|temu|shein|aliexpress|ebay|walmart|shop|store|redbubble|zazzle|teepublic/i;
const MONTH = 2.63e9;

/** Pinterest est inonde d'images generees, postees par de petits comptes recents et jamais
 * etiquetees (mesure : 60 % des resultats crees dans l'annee, la moitie a <= 2 reactions).
 * On ne peut pas les reconnaitre, mais on peut ecarter ce qui leur ressemble. */
export function keepCandidate(pin: ImageCandidate, now = Date.now()) {
  if (pin.promoted || pin.video || pin.width < 700 || SHOP.test(pin.domain)) return false;
  const age = (now - new Date(pin.created).getTime()) / MONTH;
  return !(pin.reactions < 3 && (Number.isNaN(age) || age < 18));
}

export function rankCandidates(pins: ImageCandidate[], limit = 20, now = Date.now()) {
  return pins.filter(pin => keepCandidate(pin, now)).sort((a, b) => b.reactions - a.reactions).slice(0, limit);
}

type RawPin = { id?: string; images?: Record<string, { url: string; width: number; height: number }>; reaction_counts?: Record<string, number>; created_at?: string; pinner?: { follower_count?: number }; domain?: string; is_promoted?: boolean; videos?: unknown; story_pin_data?: unknown };

export function normalizePin(pin: RawPin): ImageCandidate | null {
  const orig = pin.images?.orig;
  if (!pin.id || !orig?.url) return null;
  return {
    id: pin.id, page: `https://www.pinterest.com/pin/${pin.id}/`, image: orig.url,
    preview: pin.images?.["736x"]?.url || orig.url, thumb: pin.images?.["236x"]?.url || orig.url,
    width: orig.width, height: orig.height,
    reactions: Object.values(pin.reaction_counts || {}).reduce((sum, n) => sum + (Number(n) || 0), 0),
    created: pin.created_at || "", followers: pin.pinner?.follower_count || 0, domain: pin.domain || "",
    promoted: Boolean(pin.is_promoted), video: Boolean(pin.videos || pin.story_pin_data),
  };
}

// Cache partage entre utilisateurs : une requete ne depend pas de qui la pose. Borne, en memoire.
const searchCache = new Map<string, { at: number; pins: ImageCandidate[] }>();
const CACHE_MS = 6 * 3600_000;
const normalizeQuery = (query: string) => query.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);

export async function searchPinterest(query: string): Promise<ImageCandidate[]> {
  const key = normalizeQuery(query);
  if (key.length < 2) throw new Error("query_required");
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.pins;
  const data = { options: { query: key, scope: "pins", page_size: 50, rs: "typed" }, context: {} };
  const url = "https://www.pinterest.com/resource/BaseSearchResource/get/?" + new URLSearchParams({ source_url: `/search/pins/?q=${encodeURIComponent(key)}`, data: JSON.stringify(data) });
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    // Sans X-Pinterest-PWS-Handler la requete est refusee (403).
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", Accept: "application/json", "X-Requested-With": "XMLHttpRequest", "X-Pinterest-PWS-Handler": "www/search/[scope].js" },
  });
  if (!response.ok) throw new Error(`image_search_unavailable_${response.status}`);
  const json = await response.json() as { resource_response?: { data?: { results?: RawPin[] } } };
  const pins = (json.resource_response?.data?.results || []).map(normalizePin).filter((pin): pin is ImageCandidate => Boolean(pin));
  if (searchCache.size > 500) searchCache.delete(searchCache.keys().next().value as string);
  searchCache.set(key, { at: Date.now(), pins });
  return pins;
}

/** Planche numerotee : ce que l'agent regarde pour choisir. Une image, pas vingt. */
export async function contactSheet(items: Array<{ bytes: Buffer; label: string }>, columns = 5) {
  const W = 300, H = 400, gap = 6;
  const tiles = await Promise.all(items.map(async (item, index) => {
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="46" height="30" fill="#000"/><text x="6" y="23" font-family="Arial" font-size="22" font-weight="700" fill="#fff">${index}</text><rect y="${H - 22}" width="${W}" height="22" fill="rgba(0,0,0,.55)"/><text x="6" y="${H - 6}" font-family="Arial" font-size="14" fill="#fff">${item.label.replace(/[<&>]/g, "")}</text></svg>`);
    try { return await sharp(item.bytes).rotate().resize(W, H, { fit: "cover" }).composite([{ input: label }]).jpeg().toBuffer(); } catch { return null; }
  }));
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const composite = tiles.flatMap((input, index) => input ? [{ input, left: (index % columns) * (W + gap), top: Math.floor(index / columns) * (H + gap) }] : []);
  return sharp({ create: { width: columns * (W + gap) - gap, height: rows * (H + gap) - gap, channels: 3, background: "#ffffff" } }).composite(composite).jpeg({ quality: 78 }).toBuffer();
}

const fetchThumb = async (url: string) => (await safeFetchBytes(url, { maxBytes: 3_000_000, timeoutMs: 8000 })).bytes;

export async function findImages(user: SessionUser, input: { query: string; limit?: number }) {
  if (!(await consumeLimit(`imgsearch:${user.id}`, 300, 86400000))) throw new Error("daily_image_search_limit");
  const limit = Math.min(20, Math.max(4, input.limit ?? 15));
  const bank = (await gallerySearch(user, input.query)).slice(0, 5);
  const found = rankCandidates(await searchPinterest(input.query), limit);
  const thumbs = await Promise.all(found.map(async pin => { try { return { pin, bytes: await fetchThumb(pin.preview) }; } catch { return null; } }));
  const usable = thumbs.filter((item): item is { pin: ImageCandidate; bytes: Buffer } => Boolean(item));
  const sheet = usable.length ? await contactSheet(usable.map(({ pin, bytes }) => ({ bytes, label: `${pin.width}x${pin.height} · ${pin.reactions} reactions` }))) : null;
  return { query: normalizeQuery(input.query), bank, candidates: usable.map(({ pin }, index) => ({ index, image: pin.image, fallback: pin.preview, page: pin.page, width: pin.width, height: pin.height, reactions: pin.reactions })), sheet };
}

/** Ajoute une image a la banque depuis n'importe quelle URL publique (Pinterest, generateur d'images, web). */
export async function galleryAdd(user: SessionUser, input: { url: string; fallback?: string; page?: string; tags?: string[]; note?: string; source?: MediaItem["source"] }) {
  if (!(await consumeLimit(`galleryadd:${user.id}`, 400, 86400000))) throw new Error("daily_gallery_limit");
  let bytes: Buffer | null = null; let info: { width: number; height: number } | null = null;
  // Certaines « originales » Pinterest sont en HEIF, que sharp ne decode pas : on retombe sur la taille suivante.
  for (const candidate of [input.url, input.fallback].filter(Boolean) as string[]) {
    try {
      const file = await safeFetchBytes(candidate, { maxBytes: 25_000_000, timeoutMs: 15000 });
      const out = await sharp(file.bytes, { limitInputPixels: 60_000_000 }).rotate().resize({ width: 2160, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
      bytes = out.data; info = out.info; break;
    } catch { /* source suivante */ }
  }
  if (!bytes || !info) throw new Error("image_unreadable");
  const url = await savePublicImage(bytes, "image/jpeg");
  const tags = [...new Set((input.tags || []).map(tag => tag.toLowerCase().trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
  const host = (() => { try { return new URL(input.page || input.url).hostname; } catch { return ""; } })();
  const item: MediaItem = {
    id: crypto.randomUUID(), userId: user.id, projectId: user.projectId, url, createdAt: new Date().toISOString(),
    name: (input.note || tags.slice(0, 4).join(" ") || "Image").slice(0, 80),
    source: input.source || (/pinterest|pinimg/.test(host) ? "pinterest" : "web"), sourceUrl: (input.page || input.url).slice(0, 500),
    tags, note: input.note?.slice(0, 300), width: info.width, height: info.height,
  };
  await updateStoreSlice(["media"], data => { data.media.push(item); }, { userId: user.id });
  return publicItem(item);
}

const publicItem = (item: MediaItem) => ({ id: item.id, url: item.url, name: item.name, tags: item.tags || [], note: item.note || null, source: item.source || "upload", sourceUrl: item.sourceUrl || null, width: item.width || null, height: item.height || null });

export async function gallerySearch(user: SessionUser, query = "") {
  const data = await readStoreSlice(["media"], { userId: user.id });
  const words = normalizeQuery(query).split(" ").filter(word => word.length > 2);
  return data.media
    .filter(item => inScope(item, user) && item.source !== "render")
    .map(item => ({ item, score: words.length ? words.filter(word => `${item.name} ${(item.tags || []).join(" ")} ${item.note || ""}`.toLowerCase().includes(word)).length : 1 }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.createdAt.localeCompare(a.item.createdAt))
    .slice(0, 40).map(entry => publicItem(entry.item));
}

export async function gallerySheet(user: SessionUser, items: Array<{ url: string; name: string }>) {
  const loaded = await withMediaUser(user, () => Promise.all(items.slice(0, 20).map(async item => { try { const file = await readSlideBytes(item.url); return file ? { bytes: file.bytes, label: item.name } : null; } catch { return null; } })));
  const usable = loaded.filter((item): item is { bytes: Buffer; label: string } => Boolean(item));
  return usable.length ? contactSheet(usable) : null;
}
