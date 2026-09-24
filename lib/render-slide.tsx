import { withMediaUser, validateMediaInput, type MediaUser } from "./media-permissions";
import { readSlideBytes, savePublicImage } from "./media-files";
import { needsRasterize, slideSize, textShadowFor } from "./recipe";
import type { CarouselRecipe, CarouselSlide } from "./types";
import { ImageResponse } from "next/og";
import sharp from "sharp";

const FONT_URLS: Record<string, Array<{ weight: 400 | 500 | 700 | 800; url: string }>> = {
  "TikTok Sans": [
    { weight: 400, url: "https://cdn.jsdelivr.net/fontsource/fonts/tiktok-sans@latest/latin-400-normal.ttf" },
    { weight: 500, url: "https://cdn.jsdelivr.net/fontsource/fonts/tiktok-sans@latest/latin-500-normal.ttf" },
    { weight: 700, url: "https://cdn.jsdelivr.net/fontsource/fonts/tiktok-sans@latest/latin-700-normal.ttf" },
  ],
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
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("font_missing");
  const data = await res.arrayBuffer();
  fontCache.set(url, data);
  return data;
}

async function fontsFor(recipe: CarouselRecipe, slide: CarouselSlide) {
  if (!slide.overlays.some(overlay => overlay.text.trim())) return [];
  const names = new Set<string>([recipe.fontFamily, ...slide.overlays.map((overlay) => overlay.fontFamily)]);
  const fonts: Array<{ name: string; data: ArrayBuffer; weight: 400 | 500 | 700 | 800; style: "normal" }> = [];
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

/** Region de la source a garder : couvre le cadre, centree sur le point focal, bornee a l'image. */
export function cropRegion(src: { width: number; height: number }, frame: { width: number; height: number }, crop?: CarouselSlide["crop"]) {
  const zoom = Math.max(1, crop?.zoom ?? 1);
  const scale = Math.min(src.width / frame.width, src.height / frame.height) / zoom;
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const cx = ((crop?.x ?? 50) / 100) * src.width;
  const cy = ((crop?.y ?? 50) / 100) * src.height;
  const left = Math.round(Math.min(Math.max(0, cx - width / 2), src.width - width));
  const top = Math.round(Math.min(Math.max(0, cy - height / 2), src.height - height));
  return { left, top, width, height };
}

async function dataUrl(url: string | undefined, frame: { width: number; height: number }, crop?: CarouselSlide["crop"]) {
  if (!url) return "";
  const file = await readSlideBytes(url);
  if (!file) throw new Error("media_unavailable");
  // Satori cannot decode WebP data URIs. Normalize uploaded and remote images
  // before composition, keeping dimensions bounded and applying EXIF rotation.
  const upright = await sharp(file.bytes, { limitInputPixels: 40_000_000 }).rotate().toBuffer({ resolveWithObject: true });
  const bytes = await sharp(upright.data)
    .extract(cropRegion(upright.info, frame, crop)).resize(frame.width, frame.height, { fit: "fill" }).png().toBuffer();
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

export async function rasterizeSlide(slide: CarouselSlide, recipe: CarouselRecipe) {
  const keepPhoto = Boolean(slide.keepPhoto);
  const size = slideSize(slide, recipe);
  const photo = keepPhoto ? await dataUrl(slide.sourceImage || slide.image, size, slide.crop) : "";
  const background = slide.backgroundColor || "#111111";
  const fonts = await fontsFor(recipe, slide);
  const gradient = slide.backgroundColor2 && !keepPhoto;
  const outerStyle: Record<string, unknown> = {
    width: size.width,
    height: size.height,
    display: "flex",
    position: "relative",
    backgroundColor: background,
  };
  // Satori/css-to-react-native crashes with "Cannot read properties of
  // undefined (reading 'trim')" if a style key is present with an
  // `undefined` value (e.g. backgroundImage) — omit the key entirely instead.
  if (gradient) {
    outerStyle.backgroundImage = `linear-gradient(180deg, ${background}, ${slide.backgroundColor2})`;
  }
  const png = new ImageResponse(
    (
      <div style={outerStyle}>
        {photo ? (
          <img src={photo} width={size.width} height={size.height} style={{ position: "absolute", inset: 0, objectFit: "cover" }} />
        ) : null}
        {slide.overlays
          .filter((overlay) => (overlay.text || "").trim())
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
                color: overlay.color || "#ffffff",
                fontFamily: overlay.fontFamily || recipe.fontFamily,
                fontSize: overlay.fontSize ?? 64,
                fontWeight: overlay.fontWeight ?? 800,
                lineHeight: overlay.lineHeight ?? 1.05,
                textAlign: overlay.align,
                whiteSpace: "pre-wrap",
                textShadow: textShadowFor(overlay),
                background: overlay.backdrop || "transparent",
                padding: overlay.backdrop ? 16 : 0,
                borderRadius: overlay.backdrop ? 16 : 0,
              }}
            >
              {overlay.text}
            </div>
          ))}
      </div>
    ),
    { width: size.width, height: size.height, fonts },
  );
  const bytes = Buffer.from(await png.arrayBuffer());
  return savePublicImage(bytes, "image/png");
}

export async function rasterizeRecipe(recipe: CarouselRecipe, user?: MediaUser): Promise<string[]> {
  if (user) {
    await validateMediaInput(recipe, user);
    return withMediaUser(user, () => renderRecipe(recipe));
  }
  return renderRecipe(recipe);
}
async function renderRecipe(recipe: CarouselRecipe) {
  if (!needsRasterize(recipe)) {
    return recipe.slides.map((slide) => slide.image).filter(Boolean);
  }
  const urls: string[] = [];
  for (const slide of recipe.slides) {
    if (slide.overlays.some((overlay) => (overlay.text || "").trim()) || slide.backgroundColor) {
      urls.push(await rasterizeSlide(slide, recipe));
    } else if (slide.image) {
      urls.push(slide.image);
    }
  }
  return urls;
}
