/** Recherches autorisées sans compte : la clé Monid est partagée, on borne son usage. */
export const MONID_CATEGORIES = [
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
  { key: "scraping web", label: "Scraping" },
  { key: "recherche web", label: "Recherche" },
  { key: "images et vidéos", label: "Médias" },
  { key: "enrichissement de données", label: "Data" },
  { key: "e-commerce", label: "E-commerce" },
] as const;

export const MONID_CATEGORY_KEYS: readonly string[] = MONID_CATEGORIES.map(c => c.key);

export function isPublicMonidQuery(query: string) {
  return MONID_CATEGORY_KEYS.includes(query.trim().toLowerCase());
}
