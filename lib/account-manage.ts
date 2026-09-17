import { inScope } from "./projects";
import type { Account, Channel, SessionUser, StoreData } from "./types";

/**
 * Gestionnaire de comptes du projet : lister (masques compris), masquer,
 * reafficher, supprimer — un compte ou cent d'un coup.
 *
 * Deux gestes, volontairement distincts :
 * - MASQUER est reversible et ne touche a rien : le compte sort de l'Overview, du
 *   calendrier, du composeur et de l'agent (`ownedChannels`), ses posts et ses
 *   mesures restent.
 * - SUPPRIMER efface la ligne et son cache de videos. Pour un compte connecte le
 *   jeton est aussi revoque chez la plateforme par la route (hors verrou du store).
 *   Les posts du calendrier ne sont jamais supprimes : ils perdent seulement leur cible.
 */
export type ManagedKind = "connected" | "tracked";
export type ManagedAccount = {
  key: string;
  kind: ManagedKind;
  platform: string;
  handle: string;
  name: string;
  avatar: string;
  followers: number;
  likes: number;
  posts: number;
  /** Jeton valide : publier est possible. Faux pour un compte suivi ou une connexion expiree. */
  connected: boolean;
  hidden: boolean;
  /** Posts planifies qui visent ce compte : les supprimer de la cible merite un avertissement. */
  scheduledPosts: number;
  addedAt: string | null;
};

export type ManageAction = "hide" | "show" | "remove";
export const MANAGE_MAX_KEYS = 500;

export function parseManagedKey(key: string): { kind: ManagedKind; id: string } | null {
  if (key.startsWith("ch:") && key.length > 3) return { kind: "connected", id: key.slice(3) };
  if (key.startsWith("ac:") && key.length > 3) return { kind: "tracked", id: key.slice(3) };
  return null;
}

export function listManagedAccounts(data: StoreData, user: Pick<SessionUser, "id" | "projectId">): ManagedAccount[] {
  const scheduled = new Map<string, number>();
  for (const post of data.posts || []) {
    if (post.status !== "scheduled" || !inScope(post, user)) continue;
    for (const id of post.channelIds || []) scheduled.set(id, (scheduled.get(id) || 0) + 1);
  }
  const channels = data.channels.filter((item) => inScope(item, user));
  const taken = new Set(channels.map((item) => `${item.platform}:${item.handle.toLowerCase()}`));
  return [
    ...channels.map((c): ManagedAccount => ({
      key: `ch:${c.id}`, kind: "connected", platform: c.platform, handle: c.handle, name: c.name || c.handle,
      avatar: c.avatar || "", followers: c.followers || 0, likes: c.likes || 0, posts: c.videoCount || 0,
      connected: Boolean(c.accessToken) && c.connected !== false, hidden: Boolean(c.hidden),
      scheduledPosts: scheduled.get(c.id) || 0, addedAt: null,
    })),
    ...(data.accounts || [])
      .filter((item) => inScope(item, user))
      .map((a): ManagedAccount => ({
        key: `ac:${a.id}`, kind: "tracked", platform: "tiktok", handle: a.handle, name: a.nickname || a.handle,
        avatar: a.avatar || "", followers: a.followers || 0, likes: a.likes || 0, posts: a.posts || 0,
        connected: false,
        // Un compte suivi double par sa version connectee est deja invisible dans le studio.
        hidden: Boolean(a.hidden) || taken.has(`tiktok:${a.handle.toLowerCase()}`),
        scheduledPosts: scheduled.get(a.id) || 0, addedAt: a.createdAt || null,
      })),
  ];
}

export type ManageResult = {
  changed: number;
  /** Comptes connectes supprimes : la route revoque leur jeton apres l'ecriture. */
  removedChannels: Channel[];
  missing: number;
};

/** Applique l'action aux seules lignes du projet de l'utilisateur. Mutation en place, a appeler sous verrou. */
export function applyManageAction(
  data: StoreData,
  user: Pick<SessionUser, "id" | "projectId">,
  action: ManageAction,
  keys: readonly string[],
): ManageResult {
  const wanted = { connected: new Set<string>(), tracked: new Set<string>() };
  for (const key of new Set(keys)) {
    const parsed = parseManagedKey(key);
    if (parsed) wanted[parsed.kind].add(parsed.id);
  }
  const total = wanted.connected.size + wanted.tracked.size;
  const mine = <T extends Account | Channel>(row: T, ids: Set<string>) => ids.has(row.id) && inScope(row, user);
  const result: ManageResult = { changed: 0, removedChannels: [], missing: 0 };
  let found = 0;

  if (action === "remove") {
    result.removedChannels = data.channels.filter((row) => mine(row, wanted.connected));
    const removedAccounts = data.accounts.filter((row) => mine(row, wanted.tracked)).length;
    found = result.removedChannels.length + removedAccounts;
    if (found) {
      const gone = new Set(result.removedChannels.map((row) => row.id));
      data.channels = data.channels.filter((row) => !mine(row, wanted.connected));
      data.accounts = data.accounts.filter((row) => !mine(row, wanted.tracked));
      // Les instantanes quotidiens d'un compte supprime ne servent plus a rien.
      if (gone.size) {
        data.videoStats = data.videoStats?.filter((row) => !gone.has(row.channelId));
        data.channelStats = data.channelStats?.filter((row) => !gone.has(row.channelId));
      }
    }
    result.changed = found;
  } else {
    const hidden = action === "hide";
    for (const row of data.channels) if (mine(row, wanted.connected)) { found += 1; if (Boolean(row.hidden) !== hidden) { row.hidden = hidden || undefined; result.changed += 1; } }
    for (const row of data.accounts) if (mine(row, wanted.tracked)) { found += 1; if (Boolean(row.hidden) !== hidden) { row.hidden = hidden || undefined; result.changed += 1; } }
  }
  result.missing = Math.max(0, total - found);
  return result;
}
