export type Plan = import("./plans").Plan;

export type UserSettings = {
  locale?: "fr" | "en";
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

export type User = {
  id: string;
  email: string;
  name: string;
  passwordHash?: string;
  googleId?: string;
  plan: Plan;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: string;
  settings?: Partial<UserSettings>;
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
};

export type Run = {
  id: string;
  userId: string;
  keywords: string;
  status: "queued" | "done";
  found: number;
  createdAt: string;
};

export type BrandProfile = {
  userId: string;
  website?: string;
  productName?: string;
  audience?: string;
  tone?: string;
  updatedAt?: string;
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
  openId?: string;
  expiresAt?: number;
  followers?: number;
  likes?: number;
  videoCount?: number;
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
  publishId?: string;
  publishState?: string;
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

export type StoreData = {
  users: User[];
  accounts: Account[];
  runs: Run[];
  channels: Channel[];
  posts: StudioPost[];
  media: MediaItem[];
  apiKeys: ApiKey[];
  brands?: BrandProfile[];
  pushSubscriptions?: PushSubscriptionRecord[];
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  plan: Plan;
};

export type PublicUser = SessionUser & {
  createdAt: string;
  hasPassword: boolean;
  hasGoogle: boolean;
  settings: UserSettings;
};
