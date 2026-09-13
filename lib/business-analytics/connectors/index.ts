import { ConnectorError, type BusinessConnector, type SupportedBusinessProvider } from "./types";
import { stripeBusinessConnector } from "./stripe";
import { revenuecatBusinessConnector } from "./revenuecat";
import { lemonBusinessConnector } from "./lemonsqueezy";
import { paddleBusinessConnector } from "./paddle";
export function businessConnector(provider: string): BusinessConnector {
  if (provider === "stripe") return stripeBusinessConnector;
  if (provider === "revenuecat") return revenuecatBusinessConnector;
  if (provider === "lemonsqueezy") return lemonBusinessConnector;
  if (provider === "paddle") return paddleBusinessConnector;
  throw new ConnectorError("provider_not_supported", 400);
}
export const SUPPORTED_BUSINESS_PROVIDERS: SupportedBusinessProvider[] = ["stripe", "revenuecat", "lemonsqueezy", "paddle"];
