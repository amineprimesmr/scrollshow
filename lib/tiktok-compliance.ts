// Single source of truth for TikTok's "Required UX Implementation in Your App"
// (Content Sharing Guidelines, points 1-5). Both the publish UI and every
// server-side Direct Post path validate against these rules, so a post can
// never reach TikTok with choices the creator did not make themselves.
//
// https://developers.tiktok.com/doc/content-sharing-guidelines/#required_ux_implementation_in_your_app

export const PRIVACY_LEVELS = [
  { id: "PUBLIC_TO_EVERYONE", fr: "Tout le monde", en: "Everyone" },
  { id: "MUTUAL_FOLLOW_FRIENDS", fr: "Amis", en: "Friends" },
  { id: "FOLLOWER_OF_CREATOR", fr: "Abonnés", en: "Followers" },
  { id: "SELF_ONLY", fr: "Moi uniquement", en: "Only me" },
] as const;

export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number]["id"];

export const MUSIC_USAGE_URL = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
export const BRANDED_CONTENT_POLICY_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en";

/** What the creator explicitly chose on the Post to TikTok page. */
export type TikTokPostOptions = {
  /** Post title (photo posts: shown as the caption title, max 90 chars). */
  title: string;
  /** Privacy status. Empty string = the creator has not chosen yet. */
  privacy: string;
  /** "Allow comment" — unchecked by default per guideline 2c. */
  allowComment: boolean;
  /** "Content disclosure" toggle — off by default per guideline 3a. */
  commercial: boolean;
  /** "Your brand" → brand_organic_toggle. */
  brandOrganic: boolean;
  /** "Branded content" → brand_content_toggle. */
  brandContent: boolean;
};

export const EMPTY_OPTIONS: TikTokPostOptions = {
  title: "",
  privacy: "",
  allowComment: false,
  commercial: false,
  brandOrganic: false,
  brandContent: false,
};

/** Normalised /post/publish/creator_info/query result. */
export type CreatorSnapshot = {
  nickname: string;
  username: string;
  avatar: string;
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
};

/** creator_info error codes that mean "cannot post right now" (guideline 1b). */
const BLOCKED_CODES: Record<string, string> = {
  spam_risk_too_many_posts: "too_many_posts",
  spam_risk_user_banned_from_posting: "banned_from_posting",
  spam_risk_too_many_pending_share: "too_many_pending",
  reached_active_user_cap: "active_user_cap",
  unaudited_client_can_only_post_to_private_accounts: "private_account_required",
};

/** Only TikTok's documented "cannot post now" codes count as a block; anything else is an API error. */
export function creatorBlockedReason(code?: string) {
  if (!code || code === "ok") return null;
  return BLOCKED_CODES[code] || null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeCreator(raw: any): CreatorSnapshot {
  return {
    nickname: String(raw?.creator_nickname || ""),
    username: String(raw?.creator_username || ""),
    avatar: String(raw?.creator_avatar_url || ""),
    privacyOptions: Array.isArray(raw?.privacy_level_options) ? raw.privacy_level_options.map(String) : [],
    commentDisabled: Boolean(raw?.comment_disabled),
    duetDisabled: Boolean(raw?.duet_disabled),
    stitchDisabled: Boolean(raw?.stitch_disabled),
    maxVideoPostDurationSec: Number(raw?.max_video_post_duration_sec) || 0,
  };
}

export type OptionsError =
  | "title_required"
  | "privacy_required"
  | "privacy_not_allowed"
  | "commercial_choice_required"
  | "branded_content_private"
  | "comment_disabled_by_creator";

/**
 * Returns the first rule the options break, or null when the post may be
 * sent. `creator` is the fresh snapshot the caller just fetched.
 */
export function validatePostOptions(options: TikTokPostOptions, creator: CreatorSnapshot | null): OptionsError | null {
  if (!options.title.trim()) return "title_required";
  if (!options.privacy) return "privacy_required";
  if (creator?.privacyOptions.length && !creator.privacyOptions.includes(options.privacy)) return "privacy_not_allowed";
  if (options.commercial && !options.brandOrganic && !options.brandContent) return "commercial_choice_required";
  if (options.commercial && options.brandContent && options.privacy === "SELF_ONLY") return "branded_content_private";
  if (options.allowComment && creator?.commentDisabled) return "comment_disabled_by_creator";
  return null;
}

/** Which consent declaration must sit above the publish button (guideline 2 note + 4). */
export function declarationFor(options: TikTokPostOptions): "music" | "branded" {
  return options.commercial && options.brandContent ? "branded" : "music";
}

/** The label TikTok will attach to the post, if any (guideline 3a prompts). */
export function commercialLabel(options: TikTokPostOptions): "promotional" | "paid_partnership" | null {
  if (!options.commercial) return null;
  if (options.brandContent) return "paid_partnership";
  if (options.brandOrganic) return "promotional";
  return null;
}

/** Builds the post_info block for a PHOTO direct post. Duet/stitch do not apply to photos. */
export function photoPostInfo(options: TikTokPostOptions, description: string, autoAddMusic: boolean) {
  const commercial = options.commercial;
  return {
    title: options.title.trim().slice(0, 90),
    description: description.slice(0, 2200),
    privacy_level: options.privacy,
    disable_comment: !options.allowComment,
    auto_add_music: autoAddMusic,
    brand_content_toggle: commercial && options.brandContent,
    brand_organic_toggle: commercial && options.brandOrganic,
  };
}

/** Coerces whatever was persisted on a post (possibly partial or legacy) into full options. */
export function coerceOptions(input: Partial<TikTokPostOptions> | null | undefined, fallbackTitle = ""): TikTokPostOptions {
  return {
    title: String(input?.title ?? "").trim() || fallbackTitle.slice(0, 90),
    privacy: String(input?.privacy ?? ""),
    allowComment: Boolean(input?.allowComment),
    commercial: Boolean(input?.commercial) || Boolean(input?.brandOrganic) || Boolean(input?.brandContent),
    brandOrganic: Boolean(input?.brandOrganic),
    brandContent: Boolean(input?.brandContent),
  };
}
