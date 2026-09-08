"use client";

import { useEffect } from "react";

/* Displacement map: red = x, green = y, neutral (#808000) in the centre so
   only the rim refracts, like a real lens edge. Stretched to each element. */
const MAP =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' preserveAspectRatio='none'>" +
      "<defs>" +
      "<linearGradient id='r' x1='0' x2='1' y1='0' y2='0'><stop offset='0' stop-color='#000'/><stop offset='1' stop-color='#f00'/></linearGradient>" +
      "<linearGradient id='g' x1='0' x2='0' y1='0' y2='1'><stop offset='0' stop-color='#000'/><stop offset='1' stop-color='#0f0'/></linearGradient>" +
      "<filter id='b'><feGaussianBlur stdDeviation='5'/></filter>" +
      "</defs>" +
      "<rect width='100' height='100' fill='url(#r)'/>" +
      "<rect width='100' height='100' fill='url(#g)' style='mix-blend-mode:screen'/>" +
      "<rect x='7' y='7' width='86' height='86' rx='28' fill='#808000' filter='url(#b)'/>" +
      "</svg>",
  );

/**
 * Global SVG filter for Liquid Glass edge refraction, plus the engine gate.
 * Only Chromium renders SVG filters inside backdrop-filter; WebKit and Gecko
 * silently drop the whole backdrop, so the class is added only where it works.
 */
export function LiquidGlassDefs() {
  useEffect(() => {
    const ua = navigator.userAgent;
    const chromium = /Chrom(e|ium)\//.test(ua) && !/CriOS|FxiOS/.test(ua);
    let ok = false;
    try {
      ok = chromium && CSS.supports("backdrop-filter", "url(#lg-lens)");
    } catch {
      ok = false;
    }
    document.documentElement.classList.toggle("lg-refract", ok);
  }, []);

  return (
    <svg width="0" height="0" aria-hidden style={{ position: "absolute", pointerEvents: "none" }}>
      <defs>
        <filter id="lg-lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" href={MAP} />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="-28" xChannelSelector="R" yChannelSelector="G" result="disp" />
          <feGaussianBlur in="disp" stdDeviation="5" />
        </filter>
      </defs>
    </svg>
  );
}
