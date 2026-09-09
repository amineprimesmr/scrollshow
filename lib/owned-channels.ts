import { inScope } from "./projects";
import { publicChannel } from "./tiktok";
import type { SessionUser, StoreData } from "./types";

/**
 * Les comptes du projet, tels que le studio les montre partout (Overview,
 * calendrier, composeur) : les comptes connectes (jeton TikTok) puis les comptes
 * suivis ajoutes par handle, exposes comme comptes non connectes. Un meme
 * handle n'apparait qu'une fois, la version connectee gagne.
 */
export function ownedChannels(data: StoreData, user: Pick<SessionUser, "id" | "projectId">) {
  const live = data.channels.filter((item) => inScope(item, user)).map(publicChannel);
  const seen = new Set(live.map((item) => `${item.platform}:${item.handle.toLowerCase()}`));
  const tracked = (data.accounts || [])
    .filter((item) => inScope(item, user))
    .filter((item) => !seen.has(`tiktok:${item.handle.toLowerCase()}`))
    .map((item) =>
      publicChannel({
        id: item.id,
        platform: "tiktok",
        name: item.nickname || `@${item.handle}`,
        handle: item.handle,
        avatar: item.avatar || "",
        connected: false,
        tracked: true,
        followers: item.followers,
        likes: item.likes,
        videoCount: item.posts,
      }),
    );
  return [...live, ...tracked];
}

/** Un post peut viser un compte connecte ou un compte suivi du meme projet. */
export function ownsChannel(data: StoreData, userId: string, id: string) {
  return data.channels.some((c) => c.id === id && c.userId === userId) || (data.accounts || []).some((a) => a.id === id && a.userId === userId);
}
