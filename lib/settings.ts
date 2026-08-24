import type { User, UserSettings } from "./types";

export const DEFAULT_SETTINGS: UserSettings = {
  timezone: "Europe/Paris",
  weekStartsOn: 1,
  defaultPostTime: "18:00",
  defaultPrivacy: "PUBLIC_TO_EVERYONE",
  defaultStatus: "scheduled",
  disableComments: false,
  disableDuet: true,
  disableStitch: true,
  autoAddMusic: true,
  brandContent: false,
  brandOrganic: false,
};

export const TIMEZONES = [
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Lisbon",
  "Africa/Casablanca",
  "Africa/Tunis",
  "Africa/Algiers",
  "America/New_York",
  "America/Toronto",
  "America/Chicago",
  "America/Mexico_City",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Indian/Reunion",
  "UTC",
];

export const PRIVACY_LEVELS = [
  { id: "PUBLIC_TO_EVERYONE", fr: "Tout le monde", en: "Everyone" },
  { id: "MUTUAL_FOLLOW_FRIENDS", fr: "Amis", en: "Friends" },
  { id: "FOLLOWER_OF_CREATOR", fr: "Abonnés", en: "Followers" },
  { id: "SELF_ONLY", fr: "Moi uniquement", en: "Only me" },
] as const;

export function resolveSettings(user?: Pick<User, "settings"> | null): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...user?.settings,
    weekStartsOn: user?.settings?.weekStartsOn === 0 ? 0 : 1,
    disableComments: Boolean(user?.settings?.disableComments),
    disableDuet: user?.settings?.disableDuet !== false,
    disableStitch: user?.settings?.disableStitch !== false,
    autoAddMusic: user?.settings?.autoAddMusic !== false,
    brandContent: Boolean(user?.settings?.brandContent),
    brandOrganic: Boolean(user?.settings?.brandOrganic),
  };
}

export function isValidTimezone(value: string) {
  if (TIMEZONES.includes(value) || value === "UTC") return true;
  if (!value.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function dateInTimeZone(timeZone: string, date = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function formatInTimeZone(
  timeZone: string,
  locale: string,
  date = new Date(),
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  },
) {
  try {
    return date.toLocaleString(locale, { timeZone, ...options });
  } catch {
    return date.toLocaleString(locale, options);
  }
}

export function tiktokPostFlags(settings: UserSettings) {
  return {
    disable_comment: settings.disableComments,
    disable_duet: settings.disableDuet,
    disable_stitch: settings.disableStitch,
    auto_add_music: settings.autoAddMusic,
    brand_content_toggle: settings.brandContent,
    brand_organic_toggle: settings.brandOrganic,
  };
}
