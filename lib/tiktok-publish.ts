// The one Direct Post path. The studio modal, the MCP publish_now tool and the
// scheduler all go through directPostPhotos(), so every route re-reads
// creator_info right before posting and enforces the creator's explicit
// choices (TikTok Content Sharing Guidelines, "Required UX Implementation").

import { resolveSettings } from "./settings";
import { readStore } from "./store";
import { absoluteAssetUrl, initPhotoPost, queryCreatorInfo } from "./tiktok";
import { loadTikTokChannel } from "./tiktok-account";
import {
  type CreatorSnapshot,
  type TikTokPostOptions,
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
  input: { photos: string[]; description: string; options: TikTokPostOptions },
) {
  const channel = await loadTikTokChannel(userId);
  if (!channel?.accessToken) throw new PublishError("tiktok_not_connected", 401);
  if (!input.photos.length) throw new PublishError("photos_required");

  const { creator, blocked } = await loadCreator(channel.accessToken);
  if (blocked) throw new PublishError(`creator_${blocked}`, 429);

  const invalid = validatePostOptions(input.options, creator);
  if (invalid) throw new PublishError(invalid, 400, { allowed: creator?.privacyOptions || [] });

  const store = await readStore();
  const settings = resolveSettings(store.users.find((item) => item.id === userId));

  const result = await initPhotoPost(channel.accessToken, {
    post_info: photoPostInfo(input.options, input.description, settings.autoAddMusic),
    source_info: {
      source: "PULL_FROM_URL",
      photo_cover_index: 0,
      photo_images: input.photos.map(absoluteAssetUrl),
    },
    post_mode: "DIRECT_POST",
    media_type: "PHOTO",
  });
  return { publishId: String(result.publish_id || ""), creator, channel, raw: result };
}
