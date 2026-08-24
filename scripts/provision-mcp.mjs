import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const PREFIX = "ss_live_";
const MCP_URL = "https://scrollshow.io/api/mcp";

function hashApiKey(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i)] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function emptyStore() {
  return { users: [], accounts: [], runs: [], channels: [], posts: [], media: [], apiKeys: [] };
}

function upsertUser(store, email, name) {
  const key = email.toLowerCase();
  let user = store.users.find((item) => item.email === key);
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      email: key,
      name,
      plan: "pro",
      createdAt: new Date().toISOString(),
    };
    store.users.push(user);
  }
  user.plan = "pro";
  user.name = user.name || name;
  return user;
}

async function main() {
  const env = parseEnv(await readFile(path.join(ROOT, ".env.local"), "utf8").catch(() => ""));
  for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) process.env[k] = v;
  }

  const storePath = path.join(ROOT, ".data", "store.json");
  const store = await loadJson(storePath, emptyStore());
  store.apiKeys ||= [];

  const owner = upsertUser(store, "aminennasri@outlook.com", "Amine");
  upsertUser(store, "amine.ennasri.pro@gmail.com", "Amine");

  const token = `${PREFIX}${randomBytes(24).toString("base64url")}`;
  const item = {
    id: crypto.randomUUID(),
    userId: owner.id,
    name: "Cursor + Claude",
    prefix: `${PREFIX}${token.slice(PREFIX.length, PREFIX.length + 4)}`,
    hash: hashApiKey(token),
    createdAt: new Date().toISOString(),
  };
  store.apiKeys = store.apiKeys.filter((key) => key.userId !== owner.id || key.name !== item.name);
  store.apiKeys.unshift(item);

  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store));

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    await put("scrollshow-store.json", JSON.stringify(store), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });
  }

  const home = process.env.HOME;
  await mkdir(path.join(home, ".scrollshow"), { recursive: true, mode: 0o700 });
  await writeFile(path.join(home, ".scrollshow", "api-key"), token, { mode: 0o600 });

  const localEnvPath = path.join(ROOT, ".env.local");
  let localEnv = await readFile(localEnvPath, "utf8").catch(() => "");
  if (/^SCROLLSHOW_API_KEY=/m.test(localEnv)) {
    localEnv = localEnv.replace(/^SCROLLSHOW_API_KEY=.*$/m, `SCROLLSHOW_API_KEY=${token}`);
  } else {
    localEnv = `${localEnv.trim()}\nSCROLLSHOW_API_KEY=${token}\n`;
  }
  await writeFile(localEnvPath, localEnv);

  const cursorPath = path.join(home, ".cursor", "mcp.json");
  const cursor = await loadJson(cursorPath, { mcpServers: {} });
  cursor.mcpServers ||= {};
  cursor.mcpServers.scrollshow = {
    url: MCP_URL,
    headers: { Authorization: `Bearer ${token}` },
  };
  await writeFile(cursorPath, JSON.stringify(cursor, null, 2) + "\n");

  const desktopPath = path.join(home, "Library/Application Support/Claude/claude_desktop_config.json");
  const desktop = await loadJson(desktopPath, {});
  desktop.mcpServers ||= {};
  desktop.mcpServers.scrollshow = {
    type: "http",
    url: MCP_URL,
    headers: { Authorization: `Bearer ${token}` },
  };
  await writeFile(desktopPath, JSON.stringify(desktop, null, 2) + "\n");

  const skillSrc = await readFile(path.join(ROOT, ".cursor/skills/scrollshow/SKILL.md"), "utf8");
  for (const dest of [
    path.join(home, ".cursor/skills/scrollshow/SKILL.md"),
    path.join(home, ".claude/skills/scrollshow/SKILL.md"),
  ]) {
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, skillSrc);
  }

  console.log("mcp_url", MCP_URL);
  console.log("owner", owner.email, owner.plan);
  console.log("prefix", item.prefix);
  console.log("blob", Boolean(process.env.BLOB_READ_WRITE_TOKEN));
  console.log("wrote_cursor", cursorPath);
  console.log("wrote_claude_desktop", desktopPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
