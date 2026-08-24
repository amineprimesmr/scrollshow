import { put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function useBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function extFrom(contentType: string, url: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (url.includes(".png")) return "png";
  if (url.includes(".webp")) return "webp";
  return "jpg";
}

function mimeFrom(ext: string) {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export async function savePublicImage(bytes: Buffer, contentType: string, sourceUrl = "") {
  const ext = extFrom(contentType, sourceUrl);
  const name = `${crypto.randomUUID()}.${ext}`;
  if (useBlob()) {
    const blob = await put(`marketplace/${name}`, bytes, {
      access: "public",
      contentType: mimeFrom(ext),
      addRandomSuffix: false,
    });
    return blob.url;
  }
  const dir = path.join(process.cwd(), ".data", "imports");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `/api/i/${name}`;
}

export async function readImportedFile(name: string) {
  if (name.includes("/") || name.includes("..") || !/^[a-zA-Z0-9._-]+$/.test(name)) return null;
  try {
    const file = path.join(process.cwd(), ".data", "imports", name);
    const bytes = await readFile(file);
    const ext = name.split(".").pop() || "jpg";
    return { bytes, contentType: mimeFrom(ext) };
  } catch {
    return null;
  }
}
