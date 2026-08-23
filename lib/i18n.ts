export function prefersEnglish(header?: string | null) {
  const value = (header || (typeof navigator !== "undefined" ? navigator.languages?.join(",") || navigator.language : "") || "").toLowerCase();
  if (value.includes("fr")) return false;
  return value.includes("en");
}

export function t(fr: string, en: string, english: boolean) {
  return english ? en : fr;
}
