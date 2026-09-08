"use client";

import { ImageGeneration } from "img-fx";
import { Orb } from "./Orb";
import { useAppTheme, useReducedMotion } from "./useFx";

/** Route-level loading state: three "generating" cards under a thinking orb. */
export function StudioLoading({ label }: { label: string }) {
  const theme = useAppTheme();
  const reduced = useReducedMotion();
  const presets = ["pixels-organic", "sweep-gradient", "pixels-mechanic"] as const;
  return (
    <div className="ss-loading-skel ss-loading-skel--fx" aria-busy="true">
      <div className="ss-loading-skel__head">
        <Orb state="working" size={20} label={label} />
        <span>{label}</span>
      </div>
      <div className="ss-loading-skel__grid">
        {presets.map((preset) =>
          reduced ? (
            <div key={preset} className="ss-loading-skel__card" />
          ) : (
            <ImageGeneration key={preset} preset={preset} theme={theme} strength={0.55} pixelScale={0.8} paused={reduced} style={{ display: "block" }}>
              <div className="ss-loading-skel__card is-fx" />
            </ImageGeneration>
          ),
        )}
      </div>
    </div>
  );
}
