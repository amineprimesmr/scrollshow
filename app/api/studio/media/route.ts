import { readStudioSession } from "@/lib/auth";
import { consumeLimit } from "@/lib/rate-limit";
import { savePublicImage } from "@/lib/media-files";
import { withMediaUser } from "@/lib/media-permissions";
import { updateStoreSlice } from "@/lib/store";
import sharp from "sharp";

export const maxDuration = 30;
export async function POST(request: Request) {
  const user = await readStudioSession();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (Number(request.headers.get("content-length") || 0) > 3_200_000) return Response.json({ error: "image_too_large" }, { status: 413 });
  if (!(await consumeLimit(`upload:${user.id}`, 100, 3600000))) return Response.json({ error: "upload_limit" }, { status: 429 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return Response.json({ error: "invalid_image" }, { status: 400 });
  if (!file.size || file.size > 3_000_000) return Response.json({ error: "image_too_large" }, { status: 413 });
  try {
    // Decode and re-encode: reject disguised files and remove embedded metadata.
    const bytes = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .rotate().resize({ width: 2160, height: 3840, fit: "inside", withoutEnlargement: true }).webp({ quality: 92 }).toBuffer();
    const url = await withMediaUser(user, () => savePublicImage(bytes, "image/webp"));
    const media = await updateStoreSlice(["media"], data => {
      const item = data.media.find(m => m.url === url && m.userId === user.id)!;
      item.name = file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Image";
      return item;
    });
    return Response.json({ media }, { status: 201 });
  } catch { return Response.json({ error: "image_upload_failed" }, { status: 422 }); }
}
