/** Recherches autorisées sans compte : la clé est partagée, on borne son usage. */
export const CONNECTOR_CATEGORIES = [
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
  { key: "scraping web", label: "Scraping" },
  { key: "recherche web", label: "Recherche" },
  { key: "images et vidéos", label: "Médias" },
  { key: "enrichissement de données", label: "Data" },
  { key: "e-commerce", label: "E-commerce" },
] as const;

export const CONNECTOR_CATEGORY_KEYS: readonly string[] = CONNECTOR_CATEGORIES.map(c => c.key);

export function isPublicConnectorQuery(query: string) {
  return CONNECTOR_CATEGORY_KEYS.includes(query.trim().toLowerCase());
}
