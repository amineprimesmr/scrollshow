import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyStore, readStoreSlice } from "../lib/store";
import { inScope } from "../lib/projects";
import { readResearchJobs } from "../lib/research/storage";
import type { ResearchJob } from "../lib/research/model";
import type { SessionUser, User } from "../lib/types";

test("scoped research reads preserve local project migration, ordering and exact-id isolation without writing", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "research-storage-"));
  const environment = Object.fromEntries(["DATABASE_URL", "SCROLLSHOW_DATA_DIR", "SCROLLSHOW_USE_BLOB", "VERCEL"].map(key => [key, process.env[key]]));
  delete process.env.DATABASE_URL;
  delete process.env.SCROLLSHOW_USE_BLOB;
  delete process.env.VERCEL;
  process.env.SCROLLSHOW_DATA_DIR = directory;
  try {
    const state = emptyStore();
    state.users = ["u", "v"].map(id => ({ id, email: `${id}@example.test`, name: id, plan: "pro", createdAt: "2026-01-01", lastProjectId: "second" } as User));
    state.projects = [
      { id: "prj_u_1", userId: "u", name: "Original", business: null, createdAt: "2026-01-01", archivedAt: "2026-02-01" },
      { id: "second", userId: "u", name: "Second", business: null, createdAt: "2026-02-01" },
    ];
    state.researchJobs = [
      { id: "foreign", userId: "v" },
      { id: "legacy", userId: "u" },
      ...Array.from({ length: 55 }, (_, index) => ({ id: `original-${index}`, userId: "u", projectId: "prj_u_1" })),
      { id: "selected", userId: "u", projectId: "second" },
    ] as ResearchJob[];
    const filename = path.join(directory, "store.json");
    const saved = JSON.stringify(state);
    await writeFile(filename, saved);
    const normalized = await readStoreSlice(["researchJobs"]);
    for (const projectId of [undefined, "prj_u_1", "second", "missing"]) {
      const user = { id: "u", projectId } as SessionUser;
      const expected = normalized.researchJobs!.filter(job => inScope(job, user));
      assert.deepEqual(await readResearchJobs(user), expected);
      for (const id of ["legacy", "selected", "foreign", "missing"]) {
        assert.deepEqual(await readResearchJobs(user, id), expected.filter(job => job.id === id));
      }
    }
    assert.deepEqual((await readResearchJobs({ id: "u", projectId: "second" } as SessionUser)).map(job => job.id), ["selected"], "scope must be applied before a caller limits its history list");
    assert.equal((await readResearchJobs({ id: "u", projectId: "prj_u_1" } as SessionUser, "legacy"))[0].projectId, "prj_u_1", "unassigned jobs stay in the original workspace, never the last active workspace");
    assert.equal(await readFile(filename, "utf8"), saved, "read-only project migration must not rewrite the file");
  } finally {
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
