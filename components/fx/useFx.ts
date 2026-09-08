"use client";

import { useEffect, useState } from "react";

export type AppTheme = "dark" | "light";

/**
 * The app's resolved theme: the `data-theme` attribute the root layout stamps
 * on <html>, falling back to the OS preference when the user chose "system".
 * The effect libraries default to `prefers-color-scheme` only, which ignores
 * the in-app toggle, so every effect is driven from this instead.
 */
export function useAppTheme(): AppTheme {
  const [theme, setTheme] = useState<AppTheme>("dark");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => {
      const attr = document.documentElement.dataset.theme;
      setTheme(attr === "light" ? "light" : attr === "dark" ? "dark" : mq.matches ? "dark" : "light");
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    mq.addEventListener("change", read);
    return () => {
      observer.disconnect();
      mq.removeEventListener("change", read);
    };
  }, []);
  return theme;
}

/** True once mounted when the user asked for reduced motion. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduced(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return reduced;
}

/** True after hydration; effects that need the DOM render their plain child before. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
