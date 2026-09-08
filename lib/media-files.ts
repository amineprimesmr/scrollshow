import { del, get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { safeFetchBytes } from "./safe-fetch";
import { blobToken } from "./blob-config";

function useBlob() {
  if (process.env.NODE_ENV !== "production" && process.env.SCROLLSHOW_USE_BLOB !== "1" && !process.env.DATABASE_URL) return false;
  return Boolean(blobToken() || process.env.BLOB_STORE_ID);
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

function blobPath(name: string) {
  return `marketplace/${name}`;
}

export async function savePublicImage(bytes: Buffer, contentType: string, sourceUrl = "") {
  const ext = extFrom(contentType, sourceUrl);
  const name = `${crypto.randomUUID()}.${ext}`;
  if (useBlob()) {
    await put(blobPath(name), bytes, {
      token: blobToken(),
      access: "private",
      contentType: mimeFrom(ext),
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return `/api/i/${name}`;
  }
  const dir = path.join(process.env.SCROLLSHOW_DATA_DIR || path.join(process.cwd(), ".data"), "imports");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `/api/i/${name}`;
}

export async function readSlideBytes(url: string) {
  const name = url.match(/\/api\/i\/([^/?#]+)/)?.[1];
  if (name) return readImportedFile(name);
  if (url.startsWith("/")) {
    try {
      const root = path.resolve(process.cwd(), "public");
      const file = path.resolve(root, decodeURIComponent(url).replace(/^\//, ""));
      if (!file.startsWith(root + path.sep)) return null;
      const bytes = await readFile(file);
      const ext = file.split(".").pop() || "jpg";
      return { bytes, contentType: mimeFrom(ext) };
    } catch {
      return null;
    }
  }
  try {
    const res = await safeFetchBytes(url);
    if (!res.contentType.startsWith("image/")) return null;
    return { bytes: res.bytes, contentType: res.contentType };
  } catch {
    return null;
  }
}

export async function readImportedFile(name: string) {
  if (name.includes("/") || name.includes("..") || !/^[a-zA-Z0-9._-]+$/.test(name)) return null;
  const ext = name.split(".").pop() || "jpg";
  if (useBlob()) {
    try {
      const result = await get(blobPath(name), { access: "private", useCache: true, token: blobToken() });
      if (!result?.stream) return null;
      const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
      return { bytes, contentType: mimeFrom(ext) };
    } catch {
      return null;
    }
  }
  try {
    const file = path.join(process.env.SCROLLSHOW_DATA_DIR || path.join(process.cwd(), ".data"), "imports", name);
    const bytes = await readFile(file);
    return { bytes, contentType: mimeFrom(ext) };
  } catch {
    return null;
  }
}

export async function deleteImportedFile(name: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(name) || name.includes("..")) throw new Error("invalid_media_name");
  if (useBlob()) await del(blobPath(name), { token: blobToken() });
  else {
    const file = path.join(process.env.SCROLLSHOW_DATA_DIR || path.join(process.cwd(), ".data"), "imports", name);
    await unlink(file).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}
