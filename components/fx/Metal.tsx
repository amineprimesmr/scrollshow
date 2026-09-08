"use client";

import { isMetalFxSupported, MetalFx, type MetalFxPreset, type MetalFxVariant } from "metal-fx";
import { useEffect, useState, type ReactNode } from "react";
import { useAppTheme, useReducedMotion } from "./useFx";

type MetalProps = {
  children: ReactNode;
  variant?: MetalFxVariant;
  preset?: MetalFxPreset;
  strength?: number;
  className?: string;
  /** Keep the child's own border and shadow (metal-fx strips them by default). */
  keepStyles?: boolean;
};

/**
 * Liquid-metal ring around a single control. Renders the plain child before
 * hydration, on browsers without WebGL2, and freezes under reduced motion.
 */
export function Metal({ children, variant = "button", preset = "chromatic", strength = 0.9, className, keepStyles = false }: MetalProps) {
  const theme = useAppTheme();
  const reduced = useReducedMotion();
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(isMetalFxSupported()), []);
  if (!supported) return <>{children}</>;
  return (
    <MetalFx variant={variant} preset={preset} theme={theme} strength={strength} paused={reduced} normalizeHostStyles={!keepStyles} className={className} style={{ display: "inline-flex" }}>
      {children}
    </MetalFx>
  );
}
