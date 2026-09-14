import test from "node:test";
import { mkdtemp,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exerciseShopifyPrivacy } from "./helpers/shopify-privacy-fixture";
test("Shopify privacy persists scoped access requests, exports only subject data and fences concurrent/replayed imports",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"ss-shopify-privacy-")),names=["DATABASE_URL","BUSINESS_ANALYTICS_DATA_DIR","NODE_ENV","VERCEL"],before=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  delete process.env.DATABASE_URL;delete process.env.VERCEL;process.env.BUSINESS_ANALYTICS_DATA_DIR=directory;Object.assign(process.env,{NODE_ENV:"test"});
  try{await exerciseShopifyPrivacy();}finally{for(const name of names){if(before[name]===undefined)delete process.env[name];else process.env[name]=before[name];}await rm(directory,{recursive:true,force:true});}
});
