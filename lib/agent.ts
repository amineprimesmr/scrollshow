import { loadTikTokChannel, loadTikTokChannels } from "./tiktok-account";
import {
  absoluteAssetUrl,
  creatorInfo,
  fetchUserInfo,
  initPhotoPost,
  listRecentVideos,
  publicChannel,
} from "./tiktok";
import {
  applyRecipePatch,
  cloneRecipe,
  coverOf,
  ensureRecipe,
  needsRasterize,
  newShareId,
  photosOf,
  publicRecipe,
  publicShareUrl,
  recipeFromPhotos,
  recipeJsonUrl,
} from "./recipe";
import { importTikTokFromUrl } from "./tiktok-import";
import { reconstructRecipe, ReconstructError } from "./reconstruct";
import { rasterizeRecipe } from "./render-slide";
import { seedStudio } from "./studio-seed";
import { resolveSettings, tiktokPostFlags } from "./settings";
import { readStore, updateStore } from "./store";
import type { CarouselRecipe, SessionUser, StudioPost } from "./types";
import type { RecipeInput } from "./recipe";

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
    origin?: StudioPost["origin"];
    recipe?: RecipeInput;
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
  const origin = input.origin || "ai";
  const photos = input.photo_images?.length
    ? input.photo_images
    : input.recipe?.slides?.map((slide) => slide.image || "").filter(Boolean).length
      ? (input.recipe?.slides || []).map((slide) => slide.image || "").filter(Boolean)
      : [input.image || (await agentMedia(user))[0]?.url || ""];
  const recipe = input.recipe
    ? recipeFromPhotos(photos, origin, input.recipe)
    : recipeFromPhotos(photos, origin);
  const image = coverOf({ image: photos[0] || "", recipe });
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
      origin,
      shareId: newShareId(),
      recipe,
      visibility: "private",
      inCalendar: true,
      createdAt: now.toISOString(),
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
    photo_images: string[];
    origin: StudioPost["origin"];
    recipe: (RecipeInput | Partial<CarouselRecipe>) & { replaceSlides?: boolean };
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
    if (input.origin) found.origin = input.origin;
    const recipe = ensureRecipe(found);
    if (input.recipe) {
      found.recipe = applyRecipePatch(recipe, input.recipe);
    } else if (input.photo_images?.length) {
      found.recipe = applyRecipePatch(recipe, {
        replaceSlides: true,
        slides: input.photo_images.map((image, index) => ({
          ...recipe.slides[index],
          image,
        })),
      });
    } else if (input.image) {
      found.recipe = applyRecipePatch(recipe, {
        slides: [{ ...recipe.slides[0], image: input.image }],
      });
    } else {
      found.recipe = recipe;
    }
    found.image = coverOf(found);
    if (!found.shareId) found.shareId = newShareId();
    return found;
  });
  if (!post) throw new AgentError("post_missing", 404);
  return publicPost(post);
}

export async function agentGetRecipe(user: SessionUser, idOrShare: string) {
  const data = await readStore();
  const post = data.posts.find((item) => item.id === idOrShare || item.shareId === idOrShare);
  if (!post) throw new AgentError("post_missing", 404);
  if (post.userId !== user.id && post.visibility !== "public") throw new AgentError("post_missing", 404);
  return publicRecipe(post);
}

export async function agentUpdateRecipe(
  user: SessionUser,
  idOrShare: string,
  input: (Partial<CarouselRecipe> | RecipeInput) & { caption?: string; replaceSlides?: boolean },
) {
  const post = await updateStore((data) => {
    const found = data.posts.find(
      (item) =>
        item.userId === user.id && (item.id === idOrShare || item.shareId === idOrShare),
    );
    if (!found) return null;
    found.recipe = applyRecipePatch(ensureRecipe(found), input);
    found.image = coverOf(found);
    if (input.caption) found.body = input.caption.slice(0, 2200);
    if (input.origin) found.origin = input.origin;
    if (!found.shareId) found.shareId = newShareId();
    return found;
  });
  if (!post) throw new AgentError("post_missing", 404);
  return publicRecipe(post);
}

export async function agentReconstructPost(user: SessionUser, idOrShare: string) {
  const data = await readStore();
  const found = data.posts.find(
    (item) => item.userId === user.id && (item.id === idOrShare || item.shareId === idOrShare),
  );
  if (!found) throw new AgentError("post_missing", 404);
  try {
    const recipe = await reconstructRecipe(ensureRecipe(found));
    const post = await updateStore((store) => {
      const item = store.posts.find((entry) => entry.id === found.id && entry.userId === user.id);
      if (!item) return null;
      item.recipe = recipe;
      item.image = coverOf(item);
      return item;
    });
    if (!post) throw new AgentError("post_missing", 404);
    return publicPost(post);
  } catch (error) {
    if (error instanceof ReconstructError) throw new AgentError(error.message, error.status);
    throw error;
  }
}

export async function agentRasterizePost(user: SessionUser, idOrShare: string, recipePatch?: CarouselRecipe) {
  const data = await readStore();
  const found = data.posts.find(
    (item) => item.userId === user.id && (item.id === idOrShare || item.shareId === idOrShare),
  );
  if (!found && !recipePatch) throw new AgentError("post_missing", 404);
  const recipe = recipePatch || ensureRecipe(found!);
  const photo_images = await rasterizeRecipe(recipe);
  if (!photo_images.length) throw new AgentError("photos_required");
  return { photo_images, recipe };
}

export async function agentEnsureShare(user: SessionUser, id: string) {
  const post = await updateStore((data) => {
    const found = data.posts.find((item) => item.id === id && item.userId === user.id);
    if (!found) return null;
    found.recipe = ensureRecipe(found);
    found.image = coverOf(found);
    if (!found.shareId) found.shareId = newShareId();
    found.origin = found.origin || found.recipe.origin;
    return found;
  });
  if (!post) throw new AgentError("post_missing", 404);
  return {
    id: post.id,
    shareId: post.shareId,
    shareUrl: publicShareUrl(post.shareId!),
    jsonUrl: recipeJsonUrl(post.shareId!),
    recipe: publicRecipe(post),
  };
}

export async function agentForkPost(user: SessionUser, id: string) {
  const created = await updateStore((data) => {
    const found = data.posts.find(
      (item) => item.id === id && (item.userId === user.id || item.visibility === "public"),
    );
    if (!found) return null;
    if (found.userId !== user.id) found.clones = (found.clones || 0) + 1;
    const now = new Date();
    const recipe = cloneRecipe(ensureRecipe(found));
    recipe.origin = "fork";
    const copy: StudioPost = {
      ...found,
      id: crypto.randomUUID(),
      userId: user.id,
      channelIds: data.channels.filter((item) => item.userId === user.id).slice(0, 1).map((item) => item.id),
      body: found.body,
      date: now.toISOString().slice(0, 10),
      time: found.time || "18:00",
      status: "draft",
      image: coverOf({ image: found.image, recipe }),
      views: found.userId === user.id ? 0 : found.views,
      likes: found.userId === user.id ? 0 : found.likes,
      comments: found.userId === user.id ? 0 : found.comments,
      shares: found.userId === user.id ? 0 : found.shares,
      origin: "fork",
      shareId: newShareId(),
      recipe,
      visibility: "private",
      inCalendar: false,
      clones: 0,
      forkedFrom: found.id,
      createdAt: now.toISOString(),
    };
    data.posts.unshift(copy);
    return copy;
  });
  if (!created) throw new AgentError("post_missing", 404);
  return publicPost(created);
}

export async function agentImportTikTok(
  user: SessionUser,
  input: { url: string; visibility?: "private" | "public"; reconstruct?: boolean },
) {
  const imported = await importTikTokFromUrl(input.url);
  const current = await readStore();
  const existing = current.posts.find(
    (item) => item.userId === user.id && imported.tiktokId && item.tiktokId === imported.tiktokId,
  );
  if (existing) return publicPost(existing);
  const now = new Date();
  const recipe = recipeFromPhotos(imported.images, "import", {
    origin: "import",
    prompt: `Pixel-perfect import of ${imported.url}. Keep these exact slides and caption.`,
  });
  const post = await updateStore((data) => {
    imported.images.forEach((url, index) => {
      data.media.unshift({
        id: crypto.randomUUID(),
        userId: user.id,
        url,
        name: `${imported.authorHandle || "tiktok"}-${imported.tiktokId || "slide"}-${index + 1}`,
        createdAt: now.toISOString(),
      });
    });
    const channelId = data.channels.find((item) => item.userId === user.id)?.id;
    const created: StudioPost = {
      id: crypto.randomUUID(),
      userId: user.id,
      channelIds: channelId ? [channelId] : [],
      body: imported.caption || `TikTok @${imported.authorHandle}`.trim(),
      date: now.toISOString().slice(0, 10),
      time: "18:00",
      status: "draft",
      image: imported.images[0],
      views: imported.views,
      likes: imported.likes,
      comments: imported.comments,
      shares: imported.shares,
      origin: "import",
      shareId: newShareId(),
      recipe,
      visibility: input.visibility || "private",
      inCalendar: false,
      kind: imported.kind,
      tiktokUrl: imported.url,
      tiktokId: imported.tiktokId,
      authorHandle: imported.authorHandle,
      authorName: imported.authorName,
      authorAvatar: imported.authorAvatar,
      musicTitle: imported.musicTitle,
      musicAuthor: imported.musicAuthor,
      clones: 0,
      createdAt: now.toISOString(),
    };
    data.posts.unshift(created);
    return created;
  });
  if (input.reconstruct) return agentReconstructPost(user, post.id);
  return publicPost(post);
}

export function marketplaceCard(post: StudioPost, userId: string) {
  const recipe = ensureRecipe(post);
  return {
    ...publicPost(post),
    mine: post.userId === userId,
    slideCount: recipe.slides.length,
  };
}

export async function agentListMarketplace(user: SessionUser, tab: "private" | "public" = "private") {
  const data = await readStore();
  if (tab === "public") {
    return data.posts
      .filter((item) => item.visibility === "public")
      .sort((a, b) => b.views - a.views || b.likes - a.likes || (b.clones || 0) - (a.clones || 0))
      .map((item) => marketplaceCard(item, user.id));
  }
  return data.posts
    .filter((item) => item.userId === user.id)
    .map((item) => marketplaceCard(item, user.id));
}

export async function agentSetVisibility(user: SessionUser, id: string, visibility: "private" | "public") {
  const post = await updateStore((data) => {
    const found = data.posts.find((item) => item.id === id && item.userId === user.id);
    if (!found) return null;
    found.visibility = visibility;
    found.recipe = ensureRecipe(found);
    if (!found.shareId) found.shareId = newShareId();
    return found;
  });
  if (!post) throw new AgentError("post_missing", 404);
  return publicPost(post);
}

export async function agentSetCalendar(user: SessionUser, id: string, inCalendar: boolean) {
  const post = await updateStore((data) => {
    const found = data.posts.find((item) => item.id === id && item.userId === user.id);
    if (!found) return null;
    found.inCalendar = inCalendar;
    if (inCalendar && found.status === "draft") found.status = "scheduled";
    return found;
  });
  if (!post) throw new AgentError("post_missing", 404);
  return publicPost(post);
}

export async function findPostByShareId(shareId: string) {
  const data = await readStore();
  return data.posts.find((item) => item.shareId === shareId) || null;
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
    id?: string;
    photo_images?: string[];
    image?: string;
    privacy_level?: string;
    disable_comment?: boolean;
  },
) {
  const channel = await loadTikTokChannel(user.id);
  if (!channel?.accessToken) throw new AgentError("tiktok_not_connected", 401);
  const store = await readStore();
  const settings = resolveSettings(store.users.find((item) => item.id === user.id));
  const flags = tiktokPostFlags(settings);
  const media = await agentMedia(user);
  let photos = (input.photo_images?.length ? input.photo_images : [input.image || media[0]?.url]).filter(
    Boolean,
  ) as string[];
  if (input.id) {
    const found = store.posts.find((item) => item.userId === user.id && (item.id === input.id || item.shareId === input.id));
    if (found) {
      const recipe = ensureRecipe(found);
      photos = needsRasterize(recipe) ? await rasterizeRecipe(recipe) : photosOf(recipe);
    }
  }
  if (!photos.length) throw new AgentError("photos_required");
  const info = await creatorInfo(channel.accessToken);
  const allowed: string[] = info.privacy_level_options || [];
  const privacy =
    input.privacy_level && allowed.includes(input.privacy_level)
      ? input.privacy_level
      : allowed[0] || input.privacy_level || settings.defaultPrivacy;
  const caption = input.caption.trim().slice(0, 2200);
  const result = await initPhotoPost(channel.accessToken, {
    post_info: {
      title: (input.title || caption).slice(0, 90),
      description: caption,
      privacy_level: privacy,
      disable_comment: input.disable_comment ?? flags.disable_comment,
      disable_duet: flags.disable_duet,
      disable_stitch: flags.disable_stitch,
      auto_add_music: flags.auto_add_music,
      brand_content_toggle: flags.brand_content_toggle,
      brand_organic_toggle: flags.brand_organic_toggle,
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
  // content/init only queues the carousel; the cron reconciles publish_id into a
  // real published/failed verdict.
  const publishId = String(result.publish_id || "");
  if (publishId) {
    await updateStore((store) => {
      const current = store.posts.find((item) => item.id === post.id);
      if (!current) return;
      current.publishId = publishId;
      current.publishState = "PROCESSING";
      current.publishedAt = new Date().toISOString();
    });
  }
  return { ok: true, publish_id: result.publish_id, privacy, post, data: result };
}

export async function agentAnalytics(user: SessionUser) {
  const channels = await loadTikTokChannels(user.id);
  const posts = (await agentListPosts(user)).filter((post) => post.inCalendar !== false);
  const calendar = {
    views: posts.reduce((sum, post) => sum + post.views, 0),
    likes: posts.reduce((sum, post) => sum + post.likes, 0),
    comments: posts.reduce((sum, post) => sum + post.comments, 0),
    shares: posts.reduce((sum, post) => sum + post.shares, 0),
    drafts: posts.filter((post) => post.status === "draft").length,
    scheduled: posts.filter((post) => post.status === "scheduled").length,
    published: posts.filter((post) => post.status === "published").length,
  };
  if (!channels.length) {
    return { connected: false, calendar, profile: null, videos: [], totals: calendar, errors: [] };
  }

  let profile: Record<string, unknown> | null = null;
  let videos: any[] = [];
  const errors: string[] = [];

  for (const channel of channels) {
    if (!channel.accessToken) continue;
    try {
      const channelProfile = await fetchUserInfo(channel.accessToken);
      profile = profile || channelProfile;
    } catch (err) {
      errors.push(`@${channel.handle}: ${err instanceof Error ? err.message : "profile fetch failed"}`);
    }
    try {
      const channelVideos = await listRecentVideos(channel.accessToken);
      videos.push(...channelVideos.map((video) => ({ ...video, channelHandle: channel.handle })));
    } catch (err) {
      errors.push(`@${channel.handle}: ${err instanceof Error ? err.message : "video list failed"}`);
    }
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
    handle: channels[0].handle,
    calendar,
    profile,
    videos: videos.sort((a, b) => Number(b.view_count || 0) - Number(a.view_count || 0)).slice(0, 20),
    totals,
    errors,
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
  const recipe = ensureRecipe(post);
  return {
    id: post.id,
    userId: post.userId,
    caption: post.body,
    body: post.body,
    date: post.date,
    time: post.time,
    status: post.status,
    image: coverOf(post),
    photo_images: photosOf(recipe),
    channelIds: post.channelIds,
    origin: post.origin || recipe.origin,
    shareId: post.shareId || undefined,
    shareUrl: post.shareId ? publicShareUrl(post.shareId) : null,
    views: post.views,
    likes: post.likes,
    comments: post.comments,
    shares: post.shares,
    recipe,
    visibility: post.visibility || "private",
    inCalendar: post.inCalendar !== false,
    kind: post.kind || (recipe.slides.length > 1 ? "photo" : "photo"),
    tiktokUrl: post.tiktokUrl || null,
    tiktokId: post.tiktokId || null,
    authorHandle: post.authorHandle || null,
    authorName: post.authorName || null,
    authorAvatar: post.authorAvatar || null,
    musicTitle: post.musicTitle || null,
    musicAuthor: post.musicAuthor || null,
    clones: post.clones || 0,
    forkedFrom: post.forkedFrom || null,
    createdAt: post.createdAt || null,
  };
}
