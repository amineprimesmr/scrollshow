import assert from "node:assert/strict";
import test from "node:test";
import { analyzeShadowban, reachFloorFor } from "../lib/shadowban";
import type { TikTokVideo } from "../lib/tiktok";

const DAY = 86_400;

function post(daysAgo: number, views: number, engagement = 0.08): TikTokVideo {
  const likes = Math.round(views * engagement);
  return {
    id: `v-${daysAgo}-${views}`,
    create_time: Math.round(Date.now() / 1000 - daysAgo * DAY),
    view_count: views,
    like_count: likes,
    comment_count: 0,
    share_count: 0,
    video_description: `post ${daysAgo}`,
    cover_image_url: "",
    share_url: "",
  };
}

function series(spec: Array<[number, number]>, engagement = 0.08) {
  return spec.map(([daysAgo, views]) => post(daysAgo, views, engagement));
}

/**
 * @ladyycinnamon, mesure reelle du 10 septembre 2026 : 33 posts, mediane
 * 5 401 vues, de 1 040 a 1 360 142. Les 4 derniers a ~1 400 vues valaient
 * « Shadowban » a l'ancien moteur (-84 % contre la mediane) alors que le
 * compte varie naturellement d'un facteur 5.
 */
const CINNAMON: Array<[number, number, number]> = [
  [4.73, 1438, 152], [5.15, 1710, 205], [6.6, 1040, 279], [7.89, 1268, 352], [8.19, 5401, 661],
  [8.87, 238074, 52810], [9.88, 8618, 2255], [9.93, 394549, 114043], [12.76, 1332, 197],
  [13.79, 1360142, 412127], [17.64, 9125, 1337], [18.67, 22356, 5876], [23.64, 32459, 6392],
  [26.61, 442999, 91837], [26.69, 10740, 2369], [28.61, 31374, 6558], [28.65, 4175, 510],
  [30.54, 4181, 456], [32.65, 3233, 476], [33.63, 1931, 119], [33.91, 1701, 100],
  [33.97, 2185, 256], [35.62, 4360, 594], [39.58, 9889, 1593], [39.69, 19518, 4384],
  [40.57, 2187, 367], [40.65, 1440, 177], [42.53, 2666, 428], [42.67, 2026, 168],
  [43.73, 87010, 29453], [44.66, 178072, 47805], [45.12, 5906, 762], [45.54, 187024, 40658],
];

function cinnamon(): TikTokVideo[] {
  return CINNAMON.map(([daysAgo, views, likes]) => ({
    id: `c-${daysAgo}`,
    create_time: Math.round(Date.now() / 1000 - daysAgo * DAY),
    view_count: views,
    like_count: likes,
    comment_count: 0,
    share_count: 0,
    video_description: "",
    cover_image_url: "",
    share_url: "",
  }));
}

test("un compte tres variable dont les derniers posts sont bas n'est pas shadowban", () => {
  const report = analyzeShadowban(cinnamon(), { followers: 2372 });
  assert.equal(report.verdict, "none");
  assert.equal(report.volatility, "erratic");
  // La baisse existe bien, elle est simplement dans la normale du compte.
  assert.ok(report.dropPct > 0.7, `dropPct=${report.dropPct}`);
  assert.ok(Math.abs(report.zScore) < 1.5, `z=${report.zScore}`);
  assert.ok(report.swingFactor > 3, `swing=${report.swingFactor}`);
  assert.deepEqual(report.signals, []);
  assert.equal(report.estimatedOnset, null);
});

test("le meme -84 % sur un compte regulier est un effondrement", () => {
  const steady = series([
    [1.2, 820], [2.5, 760], [4, 910], [6, 880],
    [9, 5100], [11, 4800], [13, 5600], [15, 5200], [18, 4700], [21, 5400], [24, 4900], [27, 5300],
  ]);
  const report = analyzeShadowban(steady, { followers: 40_000 });
  assert.equal(report.verdict, "likely");
  assert.equal(report.volatility, "steady");
  assert.ok(report.zScore < -2.5, `z=${report.zScore}`);
  assert.ok(report.signals.some((s) => s.id === "reach_collapse"));
  assert.ok(report.signals.some((s) => s.id === "below_follower_reach"));
  assert.ok(report.estimatedOnset);
});

test("une baisse relative seule ne suffit jamais a dire shadowban", () => {
  // Meme effondrement, mais aucun compteur d'abonnes connu et une portee qui
  // reste tres au-dessus du lot de test : au maximum « a surveiller ».
  const steady = series([
    [1.2, 4200], [2.5, 3900], [4, 4400], [6, 4100],
    [9, 52000], [11, 48000], [13, 56000], [15, 52000], [18, 47000], [21, 54000], [24, 49000], [27, 53000],
  ]);
  const report = analyzeShadowban(steady, { followers: 0 });
  assert.equal(report.verdict, "mild");
  assert.equal(report.signals.filter((s) => s.kind === "hard").length, 1);
});

test("des posts a 0 vue sont un shadowban quelle que soit la variance", () => {
  // Un post de moins de 48h reste exclu, meme a 0 vue : le fournisseur peut retarder.
  const videos = series([
    [2.5, 0], [4, 0], [6, 140], [8, 9000], [10, 12000], [13, 8000], [16, 11000], [19, 9500],
  ]);
  const report = analyzeShadowban(videos, { followers: 12_000 });
  assert.equal(report.verdict, "likely");
  assert.ok(report.signals.some((s) => s.id === "never_seeded"));
});

test("un petit compte bloque dans le lot de test est detecte sans compteur d'abonnes", () => {
  const videos = series([[1.5, 130], [3, 90], [5, 170], [6.5, 110], [9, 2400], [12, 2900], [15, 2600], [18, 3100], [21, 2700], [24, 2500]]);
  const report = analyzeShadowban(videos, { followers: null });
  assert.equal(report.verdict, "likely");
  assert.ok(report.signals.some((s) => s.id === "stuck_in_seed"));
  assert.equal(report.reachFloor, 200);
});

test("le plancher de diffusion suit le nombre d'abonnes, borne et jamais nul", () => {
  assert.equal(reachFloorFor(null), 200);
  assert.equal(reachFloorFor(0), 200);
  assert.equal(reachFloorFor(2372), 200);
  assert.equal(reachFloorFor(120_000), 1000);
});

test("les posts de moins de 48h sont exclus du verdict", () => {
  const videos = series([[0.5, 40], [1, 60], [4, 5200], [8, 4800], [12, 5400], [16, 5100], [20, 4900], [24, 5300]]);
  const report = analyzeShadowban(videos, { followers: 30_000 });
  assert.equal(report.freshCount, 2);
  assert.equal(report.videoCount, 6);
  assert.equal(report.verdict, "none");
  assert.equal(report.points.filter((p) => p.state === "fresh").length, 2);
});

test("moins de 5 posts murs : aucun verdict", () => {
  const report = analyzeShadowban(series([[3, 900], [6, 1200], [9, 800], [12, 1100]]), { followers: 5000 });
  assert.equal(report.verdict, "insufficient_data");
  assert.equal(report.windowMode, "none");
});

test("un compte sain garde ses posts en normal et ne date aucun debut", () => {
  const videos = series([[1.5, 5200], [4, 6100], [6, 4800], [10, 5500], [13, 5900], [16, 5100], [19, 6200], [22, 4700]]);
  const report = analyzeShadowban(videos, { followers: 30_000 });
  assert.equal(report.verdict, "none");
  assert.equal(report.points.filter((p) => p.state === "suppressed").length, 0);
  assert.equal(report.estimatedOnset, null);
});
