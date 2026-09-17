// `next dev` + le comblement des manifestes de routes (voir dev-manifests.mjs).
// Les arguments sont passes tels quels a Next : `node scripts/dev.mjs --turbopack --port 3000`.
import { spawn } from "node:child_process";
import path from "node:path";
import { watchRouteManifests } from "./dev-manifests.mjs";

const stop = watchRouteManifests(process.env.SCROLLSHOW_BUILD_DIR || ".next");
const bin = path.join(process.cwd(), "node_modules", ".bin", "next");
const child = spawn(bin, ["dev", ...process.argv.slice(2)], { stdio: "inherit", env: process.env });
const forward = (signal) => () => child.kill(signal);
process.on("SIGINT", forward("SIGINT"));
process.on("SIGTERM", forward("SIGTERM"));
child.on("exit", (code, signal) => { stop(); process.exit(code ?? (signal ? 1 : 0)); });
