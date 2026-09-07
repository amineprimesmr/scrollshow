export type WarmedRegion = "us" | "eu";
export type WarmedPlatform = "tiktok" | "instagram";

export type WarmedListing = {
  id: string;
  platform: WarmedPlatform;
  region: WarmedRegion;
  ageDays: number;
  followersMin: number;
  followersMax: number;
  monthlyEur: number;
  setupEur: number;
  fr: string;
  en: string;
  includes: { fr: string; en: string }[];
};

const COMMON_INCLUDES = [
  { fr: "Vrai téléphone dédié, jamais de SIM, VPN résidentiel du pays", en: "Real dedicated phone, never a SIM, in-country residential VPN" },
  { fr: "Warm-up manuel 14 jours : scroll, likes, commentaires natifs", en: "14-day manual warm-up: scroll, likes, native comments" },
  { fr: "Connexion à ScrollShow prête (OAuth fait depuis le téléphone)", en: "ScrollShow connection ready (OAuth done from the phone)" },
  { fr: "Remplacement gratuit si le compte est banni dans les 30 jours", en: "Free replacement if the account is banned within 30 days" },
];

export const WARMED_CATALOG: WarmedListing[] = [
  {
    id: "tiktok-us-starter",
    platform: "tiktok",
    region: "us",
    ageDays: 30,
    followersMin: 0,
    followersMax: 200,
    monthlyEur: 80,
    setupEur: 0,
    fr: "TikTok US · Starter",
    en: "TikTok US · Starter",
    includes: COMMON_INCLUDES,
  },
  {
    id: "tiktok-us-warm",
    platform: "tiktok",
    region: "us",
    ageDays: 90,
    followersMin: 500,
    followersMax: 2000,
    monthlyEur: 140,
    setupEur: 60,
    fr: "TikTok US · Warmé 90 jours",
    en: "TikTok US · 90-day warmed",
    includes: [...COMMON_INCLUDES, { fr: "Historique de 10+ posts natifs avec vues US", en: "10+ native posts history with US views" }],
  },
  {
    id: "tiktok-eu-starter",
    platform: "tiktok",
    region: "eu",
    ageDays: 30,
    followersMin: 0,
    followersMax: 200,
    monthlyEur: 60,
    setupEur: 0,
    fr: "TikTok EU · Starter",
    en: "TikTok EU · Starter",
    includes: COMMON_INCLUDES,
  },
  {
    id: "instagram-us-starter",
    platform: "instagram",
    region: "us",
    ageDays: 45,
    followersMin: 100,
    followersMax: 500,
    monthlyEur: 90,
    setupEur: 0,
    fr: "Instagram US · Starter",
    en: "Instagram US · Starter",
    includes: COMMON_INCLUDES,
  },
  {
    id: "instagram-eu-starter",
    platform: "instagram",
    region: "eu",
    ageDays: 45,
    followersMin: 100,
    followersMax: 500,
    monthlyEur: 70,
    setupEur: 0,
    fr: "Instagram EU · Starter",
    en: "Instagram EU · Starter",
    includes: COMMON_INCLUDES,
  },
];

export function findListing(id: string) {
  return WARMED_CATALOG.find((item) => item.id === id) || null;
}
