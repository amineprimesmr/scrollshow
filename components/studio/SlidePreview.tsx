"use client";

import { fontStack, GOOGLE_FONTS_HREF, overlayStyle } from "@/lib/recipe";
import type { CarouselRecipe, CarouselSlide } from "@/lib/types";

export function SlidePreview({
  slide,
  recipe,
  width = 270,
}: {
  slide: CarouselSlide;
  recipe: CarouselRecipe;
  width?: number;
}) {
  const height = Math.round((width * 16) / 9);
  const html = slide.html || recipe.html;
  if (html) {
    const css = [recipe.css, slide.css].filter(Boolean).join("\n");
    return (
      <iframe
        className="ss-slide-preview ss-slide-preview--html"
        title="Slide"
        style={{ width, height }}
        sandbox=""
        srcDoc={`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${GOOGLE_FONTS_HREF}"><style>html,body{margin:0;height:100%;overflow:hidden;background:#111}body{font-family:${fontStack(recipe.fontFamily)};width:100%;height:100%}img{width:100%;height:100%;object-fit:cover;display:block}${css}</style></head><body>${html}</body></html>`}
      />
    );
  }
  return (
    <div className="ss-slide-preview" style={{ width, height, fontFamily: fontStack(recipe.fontFamily) }}>
      {slide.image ? <img src={slide.image} alt="" /> : <div className="ss-slide-preview__empty" />}
      {slide.overlays
        .filter((overlay) => overlay.text.trim())
        .map((overlay) => (
          <div key={overlay.id} style={overlayStyle(overlay, width)}>
            {overlay.text}
          </div>
        ))}
    </div>
  );
}
