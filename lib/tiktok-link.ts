import { exchangeCode, fetchUserInfo } from "./tiktok";
import { resolveStoreUserId } from "./local-user";
import { updateStore } from "./store";
import type { SessionUser } from "./types";

/**
 * Échange le code d'autorisation et attache le compte TikTok à l'utilisateur.
 * Partagé par le retour OAuth classique et par l'appairage QR, pour que les
 * deux chemins produisent exactement le même canal.
 */
export async function linkTikTokAccount(user: SessionUser, code: string) {
  const tokens = await exchangeCode(code);
  let profile: Record<string, any> = {};
  try {
    profile = await fetchUserInfo(tokens.access_token);
  } catch {
    profile = {};
  }

  return updateStore((data) => {
    const userId = resolveStoreUserId(data, user);
    const openId = tokens.open_id || profile.open_id || "";
    const existing = data.channels.find(
      (item) => item.userId === userId && item.platform === "tiktok" && item.openId === openId,
    );
    const next = {
      id: existing?.id || crypto.randomUUID(),
      userId,
      platform: "tiktok",
      name: profile.display_name || profile.username || "TikTok",
      handle: profile.username || "tiktok",
      avatar: profile.avatar_url || profile.avatar_url_100 || "/logo.png",
      connected: true,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      openId,
      expiresAt: tokens.expires_at,
      followers: Number(profile.follower_count || 0),
      likes: Number(profile.likes_count || 0),
      videoCount: Number(profile.video_count || 0),
    };
    if (existing) Object.assign(existing, next);
    else data.channels.unshift(next);
    return { handle: next.handle, name: next.name };
  });
}
