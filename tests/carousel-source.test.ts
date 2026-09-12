import assert from "node:assert/strict";
import test from "node:test";
import { recipeFromPhotos, normalizeRecipe } from "../lib/recipe";

test("a new blank draft contains no demonstration image and retains text-only slides", () => {
  const blank = recipeFromPhotos([]);
  assert.equal(blank.slides[0].image, "");
  assert.equal(blank.slides[0].backgroundColor, "#111111");
  const text = normalizeRecipe({ slides: [{ overlays: [{ text: "Ma création" }] }, {}] });
  assert.equal(text.slides.length, 2);
  assert.equal(text.slides[0].overlays[0].text, "Ma création");
  assert.ok(text.slides.every(slide => slide.image === "" && slide.backgroundColor));
});

test("explicit empty recipe images cannot be replaced by a compacted photo list", () => {
  const recipe = recipeFromPhotos(["https://example.invalid/photo.png"], "manual", { slides: [
    { image: "", backgroundColor: "#111111" },
    { image: "https://example.invalid/photo.png" },
  ] });
  assert.deepEqual(recipe.slides.map(slide => slide.image), ["", "https://example.invalid/photo.png"]);
});

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
