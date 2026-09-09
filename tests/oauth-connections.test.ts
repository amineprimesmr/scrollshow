import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyStore } from "../lib/store";
import { listGrants, MCP_RESOURCE } from "../lib/oauth";
import type { OAuthToken } from "../lib/types";

test("connections include renewable authorizations, exclude expired or foreign grants, and never expose tokens", async () => {
  delete process.env.DATABASE_URL;
  delete process.env.SCROLLSHOW_USE_BLOB;
  delete process.env.VERCEL;
  const dir = await mkdtemp(path.join(os.tmpdir(), "scrollshow-oauth-test-"));
  process.env.SCROLLSHOW_DATA_DIR = dir;
  try {
    const store = emptyStore();
    const grant: OAuthToken = { grantId: "valid", clientId: "c", userId: "u", resource: MCP_RESOURCE, scope: "scrollshow", accessHash: "secret-access", refreshHash: "secret-refresh", accessExpiresAt: Date.now() - 1000, refreshExpiresAt: Date.now() + 60_000, createdAt: "2026-09-09" };
    store.oauthTokens = [grant, { ...grant }, { ...grant, grantId: "expired", refreshExpiresAt: Date.now() - 1000 }, { ...grant, grantId: "other-user", userId: "other" }, { ...grant, grantId: "other-resource", resource: "https://other.invalid/api/mcp" }];
    store.oauthClients = [{ id: "c", name: "Codex", redirectUris: [], createdAt: "2026-09-09" }];
    await writeFile(path.join(dir, "store.json"), JSON.stringify(store));
    assert.deepEqual(await listGrants("u"), [{ grantId: "valid", clientId: "c", name: "Codex", createdAt: "2026-09-09" }]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
