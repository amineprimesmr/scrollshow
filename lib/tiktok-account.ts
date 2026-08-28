import { resolveStoreUserId } from "./local-user";
import { readStore, updateStore } from "./store";
import { refreshAccessToken } from "./tiktok";
import type { Channel, SessionUser } from "./types";

export async function loadTikTokChannel(userId: string): Promise<Channel | null> {
  const data = await readStore();
  const channel = data.channels.find((item) => item.userId === userId && item.platform === "tiktok" && item.accessToken);
  if (!channel?.accessToken) return null;

  const expiring = !channel.expiresAt || channel.expiresAt < Date.now() + 60_000;
  if (!expiring || !channel.refreshToken) return channel;

  try {
    const tokens = await refreshAccessToken(channel.refreshToken);
    return updateStore((store) => {
      const current = store.channels.find((item) => item.id === channel.id);
      if (!current) return channel;
      current.accessToken = tokens.access_token;
      current.refreshToken = tokens.refresh_token || current.refreshToken;
      current.openId = tokens.open_id || current.openId;
      current.expiresAt = tokens.expires_at;
      current.connected = true;
      return current;
    });
  } catch {
    return channel;
  }
}

export async function tiktokUserId(session: Pick<SessionUser, "id" | "email">) {
  return resolveStoreUserId(await readStore(), session);
}

export async function loadTikTokChannelForSession(session: Pick<SessionUser, "id" | "email">) {
  return loadTikTokChannel(await tiktokUserId(session));
}
