export type Plan = import("./plans").Plan;

export type ThemePreference = "light" | "dark" | "system";

export type UserSettings = {
  locale?: "fr" | "en";
  theme?: ThemePreference;
  timezone: string;
  weekStartsOn: 0 | 1;
  defaultPostTime: string;
  defaultPrivacy: string;
  defaultStatus: "draft" | "scheduled";
  disableComments: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  autoAddMusic: boolean;
  brandContent: boolean;
  brandOrganic: boolean;
  notifyPublishSuccess: boolean;
  notifyPublishFailure: boolean;
};

export type BusinessKind = "saas" | "ecommerce" | "mobile_app" | "creator" | "agency" | "service" | "media" | "other";

export type BusinessSocial = { platform: "tiktok" | "instagram" | "youtube" | "x" | "linkedin" | "facebook"; url: string; handle: string };

/** What ScrollShow knows about the user's business, built at onboarding from their link. */
export type BusinessProfile = {
  name: string;
  url: string;
  kind: BusinessKind;
  logo?: string;
  tagline?: string;
  description?: string;
  language?: string;
  brandColor?: string;
  keywords: string[];
  socials: BusinessSocial[];
  /** Signals found on the page: "shopify", "app-store", "play-store", "pricing-page"... */
  signals: string[];
  tiktok?: {
    handle: string;
    nickname: string;
    avatar: string;
    followers: number;
    likes: number;
    videos: number;
    avgViews: number;
    photoShare: number; // % of recent posts that are photo carousels
    source: "tiktok" | "api";
  } | null;
  goal?: "sell" | "installs" | "awareness" | "traffic" | "monetize" | "leads";
  cadence?: "daily" | "3w" | "weekly" | "unsure";
  analyzedAt: string;
};

export type OnboardingState = {
  step?: number;
  completedAt?: string;
  heardFrom?: string[];
};

export type User = {
  id: string;
  email: string;
  name: string;
  passwordHash?: string;
  googleId?: string;
  githubId?: string;
  plan: Plan;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  /** Cadence de l'abonnement en cours : l'ecran Plan affiche 29 €/mois ou 199 €/an. */
  billingInterval?: "month" | "year";
  sessionVersion?: number;
  recoveryHash?: string;
  recoveryExpiresAt?: number;
  emailVerifiedAt?: string;
  verificationHash?: string;
  verificationExpiresAt?: number;
  deletionPendingAt?: string;
  emailChange?: { email: string; oldHash: string; newHash: string; expiresAt: number; oldConfirmed: boolean; newConfirmed: boolean };
  billingEventAt?: number;
  lifetimePaymentId?: string;
  createdAt: string;
  settings?: Partial<UserSettings>;
  /** Ids of completed "Post to the US" checklist items. */
  usChecklist?: string[];
  business?: BusinessProfile;
  onboarding?: OnboardingState;
};

export type WarmedOrderStatus = "requested" | "contacted" | "delivered" | "cancelled";

export type WarmedOrder = {
  id: string;
  userId: string;
  listingId: string;
  quantity: number;
  niche: string;
  note: string;
  status: WarmedOrderStatus;
  createdAt: string;
  updatedAt: string;
};

export type AccountVideo = {
  id: string;
  title: string;
  cover: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  caption?: string;
  images?: string[];
  slideTexts?: PublicationSlideText[];
  hashtags?: string[];
  missingMetrics?: Array<"views" | "likes" | "comments" | "shares" | "saves">;
  measuredAt?: string;
  kind: "photo" | "video";
  createdAt: number; // unix seconds
  url: string;
};

export type PublicationSlideText = {
  index: number;
  imageKey: string;
  text: string;
  status: "pending" | "read" | "uncertain" | "failed";
  confidence: number | null;
  updatedAt?: string;
};

export type VideoSync = {
  source: "tiktok" | "api";
  cursor?: number;
  hasMore: boolean;
  complete: boolean;
  seenIds: string[];
  updatedAt: string;
  error?: string;
};

export type Account = {
  id: string;
  userId: string;
  handle: string;
  niche: string;
  followers: number;
  avgViews: number;
  posts: number;
  verdict: "keep" | "watch" | "skip";
  notes: string;
  createdAt: string;
  /** Public profile data pulled from TikTok (clippers network). */
  nickname?: string;
  avatar?: string;
  bio?: string;
  likes?: number;
  verified?: boolean;
  lastSyncAt?: string;
  syncError?: string;
  /** Public posts pulled on demand from the metrics provider, newest first. */
  videos?: AccountVideo[];
  videosFetchedAt?: string;
  videoSync?: VideoSync;
  researchCoverage?: { complete: boolean; pages: number; windowDays: number; measuredAt: string; reason: string };
};

export type Run = {
  id: string;
  userId: string;
  keywords: string;
  status: "queued" | "done" | "error";
  accountIds?: string[];
  error?: string;
  found: number;
  createdAt: string;
};

export type Channel = {
  id: string;
  userId: string;
  platform: string;
  name: string;
  handle: string;
  avatar: string;
  connected?: boolean;
  accessToken?: string;
  refreshToken?: string;
  scopes?: string;
  openId?: string;
  expiresAt?: number;
  followers?: number;
  likes?: number;
  videoCount?: number;
  /** Public posts pulled on demand from the metrics provider, newest first. */
  videos?: AccountVideo[];
  videosFetchedAt?: string;
  videoSync?: VideoSync;
};

export type OverlayAlign = "left" | "center" | "right";

export type SlideOverlay = {
  id: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  color: string;
  x: number;
  y: number;
  align: OverlayAlign;
  width?: number;
  lineHeight?: number;
  backdrop?: string;
};

export type CarouselSlide = {
  id: string;
  image: string;
  sourceImage?: string;
  backgroundColor?: string;
  backgroundColor2?: string;
  keepPhoto?: boolean;
  html?: string;
  css?: string;
  overlays: SlideOverlay[];
};

export type CarouselOrigin = "ai" | "manual" | "import" | "fork";

export type CarouselRecipe = {
  version: 1;
  origin: CarouselOrigin;
  fontFamily: string;
  html?: string;
  css?: string;
  prompt?: string;
  editable?: boolean;
  slides: CarouselSlide[];
};

export type StudioPost = {
  id: string;
  userId: string;
  channelIds: string[];
  body: string;
  date: string;
  time: string;
  status: "draft" | "scheduled" | "published";
  image: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  origin?: CarouselOrigin;
  shareId?: string;
  recipe?: CarouselRecipe;
  visibility?: "private" | "public";
  inCalendar?: boolean;
  kind?: "photo" | "video";
  tiktokUrl?: string;
  tiktokId?: string;
  authorHandle?: string;
  authorName?: string;
  authorAvatar?: string;
  musicTitle?: string;
  musicAuthor?: string;
  clones?: number;
  forkedFrom?: string;
  createdAt?: string;
  /** Creator's explicit Direct Post choices, captured on the Post to TikTok page. */
  tiktok?: import("./tiktok-compliance").TikTokPostOptions;
  publishId?: string;
  publishState?: string;
  publishChannelId?: string;
  publishClaim?: string;
  publishLeaseUntil?: number;
  publishAttempts?: number;
  shareEnabled?: boolean;
  publishError?: string;
  publishedAt?: string;
};

export type MediaItem = {
  id: string;
  userId: string;
  url: string;
  name: string;
  createdAt: string;
};

export type ApiKey = {
  expiresAt?: string;
  id: string;
  userId: string;
  name: string;
  prefix: string;
  hash: string;
  createdAt: string;
  lastUsedAt?: string;
};

export type PushSubscriptionRecord = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string;
  createdAt: string;
};

export type VideoStatSnapshot = {
  channelId: string;
  videoId: string;
  day: string; // YYYY-MM-DD, one snapshot per video per day
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  capturedAt: string;
};

export type ChannelStatSnapshot = {
  channelId: string;
  day: string; // YYYY-MM-DD, one snapshot per channel per day
  followers: number;
  likes: number;
  videoCount: number;
  capturedAt: string;
};

export type OAuthClient = {
  id: string;
  name: string;
  redirectUris: string[];
  uri?: string;
  createdAt: string;
};

export type OAuthCode = {
  hash: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  scope: string;
  expiresAt: number;
};

export type OAuthToken = {
  /** Une autorisation = un couple utilisateur/agent, revocable d'un bloc. */
  grantId: string;
  clientId: string;
  userId: string;
  resource: string;
  scope: string;
  accessHash: string;
  refreshHash: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  createdAt: string;
};

export type StoreData = {
  tiktokQrAttempts?: import("./tiktok-qr-session").TikTokQrAttempt[];
  publicationText?: Array<PublicationSlideText & { userId: string; postId: string }>;
  researchJobs?: import("./research/model").ResearchJob[];
  formatStudies?: import("./research/model").FormatStudy[];
  restoreReviewRequired?: boolean;
  mediaDeletionQueue?: Array<{ name: string; notBefore: number; attempts: number }>;
  operations?: Record<string, { lastStartedAt?: number; lastSucceededAt?: number; lastFailedAt?: number; leaseUntil?: number; claim?: string }>;
  billingEvents?: string[];
  refundedLifetimePayments?: string[];
  rateLimits?: Record<string, { count: number; resetAt: number }>;
  users: User[];
  accounts: Account[];
  runs: Run[];
  channels: Channel[];
  posts: StudioPost[];
  media: MediaItem[];
  apiKeys: ApiKey[];
  oauthClients?: OAuthClient[];
  oauthCodes?: OAuthCode[];
  oauthTokens?: OAuthToken[];
  /** Jetons de renouvellement deja consommes : un rejeu revoque toute l'autorisation. */
  oauthUsedRefresh?: { hash: string; grantId: string }[];
  pushSubscriptions?: PushSubscriptionRecord[];
  videoStats?: VideoStatSnapshot[];
  channelStats?: ChannelStatSnapshot[];
  warmedOrders?: WarmedOrder[];
};

export type SessionUser = {
  emailVerified?: boolean;
  sessionVersion?: number;
  id: string;
  email: string;
  name: string;
  plan: Plan;
  /** True once the onboarding wizard was completed (carried in the session so layouts can gate without a store read). */
  onboarded?: boolean;
};

export type PublicUser = SessionUser & {
  createdAt: string;
  billingInterval?: "month" | "year";
  hasPassword: boolean;
  hasGoogle: boolean;
  hasGithub: boolean;
  settings: UserSettings;
  business: BusinessProfile | null;
  onboarded: boolean;
};
