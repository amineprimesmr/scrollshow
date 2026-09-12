import assert from "node:assert/strict";
import test from "node:test";
import { archiveProject, backfillProjects, createProject, findProject, inScope, listProjects, publicProject, resolveProject, withProject } from "../lib/projects";
import type { PublicUser, StoreData, User } from "../lib/types";

function user(id: string, extra: Partial<User> = {}): User {
  return { id, email: `${id}@example.com`, name: id, plan: "pro", createdAt: "2026-01-01T00:00:00.000Z", ...extra } as User;
}

function store(users: User[], extra: Partial<StoreData> = {}): StoreData {
  return {
    users, accounts: [], runs: [], channels: [], posts: [], media: [], apiKeys: [],
    videoStats: [], channelStats: [], billingEvents: [], rateLimits: {}, ...extra,
  } as StoreData;
}

test("backfill gives every user one project and adopts all their existing content", () => {
  const owner = user("u1", { business: { name: "Monid", logo: "/api/i/logo.png" } as never });
  const data = store([owner, user("u2")], {
    channels: [{ id: "c1", userId: "u1" }, { id: "c2", userId: "u2" }] as never,
    posts: [{ id: "p1", userId: "u1" }] as never,
    media: [{ id: "m1", userId: "u1" }] as never,
    apiKeys: [{ id: "k1", userId: "u1" }] as never,
  });
  backfillProjects(data);

  const first = listProjects(data, "u1");
  assert.equal(first.length, 1);
  assert.equal(first[0].name, "Monid", "le projet par defaut reprend le nom du business");
  assert.equal(first[0].business?.name, "Monid");
  assert.equal(data.channels[0].projectId, first[0].id);
  assert.equal(data.posts[0].projectId, first[0].id);
  assert.equal(data.media[0].projectId, first[0].id);
  assert.equal(data.apiKeys[0].projectId, first[0].id);
  assert.equal(data.channels[1].projectId, listProjects(data, "u2")[0].id, "le contenu d'un autre compte va dans son propre projet");
});

test("backfill is idempotent and never re-adopts content already placed elsewhere", () => {
  const data = store([user("u1")], { channels: [{ id: "c1", userId: "u1" }] as never });
  backfillProjects(data);
  const defaultId = listProjects(data, "u1")[0].id;
  const second = createProject(data, data.users[0], { name: "Second" });
  data.channels[0].projectId = second.id;

  backfillProjects(data);
  backfillProjects(data);

  assert.equal(listProjects(data, "u1").length, 2, "aucun projet en double");
  assert.equal(data.channels[0].projectId, second.id, "un contenu deja range n'est pas repris par le projet par defaut");
  assert.equal(defaultId, listProjects(data, "u1")[0].id, "l'identifiant du projet par defaut est stable entre deux lectures");
});

test("a project id from another account never resolves, it falls back to the caller's own", () => {
  const data = store([user("u1"), user("u2")]);
  backfillProjects(data);
  const mine = listProjects(data, "u1")[0];
  const theirs = listProjects(data, "u2")[0];

  assert.equal(findProject(data, "u1", theirs.id), null);
  assert.equal(resolveProject(data, "u1", theirs.id)?.id, mine.id);
  assert.equal(resolveProject(data, "u1", "prj_inconnu")?.id, mine.id);
});

test("the active project follows the last one opened, and archiving moves it off the archived one", () => {
  const data = store([user("u1")]);
  backfillProjects(data);
  const first = listProjects(data, "u1")[0];
  const second = createProject(data, data.users[0], { name: "Deuxieme" });

  assert.equal(resolveProject(data, "u1", null)?.id, second.id, "creer un projet le rend actif");
  assert.equal(resolveProject(data, "u1", first.id)?.id, first.id, "une demande explicite valide gagne");

  assert.ok(archiveProject(data, "u1", second.id));
  assert.equal(listProjects(data, "u1").length, 1);
  assert.equal(resolveProject(data, "u1", second.id)?.id, first.id, "un projet archive n'est plus selectionnable");
});

test("the last remaining project cannot be archived", () => {
  const data = store([user("u1")]);
  backfillProjects(data);
  const only = listProjects(data, "u1")[0];
  assert.equal(archiveProject(data, "u1", only.id), null);
  assert.equal(listProjects(data, "u1").length, 1);
  assert.equal(archiveProject(data, "u1", "prj_inconnu"), null);
});

test("inScope isolates projects, including unassigned content", () => {
  const me = { id: "u1", projectId: "p1" };
  assert.equal(inScope({ userId: "u1", projectId: "p1" }, me), true);
  assert.equal(inScope({ userId: "u1", projectId: "p2" }, me), false, "un autre projet du meme compte est invisible");
  assert.equal(inScope({ userId: "u2", projectId: "p1" }, me), false, "jamais le contenu d'un autre compte, meme avec le meme id de projet");
  assert.equal(inScope({ userId: "u1" }, me), false, "une ligne non migree ne doit pas etre partagee entre projets");
  assert.equal(inScope({ userId: "u1", projectId: "p2" }, { id: "u1" }), true, "un appelant sans projet (chemin ancien) voit tout son compte");
});

test("a draft project is not completed and the session exposes the project's business", () => {
  const owner = user("u1", { business: { name: "Legacy" } as never, onboarding: { completedAt: "2026-01-02T00:00:00.000Z" } as never });
  const data = store([owner]);
  backfillProjects(data);
  const first = listProjects(data, "u1")[0];
  assert.equal(publicProject(first).completed, true, "le projet migre d'un compte onboarde est complet");

  const draft = createProject(data, owner, { name: "Brouillon", business: { name: "Draft Co" } as never });
  assert.equal(publicProject(draft).completed, false);

  const base: PublicUser = { id: "u1", email: "u1@example.com", name: "u1", plan: "pro", createdAt: "", hasPassword: false, hasGoogle: false, hasGithub: false, settings: {} as never, business: owner.business!, onboarded: true };
  const pub = withProject(base, draft);
  assert.equal(pub.projectId, draft.id);
  assert.equal(pub.business?.name, "Draft Co", "le business de session est celui du projet, pas la copie du compte");
});

test("a migrated project is complete when the account shows any onboarding signal, and gets repaired", () => {
  const byBusiness = user("u1", { business: { name: "Old", analyzedAt: "2026-01-01T00:00:00.000Z" } as never });
  const fresh = user("u2");
  const data = store([byBusiness, fresh]);
  backfillProjects(data);
  assert.equal(publicProject(listProjects(data, "u1")[0]).completed, true, "business analyse = compte onboarde");
  assert.equal(publicProject(listProjects(data, "u2")[0]).completed, false, "compte neuf : projet a terminer");

  // Projet ecrit par une version anterieure, sans completedAt.
  const stale = listProjects(data, "u1")[0];
  stale.completedAt = undefined;
  backfillProjects(data);
  assert.equal(publicProject(listProjects(data, "u1")[0]).completed, true, "repare a la lecture suivante");
});
