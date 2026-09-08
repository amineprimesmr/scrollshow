import { readStore, updateStore } from "./store";
import { hasStudioAccess } from "./plans";
import { ensureRecipe, needsRasterize, photosOf } from "./recipe";
import { rasterizeRecipe } from "./render-slide";
import { directPostPhotos } from "./tiktok-publish";
import { coerceOptions } from "./tiktok-compliance";

export async function dispatchPost(userId: string, id: string) {
  if (process.env.VERCEL_ENV === "preview" && process.env.ALLOW_PREVIEW_PUBLISH !== "1") throw new Error("preview_publication_disabled");
  const claim = crypto.randomUUID();
  const post = await updateStore(data => {
    if (data.restoreReviewRequired) throw new Error("restoration_review_required");
    const user = data.users.find(u => u.id === userId);
    if (!user || user.deletionPendingAt || !user.emailVerifiedAt || !hasStudioAccess(user.plan)) throw new Error("verified_paid_account_required");
    const p = data.posts.find(p => p.id === id && p.userId === userId);
    if (!p) throw new Error("post_missing");
    if (p.publishId || p.status === "published" || ["INITIATING", "REVIEW_REQUIRED"].includes(p.publishState || "")) throw new Error("publication_already_started");
    if (p.publishLeaseUntil && p.publishLeaseUntil > Date.now()) throw new Error("publication_busy");
    if (p.channelIds.length !== 1 || !data.channels.some(c => c.id === p.channelIds[0] && c.userId === userId && c.platform === "tiktok" && c.accessToken && c.connected !== false)) throw new Error("select_one_connected_tiktok_account");
    if (!p.tiktok?.privacy) throw new Error("tiktok_options_required");
    p.publishClaim = claim;
    p.publishLeaseUntil = Date.now() + 300000;
    p.publishState = "PREPARING";
    p.publishAttempts = (p.publishAttempts || 0) + 1;
    return structuredClone(p);
  });
  let initiated = false;
  try {
    const recipe = ensureRecipe(post);
    const photos = needsRasterize(recipe) ? await rasterizeRecipe(recipe) : photosOf(recipe);
    if (!photos.length) throw new Error("photos_required");
    await updateStore(data => {
      const p = data.posts.find(p => p.id === id && p.publishClaim === claim);
      if (!p) throw new Error("publication_claim_lost");
      p.publishState = "INITIATING";
      p.publishChannelId = post.channelIds[0];
    });
    initiated = true;
    const { publishId } = await directPostPhotos(userId, { photos, description: post.body, options: coerceOptions(post.tiktok), channelId: post.channelIds[0] });
    await updateStore(data => {
      const p = data.posts.find(p => p.id === id && p.publishClaim === claim);
      if (!p) throw new Error("publication_claim_lost");
      p.publishId = publishId;
      p.publishState = "PROCESSING";
      p.status = "scheduled";
      p.publishError = undefined;
      p.publishLeaseUntil = undefined;
    });
    return { publishId, post: (await readStore()).posts.find(p => p.id === id)! };
  } catch (error) {
    await updateStore(data => {
      const p = data.posts.find(p => p.id === id && p.publishClaim === claim);
      if (!p) return;
      p.publishState = initiated ? "REVIEW_REQUIRED" : "FAILED";
      p.publishError = error instanceof Error ? error.message.slice(0, 200) : "publish_failed";
      p.status = "draft";
      p.publishLeaseUntil = undefined;
    });
    throw error;
  }
}
