export const PLATFORM_IDS = ["tiktok", "instagram", "facebook", "x"] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];
export type PlatformFamily = "tiktok" | "meta" | "x";
export type PlatformLifecycle = "pending_review" | "connectable";

export type PlatformDef = {
  id: PlatformId;
  name: string;
  family: PlatformFamily;
  lifecycle: PlatformLifecycle;
  logo: string;
  connectPath: string;
};

export const PLATFORMS: PlatformDef[] = [
  {
    id: "tiktok",
    name: "TikTok",
    family: "tiktok",
    lifecycle: "pending_review",
    logo: "/assets/platforms/tiktok.png",
    connectPath: "/api/tiktok/oauth/start",
  },
  {
    id: "instagram",
    name: "Instagram",
    family: "meta",
    lifecycle: "connectable",
    logo: "/assets/platforms/instagram.png",
    connectPath: "/api/auth/meta?platform=instagram",
  },
  {
    id: "facebook",
    name: "Facebook",
    family: "meta",
    lifecycle: "connectable",
    logo: "/assets/platforms/facebook.png",
    connectPath: "/api/auth/meta?platform=facebook",
  },
  {
    id: "x",
    name: "X",
    family: "x",
    lifecycle: "connectable",
    logo: "/assets/platforms/x.png",
    connectPath: "/api/auth/x",
  },
];

export function isPlatformId(value: string): value is PlatformId {
  return PLATFORMS.some((item) => item.id === value);
}

export function platformById(id: string) {
  return PLATFORMS.find((item) => item.id === id) || null;
}

export function platformName(id: string) {
  return platformById(id)?.name || id;
}

export function platformAvailability() {
  return {
    tiktok: Boolean(process.env.TIKTOK_CLIENT_KEY?.trim() && process.env.TIKTOK_CLIENT_SECRET?.trim()),
    meta: Boolean(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim()),
    x: Boolean(process.env.X_CLIENT_ID?.trim() && process.env.X_CLIENT_SECRET?.trim()),
  };
}

export type PlatformAvailability = ReturnType<typeof platformAvailability>;

export function familyConfigured(family: PlatformFamily, availability: PlatformAvailability) {
  if (family === "tiktok") return availability.tiktok;
  if (family === "meta") return availability.meta;
  return availability.x;
}
