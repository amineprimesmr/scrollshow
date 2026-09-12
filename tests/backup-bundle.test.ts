import test from "node:test";
import assert from "node:assert/strict";
import { emptyStore } from "../lib/store";
import { readBackupManifest, restoreBackupBundle, writeBackupBundle } from "../lib/backup-bundle";

test("segmented encrypted backups restore more than 500 files including project logos, and reject a missing part", async () => {
  const source = emptyStore(), bytes = Buffer.from("image-fixture"), key = Buffer.alloc(32, 7).toString("base64");
  source.media = Array.from({ length: 501 }, (_, i) => ({ id: String(i), name: "image", userId: "u", createdAt: "2026-01-01", url: `/api/i/image-${i}.png` }));
  source.projects = [{ id: "p", userId: "u", logo: "/api/i/logo.png", name: "logo", business: null, createdAt: "2026-01-01" }];
  const blobs = new Map<string, Buffer>();
  const result = await writeBackupBundle(source, key, "backups/scrollshow/staging/test", {
    async write(path, bytes) { blobs.set(path, bytes); }, async read(path) { return blobs.get(path) || null; },
  }, async () => ({ bytes, contentType: "image/png" }), 100);
  assert.equal(result.mediaFiles, 502); assert.ok(result.parts > 1);
  const manifest = readBackupManifest(blobs.get(result.manifestPath)!, key);
  const target = new Map<string, Buffer>();
  const storage = { async read(name: string) { return target.get(name) || null; }, async write(name: string, bytes: Buffer) { target.set(name, bytes); } };
  assert.equal(await restoreBackupBundle(manifest, key, async path => blobs.get(path) || null, storage), 502);
  assert.equal(target.get("logo.png")?.toString(), bytes.toString());
  assert.equal(await restoreBackupBundle(manifest, key, async path => blobs.get(path) || null, storage), 502, "restore can resume without overwriting files");
  blobs.delete(manifest.parts[1].path);
  await assert.rejects(restoreBackupBundle(manifest, key, async path => blobs.get(path) || null, storage), /backup_part_missing_or_corrupt/);
});
