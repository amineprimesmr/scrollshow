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
  { href: "/app/blitz", fr: "Blitz", en: "Blitz", icon: "blitz", section: "main" },
  { href: "/app/library", fr: "Bibliothèque inspiration", en: "Inspiration Library", icon: "library", locked: true, section: "main" },
  { href: "/app/automations", fr: "Automations", en: "Automations", icon: "automations", section: "main" },
  { href: "/app/ai-studio", fr: "AI Studio", en: "AI Studio", icon: "studio", section: "main" },
  { href: "/app/influencers", fr: "Influenceurs", en: "Influencers", icon: "influencers", section: "main" },
  { href: "/app/content", fr: "Contenu", en: "Content", icon: "content", badge: true, section: "main" },
  { href: "/app/marketplace", fr: "Bibliothèque", en: "Library", icon: "media", section: "main" },
  { href: "/app", fr: "Calendrier", en: "Calendar", icon: "calendar", section: "main" },
  { href: "/app/analytics", fr: "Analytics", en: "Analytics", icon: "chart", section: "main" },
  { href: "/app/warmed-accounts", fr: "Comptes warmés", en: "Warmed Accounts", icon: "warmed", locked: true, section: "main" },
  { href: "/app/billing", fr: "Upgrade", en: "Upgrade", icon: "upgrade", highlight: true, section: "bottom" },
  { href: "/app/affiliate", fr: "Parrainer", en: "Refer & Earn", icon: "gift", section: "bottom" },
  { href: "/app/brand", fr: "Marque", en: "Brand", icon: "brand", badge: true, section: "bottom" },
  { href: "/app/guide", fr: "Guide", en: "Guide", icon: "guide", section: "bottom" },
  { href: "/app/integrations", fr: "Connexions", en: "Connect", icon: "plug", section: "bottom" },
  { href: "/app/mcp", fr: "MCP", en: "MCP", icon: "mcp", section: "bottom" },
  { href: "/app/settings", fr: "Réglages", en: "Settings", icon: "settings", section: "bottom" },
];

export const PAGE_TITLES = STUDIO_NAV.map(({ href, fr, en }) => ({ href, fr, en }));

export function navActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app" || pathname === "/app/calendar";
  if (href === "/app/home") return pathname === "/app/home";
  return pathname === href || pathname.startsWith(`${href}/`);
}
