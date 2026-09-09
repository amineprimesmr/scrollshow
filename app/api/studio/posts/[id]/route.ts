import { readStudioSession as readSession } from "@/lib/auth";
import { applyRecipePatch, coverOf, ensureRecipe, newShareId, recipeInputSchema } from "@/lib/recipe";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";
import { queueDeletedMedia } from "@/lib/media-cleanup";
import { assertEditable, validatePost, validateSchedule, postErrorResponse } from "@/lib/post-validation";
import { inScope } from "@/lib/projects";

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
  tiktok: z
    .object({
      title: z.string().max(90),
      privacy: z.string(),
      allowComment: z.boolean(),
      commercial: z.boolean(),
      brandOrganic: z.boolean(),
      brandContent: z.boolean(),
    })
    .optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const post = await updateStore((data) => {
    const found = data.posts.find((item) => item.id === id && inScope(item, user));
    if (!found) return null;
    assertEditable(found);
    const { recipe: recipePatch, photo_images, image, origin, ...rest } = parsed.data;
    Object.assign(found, rest);
    // Un simple deplacement (date/heure) ne rejoue pas toute la validation de
    // publication : un post planifie a l'ancienne (sans options TikTok) doit
    // pouvoir bouger dans le calendrier, il sera revalide a la publication.
    const keys = Object.keys(parsed.data);
    const scheduleOnly = keys.length > 0 && keys.every((key) => key === "date" || key === "time");
    if (scheduleOnly) validateSchedule(found);
    else validatePost(data, found);
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
  }).catch(postErrorResponse);

  if (post instanceof Response) return post;
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
  const result = await updateStore((data) => {
    const post = data.posts.find(item => item.id === id && inScope(item, user));
    if (post) assertEditable(post);
    data.posts = data.posts.filter((item) => !(item.id === id && inScope(item, user)));
    if (post) queueDeletedMedia(data, post);
  }).catch(postErrorResponse);
  if (result instanceof Response) return result;
  return NextResponse.json({ ok: true });
}
