import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
const directory = join(process.cwd(), ".data", "operations");
await mkdir(directory, { recursive: true, mode: 0o700 });
const filename = join(directory, "preview-secrets.json");
let secrets;
try { secrets = JSON.parse(await readFile(filename,"utf8")); }
catch (error) { if(error.code!=="ENOENT")throw error; secrets = { AUTH_SECRET: randomBytes(32).toString("hex"), CRON_SECRET: randomBytes(32).toString("hex"), BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("base64") };await writeFile(filename,JSON.stringify(secrets),{mode:0o600,flag:"wx"}); }
if (!process.argv.includes("--apply")) { console.log("Prepared isolated preview secrets. Use --apply to configure Vercel preview only.");process.exit(0); }
for (const [name,value] of Object.entries({...secrets,SALES_ENABLED:"0",ALLOW_PREVIEW_PUBLISH:"0"})) {
  await new Promise((resolve,reject)=>{
    const child=spawn("vercel",["env","add",name,"preview","--force","--yes",name.endsWith("SECRET")||name.includes("KEY")?"--sensitive":"--no-sensitive"],{stdio:["pipe","pipe","pipe"]});
    child.stdout.resume();child.stderr.resume();child.stdin.end(value);
    child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(new Error(`Configuration failed for ${name}; no secret printed`)));
  });
  console.log(`Configured preview ${name}`);
}
