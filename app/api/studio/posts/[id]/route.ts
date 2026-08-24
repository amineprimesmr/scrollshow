import { readSession } from "@/lib/auth";
import { applyRecipePatch, coverOf, ensureRecipe, newShareId, recipeInputSchema } from "@/lib/recipe";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  body: z.string().trim().min(1).max(2200).optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  status: z.enum(["draft", "scheduled", "published"]).optional(),
  channelIds: z.array(z.string()).optional(),
  image: z.string().optional(),
  photo_images: z.array(z.string()).optional(),
  origin: z.enum(["ai", "manual", "import", "fork"]).optional(),
  recipe: recipeInputSchema.optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const post = await updateStore((data) => {
    const found = data.posts.find((item) => item.id === id && item.userId === user.id);
    if (!found) return null;
    const { recipe: recipePatch, photo_images, image, origin, ...rest } = parsed.data;
    Object.assign(found, rest);
    if (origin) found.origin = origin;
    const recipe = ensureRecipe(found);
    if (recipePatch) {
      found.recipe = applyRecipePatch(recipe, recipePatch);
    } else if (photo_images?.length) {
      found.recipe = applyRecipePatch(recipe, {
        replaceSlides: true,
        slides: photo_images.map((url, index) => ({
          ...recipe.slides[index],
          image: url,
        })),
      });
    } else if (image) {
      found.recipe = applyRecipePatch(recipe, {
        slides: [{ ...recipe.slides[0], image }],
      });
    } else {
      found.recipe = recipe;
    }
    found.image = coverOf(found);
    if (!found.shareId) found.shareId = newShareId();
    return found;
  });

  if (!post) return NextResponse.json({ error: "missing" }, { status: 404 });
  return NextResponse.json({ post });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await updateStore((data) => {
    data.posts = data.posts.filter((item) => !(item.id === id && item.userId === user.id));
  });
  return NextResponse.json({ ok: true });
}
