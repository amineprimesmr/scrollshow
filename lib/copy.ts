export type Lang = "fr" | "en";

export function detectLang(header?: string | null): Lang {
  const value = (header || "").toLowerCase();
  if (value.includes("fr")) return "fr";
  return value.includes("en") ? "en" : "fr";
}

export const copy = {
  fr: {
    brand: "ScrollShow",
    tagline: "Le QG de recherche des carrousels TikTok.",
    hero: "Trouve les comptes slideshow qui cartonnent. Analyse le format. Garde une bibliothèque.",
    heroSub:
      "ScrollShow est le SaaS pour rechercher, juger et classer les comptes TikTok photo-slideshow — indépendant, rapide, fait pour les fondateurs qui publient.",
    cta: "Créer mon espace",
    login: "Connexion",
    signup: "Créer un compte",
    product: "Produit",
    pricing: "Tarifs",
    library: "Bibliothèque",
    discover: "Découverte",
    settings: "Réglages",
    logout: "Déconnexion",
    email: "Email",
    password: "Mot de passe",
    name: "Prénom",
    free: "Gratuit",
    pro: "Pro",
  },
  en: {
    brand: "ScrollShow",
    tagline: "Research HQ for TikTok carousels.",
    hero: "Find the slideshow accounts that actually win. Break down the format. Keep a library.",
    heroSub:
      "ScrollShow is the SaaS for finding, judging, and filing TikTok photo-slideshow accounts — independent, fast, built for founders who publish.",
    cta: "Create my workspace",
    login: "Log in",
    signup: "Create account",
    product: "Product",
    pricing: "Pricing",
    library: "Library",
    discover: "Discover",
    settings: "Settings",
    logout: "Log out",
    email: "Email",
    password: "Password",
    name: "First name",
    free: "Free",
    pro: "Pro",
  },
} as const;
