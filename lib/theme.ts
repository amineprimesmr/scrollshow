import type { ThemePreference } from "./types";

const KEY = "ss-theme";

/** Persists the preference in this browser and applies it to <html> right away. */
export function setStoredTheme(theme: ThemePreference) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable: still apply for this page */
  }
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const value = localStorage.getItem(KEY);
    return value === "dark" || value === "light" || value === "system" ? value : "dark";
  } catch {
    return "dark";
  }
}
