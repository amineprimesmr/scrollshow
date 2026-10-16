// Publish or schedule a TikTok carousel through Zernio.
//   npm run zernio -- accounts
//   npm run zernio -- post --account <id> --photo <url|local .jpg/.webp> [--photo …] --title "..." --caption "..."
//        [--privacy PUBLIC_TO_EVERYONE] [--draft] [--at 2026-10-17T18:00:00+02:00] [--comments]
//   npm run zernio -- status <postId>
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createTikTokCarousel, getZernioPost, listZernioAccounts, uploadZernioMedia } from "../lib/zernio";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string) => rest.includes(`--${name}`);
const value = (name: string) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const values = (name: string) => rest.flatMap((v, i) => (v === `--${name}` && rest[i + 1] ? [rest[i + 1]] : []));

async function main() {
  if (cmd === "accounts") return console.table(await listZernioAccounts());
  if (cmd === "status") return console.log(JSON.stringify(await getZernioPost(rest[0]), null, 2));
  if (cmd === "post") {
    const at = value("at");
    // Local files are uploaded to Zernio first; TikTok photos must be JPEG or WebP.
    const photos = await Promise.all(values("photo").map(async p => /^https?:/.test(p) ? p
      : uploadZernioMedia(await readFile(p), basename(p), p.endsWith(".webp") ? "image/webp" : "image/jpeg")));
    const result = await createTikTokCarousel({
      accountId: value("account") || "",
      photos,
      title: value("title"),
      caption: value("caption") || "",
      scheduledFor: at ? new Date(at).toISOString() : undefined,
      options: { draft: flag("draft"), privacyLevel: value("privacy"), allowComment: flag("comments") },
    });
    return console.log(result);
  }
  console.log("usage: accounts | post --account … --photo … | status <id>");
}

main().catch(error => { console.error(error.message, error.body ? JSON.stringify(error.body) : ""); process.exit(1); });
