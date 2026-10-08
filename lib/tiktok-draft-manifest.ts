import type { CarouselRecipe } from "./types";

/** Only editable, image-free recipes may cross into the native draft pilot. */
export function textDraftManifest(id: string, caption: string, recipe: CarouselRecipe, expectedSlides: number) {
  if (!recipe.editable || !expectedSlides || expectedSlides > 35 || recipe.slides.length !== expectedSlides) throw new Error("text_draft_slide_count_invalid");
  if (recipe.html || recipe.css) throw new Error("text_draft_must_be_editable");
  const slides = recipe.slides.map((slide, index) => {
    if (slide.image || slide.sourceImage || slide.html || slide.css || slide.keepPhoto) throw new Error("text_draft_contains_images");
    if (slide.overlays.length > 20) throw new Error("text_draft_too_many_overlays");
    const texts = slide.overlays.map(overlay => {
      if (!overlay.text.trim() || overlay.text.length > 4000 || ![overlay.x, overlay.y, overlay.fontSize].every(Number.isFinite)) throw new Error("text_draft_overlay_invalid");
      if (overlay.x < 0 || overlay.x > 100 || overlay.y < 0 || overlay.y > 100) throw new Error("text_draft_position_invalid");
      return { ...overlay };
    });
    return { index, aspect: slide.aspect || recipe.aspect || "9:16", backgroundColor: slide.backgroundColor || "#eeeeee", texts };
  });
  return { version: 1 as const, id, caption, destination: "tiktok-device-pilot" as const, requiresForeground: true, published: false, slides };
}
