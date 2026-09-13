import type { BusinessProfile } from "./types";

export function businessTikTokAccounts(business?: BusinessProfile | null) {
  const accounts = new Map<string, NonNullable<BusinessProfile["tiktok"]>>();
  for (const account of [business?.tiktok, ...(business?.tiktokAccounts || [])]) {
    if (account?.handle) accounts.set(account.handle.toLowerCase(), account);
  }
  return [...accounts.values()];
}

/** Adding or refreshing a profile never replaces the other business accounts. */
export function withBusinessTikTok(business: BusinessProfile, account: NonNullable<BusinessProfile["tiktok"]>): BusinessProfile {
  const accounts = new Map(businessTikTokAccounts(business).map(item => [item.handle.toLowerCase(), item]));
  accounts.set(account.handle.toLowerCase(), account);
  const tiktokAccounts = [...accounts.values()];
  return {
    ...business,
    tiktok: tiktokAccounts[0],
    tiktokAccounts,
    socials: [
      ...business.socials.filter(item => item.platform !== "tiktok" || item.handle.toLowerCase() !== account.handle.toLowerCase()),
      { platform: "tiktok", url: `https://www.tiktok.com/@${account.handle}`, handle: account.handle },
    ],
  };
}
