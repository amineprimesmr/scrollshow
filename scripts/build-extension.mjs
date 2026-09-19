// Emballe `extension/` en `public/scrollshow-extension.zip`, servi par la page
// /extension tant que l'extension n'est pas sur le Chrome Web Store (et c'est le
// meme fichier qu'on y televerse). A relancer a chaque changement de l'extension.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public", "scrollshow-extension.zip");
const { version } = JSON.parse(readFileSync(path.join(root, "extension", "manifest.json"), "utf8"));
rmSync(out, { force: true });
execFileSync("zip", ["-r", "-X", "-q", out, ".", "-x", ".*", "-x", "*/.*"], { cwd: path.join(root, "extension") });
console.log(`scrollshow-extension.zip · v${version}`);
