import { safeFetchBytes } from "./safe-fetch";

const globalCache = globalThis as typeof globalThis & {
  __scrollshowMediaSize?: Map<string, { bytes: number | null; at: number }>;
};

const TTL_MS = 10 * 60 * 1000;

function cache() {
  if (!globalCache.__scrollshowMediaSize) globalCache.__scrollshowMediaSize = new Map();
  return globalCache.__scrollshowMediaSize;
}

/** HEAD the file for its real Content-Length. Local /assets/... paths have no server to HEAD, so those resolve to null (shown as "—", never guessed). */
async function headSize(url: string): Promise<number | null> {
  if (url.startsWith("/")) return null;
  try {
    const res = await safeFetchBytes(url, { method: "HEAD", timeoutMs: 4000 });
    return Number.isFinite(res.contentLength) && res.contentLength! >= 0 ? res.contentLength! : null;
  } catch {
    return null;
  }
}

/** Real byte sizes for a set of media URLs, HEAD-requested with bounded concurrency and cached for 10 minutes. */
export async function sizesOf(urls: string[]): Promise<Map<string, number | null>> {
  const store = cache();
  const now = Date.now();
  for (const [key, value] of store) if (now - value.at >= TTL_MS) store.delete(key);
  if (store.size > 10000) store.clear();
  const unique = Array.from(new Set(urls));
  const result = new Map<string, number | null>();
  const pending: string[] = [];

  for (const url of unique) {
    const hit = store.get(url);
    if (hit && now - hit.at < TTL_MS) result.set(url, hit.bytes);
    else pending.push(url);
  }

  const CONCURRENCY = 6;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    const bytes = await Promise.all(batch.map(headSize));
    batch.forEach((url, index) => {
      store.set(url, { bytes: bytes[index], at: now });
      result.set(url, bytes[index]);
    });
  }

  return result;
}
