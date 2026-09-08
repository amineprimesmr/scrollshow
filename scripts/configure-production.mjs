import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
const email=JSON.parse(await readFile(".data/operations/preview-email.json","utf8"));
const backup=JSON.parse(await readFile(".data/operations/production-secrets.json","utf8"));
const config={...email,...backup,STRIPE_PRICE_PRO_MONTHLY:"price_1UDOo43yrYjpyuOyTXdtTbci",STRIPE_PRICE_LIFETIME:"price_1UDOo43yrYjpyuOyjFHmPujl",STRIPE_LEGACY_MONTHLY_PRICE_IDS:"price_1U9MLv3yrYjpyuOyaU2ZWKf5",SALES_ENABLED:"1",MAINTENANCE_MODE:"0",NEXT_PUBLIC_SITE_URL:"https://scrollshow.io"};
for(const [name,value] of Object.entries(config)) {
  if(typeof value!=="string"||!value||value==="[SENSITIVE]")throw new Error(`Missing configuration ${name}`);
  await new Promise((resolve,reject)=>{
    const child=spawn("vercel",["env","add",name,"production","--force","--yes",name.includes("KEY")?"--sensitive":"--no-sensitive"],{stdio:["pipe","pipe","pipe"]});
    child.stdout.resume();child.stderr.resume();child.stdin.end(value);child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(new Error(`Failed configuration ${name}`)));
  });
  console.log(`Configured production ${name}; applies to new deployments only.`);
}
