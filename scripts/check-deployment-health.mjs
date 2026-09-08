import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
const [url,envFile]=process.argv.slice(2);
if(!url||!envFile||!url.startsWith("https://scrollshow-"))throw new Error("Explicit ScrollShow deployment and env required");
const env=parseEnv(await readFile(envFile,"utf8"));
if(!env.CRON_SECRET||env.CRON_SECRET==="[SENSITIVE]")throw new Error("Cron credential unavailable");
const output=await new Promise((resolve,reject)=>{
  const child=spawn("vercel",["curl","/api/health","--deployment",url,"--","--silent","--show-error","--max-time","30","--header","@-"],{stdio:["pipe","pipe","pipe"]});
  let text="";child.stdout.on("data",part=>text+=part);child.stderr.resume();child.stdin.end(`Authorization: Bearer ${env.CRON_SECRET}\n`);child.on("error",reject);child.on("exit",code=>code===0?resolve(text):reject(new Error("Deployment health request failed")));
});
const result=JSON.parse(output);
console.log(JSON.stringify({ok:result.ok,problems:result.problems,error:result.error}));
