import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";
let worker: Worker | null=null;
let queue:Promise<unknown>=Promise.resolve();
let idle:ReturnType<typeof setTimeout>|undefined;
/** A worker is serialized: language state and recognition cannot race across workspaces. */
export function readResearchText(bytes:Buffer) {
  const task=queue.catch(()=>{}).then(async()=>{
    if(idle)clearTimeout(idle);
    worker ??= await createWorker("eng",1,{workerPath:path.join(process.cwd(),"node_modules/tesseract.js/src/worker-script/node/index.js"),langPath:path.join(process.cwd(),"node_modules/@tesseract.js-data/eng/4.0.0_best_int"),cachePath:path.join(os.tmpdir(),"scrollshow-research-ocr"),gzip:true});
    try {
      const image=await sharp(bytes,{limitInputPixels:25000000}).rotate().resize({width:1400,withoutEnlargement:true}).flatten({background:"#fff"}).normalise().png().toBuffer();
      await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO});
      let {data}=await worker.recognize(image,{}, {text:true,blocks:true});
      // Sparse, outlined captions often need segmentation independent of the photo background.
      // Retain the best raw reading; never synthesize words or interpret low confidence as truth.
      if(data.confidence<70) {
        await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
        const alternate=await worker.recognize(await sharp(image).greyscale().sharpen().png().toBuffer(),{}, {text:true,blocks:true});
        if(alternate.data.confidence>data.confidence&&alternate.data.text.trim().length>=8)data=alternate.data;
      }
      const size=await sharp(image).metadata();
      return {text:data.text.trim().slice(0,12000),confidence:data.confidence,width:size.width??0,height:size.height??0,textBlocks:data.blocks?.length??0};
    } finally {idle=setTimeout(()=>{const held=worker;worker=null;void held?.terminate();},10000);idle.unref();}
  });
  queue=task;return task;
}
