export const PLATFORMS = [{ id: "tiktok", name: "TikTok", color: "#111" }] as const;

export function platformName(id: string) {
  return PLATFORMS.find((item) => item.id === id)?.name || id;
}
