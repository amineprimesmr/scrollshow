/** Includes legacy readers so previously imported data and webhooks remain supported. */
export type SupportedBusinessProvider = "stripe" | "revenuecat" | "shopify" | "lemonsqueezy" | "paddle";
export type ConnectorEnvironment = "production" | "sandbox";
export type BusinessCredentials = { apiKey: string; webhookSecret?: string; refreshToken?: string; expiresAt?: string; refreshExpiresAt?: string; issuedAt?: string };
export type ConnectorConfig = { provider: SupportedBusinessProvider; externalAccountId: string; environment: ConnectorEnvironment; revenuecatAppIds?: string[]; excludeStripe?: boolean; shopDomain?: string; connectionId?: string };
export type ProviderTransaction = {
  externalId: string;
  originalTransactionId?: string;
  customerId?: string;
  subscriptionId?: string;
  kind: "sale" | "renewal" | "refund" | "refund_reversal" | "dispute";
  currency: string;
  amountMinor: number;
  taxMinor?: number | null;
  feeMinor?: number | null;
  occurredAt: string;
  environment: ConnectorEnvironment;
  store: string;
  productId?: string;
  clickId?: string;
  externalUserId?: string;
  /** No raw payload or customer PII. */
  metadata?: Record<string, string | number | boolean | null>;
};
export type ProviderEvent = { externalId: string; type: string; occurredAt: string; transactions: ProviderTransaction[]; skipped?: string };
export type HistoryPage = { transactions: ProviderTransaction[]; cursor: string | null; complete: boolean; warnings: string[]; scanned: number; shopifyAcknowledgements?: Array<{ id: string; eventId: string }> };
export type VerifiedBusinessAccount = { externalAccountId: string; name: string; environment: ConnectorEnvironment; appIds?: string[] };
export interface BusinessConnector {
  verify(credentials: BusinessCredentials, config: Omit<ConnectorConfig, "externalAccountId"> & { externalAccountId?: string }): Promise<VerifiedBusinessAccount>;
  history(credentials: BusinessCredentials, config: ConnectorConfig, cursor: string | null, since: string): Promise<HistoryPage>;
  webhook(raw: string, headers: Headers, credentials: BusinessCredentials, config: ConnectorConfig): Promise<ProviderEvent>;
}
export class ConnectorError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(code); this.name = "ConnectorError"; }
}
export function minorUnits(amount: number, currency: string): number | null {
  if (!Number.isFinite(amount) || !/^[A-Z]{3}$/.test(currency)) return null;
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    const result = Math.round(amount * 10 ** digits);
    return Number.isSafeInteger(result) ? result : null;
  } catch { return null; }
}
export function safeMetadataReference(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_:-]{1,200}$/.test(value) ? value : undefined;
}
export function safeProviderError(error: unknown): ConnectorError {
  if (error instanceof ConnectorError) return error;
  const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
  if (status === 401) return new ConnectorError("provider_credentials_invalid", 400);
  if (status === 403) return new ConnectorError("provider_permissions_missing", 400);
  if (status === 429) return new ConnectorError("provider_rate_limited", 429);
  return new ConnectorError("provider_request_failed", 502);
}
