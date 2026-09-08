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
  /**
   * Let metal-fx strip the child's own border / background / shadow. Off by
   * default: every control here is already styled by the design system and
   * normalising it would erase the button surface (white label on white).
   */
  normalizeHost?: boolean;
};

/**
 * Liquid-metal ring around a single control. Renders the plain child before
 * hydration, on browsers without WebGL2, and freezes under reduced motion.
 */
export function Metal({ children, variant = "button", preset = "chromatic", strength = 0.9, className, normalizeHost = false }: MetalProps) {
  const theme = useAppTheme();
  const reduced = useReducedMotion();
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(isMetalFxSupported()), []);
  if (!supported) return <>{children}</>;
  return (
    <MetalFx variant={variant} preset={preset} theme={theme} strength={strength} paused={reduced} normalizeHostStyles={normalizeHost} className={className} style={{ display: "inline-flex" }}>
      {children}
    </MetalFx>
  );
}
