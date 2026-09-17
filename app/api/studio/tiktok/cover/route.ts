import { readStudioSession as readSession } from "@/lib/auth";
import { consumeLimit } from "@/lib/rate-limit";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { allowedCoverUrl, coverCacheKey, coverExpired, coverWidth, COVER_TYPES } from "@/lib/tiktok-cover";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

type Cached = { bytes: Uint8Array; type: string };

/**
 * Cache memoire des vignettes deja redimensionnees, borne en octets.
 * Une vignette WebP pese 5 a 25 Ko : 48 Mo couvrent ~3000 images, soit toutes
 * les galeries qu'une session ouvre. Sert aussi a dedoublonner les requetes
 * simultanees sur la meme image (mode strict de React, deux onglets).
 */
const MAX_CACHE_BYTES = 48_000_000;
const globalCovers = globalThis as typeof globalThis & {
  ssCoverCache?: Map<string, Cached>;
  ssCoverBytes?: number;
  ssCoverPending?: Map<string, Promise<Cached | null>>;
};
const cache = () => (globalCovers.ssCoverCache ||= new Map());
const pending = () => (globalCovers.ssCoverPending ||= new Map());

function remember(key: string, value: Cached) {
  const store = cache();
  // Des requetes simultanees partagent un meme chargement puis appellent toutes
  // `remember` : sans ce retrait le compteur gonflait d'octets fantomes et la
  // boucle d'eviction finissait par vider le cache.
  const previous = store.get(key);
  if (previous) globalCovers.ssCoverBytes = (globalCovers.ssCoverBytes || 0) - previous.bytes.byteLength;
  store.delete(key);
  store.set(key, value);
  globalCovers.ssCoverBytes = (globalCovers.ssCoverBytes || 0) + value.bytes.byteLength;
  while ((globalCovers.ssCoverBytes || 0) > MAX_CACHE_BYTES && store.size > 1) {
    const oldest = store.keys().next().value as string;
    globalCovers.ssCoverBytes! -= store.get(oldest)!.bytes.byteLength;
    store.delete(oldest);
  }
}

async function load(url: URL, width: number | null): Promise<Cached | null> {
  const file = await safeFetchBytes(url, {
    maxBytes: 8_000_000,
    timeoutMs: 6000,
    // TikTok serves the image only to a tiktok.com referrer.
    headers: { Referer: "https://www.tiktok.com/", Accept: "image/*" },
  });
  const type = file.contentType.split(";")[0].trim().toLowerCase();
  if (!COVER_TYPES.includes(type)) return null;
  // Un GIF anime perdrait ses images ; sans largeur demandee on relaie tel quel.
  if (!width || type === "image/gif") return { bytes: new Uint8Array(file.bytes), type };
  try {
    // Une slide TikTok fait 1080 px de large et 200 a 500 Ko pour etre affichee
    // dans une tuile de 200 px : on envoie ce que l'ecran montre.
    const bytes = await sharp(file.bytes, { failOn: "none", limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 72, effort: 2 })
      .toBuffer();
    return { bytes: new Uint8Array(bytes), type: "image/webp" };
  } catch {
    return { bytes: new Uint8Array(file.bytes), type };
  }
}

function respond(hit: Cached) {
  return new NextResponse(hit.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": hit.type,
      // La cle est l'image elle-meme (chemin CDN sans signature) : son contenu
      // ne change pas. La signature amont expire, notre copie non.
      "Cache-Control": "private, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = allowedCoverUrl(request.nextUrl.searchParams.get("url") || "");
  if (!url) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const width = coverWidth(request.nextUrl.searchParams.get("w"));
  const key = coverCacheKey(url, width);

  // Une image deja en memoire ne coute ni appel amont ni jeton du compteur.
  const hit = cache().get(key);
  if (hit) {
    // Vrai LRU : une image relue repasse en tete.
    cache().delete(key);
    cache().set(key, hit);
    return respond(hit);
  }

  // Signature deja expiree : le CDN repondra 403. Inutile d'y aller, et surtout
  // de tenir une des six connexions du navigateur pour l'apprendre.
  if (coverExpired(url)) return NextResponse.json({ error: "expired" }, { status: 404, headers: { "Cache-Control": "private, max-age=300" } });

  // Une galerie complète fait ~300 vignettes : large, mais pas un relais ouvert.
  if (!(await consumeLimit(`tiktok-cover:${user.id}`, 600, 600_000))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }
  try {
    let job = pending().get(key);
    if (!job) {
      job = load(url, width).finally(() => pending().delete(key));
      pending().set(key, job);
    }
    const file = await job;
    if (!file) return NextResponse.json({ error: "not_an_image" }, { status: 415 });
    remember(key, file);
    return respond(file);
  } catch {
    // Expired signature or an unreachable CDN: the panel falls back on its own.
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }
}
