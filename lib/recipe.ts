import { z } from "zod";
import { siteUrl } from "./stripe";
import type {
  CarouselRecipe,
  CarouselSlide,
  OverlayAlign,
  SlideOverlay,
  StudioPost,
} from "./types";

export const overlayInputSchema = z.object({
  id: z.string().optional(),
  text: z.string().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().optional(),
  fontWeight: z.union([z.number(), z.string()]).optional(),
  color: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  width: z.number().optional(),
  lineHeight: z.number().optional(),
  backdrop: z.string().optional(),
});

export const slideInputSchema = z.object({
  id: z.string().optional(),
  image: z.string().optional(),
  sourceImage: z.string().optional(),
  backgroundColor: z.string().optional(),
  backgroundColor2: z.string().optional(),
  keepPhoto: z.boolean().optional(),
  html: z.string().optional(),
  css: z.string().optional(),
  overlays: z.array(overlayInputSchema).optional(),
});

export const recipeInputSchema = z.object({
  version: z.literal(1).optional(),
  origin: z.enum(["ai", "manual", "import", "fork"]).optional(),
  fontFamily: z.string().optional(),
  html: z.string().optional(),
  css: z.string().optional(),
  prompt: z.string().optional(),
  editable: z.boolean().optional(),
  replaceSlides: z.boolean().optional(),
  slides: z.array(slideInputSchema).optional(),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;

export const RECIPE_FONTS = [
  "Inter",
  "Montserrat",
  "Poppins",
  "Oswald",
  "Anton",
  "Bebas Neue",
  "Outfit",
  "DM Sans",
  "Playfair Display",
  "Arial",
  "Impact",
] as const;

export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=DM+Sans:wght@400;700;800&family=Montserrat:wght@400;700;800;900&family=Oswald:wght@400;600;700&family=Outfit:wght@400;700;800&family=Playfair+Display:ital,wght@0,700;1,700&family=Poppins:wght@400;600;700;800&display=swap";

const DEFAULT_FONT = "Montserrat";

export function newId() {
  return crypto.randomUUID();
}

export function newShareId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export function fontStack(family: string) {
  if (family === "Impact") return `Impact, Haettenschweiler, "Arial Black", sans-serif`;
  if (family === "Arial") return `Arial, Helvetica, sans-serif`;
  if (family === "Bebas Neue") return `"Bebas Neue", Impact, sans-serif`;
  return `"${family}", Inter, ui-sans-serif, system-ui, sans-serif`;
}

export function defaultOverlay(partial?: Partial<SlideOverlay>): SlideOverlay {
  return {
    id: partial?.id || newId(),
    text: partial?.text || "",
    fontFamily: partial?.fontFamily || DEFAULT_FONT,
    fontSize: partial?.fontSize ?? 64,
    fontWeight: partial?.fontWeight ?? 800,
    color: partial?.color || "#ffffff",
    x: partial?.x ?? 50,
    y: partial?.y ?? 78,
    align: partial?.align || "center",
    width: partial?.width ?? 86,
    lineHeight: partial?.lineHeight ?? 1.05,
    backdrop: partial?.backdrop,
  };
}

export function closestFont(name: string) {
  const n = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const exact = RECIPE_FONTS.find((font) => font.toLowerCase().replace(/[^a-z0-9]+/g, "") === n);
  if (exact) return exact;
  if (n.includes("bebas")) return "Bebas Neue";
  if (n.includes("playfair")) return "Playfair Display";
  if (n.includes("dmsans") || n === "dm") return "DM Sans";
  if (n.includes("impact") || n.includes("haettenschweiler")) return "Anton";
  if (n.includes("oswald")) return "Oswald";
  if (n.includes("poppin")) return "Poppins";
  if (n.includes("outfit")) return "Outfit";
  if (n.includes("arial") || n.includes("helvetica")) return "Inter";
  if (n.includes("montserrat")) return "Montserrat";
  return DEFAULT_FONT;
}

export function defaultSlide(
  image: string,
  partial?: Partial<Omit<CarouselSlide, "overlays">> & { overlays?: Array<Partial<SlideOverlay>> },
): CarouselSlide {
  return {
    id: partial?.id || newId(),
    image: image || partial?.image || "",
    sourceImage: partial?.sourceImage,
    backgroundColor: partial?.backgroundColor,
    backgroundColor2: partial?.backgroundColor2,
    keepPhoto: partial?.keepPhoto,
    html: partial?.html,
    css: partial?.css,
    overlays: (partial?.overlays || []).map((overlay) => defaultOverlay(overlay)),
  };
}

export function recipeFromPhotos(
  photos: string[],
  origin: CarouselRecipe["origin"] = "manual",
  extra?: RecipeInput | Partial<CarouselRecipe>,
): CarouselRecipe {
  const extraSlides = extra?.slides || [];
  const slides = (photos.length ? photos : ["/assets/tiktoks/01-glowup-188k.png"]).map((image, index) =>
    defaultSlide(image, extraSlides[index] as Partial<CarouselSlide> | undefined),
  );
  return normalizeRecipe({
    version: 1,
    origin: extra?.origin || origin,
    fontFamily: extra?.fontFamily || DEFAULT_FONT,
    html: extra?.html,
    css: extra?.css,
    prompt: extra?.prompt,
    editable: extra?.editable,
    slides,
  });
}

export function normalizeRecipe(input: Partial<CarouselRecipe> | RecipeInput | undefined, origin: CarouselRecipe["origin"] = "manual"): CarouselRecipe {
  const slides = (input?.slides || [])
    .map((slide) => {
      if (!slide?.image && !slide?.html && !slide?.backgroundColor && !slide?.sourceImage) return null;
      return defaultSlide(slide.image || "", {
        id: slide.id,
        html: slide.html,
        css: slide.css,
        sourceImage: slide.sourceImage,
        backgroundColor: slide.backgroundColor,
        backgroundColor2: slide.backgroundColor2,
        keepPhoto: slide.keepPhoto,
        overlays: slide.overlays,
      });
    })
    .filter(Boolean) as CarouselSlide[];
  return {
    version: 1,
    origin: input?.origin || origin,
    fontFamily: input?.fontFamily || DEFAULT_FONT,
    html: input?.html,
    css: input?.css,
    prompt: input?.prompt,
    editable: input?.editable,
    slides: slides.length ? slides : [defaultSlide("/assets/tiktoks/01-glowup-188k.png")],
  };
}

export function ensureRecipe(post: Pick<StudioPost, "image" | "origin" | "recipe">): CarouselRecipe {
  if (post.recipe?.slides?.length) return normalizeRecipe(post.recipe, post.origin || post.recipe.origin || "manual");
  return recipeFromPhotos(post.image ? [post.image] : [], post.origin || "manual");
}

export function photosOf(recipe: CarouselRecipe) {
  return recipe.slides.map((slide) => slide.image).filter(Boolean);
}

export function coverOf(post: Pick<StudioPost, "image" | "recipe">) {
  return post.recipe?.slides?.[0]?.image || post.image || "/assets/tiktoks/01-glowup-188k.png";
}

export function cloneRecipe(recipe: CarouselRecipe): CarouselRecipe {
  return normalizeRecipe({
    ...recipe,
    slides: recipe.slides.map((slide) => ({
      ...slide,
      id: newId(),
      overlays: slide.overlays.map((overlay) => ({ ...overlay, id: newId() })),
    })),
  });
}

export function applyRecipePatch(
  current: CarouselRecipe,
  patch: (Partial<CarouselRecipe> | RecipeInput) & { replaceSlides?: boolean },
): CarouselRecipe {
  const next = normalizeRecipe({
    ...current,
    origin: patch.origin || current.origin,
    fontFamily: patch.fontFamily || current.fontFamily,
    html: patch.html ?? current.html,
    css: patch.css ?? current.css,
    prompt: patch.prompt ?? current.prompt,
    editable: patch.editable ?? current.editable,
    slides: current.slides,
  });
  if (!patch.slides?.length) return next;
  if (patch.replaceSlides) {
    next.slides = normalizeRecipe({ ...next, slides: patch.slides }).slides;
    return next;
  }
  next.slides = next.slides.map((slide, index) => {
    const incoming = patch.slides?.find((item) => item.id && item.id === slide.id) || patch.slides?.[index];
    if (!incoming) return slide;
    return defaultSlide(incoming.image || slide.image, {
      id: slide.id,
      html: incoming.html ?? slide.html,
      css: incoming.css ?? slide.css,
      sourceImage: incoming.sourceImage ?? slide.sourceImage,
      backgroundColor: incoming.backgroundColor ?? slide.backgroundColor,
      backgroundColor2: incoming.backgroundColor2 ?? slide.backgroundColor2,
      keepPhoto: incoming.keepPhoto ?? slide.keepPhoto,
      overlays: mergeOverlays(slide.overlays, incoming.overlays),
    });
  });
  const extras = patch.slides.filter((slide) => slide.id && !next.slides.some((item) => item.id === slide.id));
  if (extras.length) next.slides.push(...normalizeRecipe({ slides: extras }).slides);
  return next;
}

function mergeOverlays(current: SlideOverlay[], incoming?: Array<Partial<SlideOverlay>>) {
  if (!incoming?.length) return current;
  const byId = new Map(incoming.filter((item) => item.id).map((item) => [item.id as string, item]));
  const merged = current.map((overlay, index) => {
    const patch = byId.get(overlay.id) || incoming[index];
    if (!patch) return overlay;
    return defaultOverlay({ ...overlay, ...patch, id: overlay.id });
  });
  incoming.forEach((item) => {
    if (item.id && !merged.some((overlay) => overlay.id === item.id)) {
      merged.push(defaultOverlay(item));
    }
  });
  return merged;
}

export function sharePath(shareId: string) {
  return `/r/${shareId}`;
}

export function publicShareUrl(shareId: string) {
  return `${siteUrl().replace(/\/$/, "")}${sharePath(shareId)}`;
}

export function recipeJsonUrl(shareId: string) {
  return `${siteUrl().replace(/\/$/, "")}/api/r/${shareId}`;
}

export function overlayStyle(overlay: SlideOverlay, canvasWidth: number) {
  const scale = canvasWidth / 1080;
  const align = overlay.align || "center";
  return {
    position: "absolute" as const,
    left: `${overlay.x}%`,
    top: `${overlay.y}%`,
    width: `${overlay.width ?? 86}%`,
    transform: align === "left" ? "translate(0, -50%)" : align === "right" ? "translate(-100%, -50%)" : "translate(-50%, -50%)",
    textAlign: align as OverlayAlign,
    color: overlay.color,
    fontFamily: fontStack(overlay.fontFamily),
    fontSize: `${Math.max(10, overlay.fontSize * scale)}px`,
    fontWeight: overlay.fontWeight,
    lineHeight: overlay.lineHeight ?? 1.05,
    whiteSpace: "pre-wrap" as const,
    textShadow: overlay.backdrop
      ? "none"
      : "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 10px rgb(0 0 0 / 0.45)",
    background: overlay.backdrop || "transparent",
    padding: overlay.backdrop ? "0.12em 0.4em" : undefined,
    borderRadius: overlay.backdrop ? 12 : undefined,
    pointerEvents: "none" as const,
  };
}

export function publicRecipe(post: StudioPost) {
  const recipe = ensureRecipe(post);
  const shareId = post.shareId || "";
  const imported = post.origin === "import" || recipe.origin === "import";
  return {
    id: post.id,
    shareId: shareId || null,
    shareUrl: shareId ? publicShareUrl(shareId) : null,
    jsonUrl: shareId ? recipeJsonUrl(shareId) : null,
    caption: post.body,
    date: post.date,
    time: post.time,
    status: post.status,
    origin: post.origin || recipe.origin,
    visibility: post.visibility || "private",
    kind: post.kind || "photo",
    tiktokUrl: post.tiktokUrl || null,
    tiktokId: post.tiktokId || null,
    authorHandle: post.authorHandle || null,
    authorName: post.authorName || null,
    authorAvatar: post.authorAvatar || null,
    musicTitle: post.musicTitle || null,
    musicAuthor: post.musicAuthor || null,
    image: coverOf(post),
    photo_images: photosOf(recipe),
    recipe,
    instruction: recipe.editable
      ? "EDITABLE reconstruction. Texts live in recipe.slides[].overlays (not baked into the JPEG). Change overlay text/font/color/position or slide.backgroundColor, then call update_recipe. Call reconstruct_post only if overlays are still empty. On publish, rasterize the overlays into photo_images."
      : imported
        ? "BAKED import — text is still inside the JPEG. Call reconstruct_post so the user can edit texts and images. Until then, photo_images are a pixel copy of the original TikTok."
        : "This is the exact source of an existing ScrollShow TikTok. Do not generate a new template. Keep fontFamily, overlay positions, html and css. Change only the texts or images requested, then call update_recipe with this id.",
  };
}

export function needsReconstruct(recipe: CarouselRecipe) {
  if (recipe.origin !== "import" && recipe.origin !== "fork") return false;
  const overlays = recipe.slides.flatMap((slide) => slide.overlays);
  const hasText = overlays.some((overlay) => (overlay.text || "").trim());
  if (!recipe.editable || !hasText) return !hasText;
  return overlays.some((overlay) => overlayLooksBroken(overlay.text || ""));
}

function overlayLooksBroken(text: string) {
  const compact = text.replace(/\s/g, "");
  if (!compact) return false;
  const letters = (text.match(/[A-Za-zÀ-ÿ0-9]/g) || []).length;
  if (compact.length >= 6 && letters / Math.max(1, compact.length) < 0.55) return true;
  return /[\\|=~]{2,}/.test(text);
}

export function needsRasterize(recipe: CarouselRecipe) {
  // A slide only ever publishes as a raw upload of slide.image when it needs
  // neither: a flat/gradient background (no real photo — image would be empty,
  // photosOf() would silently drop the slide) nor overlay text (would be lost,
  // since only rasterizeSlide bakes it onto the photo). Gating this on
  // recipe.editable — set only by the OCR reconstruct pipeline — meant every
  // manually composed post with typed-on text skipped rasterizing entirely and
  // published the bare photo.
  return recipe.slides.some((slide) => Boolean(slide.backgroundColor) || slide.overlays.some((overlay) => (overlay.text || "").trim()));
}

export function slidePreviewImage(slide: CarouselSlide) {
  if (slide.keepPhoto) return slide.sourceImage || slide.image;
  if (slide.backgroundColor) return "";
  return slide.image;
}
