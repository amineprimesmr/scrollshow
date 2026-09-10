import test from "node:test";
import assert from "node:assert/strict";
import { emptyStore } from "../lib/store";
import { filtersSchema, startResearchSchema, type ResearchJob } from "../lib/research/model";
import { applyResearchStep, keepForWall, publicJob } from "../lib/research/jobs";
import type { AccountVideo } from "../lib/types";

const now = Date.parse("2026-09-09T12:00:00Z");
function post(id: string, views = 100, days = 1): AccountVideo {
  return { id, title: "Example", caption: "Example", cover: "", views, likes: 5, comments: 1, shares: 1, saves: 2,
    createdAt: now / 1000 - days * 86400, kind: "photo", url: `https://www.tiktok.com/@example/photo/${id}`,
    images: ["https://p16.tiktokcdn.com/one.jpg"], measuredAt: new Date(now).toISOString() };
}
const filters = filtersSchema.parse({ minTotalViews: 0, minPosts: 1, minPostViews: 100_000, days: 30 });
function job(): ResearchJob {
  return { id: "job", userId: "u", input: startResearchSchema.parse({ keywords: ["sleepmaxing"], filters }),
    status: "running", phase: "measure", createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
    revision: 1, keywordIndex: 0, searchPage: 0, searchCursor: 0, candidates: [], processed: [], results: [],
    failures: [], events: [], exhausted: false, lease: { token: "lease", until: Date.now() + 180000 } };
}

test("le plancher du mur ecarte les videos, les vues inconnues et le hors-fenetre", () => {
  assert.equal(keepForWall(post("a", 200_000, 2), filters, now), true);
  assert.equal(keepForWall({ ...post("b", 200_000, 2), kind: "video" }, filters, now), false, "un mur de carrousels");
  assert.equal(keepForWall(post("c", 500, 2), filters, now), false, "sous le plancher demande");
  assert.equal(keepForWall(post("d", 200_000, 90), filters, now), false, "hors de la fenetre");
  assert.equal(
    keepForWall({ ...post("e", 200_000, 2), missingMetrics: ["views"] }, filters, now),
    false,
    "un compteur absent n'est pas un chiffre mesure : il ne doit pas passer pour tel",
  );
});

test("le carrousel trouve par le mot-cle est conserve et marque, le reste du feed ne l'est pas", () => {
  const j = job(), data = emptyStore();
  // Le post du mot-cle n'est volontairement PAS dans la page mesuree : c'est le
  // cas qui le faisait disparaitre au profit du meilleur post du compte.
  const matched = post("sleepmaxing-carousel", 120_000, 2);
  const offTopic = post("hairmaxxing-guide", 184_000, 2);
  j.candidates = [{ handle: "jawlmx", keyword: "sleepmaxing", sourceUrl: "https://www.tiktok.com/@jawlmx", posts: [matched] }];
  const task = { jobId: j.id, token: "lease", kind: "measure" as const, candidate: j.candidates[0], source: "provider" as const, filters, maxPages: 3 };

  applyResearchStep(data, j, task, { kind: "measure", posts: [offTopic], hasMore: false, followers: 5000 });

  const videos = data.accounts[0].videos!;
  const kept = videos.find((v) => v.id === "sleepmaxing-carousel");
  assert.ok(kept, "le carrousel du mot-cle doit survivre a la mesure du compte");
  assert.deepEqual(kept!.matchedKeywords, ["sleepmaxing"]);
  const other = videos.find((v) => v.id === "hairmaxxing-guide");
  assert.ok(other, "le reste du feed reste consultable");
  assert.equal(other!.matchedKeywords, undefined, "un post hors sujet ne doit jamais porter le mot-cle");
});

test("un meme carrousel trouve par deux mots-cles les porte tous les deux", () => {
  const j = job(), data = emptyStore();
  j.input.keywords = ["sleepmaxing", "sommeil"];
  const shared = post("shared", 120_000, 2);
  for (const keyword of ["sleepmaxing", "sommeil"]) {
    j.candidates = [{ handle: "jawlmx", keyword, sourceUrl: "https://www.tiktok.com/@jawlmx", posts: [shared] }];
    j.processed = [];
    j.lease = { token: "lease", until: Date.now() + 180000 };
    const task = { jobId: j.id, token: "lease", kind: "measure" as const, candidate: j.candidates[0], source: "provider" as const, filters, maxPages: 3 };
    applyResearchStep(data, j, task, { kind: "measure", posts: [shared], hasMore: false, followers: 5000 });
  }
  assert.deepEqual(data.accounts[0].videos!.find((v) => v.id === "shared")!.matchedKeywords, ["sleepmaxing", "sommeil"]);
});

test("les cartes d'attente n'annoncent que ce qui passera le filtre", () => {
  const j = job();
  j.phase = "search";
  j.candidates = [{ handle: "jawlmx", keyword: "sleepmaxing", sourceUrl: "https://www.tiktok.com/@jawlmx",
    posts: [post("faible", 581, 1), post("fort", 200_000, 1), post("vieux", 300_000, 120)] }];
  const shown = publicJob(j).pending[0].posts.map((p) => p.id);
  assert.deepEqual(shown, ["fort"], "581 vues sous un filtre 100k+ ne doit jamais s'afficher pour disparaitre ensuite");
});
