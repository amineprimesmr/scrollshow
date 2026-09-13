/** Business analytics is separate from the subscription a user pays to ScrollShow. */
export type BusinessScope = { userId: string; projectId: string };
export type BusinessProvider = "stripe" | "revenuecat" | "shopify" | "paddle" | "lemonsqueezy" | "gumroad" | "manual";
export type BusinessEnvironment = "live" | "test";
export type OwnedEntity = BusinessScope & { id: string; createdAt: string; updatedAt: string };
export type EntityInput<T extends OwnedEntity> = Omit<T, keyof OwnedEntity> & Partial<Pick<OwnedEntity, "id" | "createdAt" | "updatedAt">>;
export type BusinessConnection = OwnedEntity & {
  provider: BusinessProvider; name: string; externalAccountId: string; environment: BusinessEnvironment;
  status: "connected" | "syncing" | "error" | "disconnected" | "configuration_required";
  encryptedCredentials?: string; encryptedWebhookSecret?: string; scopes?: string[];
  productIds?: string[]; appIds?: string[]; monetarySource?: boolean;
  cursor?: string; lastSyncedAt?: string; historyStartedAt?: string; historyComplete?: boolean;
  lastError?: string; lastSyncAttemptAt?: string; lastWebhookAt?: string; syncLeaseUntil?: string; syncClaim?: string; metadata?: Record<string, string>;
};
export type PublicBusinessConnection = Omit<BusinessConnection, "encryptedCredentials" | "encryptedWebhookSecret" | "metadata" | "syncClaim" | "syncLeaseUntil" | "cursor"> & { hasCredentials: boolean; hasWebhookSecret: boolean };
export type BusinessPublication = OwnedEntity & {
  contentId?: string; channelId?: string; externalId?: string; url?: string; title: string;
  publishedAt: string; lifecycle?: "planned" | "published"; format: string; hook?: string; cta?: string; destinationUrl?: string;
  trackingStartedAt?: string; trackingEndedAt?: string;
  /** Counters only from authenticated providers, never accepted from caller annotations. */
  views?: number | null; viewsMeasuredAt?: string; viewsAtHorizon?: number | null; viewsHorizonDays?: number;
  metricSource?: string;
};
export type BusinessTransaction = OwnedEntity & {
  connectionId?: string; provider: BusinessProvider; externalAccountId: string; environment: BusinessEnvironment;
  externalId: string; canonicalId?: string; customerId?: string; subscriptionId?: string; productId?: string;
  kind: "initial" | "renewal" | "one_time" | "unknown";
  status: "paid" | "pending" | "failed" | "void";
  amountMinor: number; taxMinor: number | null; feeMinor?: number | null; currency: string;
  occurredAt: string; source: "provider" | "import" | "server";
  publicationId?: string; campaign?: string; clickId?: string; attributionModel?: string;
  attributionWindowDays?: number; attributedAt?: string; acquisitionPublicationId?: string;
  acquisitionAt?: string; acquisitionKnown?: boolean;
  /** Provider supplies a cumulative refunded total when individual refunds cannot be listed. */
  refundedAmountMinor?: number; refundedTaxMinor?: number | null; refundUpdatedAt?: string;
};
export type BusinessAdjustment = OwnedEntity & {
  transactionId: string; connectionId?: string; provider: BusinessProvider; externalId: string;
  kind: "refund" | "dispute" | "reversal"; amountMinor: number; taxMinor: number | null;
  currency: string; occurredAt: string; source: "provider" | "import" | "server";
};
export type BusinessLink = OwnedEntity & {
  slug: string; label: string; destinationUrl: string; publicationId?: string; campaign?: string;
  active: boolean; destinationHistory?: Array<{ url: string; changedAt: string }>;
};
export type BusinessClick = OwnedEntity & {
  linkId: string; publicationId?: string; campaign?: string; visitorId: string;
  occurredAt: string; referrer?: string; source: "redirect" | "landing"; isBot?: boolean;
};
export type BusinessIdentity = OwnedEntity & {
  provider: string; externalId: string; customerId: string; visitorId?: string; externalAccountId?: string; environment?: BusinessEnvironment;
  firstSeenAt: string; clickId?: string; acquisitionAt?: string; acquisitionKnown?: boolean;
};
export type BusinessEvent = OwnedEntity & {
  externalId?: string; kind: "visit" | "signup" | "activation" | "lead" | "trial" | "survey";
  occurredAt: string; visitorId?: string; customerId?: string; clickId?: string; provider?: string; publicationId?: string; campaign?: string;
  source: "manual" | "server" | "provider"; value?: string; trialEndsAt?: string;
};
export type BusinessCost = OwnedEntity & {
  publicationId?: string; contentId?: string; name: string; amountMinor: number; currency: string;
  category: "production" | "creator" | "tools" | "cogs" | "shipping" | "ads" | "other";
  incurredAt: string; source: "manual" | "provider";
};
export type BusinessExperiment = OwnedEntity & {
  name: string; hypothesis: string; metric: string; publicationIds: string[];
  status: "planned" | "running" | "completed"; design: "observational" | "randomized";
};
export type BusinessSettings = OwnedEntity & {
  currency: string; attributionWindowDays: number; horizonDays: number; siteUrl?: string;
  bioSlug?: string; bioEnabled: boolean; costsComplete: boolean; trackingStartedAt?: string; trackingVerifiedAt?: string;
};
export type BusinessTrackingKey = OwnedEntity & { hash: string; prefix: string; active: boolean; lastUsedAt?: string };
export type BusinessRecords = {
  connections: BusinessConnection; publications: BusinessPublication; transactions: BusinessTransaction;
  adjustments: BusinessAdjustment; links: BusinessLink; clicks: BusinessClick; identities: BusinessIdentity;
  events: BusinessEvent; costs: BusinessCost; experiments: BusinessExperiment; settings: BusinessSettings; trackingKeys: BusinessTrackingKey;
};
export type BusinessCollection = keyof BusinessRecords;
export type BusinessSnapshot = { [K in BusinessCollection]: BusinessRecords[K][] } & {
  scope?: BusinessScope; truncated: BusinessCollection[]; loadedAt: string;
};
export type MoneyMetric = { amountMinor: number | null; currency: string; missing: number };
export type PublicationOutcome = {
  id: string; title: string; contentId?: string; channelId?: string; url?: string; publishedAt: string;
  ageDays: number; format: string; hook?: string; cta?: string; mature: boolean; eligible: boolean;
  exclusionReason: "immature" | "tracking_missing" | "tracking_incomplete" | "history_incomplete" | null;
  views: number | null; horizonViews: number | null; visits: number; signups: number; buyers: number;
  initialRevenueMinor: number | null; renewalRevenueMinor: number | null; revenueMinor: number | null;
  costMinor: number; contributionMinor: number | null; attributionMethods: string[];
};
export type BusinessDashboard = {
  generatedAt: string; currency: string; days: number; horizonDays: number;
  period: { from: string; to: string }; cohortPeriod: { from: string; to: string };
  cash: { grossMinor: number | null; taxMinor: number | null; refundsMinor: number | null; netRevenueMinor: number | null;
    sales: number | null; newBuyers: number | null; publications: number | null; globalRevenuePerPostMinor: number | null; currencies: string[] };
  content: { revenueMinor: number | null; initialRevenueMinor: number | null; renewalRevenueMinor: number | null;
    revenuePerPostMinor: number | null; costMinor: number; contributionMinor: number | null; contributionPerPostMinor: number | null;
    buyers: number; acquisitionCostMinor: number | null; revenuePerThousandViewsMinor: number | null;
    eligiblePublications: number; totalPublications: number; immaturePublications: number; excludedPublications: number };
  coverage: { publicationPercent: number | null; attributedSalesPercent: number | null; attributedRevenuePercent: number | null;
    measuredViewsPercent: number | null; knownTaxesPercent: number | null; costsComplete: boolean;
    truncated: BusinessCollection[]; warnings: string[]; lastSyncedAt: string | null };
  funnel: Array<{ key: "visits" | "signups" | "activations" | "buyers"; label: string; count: number; rate: number | null; measured: boolean }>;
  customerCohorts: Array<{ horizonDays: number; customers: number; revenueMinor: number | null; revenuePerCustomerMinor: number | null; renewalCustomers: number }>;
  publicationOutcomes: PublicationOutcome[];
  formats: Array<{ format: string; publications: number; buyers: number; revenueMinor: number | null; revenuePerPostMinor: number | null; contributionMinor: number | null }>;
  timeline: Array<{ date: string; grossMinor: number; refundsMinor: number; sales: number }>;
  insights: Array<{ id: string; kind: "info" | "warning" | "opportunity"; title: string; detail: string }>;
  settings: BusinessSettings;
  connections: PublicBusinessConnection[]; publications: BusinessPublication[]; links: BusinessLink[];
  costs: BusinessCost[]; experiments: BusinessExperiment[]; events: BusinessEvent[];
  transactions: Array<Omit<BusinessTransaction, "customerId" | "subscriptionId" | "clickId">>; adjustments: BusinessAdjustment[];
  capabilities: { storageReady: boolean; trackingKeyConfigured: boolean; trackingObserved: boolean; providerConnected: boolean; historyComplete: boolean };
};
