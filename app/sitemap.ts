import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://scrollshow.io";
  return ["", "/pricing", "/signup", "/terms", "/privacy", "/cgu", "/confidentialite", "/support", "/review"].map(
    (path) => ({
      url: `${base}${path}`,
      lastModified: new Date(),
    }),
  );
}
