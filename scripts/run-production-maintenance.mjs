import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
const env=parseEnv(await readFile(process.argv[2],"utf8"));
if(!env.CRON_SECRET||env.CRON_SECRET==="[SENSITIVE]")throw new Error("Cron authentication unavailable");
for(const path of ["/api/cron/maintenance","/api/cron/publish","/api/health"]) {
  const response=await fetch(`https://scrollshow.io${path}`,{headers:{Authorization:`Bearer ${env.CRON_SECRET}`},signal:AbortSignal.timeout(290000)});
  const result=await response.json();
  if(!response.ok||result.ok===false)throw new Error(`Production operation failed: ${path}`);
  console.log(JSON.stringify({path,...result}));
}
