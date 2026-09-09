import type { ReactNode } from "react";

export type NavItem = {
  href: string;
  fr: string;
  en: string;
  icon: string;
  locked?: boolean;
  badge?: boolean;
  highlight?: boolean;
  group?: "content" | "growth";
  section?: "main" | "bottom" | "menu";
};

export const STUDIO_NAV: NavItem[] = [
  { href: "/app/home", fr: "Publications et stats", en: "Overview", icon: "home", section: "main", group: "content" },
  { href: "/app", fr: "Calendrier", en: "Calendar", icon: "calendar", section: "main", group: "content" },
  { href: "/app/discover", fr: "Recherche", en: "Research", icon: "globe", section: "main", group: "content" },
  { href: "/app/unshadowban", fr: "Shadowban", en: "Shadowban", icon: "unshadowban", section: "main", group: "growth" },
  { href: "/app/marketplace", fr: "Bibliothèque", en: "Library", icon: "media", section: "main", group: "content" },
  { href: "/app/post-us", fr: "Poster aux US", en: "Post to the US", icon: "globe", section: "main", group: "growth" },
  { href: "/app/warmed-accounts", fr: "Comptes warmés", en: "Warmed Accounts", icon: "warmed", section: "main", group: "growth" },
  { href: "/app/integrations", fr: "Comptes", en: "Accounts", icon: "tiktok", section: "bottom" },
  { href: "/app/mcp", fr: "Agents", en: "Agents", icon: "mcp", section: "bottom" },
  { href: "/app/support", fr: "Support", en: "Support", icon: "support", section: "menu" },
  { href: "/app/clippers", fr: "Devenir clipper", en: "Become a clipper", icon: "user", section: "bottom" },
  { href: "/app/settings", fr: "Réglages", en: "Settings", icon: "settings", section: "menu" },
];

export const PAGE_TITLES = STUDIO_NAV.map(({ href, fr, en }) => ({ href, fr, en }));

export function navActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app" || pathname === "/app/calendar";
  if (href === "/app/home") return pathname === "/app/home";
  return pathname === href || pathname.startsWith(`${href}/`);
}
