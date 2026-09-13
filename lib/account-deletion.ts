import { readStoreSlice, updateStore, updateStoreSlice } from "./store";
import { queueDeletedMedia } from "./media-cleanup";
import { revokeAllForUser } from "./oauth";
import { stripe } from "./stripe";
import { revokeAccessToken, refreshAccessToken, TikTokApiError } from "./tiktok";

type Providers = { cancelSubscription(id: string): Promise<void>; revokeToken(token: string): Promise<void>; refreshToken?: typeof refreshAccessToken };
const providers: Providers = {
  async cancelSubscription(id) { const item = await stripe().subscriptions.retrieve(id); if (item.status !== "canceled") await stripe().subscriptions.cancel(id); },
  revokeToken: revokeAccessToken,
  refreshToken: refreshAccessToken,
};

/** The persisted marker proves the owner requested deletion. Each provider
 * completion is checkpointed, and an expired lease can be resumed after a crash. */
export async function processAccountDeletion(userId: string, requestDeletion = false, external: Providers = providers) {
  const claim = crypto.randomUUID();
  const prepared = await updateStoreSlice(["posts", "channels"], data => {
    const owner = data.users.find(u => u.id === userId);
    if (!owner) return null;
    if (!owner.deletionPendingAt && !requestDeletion) return null;
    if ((owner.deletionLeaseUntil || 0) > Date.now()) return null;
    if (data.posts.some(p => p.userId === userId && ["PREPARING", "INITIATING", "PROCESSING", "REVIEW_REQUIRED"].includes(p.publishState || ""))) throw new Error("publication_in_progress");
    const channels = data.channels.filter(c => c.userId === userId);
    if (channels.some(c => c.accessToken && c.platform !== "tiktok")) throw new Error("disconnect_other_platforms_first");
    owner.deletionPendingAt ||= new Date().toISOString();
    owner.deletionClaim = claim; owner.deletionLeaseUntil = Date.now() + 300000;
    return { owner: structuredClone(owner), channels: structuredClone(channels) };
  });
  if (!prepared) return { pending: true };
  try {
    if (prepared.owner.stripeSubscriptionId) {
      await external.cancelSubscription(prepared.owner.stripeSubscriptionId);
      await updateStoreSlice([], data => { const owner = data.users.find(u => u.id === userId && u.deletionClaim === claim); if (!owner) throw new Error("deletion_claim_lost"); owner.stripeSubscriptionId = undefined; });
    }
    for (const channel of prepared.channels) if (channel.accessToken) {
      try { await external.revokeToken(channel.accessToken); }
      catch (error) {
        if (!(error instanceof TikTokApiError) || error.code !== "invalid_grant" || !channel.refreshToken || !external.refreshToken) throw error;
        // An expired access token cannot be revoked. Refresh once and checkpoint
        // rotation before revocation; a rejected refresh proves the grant is dead.
        let tokens: Awaited<ReturnType<typeof refreshAccessToken>> | undefined;
        try { tokens = await external.refreshToken(channel.refreshToken); }
        catch (refreshError) { if (!(refreshError instanceof TikTokApiError) || refreshError.code !== "invalid_grant") throw refreshError; }
        if (tokens) {
          const fresh = tokens;
          await updateStoreSlice(["channels"], data => {
            const current = data.channels.find(c => c.id === channel.id && c.userId === userId);
            if (!current || current.accessToken !== channel.accessToken) throw new Error("channel_changed_during_deletion");
            current.accessToken = fresh.access_token; current.refreshToken = fresh.refresh_token || current.refreshToken; current.expiresAt = fresh.expires_at;
          });
          channel.accessToken = fresh.access_token;
          await external.revokeToken(fresh.access_token);
        }
      }
      await updateStoreSlice(["channels"], data => {
        const current = data.channels.find(c => c.id === channel.id && c.userId === userId);
        if (!current) return;
        if (current.accessToken !== channel.accessToken) throw new Error("channel_changed_during_deletion");
        current.accessToken = undefined; current.refreshToken = undefined; current.connected = false;
      });
    }
  await updateStore((data) => {
    const owner = data.users.find(u => u.id === userId);
    if (owner?.deletionClaim !== claim) throw new Error("deletion_claim_lost");
    queueDeletedMedia(data, { user: owner, projects: data.projects?.filter(p => p.userId === userId), posts: data.posts.filter(p => p.userId === userId), media: data.media.filter(m => m.userId === userId) });
    const channelIds = new Set(data.channels.filter(c => c.userId === userId).map(c => c.id));
    data.pushSubscriptions = data.pushSubscriptions?.filter(s => s.userId !== userId);
    data.warmedOrders = data.warmedOrders?.filter(o => o.userId !== userId);
    data.videoStats = data.videoStats?.filter(s => !channelIds.has(s.channelId));
    data.channelStats = data.channelStats?.filter(s => !channelIds.has(s.channelId));
    const grants = new Set((data.oauthTokens || []).filter(t => t.userId === userId).map(t => t.grantId));
    revokeAllForUser(data, userId);
    data.oauthUsedRefresh = data.oauthUsedRefresh?.filter(t => !grants.has(t.grantId));
    data.revenueCatOutbox = data.revenueCatOutbox?.filter(item => item.appUserId !== userId);
    data.users = data.users.filter((item) => item.id !== userId);
    data.projects = (data.projects || []).filter((item) => item.userId !== userId);
    data.tiktokQrAttempts = (data.tiktokQrAttempts || []).filter((item) => item.userId !== userId);
    data.channels = data.channels.filter((item) => item.userId !== userId);
    data.posts = data.posts.filter((item) => item.userId !== userId);
    data.media = data.media.filter((item) => item.userId !== userId);
    data.apiKeys = data.apiKeys.filter((item) => item.userId !== userId);
    data.accounts = data.accounts.filter((item) => item.userId !== userId);
    data.runs = data.runs.filter((item) => item.userId !== userId);
    data.researchJobs = data.researchJobs?.filter(item => item.userId !== userId);
    data.formatStudies = data.formatStudies?.filter(item => item.userId !== userId);
    data.publicationText = data.publicationText?.filter(item => item.userId !== userId);
    // Historical collections may remain in older snapshots after UI retirement.
    const legacy = data as unknown as Record<string, unknown>;
    for (const key of ["automations", "brands", "influencers"]) {
      const items = legacy[key];
      if (Array.isArray(items)) legacy[key] = items.filter(item => item?.userId !== userId);
    }
  });
    return { pending: false };
  } catch {
    await updateStoreSlice([], data => { const owner = data.users.find(u => u.id === userId && u.deletionClaim === claim); if (owner) { owner.deletionLeaseUntil = 0; owner.deletionAttempts = (owner.deletionAttempts || 0) + 1; } });
    return { pending: true };
  }
}

export async function resumePendingDeletions() {
  const data = await readStoreSlice([]);
  if (data.restoreReviewRequired) return { skipped: true };
  let completed = 0, pending = 0;
  for (const user of data.users.filter(u => u.deletionPendingAt && (u.deletionLeaseUntil || 0) < Date.now()).slice(0, 3)) {
    try { if ((await processAccountDeletion(user.id)).pending) pending++; else completed++; } catch { pending++; }
  }
  return { completed, pending };
}
