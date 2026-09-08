"use client";

import { ImageGeneration, loadImage, type ImageGenerationHandle, type ImageGenerationPreset } from "img-fx";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useAppTheme, useReducedMotion } from "./useFx";

type FxImageProps = {
  src: string;
  alt?: string;
  width: number;
  height: number;
  radius?: number;
  preset?: ImageGenerationPreset;
  className?: string;
  style?: CSSProperties;
};

/**
 * An <img> that is "generated" in: a pixel-mosaic shader churns while the
 * real image loads, then the image dissolves in over it. Falls back to a
 * plain <img> under reduced motion, or if the reveal never lands (blocked
 * canvas, WebGL unavailable) so nothing ever stays blank.
 */
export function FxImage({ src, alt = "", width, height, radius = 12, preset = "pixels-organic", className, style }: FxImageProps) {
  const ref = useRef<ImageGenerationHandle>(null);
  const theme = useAppTheme();
  const reduced = useReducedMotion();
  const [fallback, setFallback] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reduced || !src) return;
    let alive = true;
    setShown(false);
    setFallback(false);
    const timer = window.setTimeout(() => alive && !shown && setFallback(true), 6000);
    loadImage(src)
      .then(() => alive && ref.current?.triggerReveal({ hold: "manual" }))
      .catch(() => alive && setFallback(true));
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, reduced]);

  if (reduced || fallback || !src) {
    return <img src={src} alt={alt} width={width} height={height} className={className} style={{ borderRadius: radius, objectFit: "cover", ...style }} />;
  }
  return (
    <ImageGeneration
      ref={ref}
      images={src}
      preset={preset}
      theme={theme}
      strength={0.9}
      pixelScale={0.6}
      borderRadius={radius}
      revealFadeOutMs={0}
      onCycle={(event) => {
        if (event.phase === "visible" || event.phase === "reveal") setShown(true);
      }}
      className={className}
      style={{ display: "block", flex: "none", ...style }}
    >
      <div role={alt ? "img" : undefined} aria-label={alt || undefined} style={{ width, height, borderRadius: radius }} />
    </ImageGeneration>
  );
}
