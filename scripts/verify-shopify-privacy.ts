import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { database } from "../lib/database";
import { deleteUser } from "../lib/business-analytics/repository";
import { exerciseShopifyPrivacy } from "../tests/helpers/shopify-privacy-fixture";
async function main(){
  if(new URL(process.env.DATABASE_URL||"").hostname!=="ep-plain-night-b19jhok5.c-5.eu-central-1.aws.neon.tech")throw new Error("This verification is restricted to the explicitly authorized isolated test branch.");
  const suffix=randomBytes(6).toString("hex");
  try{await exerciseShopifyPrivacy(suffix);console.log("PASS isolated SQL Shopify privacy: scoped request/export, customer+order+visitor redaction, concurrent and replayed import/request fences, store purge, old redaction ignored after reauthorization, atomic source switching, other-provider history preserved, structural scope does not leak secrets.");}
  finally{try{await deleteUser(`privacy-owner-${suffix}`);}finally{await Promise.all([database().end(),(globalThis as typeof globalThis & {ssShopifyLockSql?:ReturnType<typeof postgres>}).ssShopifyLockSql?.end()]);}}
}
main().catch(error=>{console.error(error instanceof Error?error.stack:"Shopify privacy verification failed");process.exitCode=1;});
