import { ensureRecipe, photosOf } from "./recipe";
import type { StudioPost } from "./types";

/** Every media URL a user's posts still reference — cover image, rendered slides, and reconstruct originals. */
export function usedMediaUrls(posts: StudioPost[]) {
  const used = new Set<string>();
  for (const post of posts) {
    if (post.image) used.add(post.image);
    const recipe = ensureRecipe(post);
    for (const url of photosOf(recipe)) used.add(url);
    for (const slide of recipe.slides) if (slide.sourceImage) used.add(slide.sourceImage);
  }
  return used;
}
