import assert from "node:assert/strict";
import test from "node:test";
import { applyManageAction, listManagedAccounts, parseManagedKey } from "../lib/account-manage";
import { ownedChannels } from "../lib/owned-channels";
import type { StoreData } from "../lib/types";

const me = { id: "u1", projectId: "p1" };

function store(): StoreData {
  return {
    users: [], runs: [], media: [], apiKeys: [],
    channels: [
      { id: "c1", userId: "u1", projectId: "p1", platform: "tiktok", name: "Mine", handle: "mine", avatar: "", accessToken: "tok", connected: true },
      { id: "c2", userId: "u2", projectId: "p9", platform: "tiktok", name: "Other", handle: "other", avatar: "", accessToken: "tok2" },
    ],
    accounts: [
      { id: "a1", userId: "u1", projectId: "p1", handle: "nike", followers: 10 },
      { id: "a2", userId: "u1", projectId: "p1", handle: "mine" },
      { id: "a3", userId: "u1", projectId: "p2", handle: "autre-projet" },
      { id: "a4", userId: "u2", projectId: "p9", handle: "pas-a-moi" },
    ],
    posts: [
      { id: "post1", userId: "u1", projectId: "p1", status: "scheduled", channelIds: ["a1", "c1"] },
      { id: "post2", userId: "u1", projectId: "p1", status: "draft", channelIds: ["a1"] },
    ],
    videoStats: [{ channelId: "c1" }, { channelId: "c2" }],
    channelStats: [{ channelId: "c1" }, { channelId: "c2" }],
  } as unknown as StoreData;
}

test("les cles sont typees : ch: connecte, ac: suivi, le reste est ignore", () => {
  assert.deepEqual(parseManagedKey("ch:c1"), { kind: "connected", id: "c1" });
  assert.deepEqual(parseManagedKey("ac:a1"), { kind: "tracked", id: "a1" });
  assert.equal(parseManagedKey("ch:"), null);
  assert.equal(parseManagedKey("c1"), null);
});

test("la liste ne montre que le projet courant et compte les posts planifies", () => {
  const list = listManagedAccounts(store(), me);
  assert.deepEqual(list.map((item) => item.key), ["ch:c1", "ac:a1", "ac:a2"]);
  assert.equal(list.find((item) => item.key === "ac:a1")?.scheduledPosts, 1, "le brouillon ne compte pas");
  assert.equal(list.find((item) => item.key === "ch:c1")?.connected, true);
  assert.equal(list.find((item) => item.key === "ac:a2")?.hidden, true, "double par sa version connectee");
});

test("masquer retire le compte du studio sans rien supprimer, reafficher le ramene", () => {
  const data = store();
  const hidden = applyManageAction(data, me, "hide", ["ac:a1", "ch:c1"]);
  assert.equal(hidden.changed, 2);
  assert.equal(data.accounts.length, 4);
  assert.equal(data.channels.length, 2);
  assert.deepEqual(ownedChannels(data, me).map((c) => c.id), [], "plus rien dans l'Overview, le calendrier ni le composeur");
  assert.equal(listManagedAccounts(data, me).filter((item) => item.hidden).length, 3);
  assert.equal(applyManageAction(data, me, "hide", ["ac:a1"]).changed, 0, "idempotent");
  assert.equal(applyManageAction(data, me, "show", ["ac:a1", "ch:c1"]).changed, 2);
  assert.deepEqual(ownedChannels(data, me).map((c) => c.id), ["c1", "a1"]);
});

test("masquer un compte connecte ne fait pas reapparaitre son doublon suivi", () => {
  const data = store();
  applyManageAction(data, me, "hide", ["ch:c1"]);
  assert.deepEqual(ownedChannels(data, me).map((c) => c.handle), ["nike"]);
});

test("supprimer n'atteint jamais un autre utilisateur ni un autre projet", () => {
  const data = store();
  const result = applyManageAction(data, me, "remove", ["ac:a1", "ac:a3", "ac:a4", "ch:c2", "ch:c1", "ch:inconnu", "n'importe quoi"]);
  assert.equal(result.changed, 2);
  assert.equal(result.missing, 4, "a3, a4, c2 et l'inconnu sont hors de portee");
  assert.deepEqual(result.removedChannels.map((c) => c.id), ["c1"], "le jeton a revoquer est rendu a la route");
  assert.deepEqual(data.accounts.map((a) => a.id), ["a2", "a3", "a4"]);
  assert.deepEqual(data.channels.map((c) => c.id), ["c2"]);
  assert.deepEqual(data.videoStats?.map((s) => s.channelId), ["c2"], "les instantanes du compte supprime partent avec lui");
  assert.equal(data.posts.length, 2, "aucun post n'est supprime");
});

test("tout supprimer d'un coup, deux fois de suite", () => {
  const data = store();
  const keys = listManagedAccounts(data, me).map((item) => item.key);
  assert.equal(applyManageAction(data, me, "remove", keys).changed, 3);
  assert.deepEqual(listManagedAccounts(data, me), []);
  const again = applyManageAction(data, me, "remove", keys);
  assert.equal(again.changed, 0);
  assert.equal(again.missing, 3);
});
