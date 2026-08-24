import { loadTikTokChannel } from "./tiktok-account";
import {
  absoluteAssetUrl,
  creatorInfo,
  fetchUserInfo,
  initPhotoPost,
  listVideos,
  publicChannel,
} from "./tiktok";
import { seedStudio } from "./studio-seed";
import { readStore, updateStore } from "./store";
import type { SessionUser, StudioPost } from "./types";

export class AgentError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function agentWhoami(user: SessionUser) {
  const channel = await loadTikTokChannel(user.id);
  return {
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
    tiktok: channel
      ? {
          connected: true,
          channelId: channel.id,
          handle: channel.handle,
          name: channel.name,
          followers: channel.followers || 0,
        }
      : { connected: false },
  };
}

export async function agentChannels(user: SessionUser) {
  const data = await readStore();
  return data.channels.filter((item) => item.userId === user.id).map(publicChannel);
}

export async function agentMedia(user: SessionUser) {
  return updateStore((data) => {
    let media = data.media.filter((item) => item.userId === user.id);
    if (!media.length) {
      const seeded = seedStudio(user.id);
      data.media.push(...seeded.media);
      media = seeded.media;
    }
    return media.map((item) => ({ id: item.id, url: item.url, name: item.name, createdAt: item.createdAt }));
  });
}

export async function agentListPosts(user: SessionUser, status?: StudioPost["status"]) {
  const data = await readStore();
  return data.posts
    .filter((item) => item.userId === user.id && (!status || item.status === status))
    .map(publicPost);
}

export async function agentCreatePost(
  user: SessionUser,
  input: {
    caption: string;
    channelId?: string;
    date?: string;
    time?: string;
    status?: StudioPost["status"];
    image?: string;
    photo_images?: string[];
  },
) {
  const caption = input.caption.trim();
  if (!caption) throw new AgentError("caption_required");
  const channels = await agentChannels(user);
  let channelId = input.channelId || channels.find((item) => item.connected)?.id || channels[0]?.id;
  if (!channelId) {
    const created = await updateStore((data) => {
      const channel = {
        id: crypto.randomUUID(),
        userId: user.id,
        platform: "tiktok",
        name: user.name || "TikTok",
        handle: user.email.split("@")[0] || "creator",
        avatar: "/assets/avatars/leo.png",
      };
      data.channels.unshift(channel);
      return channel;
    });
    channelId = created.id;
  }
  const image = input.image || input.photo_images?.[0] || (await agentMedia(user))[0]?.url || "";
  const now = new Date();
  const post = await updateStore((data) => {
    const created: StudioPost = {
      id: crypto.randomUUID(),
      userId: user.id,
      channelIds: [channelId],
      body: caption.slice(0, 2200),
      date: input.date || now.toISOString().slice(0, 10),
      time: input.time || "18:00",
      status: input.status || "scheduled",
      image,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
    };
    data.posts.unshift(created);
    return created;
  });
  return publicPost(post);
}

export async function agentUpdatePost(
  user: SessionUser,
  id: string,
  input: Partial<{
    caption: string;
    date: string;
    time: string;
    status: StudioPost["status"];
    channelId: string;
    image: string;
  }>,
) {
  const post = await updateStore((data) => {
    const found = data.posts.find((item) => item.id === id && item.userId === user.id);
    if (!found) return null;
    if (input.caption) found.body = input.caption.slice(0, 2200);
    if (input.date) found.date = input.date;
    if (input.time) found.time = input.time;
    if (input.status) found.status = input.status;
    if (input.channelId) found.channelIds = [input.channelId];
    if (input.image) found.image = input.image;
    return found;
  });
  if (!post) throw new AgentError("post_missing", 404);
  return publicPost(post);
}

export async function agentDeletePost(user: SessionUser, id: string) {
  const removed = await updateStore((data) => {
    const before = data.posts.length;
    data.posts = data.posts.filter((item) => !(item.id === id && item.userId === user.id));
    return before !== data.posts.length;
  });
  if (!removed) throw new AgentError("post_missing", 404);
  return { ok: true, id };
}

export async function agentPublish(
  user: SessionUser,
  input: {
    caption: string;
    title?: string;
    photo_images?: string[];
    image?: string;
    privacy_level?: string;
    disable_comment?: boolean;
  },
) {
  const channel = await loadTikTokChannel(user.id);
  if (!channel?.accessToken) throw new AgentError("tiktok_not_connected", 401);
  const media = await agentMedia(user);
  const photos = (input.photo_images?.length ? input.photo_images : [input.image || media[0]?.url]).filter(
    Boolean,
  ) as string[];
  if (!photos.length) throw new AgentError("photos_required");
  const info = await creatorInfo(channel.accessToken);
  const allowed: string[] = info.privacy_level_options || [];
  const privacy =
    input.privacy_level && allowed.includes(input.privacy_level)
      ? input.privacy_level
      : allowed[0] || input.privacy_level || "SELF_ONLY";
  const caption = input.caption.trim().slice(0, 2200);
  const result = await initPhotoPost(channel.accessToken, {
    post_info: {
      title: (input.title || caption).slice(0, 90),
      description: caption,
      privacy_level: privacy,
      disable_comment: Boolean(input.disable_comment ?? true),
      disable_duet: true,
      disable_stitch: true,
      auto_add_music: true,
      brand_content_toggle: false,
      brand_organic_toggle: false,
    },
    source_info: {
      source: "PULL_FROM_URL",
      photo_cover_index: 0,
      photo_images: photos.map(absoluteAssetUrl),
    },
    post_mode: "DIRECT_POST",
    media_type: "PHOTO",
  });
  const post = await agentCreatePost(user, {
    caption,
    channelId: channel.id,
    status: "published",
    image: photos[0],
    photo_images: photos,
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toISOString().slice(11, 16),
  });
  return { ok: true, publish_id: result.publish_id, privacy, post, data: result };
}

export async function agentAnalytics(user: SessionUser) {
  const channel = await loadTikTokChannel(user.id);
  const posts = await agentListPosts(user);
  const calendar = {
    views: posts.reduce((sum, post) => sum + post.views, 0),
    likes: posts.reduce((sum, post) => sum + post.likes, 0),
    comments: posts.reduce((sum, post) => sum + post.comments, 0),
    shares: posts.reduce((sum, post) => sum + post.shares, 0),
    drafts: posts.filter((post) => post.status === "draft").length,
    scheduled: posts.filter((post) => post.status === "scheduled").length,
    published: posts.filter((post) => post.status === "published").length,
  };
  if (!channel?.accessToken) {
    return { connected: false, calendar, profile: null, videos: [], totals: calendar };
  }
  let profile: Record<string, unknown> | null = null;
  let videos: any[] = [];
  try {
    profile = await fetchUserInfo(channel.accessToken);
  } catch {
    profile = null;
  }
  try {
    const result = await listVideos(channel.accessToken);
    videos = result.videos || result.list || [];
  } catch {
    videos = [];
  }
  const totals = videos.length
    ? videos.reduce(
        (sum, video) => ({
          views: sum.views + Number(video.view_count || 0),
          likes: sum.likes + Number(video.like_count || 0),
          comments: sum.comments + Number(video.comment_count || 0),
          shares: sum.shares + Number(video.share_count || 0),
        }),
        { views: 0, likes: 0, comments: 0, shares: 0 },
      )
    : calendar;
  return {
    connected: true,
    handle: channel.handle,
    calendar,
    profile,
    videos: videos.slice(0, 20),
    totals,
  };
}

export async function agentLibrary(user: SessionUser, query?: string, verdict?: string) {
  const data = await readStore();
  const needle = (query || "").trim().toLowerCase();
  return data.accounts
    .filter((item) => item.userId === user.id)
    .filter((item) => !verdict || item.verdict === verdict)
    .filter((item) => {
      if (!needle) return true;
      return [item.handle, item.niche, item.notes, item.verdict].join(" ").toLowerCase().includes(needle);
    })
    .slice(0, 50);
}

export async function agentGetAccount(user: SessionUser, idOrHandle: string) {
  const data = await readStore();
  const value = idOrHandle.replace(/^@/, "").toLowerCase();
  const account = data.accounts.find(
    (item) => item.userId === user.id && (item.id === idOrHandle || item.handle.toLowerCase() === value),
  );
  if (!account) throw new AgentError("account_missing", 404);
  return account;
}

export async function agentReport(user: SessionUser) {
  const [whoami, analytics, library, posts] = await Promise.all([
    agentWhoami(user),
    agentAnalytics(user),
    agentLibrary(user),
    agentListPosts(user),
  ]);
  const keep = library.filter((item) => item.verdict === "keep");
  const recommendations: string[] = [];
  if (!whoami.tiktok.connected) {
    recommendations.push("Connect TikTok in ScrollShow before publishing from this agent.");
  }
  if (!posts.some((item) => item.status === "scheduled")) {
    recommendations.push("Nothing is scheduled. Create or schedule the next carousel.");
  }
  if (keep.length) {
    recommendations.push(
      `Study @${keep[0].handle} (${keep[0].avgViews.toLocaleString()} avg views) and reuse that slideshow format.`,
    );
  }
  if (analytics.totals.views && analytics.totals.likes / Math.max(analytics.totals.views, 1) < 0.03) {
    recommendations.push("Like rate is soft. Tighten the first-slide hook and cut the caption.");
  }
  if (!recommendations.length) {
    recommendations.push("Workspace is live. Draft the next carousel and schedule it in the next 24h.");
  }
  return {
    generatedAt: new Date().toISOString(),
    workspace: whoami,
    analytics: {
      connected: analytics.connected,
      totals: analytics.totals,
      calendar: analytics.calendar,
      topVideos: (analytics.videos || []).slice(0, 5).map((video: any) => ({
        id: video.id,
        title: video.title || video.video_description || "",
        views: Number(video.view_count || 0),
        likes: Number(video.like_count || 0),
        comments: Number(video.comment_count || 0),
        shares: Number(video.share_count || 0),
        url: video.share_url || null,
      })),
    },
    library: {
      total: library.length,
      keep: keep.length,
      watch: library.filter((item) => item.verdict === "watch").length,
      skip: library.filter((item) => item.verdict === "skip").length,
      highlights: keep.slice(0, 5).map((item) => ({
        handle: item.handle,
        niche: item.niche,
        followers: item.followers,
        avgViews: item.avgViews,
        notes: item.notes,
      })),
    },
    posts: {
      drafts: posts.filter((item) => item.status === "draft").length,
      scheduled: posts.filter((item) => item.status === "scheduled"),
      published: posts.filter((item) => item.status === "published").slice(0, 10),
    },
    recommendations,
  };
}

function publicPost(post: StudioPost) {
  return {
    id: post.id,
    caption: post.body,
    date: post.date,
    time: post.time,
    status: post.status,
    image: post.image,
    channelIds: post.channelIds,
    views: post.views,
    likes: post.likes,
    comments: post.comments,
    shares: post.shares,
  };
}
