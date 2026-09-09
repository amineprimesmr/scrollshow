import path from "node:path";
import os from "node:os";
import { mkdir, copyFile } from "node:fs/promises";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";
import { strokeMask } from "./ocr-slide";
import { normalizeSlideSearch } from "./publication-text";

let worker: Worker | null = null;
let queue: Promise<unknown> = Promise.resolve();
let idle: ReturnType<typeof setTimeout> | undefined;
let waiting = 0;
async function getWorker() {
  if (worker) return worker;
  const directory = path.join(os.tmpdir(), "scrollshow-publication-text");
  await mkdir(directory, { recursive: true });
  for (const language of ["fra", "eng"]) await copyFile(
    path.join(process.cwd(), "node_modules", "@tesseract.js-data", language, "4.0.0_best_int", `${language}.traineddata.gz`),
    path.join(directory, `${language}.traineddata.gz`));
  worker = await createWorker("fra+eng", 1, {
    workerPath: path.join(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/index.js"),
    langPath: directory, cachePath: directory, gzip: true,
  });
  return worker;
}

/** Read printed text, including outlined TikTok captions, without interpreting the image. */
export function readPublicationImageText(bytes: Buffer) {
  if (waiting >= 8) return Promise.reject(new Error("text_reader_busy"));
  waiting++;
  const task = queue.catch(() => {}).then(async () => {
    if (idle) clearTimeout(idle);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const reader = await getWorker();
          const image = await sharp(bytes, { limitInputPixels: 25000000 }).rotate().resize({ width: 1400, withoutEnlargement: true }).flatten({ background: "#fff" }).png().toBuffer();
          await reader.setParameters({ tessedit_pageseg_mode: PSM.AUTO, user_defined_dpi: "150" });
          const normal = await reader.recognize(image, {}, { text: true, blocks: true });
          const mask = await strokeMask(image);
          const outlined = await reader.recognize(mask.png, {}, { text: true, blocks: true });
          const readings = [normal.data, outlined.data];
          if (Math.max(normal.data.confidence, outlined.data.confidence) < 85) {
            await reader.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
            readings.push((await reader.recognize(image, {}, { text: true, blocks: true })).data);
            readings.push((await reader.recognize(mask.png, {}, { text: true, blocks: true })).data);
          }
          const lines = readings.flatMap(data => (data.blocks || []).flatMap(block =>
            block.paragraphs.flatMap(p => p.lines))).filter(line => line.confidence >= 50 && normalizeSlideSearch(line.text).length >= 3);
          // Prefer the clearer reading when the two passes recognize the same line.
          const distinct = lines.sort((a, b) => b.confidence - a.confidence).filter((line, index, all) => !all.slice(0, index).some(previous => {
            const a = normalizeSlideSearch(previous.text), b = normalizeSlideSearch(line.text);
            const overlapWidth = Math.max(0, Math.min(previous.bbox.x1, line.bbox.x1) - Math.max(previous.bbox.x0, line.bbox.x0));
            const overlapHeight = Math.max(0, Math.min(previous.bbox.y1, line.bbox.y1) - Math.max(previous.bbox.y0, line.bbox.y0));
            const area = (line.bbox.x1 - line.bbox.x0) * (line.bbox.y1 - line.bbox.y0);
            return a === b || a.includes(b) || b.includes(a) || overlapWidth * overlapHeight > area * .6;
          })).sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
          const text = distinct.map(line => line.text.trim()).join("\n").slice(0, 12000);
          const confidence = distinct.length ? Math.round(distinct.reduce((sum, line) => sum + line.confidence, 0) / distinct.length) : 0;
          return { text, confidence, status: (text && confidence >= 70 ? "read" : "uncertain") as "read" | "uncertain" };
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { const held = worker; worker = null; void held?.terminate(); reject(new Error("text_reader_timeout")); }, 35000); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      waiting--;
      idle = setTimeout(() => { const held = worker; worker = null; void held?.terminate(); }, 10000);
      idle.unref();
    }
  });
  queue = task;
  return task;
}
