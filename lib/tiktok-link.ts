import { exchangeCode, fetchUserInfo, profileFieldsForScopes } from "./tiktok";
import { resolveStoreUserId } from "./local-user";
import { updateStore } from "./store";
import type { Channel, SessionUser, StoreData } from "./types";

export type TikTokTokens = Awaited<ReturnType<typeof exchangeCode>>;

/**
 * Échange le code d'autorisation et attache le compte TikTok à l'utilisateur.
 * Partagé par le retour OAuth classique et par l'appairage QR, pour que les
 * deux chemins produisent exactement le même canal.
 */
export async function linkTikTokAccount(user: SessionUser, code: string) {
  const tokens = await exchangeCode(code);
  return saveTikTokAccount(user, tokens);
}

/** Optional receipt is committed in the same transaction as the channel. */
export async function saveTikTokAccount(user: SessionUser, tokens: TikTokTokens, receipt?: (data: StoreData, channel: Channel) => void) {
  let profile: Record<string, any> = {};
  try {
    // Profile decoration must not hold up a completed authorization for 15s.
    // The granted open_id and tokens are enough to persist the connection.
    profile = await fetchUserInfo(tokens.access_token, profileFieldsForScopes(tokens.scope), 3000);
  } catch {
    profile = {};
  }

  return updateStore((data) => {
    const userId = resolveStoreUserId(data, user);
    const openId = tokens.open_id || profile.open_id || "";
    if (!openId) throw new Error("missing_open_id");
    const existing = data.channels.find(
      (item) => item.userId === userId && item.platform === "tiktok" && item.openId === openId,
    );
    const next = {
      id: existing?.id || crypto.randomUUID(),
      userId,
      platform: "tiktok",
      name: profile.display_name || profile.username || existing?.name || "TikTok",
      handle: profile.username || existing?.handle || "",
      avatar: profile.avatar_url || profile.avatar_url_100 || existing?.avatar || "/logo.png",
      connected: true,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      openId,
      expiresAt: tokens.expires_at,
      scopes: tokens.scope,
      videoSync: undefined,
      followers: Number(profile.follower_count ?? existing?.followers ?? 0),
      likes: Number(profile.likes_count ?? existing?.likes ?? 0),
      videoCount: Number(profile.video_count ?? existing?.videoCount ?? 0),
    };
    if (existing) Object.assign(existing, next);
    else data.channels.unshift(next);
    receipt?.(data, next);
    return { handle: next.handle, name: next.name };
  });
}
