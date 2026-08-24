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

const analyzedOverlaySchema = z.object({
  text: z.string(),
  fontFamily: z.string(),
  fontSize: z.number(),
  fontWeight: z.number(),
  color: z.string(),
  x: z.number(),
  y: z.number(),
  align: z.enum(["left", "center", "right"]),
  width: z.number(),
  lineHeight: z.number().optional(),
});

const analyzedSlideSchema = z.object({
  backgroundType: z.enum(["solid", "gradient", "photo"]),
  backgroundColor: z.string(),
  backgroundColor2: z.string().optional(),
  keepPhoto: z.boolean(),
  fontFamily: z.string(),
  overlays: z.array(analyzedOverlaySchema).max(12),
});

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function namedHex(value: string, fallback = "#ffffff") {
  const raw = value.trim().toLowerCase();
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
  return /api key|unauthoriz|ai_gateway|oidc|forbidden|401|403|credential/i.test(message);
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
- If the background is a real photograph, keepPhoto=true and still extract the texts.
- Prefer 1-4 overlay blocks, not one overlay per word.
- Colors as #rrggbb.`,
          },
          { type: "image", image: file.bytes, mediaType: file.contentType },
        ],
      },
    ],
  });
  if (!result.output) throw new ReconstructError("reconstruct_failed", 500);
  return result.output;
}

function toSlide(current: CarouselSlide, analyzed: z.infer<typeof analyzedSlideSchema>): CarouselSlide {
  const overlays = analyzed.overlays.filter((overlay) => overlay.text.trim());
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
    keepPhoto: false,
    html: undefined,
    css: undefined,
    overlays: overlays.map((overlay) =>
        defaultOverlay({
          text: overlay.text.replace(/\r\n/g, "\n").trim(),
          fontFamily: closestFont(overlay.fontFamily),
          fontSize: clamp(Math.round(overlay.fontSize), 18, 200),
          fontWeight: clamp(Math.round(overlay.fontWeight), 400, 900),
          color: namedHex(overlay.color),
          x: clamp(overlay.x, 4, 96),
          y: clamp(overlay.y, 4, 96),
          align: overlay.align,
          width: clamp(overlay.width, 40, 96),
          lineHeight: clamp(overlay.lineHeight || 1.05, 0.85, 1.5),
        }),
      ),
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
    if (error instanceof ReconstructError) throw error;
    if (gatewayMissing(error)) throw new ReconstructError("ai_gateway_missing", 503);
    throw new ReconstructError("reconstruct_failed", 500);
  }
}
