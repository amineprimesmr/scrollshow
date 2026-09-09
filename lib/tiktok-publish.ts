// The one Direct Post path. The studio modal, the MCP publish_now tool and the
// scheduler all go through directPostPhotos(), so every route re-reads
// creator_info right before posting and enforces the creator's explicit
// choices (TikTok Content Sharing Guidelines, "Required UX Implementation").

import { resolveSettings } from "./settings";
import { readStore } from "./store";
import { hasStudioAccess } from "./plans";
import { signedMediaUrl } from "./media-access";
import { absoluteAssetUrl, initPhotoPost, queryCreatorInfo, TikTokApiError } from "./tiktok";
import { loadTikTokChannel } from "./tiktok-account";
import {
  type CreatorSnapshot,
  type TikTokPostOptions,
  creatorBlockedReason,
  photoPostInfo,
  validatePostOptions,
} from "./tiktok-compliance";

export class PublishError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(message: string, status = 400, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Fresh creator snapshot, or the reason the creator cannot post right now (guideline 1b). */
export async function loadCreator(accessToken: string): Promise<{ creator: CreatorSnapshot | null; blocked: string | null }> {
  return queryCreatorInfo(accessToken);
}

export async function directPostPhotos(
  userId: string,
  input: { photos: string[]; description: string; options: TikTokPostOptions; channelId?: string; projectId?: string },
) {
  const data = await readStore(true);
  if (data.restoreReviewRequired) throw new PublishError("restoration_review_required", 503);
  if (process.env.VERCEL_ENV === "preview" && process.env.ALLOW_PREVIEW_PUBLISH !== "1") throw new PublishError("preview_publishing_disabled", 403);
  const user = data.users.find(u => u.id === userId);
  if (!user || user.deletionPendingAt || !user.emailVerifiedAt || !hasStudioAccess(user.plan)) throw new PublishError("verified_paid_account_required", 403);
  const channel = await loadTikTokChannel(userId, input.channelId, input.projectId);
  if (!channel?.accessToken) throw new PublishError("tiktok_not_connected", 401);
  if (!input.photos.length) throw new PublishError("photos_required");

  const { creator, blocked } = await loadCreator(channel.accessToken);
  if (blocked) throw new PublishError(`creator_${blocked}`, 429);

  const invalid = validatePostOptions(input.options, creator);
  if (invalid) throw new PublishError(invalid, 400, { allowed: creator?.privacyOptions || [] });

  const store = await readStore();
  const settings = resolveSettings(store.users.find((item) => item.id === userId));

  let result: Record<string, unknown>;
  try {
    result = await initPhotoPost(channel.accessToken, {
      post_info: photoPostInfo(input.options, input.description, settings.autoAddMusic),
      source_info: {
        source: "PULL_FROM_URL",
        photo_cover_index: 0,
        photo_images: input.photos.map(url => signedMediaUrl(absoluteAssetUrl(url), process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io")),
      },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
    });
  } catch (error) {
    // content/init reports the same "cannot post" conditions as creator_info
    // (guideline 1b), plus the unaudited-client restriction; surface the code
    // so the UI can explain instead of echoing TikTok's generic sentence.
    if (error instanceof TikTokApiError) {
      const blocked = creatorBlockedReason(error.code);
      throw new PublishError(blocked ? `creator_${blocked}` : `tiktok_${error.code}`, blocked ? 429 : 400, { message: error.message });
    }
    throw error;
  }
  if (!result.publish_id) throw new PublishError("publish_result_unknown", 502);
  return { publishId: String(result.publish_id), creator, channel, raw: result };
}
