import { imageSize } from "image-size";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";
import { readSlideBytes } from "./media-files";
import { closestFont, defaultOverlay, defaultSlide } from "./recipe";
import type { CarouselRecipe, CarouselSlide, OverlayAlign } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pkgDir(name: string) {
  return path.join(process.cwd(), "node_modules", name);
}

const WORDS = [
  "yesterday",
  "months",
  "month",
  "cheated",
  "texted",
  "after",
  "days",
  "meet",
  "want",
  "this",
  "that",
  "with",
  "from",
  "have",
  "just",
  "when",
  "what",
  "will",
  "your",
  "she",
  "the",
  "and",
  "you",
  "for",
  "not",
];

function restoreSpaces(text: string) {
  return text
    .split(/(\s+)/)
    .map((token) => {
      if (!/^[A-Za-z]{8,}$/.test(token)) return token;
      const lower = token.toLowerCase();
      const parts: string[] = [];
      let i = 0;
      while (i < lower.length) {
        const hit = WORDS.filter((word) => word.length >= 3 && lower.startsWith(word, i)).sort((a, b) => b.length - a.length)[0];
        if (hit) {
          parts.push(token.slice(i, i + hit.length));
          i += hit.length;
          continue;
        }
        parts.push(token[i]);
        i += 1;
      }
      if (parts.some((part) => part.length === 1) || parts.length < 2) return token;
      return parts.join(" ");
    })
    .join("")
    .replace(/\s+/g, " ")
    .replace(/\bmlondhs\b/i, "Months")
    .replace(/\bmondhs\b/i, "Months")
    .trim();
}

type Box = { text: string; x0: number; y0: number; x1: number; y1: number; confidence: number };

async function strokeMask(bytes: Buffer) {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  const gray = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < gray.length; p++, i += channels) {
    gray[p] = (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  const mask = Buffer.alloc(width * height);
  const radius = 2;
  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const p = y * width + x;
      if (gray[p] < 175) continue;
      let dark = false;
      for (let dy = -radius; dy <= radius && !dark; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (gray[(y + dy) * width + (x + dx)] < 55) dark = true;
        }
      }
      if (dark) mask[p] = 255;
    }
  }
  return {
    png: await sharp(mask, { raw: { width, height, channels: 1 } }).png().toBuffer(),
    width,
    height,
  };
}

function isCaption(line: Box, width: number, height: number) {
  const letters = (line.text.match(/[A-Za-zÀ-ÿ0-9]/g) || []).length;
  const compact = line.text.replace(/\s/g, "");
  if (letters < 3) return false;
  if (letters / Math.max(1, compact.length) < 0.5) return false;
  if (line.confidence < 28) return false;
  const boxH = line.y1 - line.y0;
  const boxW = line.x1 - line.x0;
  if (boxH < height * 0.01 || boxH > height * 0.14) return false;
  if (boxW < width * 0.08) return false;
  const cy = (line.y0 + line.y1) / 2 / height;
  if (cy > 0.4 && cy < 0.66 && line.confidence < 80) return false;
  return true;
}

let workerPromise: Promise<Worker> | null = null;

async function getWorker() {
  if (workerPromise) return workerPromise;
  const tessRoot = pkgDir("tesseract.js");
  const langPath = path.join(pkgDir("@tesseract.js-data/eng"), "4.0.0_best_int");
  workerPromise = createWorker("eng", 1, {
    workerPath: path.join(tessRoot, "src/worker-script/node/index.js"),
    langPath,
    cachePath: path.join(os.tmpdir(), "scrollshow-tess"),
    cacheMethod: "write",
    gzip: true,
    logger: (message) => {
      if (message.status === "recognizing text" && message.progress < 1) return;
      console.log(`[ocr] ${message.status}${message.progress ? ` ${Math.round(message.progress * 100)}%` : ""}`);
    },
    errorHandler: (error) => {
      console.error("[ocr] worker", error);
      workerPromise = null;
    },
  }).catch((error) => {
    workerPromise = null;
    throw error;
  });
  return workerPromise;
}

export async function captionsFromImage(bytes: Buffer) {
  const size = imageSize(new Uint8Array(bytes));
  const { png, width, height } = await strokeMask(bytes);
  const worker = await getWorker();
  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, user_defined_dpi: "72" });
  const result = await worker.recognize(png, undefined, { text: true, blocks: true });
  const rawLines = (result.data.blocks || []).flatMap((block) =>
    (block.paragraphs || []).flatMap((paragraph) => paragraph.lines || []),
  );
  const lines = rawLines
    .map((line) => ({
      text: restoreSpaces(line.text.replace(/\s+/g, " ").trim()),
      x0: line.bbox.x0,
      y0: line.bbox.y0,
      x1: line.bbox.x1,
      y1: line.bbox.y1,
      confidence: line.confidence,
    }))
    .filter((line) => isCaption(line, width || size.width || 1080, height || size.height || 1920));
  return { lines, width: width || size.width || 1080, height: height || size.height || 1920 };
}

async function ocrSlide(slide: CarouselSlide): Promise<CarouselSlide> {
  const source = slide.sourceImage || slide.image;
  const file = source ? await readSlideBytes(source) : null;
  if (!file) return slide;
  const { lines, width, height } = await captionsFromImage(file.bytes);
  const overlays = lines.slice(0, 6).map((box) => {
    const boxW = Math.max(1, box.x1 - box.x0);
    const boxH = Math.max(1, box.y1 - box.y0);
    const wide = boxW / width > 0.42;
    const cx = ((box.x0 + box.x1) / 2 / width) * 100;
    const cy = ((box.y0 + box.y1) / 2 / height) * 100;
    const align: OverlayAlign = wide ? "center" : cx < 38 ? "left" : cx > 62 ? "right" : "center";
    const x =
      align === "left"
        ? clamp((box.x0 / width) * 100, 4, 80)
        : align === "right"
          ? clamp((box.x1 / width) * 100, 20, 96)
          : wide
            ? 50
            : clamp(cx, 8, 92);
    return defaultOverlay({
      text: box.text,
      fontFamily: closestFont("Montserrat"),
      fontSize: clamp(Math.round(boxH * (1080 / width) * 0.82), 28, 120),
      fontWeight: 800,
      color: "#ffffff",
      x,
      y: clamp(cy, 6, 94),
      align,
      width: clamp((boxW / width) * 100 * 1.08, 40, 94),
      lineHeight: 1.05,
    });
  });
  return defaultSlide(slide.image, {
    id: slide.id,
    sourceImage: source,
    keepPhoto: true,
    backgroundColor: "#111111",
    overlays,
  });
}

export async function reconstructWithOcr(recipe: CarouselRecipe): Promise<CarouselRecipe> {
  const slides: CarouselSlide[] = [];
  for (const slide of recipe.slides) {
    slides.push(await ocrSlide(slide));
  }
  return {
    ...recipe,
    origin: recipe.origin || "import",
    fontFamily: closestFont(slides[0]?.overlays[0]?.fontFamily || recipe.fontFamily),
    editable: true,
    slides,
  };
}
