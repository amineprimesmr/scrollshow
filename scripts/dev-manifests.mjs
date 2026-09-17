// Comble un trou de `next dev --turbopack` (Next 15.5) qui coute 200 ms a CHAQUE
// appel d'API en local.
//
// `loadComponents` charge `server/app/<route>/react-loadable-manifest.json`.
// Turbopack ne l'ecrit que pour les pages, jamais pour un route handler ; en dev
// Next reessaie alors trois fois avec 100 ms d'attente avant d'abandonner — pour
// un fichier qui n'existera jamais. Mesure : /api/auth/me sans cookie 240 ms,
// 24 ms une fois le manifeste present. Chaque vignette et chaque avatar passant
// par une route API, une galerie payait ce delai des dizaines de fois, six
// connexions a la fois. La production n'est pas concernee (un seul essai).
//
// Usage : lance par `scripts/dev.mjs`, ou seul : `node scripts/dev-manifests.mjs .next`
import { existsSync, readdirSync, watch, writeFileSync } from "node:fs";
import path from "node:path";

const MANIFEST = "react-loadable-manifest.json";

function fill(dir) {
  let made = 0;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    // Un route handler compile = un dossier `route` avec ses manifestes.
    if (entry.name === "route" && existsSync(path.join(full, "app-paths-manifest.json")) && !existsSync(path.join(full, MANIFEST))) {
      try { writeFileSync(path.join(full, MANIFEST), "{}"); made += 1; } catch {}
    }
    made += fill(full);
  }
  return made;
}

export function watchRouteManifests(distDir) {
  const root = path.join(distDir, "server", "app");
  let timer = null;
  const sweep = () => { timer = null; fill(root); };
  const soon = () => { timer ||= setTimeout(sweep, 60); };
  let watcher = null;
  const attach = () => {
    if (watcher || !existsSync(root)) return;
    try { watcher = watch(root, { recursive: true }, soon); watcher.on("error", () => { watcher = null; }); } catch { watcher = null; }
  };
  // Le dossier n'existe qu'apres la premiere compilation, et un `rm -rf .next`
  // casse l'observateur : on retente, et on balaie de toute facon.
  const interval = setInterval(() => { attach(); fill(root); }, 1500);
  attach();
  fill(root);
  return () => { clearInterval(interval); watcher?.close(); if (timer) clearTimeout(timer); };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const distDir = process.argv[2] || process.env.SCROLLSHOW_BUILD_DIR || ".next";
  console.log(`[dev-manifests] surveille ${distDir}/server/app`);
  watchRouteManifests(distDir);
}
