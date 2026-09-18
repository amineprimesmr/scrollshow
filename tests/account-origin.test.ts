import assert from "node:assert/strict";
import test from "node:test";
import { backfillAccountOrigins, isFollowedAccount, isResearchAccount } from "../lib/account-origin";
import { listManagedAccounts } from "../lib/account-manage";
import { ownedChannels } from "../lib/owned-channels";
import type { StoreData } from "../lib/types";

const me = { id: "u1", projectId: "p1" };
const base = { userId: "u1", projectId: "p1", followers: 1, avgViews: 0, posts: 0, verdict: "watch", notes: "", createdAt: "2026-09-01" };

function store(): StoreData {
  return {
    users: [], media: [], apiKeys: [], posts: [],
    channels: [{ id: "c1", userId: "u1", projectId: "p1", platform: "tiktok", name: "Moi", handle: "moi", avatar: "", accessToken: "t" }],
    accounts: [
      { ...base, id: "a-search", handle: "concurrent1", niche: "sleepmaxing" },
      { ...base, id: "a-measured", handle: "concurrent2", niche: "autre", researchCoverage: { complete: true, pages: 1, windowDays: 30, measuredAt: "x", reason: "profile_end" } },
      { ...base, id: "a-manual", handle: "mon.compte.us", niche: "Wellness" },
      { ...base, id: "a-other-user", userId: "u2", handle: "ailleurs", niche: "sleepmaxing" },
    ],
    researchJobs: [{ id: "j1", userId: "u1", projectId: "p1", input: { keywords: ["Sleepmaxing"] } }],
    runs: [{ id: "r1", userId: "u1", projectId: "p1", keywords: "glow up, abs", status: "done", found: 0, createdAt: "x" }],
  } as unknown as StoreData;
}

test("un compte trouve par la Recherche n'est jamais un compte de l'utilisateur", () => {
  const data = store();
  const counts = backfillAccountOrigins(data);
  assert.deepEqual(counts, { research: 2, manual: 2 }, "mot-cle d'une recherche, ou couverture de recherche");
  assert.equal(data.accounts.find(a => a.id === "a-other-user")?.origin, "manual", "les mots-cles d'un utilisateur ne classent pas les comptes d'un autre");
  assert.deepEqual(ownedChannels(data, me).map(c => c.handle), ["moi", "mon.compte.us"], "Overview, calendrier, composeur, agent");
  assert.deepEqual(listManagedAccounts(data, me).map(a => `${a.handle}:${a.kind}`), ["moi:connected", "concurrent1:research", "concurrent2:research", "mon.compte.us:tracked"]);
  assert.deepEqual(backfillAccountOrigins(data), { research: 0, manual: 0 }, "idempotent");
});

test("sans `origin`, seule une couverture de recherche suffit a ecarter le compte", () => {
  assert.equal(isResearchAccount({ researchCoverage: { complete: true } as never }), true);
  assert.equal(isResearchAccount({}), false);
  assert.equal(isResearchAccount({ origin: "manual", researchCoverage: { complete: true } as never }), false, "suivi expres : il reste a l'utilisateur");
  assert.equal(isFollowedAccount({ origin: "manual", hidden: true }), false);
  assert.equal(isFollowedAccount({ origin: "research" }), false);
});
