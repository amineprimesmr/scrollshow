import { resolveStoreUserId } from "./local-user";
import { readStore, updateStore } from "./store";
import { refreshAccessToken } from "./tiktok";
import type { Channel, SessionUser } from "./types";

async function refreshChannelIfNeeded(channel: Channel): Promise<Channel> {
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

export async function loadTikTokChannel(userId: string): Promise<Channel | null> {
  const data = await readStore();
  const channel = data.channels.find((item) => item.userId === userId && item.platform === "tiktok" && item.accessToken);
  if (!channel?.accessToken) return null;
  return refreshChannelIfNeeded(channel);
}

/**
 * A user can have more than one TikTok account connected. Analytics must
 * aggregate across ALL of them — picking just the first (as loadTikTokChannel
 * does, for single-target actions like publishing) silently hides every
 * other connected account's videos and views.
 */
export async function loadTikTokChannels(userId: string): Promise<Channel[]> {
  const data = await readStore();
  const channels = data.channels.filter((item) => item.userId === userId && item.platform === "tiktok" && item.accessToken);
  return Promise.all(channels.map((channel) => refreshChannelIfNeeded(channel)));
}

export async function tiktokUserId(session: Pick<SessionUser, "id" | "email">) {
  return resolveStoreUserId(await readStore(), session);
}

export async function loadTikTokChannelForSession(session: Pick<SessionUser, "id" | "email">) {
  return loadTikTokChannel(await tiktokUserId(session));
}
