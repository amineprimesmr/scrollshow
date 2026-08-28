import { readStore } from "./store";
import type { Channel, StudioPost } from "./types";

export const LOCAL_DEMO_TOKEN = "local-demo";

export function isLocalDemoToken(token?: string) {
  return token === LOCAL_DEMO_TOKEN;
}

export function localDemoEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SCROLLSHOW_LOCAL_DEMO === "1";
}

export async function localDemoProfile(userId: string, channel: Channel) {
  const data = await readStore();
  const posts = data.posts.filter((item) => item.userId === userId);
  const published = posts.filter((item) => item.status === "published" || item.views > 0);
  const views = published.reduce((sum, post) => sum + post.views, 0);
  const likes = published.reduce((sum, post) => sum + post.likes, 0);
  return {
    open_id: channel.openId || "local-demo",
    username: channel.handle || "scrollshow-demo",
    display_name: channel.name || "ScrollShow Demo",
    avatar_url: channel.avatar || "/assets/avatars/leo.png",
    follower_count: channel.followers || 12400,
    following_count: 180,
    likes_count: channel.likes || likes || 89000,
    video_count: channel.videoCount || published.length || posts.length,
    bio_description: "Compte de démo local — stats calculées depuis tes posts seed.",
    is_verified: false,
    _demo: true,
    _totals: { views, likes },
  };
}

export async function localDemoVideos(userId: string) {
  const data = await readStore();
  return data.posts
    .filter((item) => item.userId === userId && (item.status === "published" || item.views > 0))
    .sort((a, b) => b.views - a.views)
    .slice(0, 12)
    .map((post, index) => demoVideoFromPost(post, index));
}

function demoVideoFromPost(post: StudioPost, index: number) {
  return {
    id: post.tiktokId || post.id,
    title: post.body.slice(0, 90),
    video_description: post.body,
    cover_image_url: post.image,
    view_count: post.views,
    like_count: post.likes,
    comment_count: post.comments,
    share_count: post.shares,
    create_time: Math.floor(Date.parse(`${post.date}T${post.time}:00`) / 1000) || Date.now() / 1000 - index * 86400,
    duration: 0,
    share_url: post.tiktokUrl || "",
    _demo: true,
  };
}
