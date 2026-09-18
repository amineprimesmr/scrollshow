import { allowedCoverUrl } from "./tiktok-cover";
import { inScope } from "./projects";
import { readStoreSlice, updateStoreSlice } from "./store";
import { fetchTikTokProfile, normalizeHandle } from "./tiktok-profile";
import type { SessionUser } from "./types";

/**
 * Les URL d'avatar TikTok sont SIGNEES et expirent en ~48 h (`x-expires`).
 * Une fois la date passee le CDN repond 403 : l'avatar stocke a l'ajout du
 * compte est donc mort deux jours plus tard, et rien ne le rafraichissait tant
 * que la lecture du profil echouait ou que le compte n'etait pas resynchronise.
 * Mesure le 17 septembre 2026 : 63 avatars sur 89 etaient expires — les photos
 * de profil ne « chargeaient pas », elles n'existaient plus.
 *
 * Ici un avatar se resout par HANDLE : l'URL stockee si elle est encore valide,
 * sinon une relecture du profil public, et l'URL fraiche est reecrite au store.
 */

/** Secondes restantes avant expiration ; `Infinity` si l'URL n'est pas signee. */
export function signedUrlTtl(raw: string, now = Date.now()) {
  try {
    const expires = Number(new URL(raw).searchParams.get("x-expires") || 0);
    return expires > 0 ? expires - now / 1000 : Infinity;
  } catch {
    return -1;
  }
}

/** Encore servie par le CDN dans les cinq prochaines minutes ? */
export function avatarUrlUsable(raw: string | undefined | null, now = Date.now()): raw is string {
  return Boolean(raw) && Boolean(allowedCoverUrl(raw!)) && signedUrlTtl(raw!, now) > 300;
}

export function validHandle(raw: string) {
  const handle = normalizeHandle(raw || "");
  // Au moins un caractere alphanumerique : `..` n'est pas un handle.
  return /^(?=.*[a-z0-9])[a-z0-9._]{2,40}$/.test(handle) ? handle : "";
}

type Healed = { url: string | null; at: number };
const globalAvatars = globalThis as typeof globalThis & {
  ssAvatarFresh?: Map<string, Healed>;
  ssAvatarPending?: Map<string, Promise<string | null>>;
  ssAvatarWrites?: Map<string, string>;
  ssAvatarFlush?: Promise<void> | null;
  ssAvatarSlots?: number;
  ssAvatarQueue?: (() => void)[];
};
const fresh = () => (globalAvatars.ssAvatarFresh ||= new Map());
const pending = () => (globalAvatars.ssAvatarPending ||= new Map());
const writes = () => (globalAvatars.ssAvatarWrites ||= new Map());

/** Un profil introuvable (compte supprime, handle invente) n'est pas redemande avant une heure. */
const NEGATIVE_MS = 3_600_000;
/** Trois lectures de profil a la fois : un eventail de 70 comptes ne doit pas
 * ressembler a une rafale de robot pour TikTok. */
const MAX_PARALLEL = 3;

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  globalAvatars.ssAvatarSlots ??= 0;
  const queue = (globalAvatars.ssAvatarQueue ||= []);
  if (globalAvatars.ssAvatarSlots >= MAX_PARALLEL) await new Promise<void>(resolve => queue.push(resolve));
  globalAvatars.ssAvatarSlots += 1;
  try { return await task(); }
  finally {
    globalAvatars.ssAvatarSlots -= 1;
    queue.shift()?.();
  }
}

/** Ce qu'on sait deja, sans reseau : une URL fraiche, `null` (profil introuvable,
 * inutile d'insister avant une heure) ou `undefined` (jamais demande). */
export function knownFreshAvatar(handle: string): string | null | undefined {
  const known = fresh().get(handle);
  if (!known) return undefined;
  if (known.url) return avatarUrlUsable(known.url) ? known.url : undefined;
  return Date.now() - known.at < NEGATIVE_MS ? null : undefined;
}

/** URL d'avatar fraiche pour ce handle, ou `null`. Dedoublonne et memorise, echecs compris. */
export async function freshAvatarUrl(handle: string): Promise<string | null> {
  const known = fresh().get(handle);
  if (known && (known.url ? avatarUrlUsable(known.url) : Date.now() - known.at < NEGATIVE_MS)) return known.url;
  let job = pending().get(handle);
  if (!job) {
    job = withSlot(() => fetchTikTokProfile(handle))
      .then(profile => (avatarUrlUsable(profile.avatar) ? profile.avatar : null))
      .catch(() => null)
      .then(url => {
        const known = fresh();
        known.delete(handle);
        known.set(handle, { url, at: Date.now() });
        // Borne : un handle par entree, quelques centaines d'octets chacune.
        while (known.size > 5000) known.delete(known.keys().next().value as string);
        return url;
      })
      .finally(() => pending().delete(handle));
    pending().set(handle, job);
  }
  return job;
}

/** L'avatar stocke pour ce handle dans le projet de l'utilisateur (compte suivi ou connecte). */
export async function storedAvatarUrl(user: SessionUser, handle: string) {
  const data = await readStoreSlice(["accounts", "channels"], { userId: user.id });
  const match = (row: { handle?: string }) => normalizeHandle(row.handle || "") === handle;
  const row = data.channels.find(c => inScope(c, user) && c.platform === "tiktok" && match(c))
    || data.accounts.find(a => inScope(a, user) && match(a));
  return row ? { known: true, url: row.avatar || "" } : { known: false, url: "" };
}

/**
 * Reecrit les avatars repares, en UN lot differe : ouvrir l'Overview repare des
 * dizaines d'avatars d'un coup, et chaque ecriture du store est lourde.
 * Renvoie la promesse du lot, a confier a `after()` pour qu'il survive a la reponse.
 */
export function queueAvatarWrite(userId: string, handle: string, url: string) {
  writes().set(`${userId}\n${handle}`, url);
  return (globalAvatars.ssAvatarFlush ||= new Promise<void>(resolve => setTimeout(resolve, 2500))
    .then(async () => {
      globalAvatars.ssAvatarFlush = null;
      const batch = new Map(writes());
      writes().clear();
      if (!batch.size) return;
      // Une ecriture PORTEE par utilisateur : deux utilisateurs ne s'attendent pas.
      const byOwner = new Map<string, Map<string, string>>();
      for (const [key, avatar] of batch) {
        const [owner, name] = key.split("\n");
        if (!byOwner.has(owner)) byOwner.set(owner, new Map());
        byOwner.get(owner)!.set(name, avatar);
      }
      for (const [owner, names] of byOwner) {
        await updateStoreSlice(["accounts", "channels"], data => {
          for (const row of [...data.accounts, ...data.channels]) {
            const avatar = names.get(normalizeHandle(row.handle || ""));
            if (avatar && row.userId === owner && row.avatar !== avatar) row.avatar = avatar;
          }
        }, { userId: owner }).catch(() => {});
      }
    })
    .catch(() => { globalAvatars.ssAvatarFlush = null; }));
}
