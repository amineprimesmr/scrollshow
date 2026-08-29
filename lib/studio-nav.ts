import type { ReactNode } from "react";

export type NavItem = {
  href: string;
  fr: string;
  en: string;
  icon: string;
  locked?: boolean;
  badge?: boolean;
  highlight?: boolean;
  section?: "main" | "bottom";
};

export const STUDIO_NAV: NavItem[] = [
  { href: "/app/home", fr: "Accueil", en: "Home", icon: "home", section: "main" },
  { href: "/app", fr: "Calendrier", en: "Calendar", icon: "calendar", section: "main" },
  { href: "/app/unshadowban", fr: "Shadowban", en: "Shadowban", icon: "unshadowban", section: "main" },
  { href: "/app/marketplace", fr: "Bibliothèque", en: "Library", icon: "media", section: "main" },
  { href: "/app/analytics", fr: "Analytics", en: "Analytics", icon: "chart", section: "main" },
  { href: "/app/warmed-accounts", fr: "Comptes warmés", en: "Warmed Accounts", icon: "warmed", section: "main" },
  { href: "/app/integrations", fr: "Comptes", en: "Accounts", icon: "tiktok", section: "bottom" },
  { href: "/app/mcp", fr: "MCP", en: "MCP", icon: "mcp", section: "bottom" },
  { href: "/app/settings", fr: "Réglages", en: "Settings", icon: "settings", section: "bottom" },
];

export const PAGE_TITLES = STUDIO_NAV.map(({ href, fr, en }) => ({ href, fr, en }));

export function navActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app" || pathname === "/app/calendar";
  if (href === "/app/home") return pathname === "/app/home";
  return pathname === href || pathname.startsWith(`${href}/`);
}
