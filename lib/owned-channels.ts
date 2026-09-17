import { inScope } from "./projects";
import { publicChannel } from "./tiktok";
import type { SessionUser, StoreData } from "./types";

/**
 * Les comptes du projet, tels que le studio les montre partout (Overview,
 * calendrier, composeur) : les comptes connectes (jeton TikTok) puis les comptes
 * suivis ajoutes par handle, exposes comme comptes non connectes. Un meme
 * handle n'apparait qu'une fois, la version connectee gagne.
 *
 * Un compte masque (`hidden`) n'apparait nulle part dans le studio : ni Overview,
 * ni calendrier, ni composeur, ni agent. Seul le gestionnaire de comptes le liste
 * (`lib/account-manage.ts`), pour pouvoir le reafficher.
 */
export function ownedChannels(data: StoreData, user: Pick<SessionUser, "id" | "projectId">) {
  const mine = data.channels.filter((item) => inScope(item, user));
  const live = mine.filter((item) => !item.hidden).map(publicChannel);
  // Meme masque, un compte connecte continue d'eclipser son doublon suivi :
  // sinon masquer l'un ferait reapparaitre l'autre.
  const seen = new Set(mine.map((item) => `${item.platform}:${item.handle.toLowerCase()}`));
  const tracked = (data.accounts || [])
    .filter((item) => inScope(item, user) && !item.hidden)
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
