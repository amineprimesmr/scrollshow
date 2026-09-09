import assert from "node:assert/strict";
import test from "node:test";
import { recipeFromPhotos } from "../lib/recipe";

test("a carousel keeps every background-and-text slide without requiring photos", () => {
  const recipe = recipeFromPhotos([], "ai", { slides: [
    { backgroundColor: "#111111", overlays: [{ text: "Hook" }] },
    { backgroundColor: "#222222", overlays: [{ text: "Useful content" }] },
    { backgroundColor: "#333333", overlays: [{ text: "CTA" }] },
  ] });
  assert.deepEqual(recipe.slides.map(slide => slide.overlays[0].text), ["Hook", "Useful content", "CTA"]);
  assert.deepEqual(recipe.slides.map(slide => slide.image), ["", "", ""]);
});

test("mixed image and background slides keep their order and source", () => {
  const recipe = recipeFromPhotos(["", "https://example.invalid/photo.png", ""], "ai", { slides: [
    { backgroundColor: "#111111", overlays: [{ text: "First" }] },
    { image: "https://example.invalid/photo.png", overlays: [{ text: "Second" }] },
    { backgroundColor: "#333333", overlays: [{ text: "Third" }] },
  ] });
  assert.deepEqual(recipe.slides.map(slide => slide.image), ["", "https://example.invalid/photo.png", ""]);
  assert.deepEqual(recipe.slides.map(slide => slide.overlays[0].text), ["First", "Second", "Third"]);
});

test("photo-only imports keep each supplied photo", () => {
  const photos = ["https://example.invalid/1.png", "https://example.invalid/2.png"];
  assert.deepEqual(recipeFromPhotos(photos, "import").slides.map(slide => slide.image), photos);
});
