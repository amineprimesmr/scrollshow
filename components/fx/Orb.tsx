"use client";

import { ThinkingOrb, type OrbSize, type OrbState } from "thinking-orbs";
import { useAppTheme } from "./useFx";

type OrbProps = {
  state?: OrbState;
  size?: OrbSize;
  /** Set when the orb sits on an inverted surface (a black-on-white button). */
  invert?: boolean;
  label?: string;
  className?: string;
};

/** A thinking orb pinned to the app theme rather than the OS preference. */
export function Orb({ state = "working", size = 20, invert = false, label, className }: OrbProps) {
  const theme = useAppTheme();
  const resolved = invert ? (theme === "dark" ? "light" : "dark") : theme;
  return <ThinkingOrb state={state} size={size} theme={resolved} className={className} aria-label={label} style={{ display: "inline-block", verticalAlign: "middle", flex: "none" }} />;
}

/** A centred 64px orb with a line of copy: the block-level loading state. */
export function LoadingOrb({ state = "working", text, className }: { state?: OrbState; text: string; className?: string }) {
  return (
    <div className={`ss-fx-loading ${className || ""}`} role="status">
      <Orb state={state} size={64} label={text} />
      <span>{text}</span>
    </div>
  );
}
