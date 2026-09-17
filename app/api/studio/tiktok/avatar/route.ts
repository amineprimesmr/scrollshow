import { readStudioSession as readSession } from "@/lib/auth";
import { consumeLimit } from "@/lib/rate-limit";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { avatarUrlUsable, freshAvatarUrl, knownFreshAvatar, queueAvatarWrite, storedAvatarUrl, validHandle } from "@/lib/tiktok-avatar";
import { COVER_TYPES, coverWidth } from "@/lib/tiktok-cover";
import { after, NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

type Cached = { bytes: Uint8Array; type: string; at: number };
const globalCache = globalThis as typeof globalThis & { ssAvatarBytes?: Map<string, Cached>; ssAvatarTotal?: number };
const cache = () => (globalCache.ssAvatarBytes ||= new Map());
const MEMORY_MS = 24 * 3_600_000;
/** Un avatar WebP pese 2 a 8 Ko : 24 Mo en couvrent des milliers. Borne en OCTETS,
 * le plus ancien sort d'abord : une instance qui vit des jours ne doit pas enfler. */
const MAX_AVATAR_BYTES = 24_000_000;

function remember(key: string, value: Cached) {
  const store = cache();
  const previous = store.get(key);
  if (previous) globalCache.ssAvatarTotal = (globalCache.ssAvatarTotal || 0) - previous.bytes.byteLength;
  store.delete(key);
  store.set(key, value);
  globalCache.ssAvatarTotal = (globalCache.ssAvatarTotal || 0) + value.bytes.byteLength;
  while ((globalCache.ssAvatarTotal || 0) > MAX_AVATAR_BYTES && store.size > 1) {
    const oldest = store.keys().next().value as string;
    globalCache.ssAvatarTotal! -= store.get(oldest)!.bytes.byteLength;
    store.delete(oldest);
  }
}

async function download(url: string, width: number): Promise<Cached | null> {
  const file = await safeFetchBytes(url, {
    maxBytes: 4_000_000, timeoutMs: 5000,
    headers: { Referer: "https://www.tiktok.com/", Accept: "image/*" },
  });
  const type = file.contentType.split(";")[0].trim().toLowerCase();
  if (!COVER_TYPES.includes(type)) return null;
  try {
    const bytes = await sharp(file.bytes, { failOn: "none", limitInputPixels: 40_000_000 }).rotate()
      .resize({ width, height: width, fit: "cover", withoutEnlargement: true })
      .webp({ quality: 76, effort: 2 }).toBuffer();
    return { bytes: new Uint8Array(bytes), type: "image/webp", at: Date.now() };
  } catch {
    // Image illisible : on ne garde pas 4 Mo bruts en memoire pour un avatar.
    return null;
  }
}

function respond(hit: Cached, cacheControl = "private, max-age=86400, stale-while-revalidate=604800") {
  return new NextResponse(hit.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": hit.type,
      // L'adresse est stable (le handle) : le navigateur garde l'avatar meme
      // quand TikTok change la signature de son URL. Un jour, puis revalidation
      // en arriere-plan : une photo de profil change rarement.
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Avatar TikTok par handle, auto-repare (voir `lib/tiktok-avatar.ts`). */
export async function GET(request: NextRequest) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const handle = validHandle(request.nextUrl.searchParams.get("handle") || "");
  if (!handle) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const width = coverWidth(request.nextUrl.searchParams.get("w")) || 96;
  const key = `${handle}|${width}`;

  const hit = cache().get(key);
  if (hit && Date.now() - hit.at < MEMORY_MS) return respond(hit);
  if (hit) cache().delete(key);

  if (!(await consumeLimit(`tiktok-avatar:${user.id}`, 600, 600_000))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  // 1. l'URL stockee par ScrollShow ; 2. une relecture du profil public.
  const stored = await storedAvatarUrl(user, handle);
  if (avatarUrlUsable(stored.url)) {
    const file = await download(stored.url, width).catch(() => null);
    if (file) { remember(key, file); return respond(file); }
  }

  // L'indice `url` vient du NAVIGATEUR : rien ne le relie au handle. Il sert a
  // afficher l'auteur d'un post hors bibliotheque sans relire son profil, mais
  // il ne doit jamais entrer dans le cache partage — sinon n'importe quel
  // utilisateur connecte ferait servir l'image de son choix comme avatar de
  // @nike a tous les autres pendant 24 h.
  const hinted = request.nextUrl.searchParams.get("url") || "";
  if (!stored.known && avatarUrlUsable(hinted)) {
    const file = await download(hinted, width).catch(() => null);
    if (file) return respond(file, "private, max-age=3600");
  }

  // La relecture du profil peut prendre dix secondes quand TikTok freine. Elle
  // ne doit JAMAIS tenir la connexion : en HTTP/1.1 le navigateur n'en ouvre que
  // six par hote, et une trentaine d'avatars en attente bloquaient alors toutes
  // les requetes de donnees de la page. On repare en arriere-plan ; l'image est
  // la au prochain essai (le client en refait un quelques secondes plus tard).
  const healed = knownFreshAvatar(handle);
  if (healed) {
    const file = await download(healed, width).catch(() => null);
    if (file) { remember(key, file); return respond(file); }
  } else if (healed === undefined) {
    after(freshAvatarUrl(handle).then(url => (url && stored.known ? queueAvatarWrite(user.id, handle, url) : undefined)));
  }
  // Compte supprime ou profil illisible : l'interface montre ses initiales.
  return NextResponse.json({ error: "unavailable" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
