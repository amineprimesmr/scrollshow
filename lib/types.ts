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
  /** Public profiles supplied during onboarding; tiktok keeps the primary profile. */
  tiktokAccounts?: NonNullable<BusinessProfile["tiktok"]>[];
  goal?: "sell" | "installs" | "awareness" | "traffic" | "monetize" | "leads";
  cadence?: "daily" | "3w" | "weekly" | "unsure";
  analyzedAt: string;
};

export type OnboardingState = {
  step?: number;
  completedAt?: string;
  heardFrom?: string[];
};

/** Un projet = un business. Il possede ses comptes connectes, son calendrier,
 * ses posts, sa bibliotheque et ses recherches. Le compte utilisateur ne garde
 * que la facturation, les reglages generaux et les projets eux-memes. */
export type Project = {
  id: string;
  userId: string;
  name: string;
  logo?: string;
  business: BusinessProfile | null;
  /** Absent tant que l'onboarding du projet n'est pas termine : le projet est
   * alors un brouillon reprenable, jamais un espace de travail complet. */
  completedAt?: string;
  /** Etape atteinte dans l'onboarding du projet, pour reprendre un brouillon. */
  onboardingStep?: number;
  archivedAt?: string;
  createdAt: string;
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
  deletionClaim?: string;
  deletionLeaseUntil?: number;
  deletionAttempts?: number;
  emailChange?: { email: string; oldHash: string; newHash: string; expiresAt: number; oldConfirmed: boolean; newConfirmed: boolean };
  billingEventAt?: number;
  lifetimePaymentId?: string;
  createdAt: string;
  settings?: Partial<UserSettings>;
  /** Ids of completed "Post to the US" checklist items. */
  usChecklist?: string[];
  business?: BusinessProfile;
  /** Dernier projet ouvert : sert de repli quand aucun projet n'est demande. */
  lastProjectId?: string;
  onboarding?: OnboardingState;
  /** Routine Claude declenchee par le raccourci iPhone (URL + jeton scelle). Voir lib/shortcut-recreate.ts. */
  agentTrigger?: AgentTrigger;
  /** Raccourci iPhone : demander a chaque partage (defaut), toujours recreer, ou toujours enregistrer. */
  shortcutMode?: "ask" | "recreate" | "save";
};

export type AgentTrigger = {
  url: string;
  /** Jeton de la routine, chiffre (AES-GCM, cle derivee d'AUTH_SECRET) : jamais rendu au navigateur. */
  tokenSealed: string;
  tokenHint: string;
  createdAt: string;
  lastFiredAt?: string;
  lastSessionUrl?: string;
  lastError?: string;
};

/** D'ou vient le compte TikTok qui a partage le post, compare aux comptes ScrollShow. */
export type SharerLink = "connected" | "tracked" | "unlinked" | "unknown";

/** Demande de recreation posee sur le post importe (une par post source). */
export type RecreationRequest = {
  status: "queued" | "running" | "done" | "failed";
  via: "shortcut" | "agent";
  requestedAt: string;
  sharer?: { handle: string; nickname?: string; avatar?: string } | null;
  link: SharerLink;
  /** Vrai quand le compte qui partage est lie a un AUTRE projet : la demande y a ete rangee. */
  routed?: boolean;
  /** Compte cible du brouillon, quand le compte qui partage est connu du projet. */
  channelId?: string;
  claimedAt?: string;
  leaseUntil?: number;
  attempts?: number;
  resultPostId?: string;
  completedAt?: string;
  error?: string;
  trigger?: { at: string; ok: boolean; sessionUrl?: string; error?: string };
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
  /** Mots-cles de recherche qui ont ramene ce post. Sans cette trace, un
   * carrousel trouve pour « sleepmaxing » est indiscernable du reste du feed du
   * compte, et le mur affiche du hors-sujet. */
  matchedKeywords?: string[];
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
  /** Projet proprietaire. Retro-rempli par le store pour les donnees anterieures. */
  projectId?: string;
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
  researchCoverage?: { complete: boolean; pages: number; windowDays: number; measuredAt: string; reason: string; loaded?: number };
  /** Masque : le compte reste dans ScrollShow mais n'apparait plus que dans le gestionnaire de comptes. */
  hidden?: boolean;
  /**
   * D'ou vient ce compte. `research` = trouve et mesure par le moteur de Recherche :
   * c'est une DONNEE de recherche (un concurrent), jamais un compte de l'utilisateur.
   * Il n'apparait ni dans l'Overview, ni dans le calendrier, ni dans le composeur, ni
   * chez l'agent. `manual` = ajoute expres (formulaire, raccourci iOS, « Suivre »).
   */
  origin?: "research" | "manual";
};

export type Run = {
  id: string;
  userId: string;
  /** Projet proprietaire. Retro-rempli par le store pour les donnees anterieures. */
  projectId?: string;
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
  /** Projet proprietaire. Retro-rempli par le store pour les donnees anterieures. */
  projectId?: string;
  platform: string;
  name: string;
  handle: string;
  avatar: string;
  connected?: boolean;
  /** Compte suivi (collection accounts) expose comme compte du projet, sans jeton : brouillons seulement. */
  tracked?: boolean;
  /** Masque : le compte reste dans ScrollShow mais n'apparait plus que dans le gestionnaire de comptes. */
  hidden?: boolean;
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
  /** "outline" (defaut historique : contour noir), "shadow" (texte natif TikTok : blanc, ombre douce), "plain". */
  textStyle?: OverlayTextStyle;
  /** Contour du style "outline" : couleur (defaut noir) et epaisseur en px a 1080 de large (defaut 1). */
  strokeColor?: string;
  strokeWidth?: number;
};

export type OverlayTextStyle = "outline" | "shadow" | "plain";
export type SlideAspect = "9:16" | "3:4" | "4:5" | "1:1";
/** Point focal du recadrage : x/y en % de la photo source, zoom >= 1. */
export type SlideCrop = { x: number; y: number; zoom?: number };

export type CarouselSlide = {
  id: string;
  image: string;
  sourceImage?: string;
  backgroundColor?: string;
  backgroundColor2?: string;
  keepPhoto?: boolean;
  /** Format de la slide ; absent = celui de la recette, sinon 9:16. Un carrousel TikTok peut les melanger. */
  aspect?: SlideAspect;
  crop?: SlideCrop;
  html?: string;
  css?: string;
  overlays: SlideOverlay[];
};

export type CarouselOrigin = "ai" | "manual" | "import" | "fork";

export type CarouselRecipe = {
  version: 1;
  aspect?: SlideAspect;
  origin: CarouselOrigin;
  fontFamily: string;
  html?: string;
  css?: string;
  prompt?: string;
  editable?: boolean;
  slides: CarouselSlide[];
};

export type StudioPost = {
  importSummary?: { expected: number; imported: number; failed: number; truncated: boolean; videoPreviewOnly?: boolean };
  id: string;
  userId: string;
  /** Projet proprietaire. Retro-rempli par le store pour les donnees anterieures. */
  projectId?: string;
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
  /** Set only by the studio's Post to TikTok page: the creator saw the preview and chose these options themselves. */
  tiktokApprovedAt?: string;
  publishId?: string;
  /** Exact rendered images handed to TikTok, retained for the published preview. */
  publishedPhotos?: string[];
  previousPublishId?: string;
  publishState?: string;
  publishChannelId?: string;
  publishClaim?: string;
  publishLeaseUntil?: number;
  publishAttempts?: number;
  shareEnabled?: boolean;
  publishError?: string;
  publishedAt?: string;
  /** Post importe par le raccourci iPhone et a recreer par l'agent. */
  recreation?: RecreationRequest;
  /** Id du post source quand ce carrousel est une recreation. */
  recreationOf?: string;
};

export type MediaItem = {
  id: string;
  userId: string;
  /** Projet proprietaire. Retro-rempli par le store pour les donnees anterieures. */
  projectId?: string;
  url: string;
  name: string;
  createdAt: string;
  /** Banque d'images : d'ou vient l'image, sa page d'origine, ses etiquettes et sa taille mesuree. */
  source?: "upload" | "pinterest" | "generated" | "web" | "render";
  sourceUrl?: string;
  tags?: string[];
  note?: string;
  width?: number;
  height?: number;
};

export type ApiKey = {
  expiresAt?: string;
  id: string;
  userId: string;
  /** Projet proprietaire. Retro-rempli par le store pour les donnees anterieures. */
  projectId?: string;
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
  projectId?: string;
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
  projectId?: string;
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
  revenueCatOutbox?: import("./revenuecat-outbox").RevenueCatDelivery[];
  tiktokQrAttempts?: import("./tiktok-qr-session").TikTokQrAttempt[];
  publicationText?: Array<PublicationSlideText & { userId: string; postId: string }>;
  researchJobs?: import("./research/model").ResearchJob[];
  formatStudies?: import("./research/model").FormatStudy[];
  restoreReviewRequired?: boolean;
  mediaDeletionQueue?: Array<{ name: string; notBefore: number; attempts: number; claim?: string; leaseUntil?: number }>;
  operations?: Record<string, { lastStartedAt?: number; lastSucceededAt?: number; lastFailedAt?: number; leaseUntil?: number; claim?: string }>;
  billingEvents?: string[];
  refundedLifetimePayments?: string[];
  rateLimits?: Record<string, { count: number; resetAt: number }>;
  users: User[];
  projects?: Project[];
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
  /** `at` et `clientId` : un meme client peut rejouer son jeton pendant REFRESH_REUSE_GRACE_MS (course entre ses appareils). */
  oauthUsedRefresh?: { hash: string; grantId: string; at?: number; clientId?: string }[];
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
  /** Projet actif de la requete : resolu depuis le cookie (studio) ou la cle API (agents). */
  projectId?: string;
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
  project?: PublicProject | null;
};

export type PublicProject = {
  id: string;
  name: string;
  logo: string;
  business: BusinessProfile | null;
  completed: boolean;
  createdAt: string;
};
