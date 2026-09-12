import { resolveStoreUserId } from "./local-user";
import { readStoreSlice, updateStoreSlice } from "./store";
import { refreshAccessToken } from "./tiktok";
import type { Channel, SessionUser } from "./types";
import { inScope } from "./projects";

async function refreshChannelIfNeeded(channel: Channel): Promise<Channel> {
  const expiring = !channel.expiresAt || channel.expiresAt < Date.now() + 60_000;
  if (!expiring || !channel.refreshToken) return channel;

  try {
    const tokens = await refreshAccessToken(channel.refreshToken);
    return updateStoreSlice(["channels"], (store) => {
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

function connectedChannels(data: { channels: Channel[] }, userId: string, projectId?: string) {
  // Sans projet (chemins anciens) on reste au niveau du compte ; avec un projet,
  // « le premier compte » est celui du projet, jamais celui d'un autre business.
  return data.channels.filter((item) => inScope(item, { id: userId, projectId }) && item.platform === "tiktok" && item.connected !== false && item.accessToken);
}

export async function loadTikTokChannel(userId: string, channelId?: string, projectId?: string): Promise<Channel | null> {
  const data = await readStoreSlice(["channels"]);
  const channels = connectedChannels(data, userId, projectId);
  if (!channelId && channels.length > 1) throw new Error("channel_required");
  const channel = channelId ? channels.find(item => item.id === channelId) : channels[0];
  if (!channel?.accessToken) return null;
  return refreshChannelIfNeeded(channel);
}

/**
 * A user can have more than one TikTok account connected. Analytics must
 * aggregate across ALL of them — picking just the first (as loadTikTokChannel
 * does, for single-target actions like publishing) silently hides every
 * other connected account's videos and views.
 */
export async function loadTikTokChannels(userId: string, projectId?: string): Promise<Channel[]> {
  const data = await readStoreSlice(["channels"]);
  const channels = connectedChannels(data, userId, projectId);
  return Promise.all(channels.map((channel) => refreshChannelIfNeeded(channel)));
}

export async function tiktokUserId(session: Pick<SessionUser, "id" | "email">) {
  return resolveStoreUserId(await readStoreSlice(["channels"]), session);
}

export async function loadTikTokChannelForSession(session: Pick<SessionUser, "id" | "email" | "projectId">, channelId?: string) {
  return loadTikTokChannel(await tiktokUserId(session), channelId, session.projectId);
}
