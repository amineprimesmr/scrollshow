import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
const key = process.argv.includes("--browser") ? await new Promise((resolve, reject) => {
  const nonce = randomBytes(24).toString("hex");
  const server = createServer((req,res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "default-src 'none'; form-action 'self'; frame-ancestors 'none'");
    if (req.url !== `/${nonce}`) { res.writeHead(404).end(); return; }
    if (req.method === "GET") { res.setHeader("Content-Type","text/html; charset=utf-8"); res.end('<title>ScrollShow — configuration locale</title><h1>Resend → préproduction Vercel</h1><form method="POST"><label>Clé Resend <input name="key" type="password" autocomplete="off" required></label><button>Configurer la préproduction</button></form>'); return; }
    if (req.method !== "POST" || req.headers.origin !== "http://127.0.0.1:4189") { res.writeHead(403).end(); return; }
    let body = "";
    req.on("data", chunk => { body += chunk; if(body.length > 4096) req.destroy(); });
    req.on("end", () => { const value = new URLSearchParams(body).get("key") || ""; res.end("Clé transmise au script local. Consultez le résultat de configuration dans la tâche."); server.close(); clearTimeout(timer); resolve(value); });
  });
  const timer = setTimeout(() => { server.close(); reject(new Error("Local credential handoff expired")); }, 300000);
  server.on("error", reject);
  server.listen(4189, "127.0.0.1", () => console.log(`Local credential form: http://127.0.0.1:4189/${nonce}`));
}) : execFileSync("pbpaste", { encoding: "utf8" }).trim();
if (!/^re_[A-Za-z0-9_-]{20,}$/.test(key)) throw new Error("Copy the newly created Resend key first; clipboard was not logged.");
const config = { RESEND_API_KEY: key, EMAIL_FROM: "ScrollShow <noreply@mail.scrollshow.io>" };
await mkdir(".data/operations", { recursive: true, mode: 0o700 });
await writeFile(".data/operations/preview-email.json", JSON.stringify(config), { mode: 0o600, flag: "wx" });
for (const [name, value] of Object.entries(config)) {
  await new Promise((resolve,reject) => {
    const child = spawn("vercel", ["env", "add", name, "preview", "--force", "--yes", name.includes("KEY") ? "--sensitive" : "--no-sensitive"], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.resume(); child.stderr.resume(); child.stdin.end(value);
    child.on("error",reject); child.on("exit",code => code === 0 ? resolve() : reject(new Error(`Preview configuration failed: ${name}`)));
  });
  console.log(`Configured preview ${name}; secret not logged.`);
}
