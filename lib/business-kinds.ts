import type { BusinessKind } from "./types";

export const BUSINESS_KINDS: { id: BusinessKind; fr: string; en: string }[] = [
  { id: "saas", fr: "SaaS / logiciel", en: "SaaS / software" },
  { id: "ecommerce", fr: "E-commerce", en: "E-commerce" },
  { id: "mobile_app", fr: "App mobile", en: "Mobile app" },
  { id: "creator", fr: "Créateur / marque perso", en: "Creator / personal brand" },
  { id: "agency", fr: "Agence", en: "Agency" },
  { id: "service", fr: "Service / coaching", en: "Service / coaching" },
  { id: "media", fr: "Média / newsletter", en: "Media / newsletter" },
  { id: "other", fr: "Autre", en: "Other" },
];
