import { imageSize } from "image-size";
import path from "node:path";
import { createWorker } from "tesseract.js";
import { readSlideBytes } from "./media-files";
import { closestFont, defaultOverlay, defaultSlide } from "./recipe";
import type { CarouselRecipe, CarouselSlide, OverlayAlign } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type Box = { text: string; x0: number; y0: number; x1: number; y1: number; confidence: number };

function mergeBoxes(lines: Box[], height: number) {
  const sorted = [...lines].sort((a, b) => a.y0 - b.y0);
  const groups: Box[] = [];
  for (const line of sorted) {
    const prev = groups[groups.length - 1];
    const gap = prev ? line.y0 - prev.y1 : 9999;
    if (prev && gap < height * 0.035 && Math.abs(line.x0 - prev.x0) < Math.max(80, (prev.x1 - prev.x0) * 0.4)) {
      prev.text = `${prev.text}\n${line.text}`.trim();
      prev.x0 = Math.min(prev.x0, line.x0);
      prev.y0 = Math.min(prev.y0, line.y0);
      prev.x1 = Math.max(prev.x1, line.x1);
      prev.y1 = Math.max(prev.y1, line.y1);
      prev.confidence = Math.min(prev.confidence, line.confidence);
      continue;
    }
    groups.push({ ...line });
  }
  return groups;
}

async function ocrSlide(slide: CarouselSlide, worker: Awaited<ReturnType<typeof createWorker>>): Promise<CarouselSlide> {
  const source = slide.sourceImage || slide.image;
  const file = source ? await readSlideBytes(source) : null;
  if (!file) return slide;
  const size = imageSize(new Uint8Array(file.bytes));
  const width = size.width || 1080;
  const height = size.height || 1920;
  const result = await worker.recognize(file.bytes, undefined, { text: true, blocks: true });
  const rawLines = (result.data.blocks || []).flatMap((block) =>
    (block.paragraphs || []).flatMap((paragraph) => paragraph.lines || []),
  );
  const lines = rawLines
    .map((line) => ({
      text: line.text.replace(/\s+/g, " ").trim(),
      x0: line.bbox.x0,
      y0: line.bbox.y0,
      x1: line.bbox.x1,
      y1: line.bbox.y1,
      confidence: line.confidence,
    }))
    .filter((line) => line.text.length > 1 && line.confidence >= 42);
  const groups = mergeBoxes(lines, height);
  if (!groups.length && result.data.text.trim()) {
    groups.push({
      text: result.data.text.replace(/\s+/g, " ").trim(),
      x0: width * 0.08,
      y0: height * 0.7,
      x1: width * 0.92,
      y1: height * 0.82,
      confidence: 80,
    });
  }
  const overlays = groups.map((box) => {
    const boxW = Math.max(1, box.x1 - box.x0);
    const boxH = Math.max(1, box.y1 - box.y0);
    const cx = ((box.x0 + box.x1) / 2 / width) * 100;
    const align: OverlayAlign = cx < 38 ? "left" : cx > 62 ? "right" : "center";
    return defaultOverlay({
      text: box.text,
      fontFamily: closestFont("Montserrat"),
      fontSize: clamp(Math.round(boxH * (1080 / width) * 0.78), 28, 140),
      fontWeight: 800,
      color: "#ffffff",
      x: clamp(cx, 8, 92),
      y: clamp(((box.y0 + box.y1) / 2 / height) * 100, 6, 94),
      align,
      width: clamp((boxW / width) * 100 * 1.12, 40, 94),
      lineHeight: 1.05,
      backdrop: "#000000",
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
  const worker = await createWorker("eng", 1, {
    workerPath: path.join(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/index.js"),
  });
  try {
    const slides: CarouselSlide[] = [];
    for (const slide of recipe.slides) {
      slides.push(await ocrSlide(slide, worker));
    }
    return {
      ...recipe,
      origin: recipe.origin || "import",
      fontFamily: closestFont(slides[0]?.overlays[0]?.fontFamily || recipe.fontFamily),
      editable: true,
      slides,
    };
  } finally {
    await worker.terminate();
  }
}
