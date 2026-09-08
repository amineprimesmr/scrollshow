"use client";

import { BorderBeam, type BorderBeamColorVariant, type BorderBeamSize } from "border-beam";
import { useState, type ReactNode } from "react";
import { useAppTheme, useReducedMotion } from "./useFx";

type BeamProps = {
  children: ReactNode;
  active?: boolean;
  size?: BorderBeamSize;
  colorVariant?: BorderBeamColorVariant;
  strength?: number;
  className?: string;
  /** Light up on hover / focus instead of a controlled `active`. */
  hover?: boolean;
};

/** Border glow pinned to the app theme; off under reduced motion. */
export function Beam({ children, active = true, size = "md", colorVariant = "mono", strength = 1, className, hover = false }: BeamProps) {
  const theme = useAppTheme();
  const reduced = useReducedMotion();
  const [hot, setHot] = useState(false);
  const on = !reduced && (hover ? hot : active);
  return (
    <BorderBeam
      size={size}
      colorVariant={colorVariant}
      theme={theme}
      strength={strength}
      active={on}
      className={className}
      onMouseEnter={hover ? () => setHot(true) : undefined}
      onMouseLeave={hover ? () => setHot(false) : undefined}
      onFocus={hover ? () => setHot(true) : undefined}
      onBlur={hover ? () => setHot(false) : undefined}
    >
      {children}
    </BorderBeam>
  );
}
