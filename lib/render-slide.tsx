import { readSlideBytes, savePublicImage } from "./media-files";
import { needsRasterize } from "./recipe";
import type { CarouselRecipe, CarouselSlide } from "./types";
import { ImageResponse } from "next/og";

const FONT_URLS: Record<string, Array<{ weight: 400 | 700 | 800; url: string }>> = {
  Inter: [
    { weight: 400, url: "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf" },
    { weight: 700, url: "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf" },
  ],
  Montserrat: [
    { weight: 400, url: "https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-400-normal.ttf" },
    { weight: 700, url: "https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-700-normal.ttf" },
    { weight: 800, url: "https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-800-normal.ttf" },
  ],
  Poppins: [
    { weight: 400, url: "https://cdn.jsdelivr.net/fontsource/fonts/poppins@latest/latin-400-normal.ttf" },
    { weight: 700, url: "https://cdn.jsdelivr.net/fontsource/fonts/poppins@latest/latin-700-normal.ttf" },
  ],
  Oswald: [
    { weight: 400, url: "https://cdn.jsdelivr.net/fontsource/fonts/oswald@latest/latin-400-normal.ttf" },
    { weight: 700, url: "https://cdn.jsdelivr.net/fontsource/fonts/oswald@latest/latin-700-normal.ttf" },
  ],
  Anton: [{ weight: 400, url: "https://cdn.jsdelivr.net/fontsource/fonts/anton@latest/latin-400-normal.ttf" }],
  "Bebas Neue": [{ weight: 400, url: "https://cdn.jsdelivr.net/fontsource/fonts/bebas-neue@latest/latin-400-normal.ttf" }],
  Outfit: [
    { weight: 400, url: "https://cdn.jsdelivr.net/fontsource/fonts/outfit@latest/latin-400-normal.ttf" },
    { weight: 700, url: "https://cdn.jsdelivr.net/fontsource/fonts/outfit@latest/latin-700-normal.ttf" },
  ],
  "DM Sans": [
    { weight: 400, url: "https://cdn.jsdelivr.net/fontsource/fonts/dm-sans@latest/latin-400-normal.ttf" },
    { weight: 700, url: "https://cdn.jsdelivr.net/fontsource/fonts/dm-sans@latest/latin-700-normal.ttf" },
  ],
  "Playfair Display": [
    { weight: 700, url: "https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-700-normal.ttf" },
  ],
};

const fontCache = new Map<string, ArrayBuffer>();

async function loadFont(url: string) {
  const hit = fontCache.get(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error("font_missing");
  const data = await res.arrayBuffer();
  fontCache.set(url, data);
  return data;
}

async function fontsFor(recipe: CarouselRecipe, slide: CarouselSlide) {
  const names = new Set<string>([recipe.fontFamily, ...slide.overlays.map((overlay) => overlay.fontFamily)]);
  const fonts: Array<{ name: string; data: ArrayBuffer; weight: 400 | 700 | 800; style: "normal" }> = [];
  for (const name of names) {
    const files = FONT_URLS[name] || FONT_URLS.Montserrat;
    for (const file of files) {
      try {
        fonts.push({ name, data: await loadFont(file.url), weight: file.weight, style: "normal" });
      } catch {
        // Satori falls back to the default font.
      }
    }
  }
  return fonts;
}

function alignTransform(align: CarouselSlide["overlays"][number]["align"]) {
  if (align === "left") return "translate(0, -50%)";
  if (align === "right") return "translate(-100%, -50%)";
  return "translate(-50%, -50%)";
}

async function dataUrl(url?: string) {
  if (!url) return "";
  const file = await readSlideBytes(url);
  if (!file) return "";
  return `data:${file.contentType};base64,${file.bytes.toString("base64")}`;
}

export async function rasterizeSlide(slide: CarouselSlide, recipe: CarouselRecipe) {
  const keepPhoto = Boolean(slide.keepPhoto);
  const photo = keepPhoto ? await dataUrl(slide.sourceImage || slide.image) : "";
  const background = slide.backgroundColor || "#111111";
  const fonts = await fontsFor(recipe, slide);
  const png = new ImageResponse(
    (
      <div
        style={{
          width: 1080,
          height: 1920,
          display: "flex",
          position: "relative",
          backgroundColor: background,
          backgroundImage: slide.backgroundColor2 && !keepPhoto ? `linear-gradient(180deg, ${background}, ${slide.backgroundColor2})` : undefined,
        }}
      >
        {photo ? (
          <img src={photo} width={1080} height={1920} style={{ position: "absolute", inset: 0, objectFit: "cover" }} />
        ) : null}
        {slide.overlays
          .filter((overlay) => overlay.text.trim())
          .map((overlay) => (
            <div
              key={overlay.id}
              style={{
                position: "absolute",
                left: `${overlay.x}%`,
                top: `${overlay.y}%`,
                width: `${overlay.width ?? 86}%`,
                transform: alignTransform(overlay.align),
                display: "flex",
                justifyContent:
                  overlay.align === "left" ? "flex-start" : overlay.align === "right" ? "flex-end" : "center",
                color: overlay.color,
                fontFamily: overlay.fontFamily,
                fontSize: overlay.fontSize,
                fontWeight: overlay.fontWeight,
                lineHeight: overlay.lineHeight ?? 1.05,
                textAlign: overlay.align,
                whiteSpace: "pre-wrap",
                textShadow: "0 2px 12px rgba(0,0,0,0.45)",
              }}
            >
              {overlay.text}
            </div>
          ))}
      </div>
    ),
    { width: 1080, height: 1920, fonts },
  );
  const bytes = Buffer.from(await png.arrayBuffer());
  return savePublicImage(bytes, "image/png");
}

export async function rasterizeRecipe(recipe: CarouselRecipe) {
  if (!needsRasterize(recipe)) {
    return recipe.slides.map((slide) => slide.image).filter(Boolean);
  }
  const urls: string[] = [];
  for (const slide of recipe.slides) {
    if (slide.overlays.some((overlay) => overlay.text.trim()) || slide.backgroundColor) {
      urls.push(await rasterizeSlide(slide, recipe));
    } else if (slide.image) {
      urls.push(slide.image);
    }
  }
  return urls;
}
