import { generateText, Output } from "ai";
import { z } from "zod";
import { readSlideBytes } from "./media-files";
import {
  closestFont,
  defaultOverlay,
  defaultSlide,
  RECIPE_FONTS,
} from "./recipe";
import type { CarouselRecipe, CarouselSlide } from "./types";

const MODEL = "google/gemini-3.5-flash";

export class ReconstructError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

const num = z.union([z.number(), z.string()]);

const analyzedOverlaySchema = z.object({
  text: z.string(),
  fontFamily: z.string().optional(),
  fontSize: num.optional(),
  fontWeight: num.optional(),
  color: z.string().optional(),
  x: num.optional(),
  y: num.optional(),
  align: z.string().optional(),
  width: num.optional(),
  lineHeight: num.optional(),
  backdrop: z.string().optional(),
});

const analyzedSlideSchema = z.object({
  backgroundType: z.string(),
  backgroundColor: z.string(),
  backgroundColor2: z.string().optional(),
  keepPhoto: z.boolean().optional(),
  fontFamily: z.string().optional(),
  overlays: z.array(analyzedOverlaySchema).max(12),
});

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function asNumber(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function namedHex(value: string | undefined, fallback = "#ffffff") {
  const raw = String(value || "").trim().toLowerCase();
  const named: Record<string, string> = {
    white: "#ffffff",
    black: "#000000",
    red: "#ef4444",
    yellow: "#facc15",
    orange: "#f97316",
    pink: "#fb7185",
    blue: "#3b82f6",
    green: "#22c55e",
    gray: "#a1a1aa",
    grey: "#a1a1aa",
  };
  if (named[raw]) return named[raw];
  const short = raw.match(/^#?([0-9a-f]{3})$/i);
  if (short) {
    const s = short[1];
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
  }
  const full = raw.match(/^#?([0-9a-f]{6})$/i);
  if (full) return `#${full[1]}`;
  return fallback;
}

function gatewayMissing(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/credit card|customer_verification|add-credit-card|unlock your free credits/i.test(message)) {
    return "ai_gateway_billing";
  }
  if (/api key|unauthoriz|ai_gateway|oidc|forbidden|401|403|credential|missing.*key|no.*key|loadapikey|authentication/i.test(message)) {
    return "ai_gateway_missing";
  }
  return null;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function analyzeSlide(imageUrl: string) {
  const file = await readSlideBytes(imageUrl);
  if (!file) throw new ReconstructError("image_missing", 400);
  const mediaType = file.contentType.startsWith("image/") ? file.contentType : "image/jpeg";
  const result = await generateText({
    model: MODEL,
    maxOutputTokens: 2000,
    output: Output.object({
      schema: analyzedSlideSchema,
      name: "tiktok_slide",
      description: "Editable layers that recreate this TikTok carousel slide at 1080x1920.",
    }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Reconstruct this TikTok photo-carousel slide as editable layers on a 1080x1920 canvas.

Available fonts: ${RECIPE_FONTS.join(", ")}. Pick the closest match.

Rules:
- Copy EVERY visible text exactly, including line breaks, casing, emojis and typos.
- fontSize is pixels at 1080px width.
- x and y are percentages of the canvas. They are the anchor of the text block (center if align=center, left edge if align=left, right edge if align=right). y is the vertical center of the block.
- width is the text box width as a percentage of the canvas (usually 78-92).
- If the background is a flat color or simple gradient, keepPhoto=false and set backgroundColor (and backgroundColor2 for a gradient).
- If the background is a real photograph, keepPhoto=true, keep the photo, still extract the texts, and set backdrop to a hex color that covers the original baked text behind each overlay.
- Prefer 1-4 overlay blocks, not one overlay per word.
- Colors as #rrggbb.
- align is left, center or right.`,
          },
          {
            type: "file",
            mediaType,
            data: new Uint8Array(file.bytes),
          },
        ],
      },
    ],
  });
  if (!result.output) throw new ReconstructError("reconstruct_failed", 500);
  return result.output;
}

function toSlide(current: CarouselSlide, analyzed: z.infer<typeof analyzedSlideSchema>): CarouselSlide {
  const overlays = analyzed.overlays.filter((overlay) => overlay.text.trim());
  const keepPhoto = Boolean(analyzed.keepPhoto) || String(analyzed.backgroundType).toLowerCase() === "photo";
  if (!overlays.length) {
    return defaultSlide(current.image, {
      id: current.id,
      sourceImage: current.sourceImage || current.image,
      keepPhoto: true,
      overlays: [],
    });
  }
  return defaultSlide(current.image, {
    id: current.id,
    sourceImage: current.sourceImage || current.image,
    backgroundColor: namedHex(analyzed.backgroundColor, "#111111"),
    backgroundColor2: analyzed.backgroundColor2 ? namedHex(analyzed.backgroundColor2, namedHex(analyzed.backgroundColor)) : undefined,
    keepPhoto,
    html: undefined,
    css: undefined,
    overlays: overlays.map((overlay) => {
      const align = overlay.align === "left" || overlay.align === "right" ? overlay.align : "center";
      return defaultOverlay({
        text: overlay.text.replace(/\r\n/g, "\n").trim(),
        fontFamily: closestFont(overlay.fontFamily || ""),
        fontSize: clamp(Math.round(asNumber(overlay.fontSize, 64)), 18, 200),
        fontWeight: clamp(Math.round(asNumber(overlay.fontWeight, 800)), 400, 900),
        color: namedHex(overlay.color),
        x: clamp(asNumber(overlay.x, 50), 4, 96),
        y: clamp(asNumber(overlay.y, 78), 4, 96),
        align,
        width: clamp(asNumber(overlay.width, 86), 40, 96),
        lineHeight: clamp(asNumber(overlay.lineHeight, 1.05), 0.85, 1.5),
        backdrop: keepPhoto ? namedHex(overlay.backdrop, "#000000") : overlay.backdrop ? namedHex(overlay.backdrop) : undefined,
      });
    }),
  });
}

export async function reconstructRecipe(recipe: CarouselRecipe): Promise<CarouselRecipe> {
  if (!recipe.slides.length) throw new ReconstructError("no_slides", 400);
  try {
    const slides = await mapPool(recipe.slides, 2, async (slide) => {
      const source = slide.sourceImage || slide.image;
      if (!source) return slide;
      const analyzed = await analyzeSlide(source);
      return toSlide(slide, analyzed);
    });
    const fontFamily = closestFont(slides[0]?.overlays[0]?.fontFamily || recipe.fontFamily);
    return {
      ...recipe,
      origin: recipe.origin || "import",
      fontFamily,
      editable: true,
      prompt: recipe.prompt,
      slides,
    };
  } catch (error) {
    console.error("[reconstruct]", error);
    if (error instanceof ReconstructError) throw error;
    const gated = gatewayMissing(error);
    if (gated) throw new ReconstructError(gated, 503);
    throw new ReconstructError("reconstruct_failed", 500);
  }
}
