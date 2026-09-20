import type { ReactNode } from "react";

export type NavItem = {
  href: string;
  fr: string;
  en: string;
  icon: string;
  locked?: boolean;
  badge?: boolean;
  highlight?: boolean;
  section?: "main" | "bottom" | "menu";
};

// Outils (Poster aux US, Shadowban, Comptes warmes) retires le temps de l'audit
// Direct Post de TikTok, a la demande d'Amine. Remettre `true` pour tout rouvrir :
// l'entree de menu et les quatre routes reviennent, rien d'autre n'a ete supprime.
export const TOOLS_ENABLED = false;

const ALL_NAV: NavItem[] = [
  { href: "/app/home", fr: "Overview", en: "Overview", icon: "home", section: "main" },
  { href: "/app", fr: "Calendrier", en: "Calendar", icon: "calendar", section: "main" },
  // Inspiration = Recherche + Bibliotheque : une seule entree, deux onglets
  // (INSPIRATION_TABS). Les deux routes restent, les liens profonds aussi.
  { href: "/app/discover", fr: "Inspiration", en: "Inspiration", icon: "media", section: "main" },
  // Outils = Poster aux US + Shadowban + Comptes warmes : une entree, une page
  // d'accueil en cartes (STUDIO_TOOLS). Les routes des outils ne changent pas.
  { href: "/app/tools", fr: "Outils", en: "Tools", icon: "tools", section: "main" },
  { href: "/app/integrations", fr: "Comptes", en: "Accounts", icon: "tiktok", section: "bottom" },
  { href: "/app/support", fr: "Support", en: "Support", icon: "support", section: "menu" },
  // Revenus, Agents et Comptes suivis sont des onglets des Reglages
  // (?tab=revenue|agents|tracked) ; leurs anciennes routes y redirigent.
  { href: "/app/settings", fr: "Réglages", en: "Settings", icon: "settings", section: "bottom" },
];

export const STUDIO_NAV: NavItem[] = ALL_NAV.filter((item) => TOOLS_ENABLED || item.href !== "/app/tools");

// Le cadenas d'un outil doit dire la meme chose que sa carte « bientot disponible ».
export const STUDIO_TOOLS: (NavItem & { frHint: string; enHint: string })[] = [
  { href: "/app/post-us", fr: "Poster aux US", en: "Post to the US", icon: "globe", frHint: "Téléphone dédié, audience américaine.", enHint: "Dedicated phone, US audience." },
  { href: "/app/unshadowban", fr: "Shadowban", en: "Shadowban", icon: "unshadowban", frHint: "Vérifie la diffusion de tes comptes.", enHint: "Check your accounts' reach." },
  { href: "/app/warmed-accounts", fr: "Comptes warmés", en: "Warmed Accounts", icon: "warmed", locked: true, frHint: "Bientôt disponible.", enHint: "Coming soon." },
];

export const PAGE_TITLES = [...STUDIO_NAV, ...STUDIO_TOOLS].map(({ href, fr, en }) => ({ href, fr, en }));

export const INSPIRATION_TABS = [
  { href: "/app/discover", fr: "Recherche", en: "Research" },
  { href: "/app/marketplace", fr: "Bibliothèque", en: "Library" },
];

export function onInspiration(pathname: string) {
  return INSPIRATION_TABS.some((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`));
}

export function navActive(pathname: string, href: string) {
  if (href === "/app/discover") return onInspiration(pathname);
  if (href === "/app/tools") {
    return pathname === href || STUDIO_TOOLS.some((tool) => pathname === tool.href || pathname.startsWith(`${tool.href}/`));
  }
  if (href === "/app") return pathname === "/app" || pathname === "/app/calendar";
  if (href === "/app/home") return pathname === "/app/home";
  return pathname === href || pathname.startsWith(`${href}/`);
}
