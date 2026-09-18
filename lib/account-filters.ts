/**
 * Filtres et indicateurs du panneau de compte (Overview). Logique pure : tout
 * se calcule sur les posts deja charges, aucun appel reseau.
 *
 * Regle de provenance : un compteur absent (`missingMetrics`) n'est jamais un
 * zero. Un post aux vues inconnues ne passe donc aucun filtre de vues ou
 * d'engagement, et il est ecarte des moyennes au lieu de les tirer vers le bas.
 */

export type FilterKind = "all" | "photo" | "video";
export type FilterPerf = "all" | "above" | "top";

export type PostFilters = {
  kind: FilterKind;
  minViews: number;
  /** En pourcentage : 5 = 5 %. */
  minEngagement: number;
  perf: FilterPerf;
};

export const NO_FILTERS: PostFilters = { kind: "all", minViews: 0, minEngagement: 0, perf: "all" };
export const VIEW_STEPS = [0, 1_000, 10_000, 100_000, 1_000_000];
export const ENGAGEMENT_STEPS = [0, 2, 5, 10];

type Post = {
  kind?: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  createdAt: number;
  missingMetrics?: string[];
};

const knows = (post: Post, metric: string) => !post.missingMetrics?.includes(metric);
const measured = (post: Post) => !post.missingMetrics?.length;

export function engagementPercent(post: Post) {
  return post.views ? Math.round(((post.likes + post.comments + post.shares) / post.views) * 1000) / 10 : 0;
}

function medianOf(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** Seuils de performance, mesures sur TOUS les posts charges (pas sur le filtre). */
export function perfThresholds(posts: Post[]) {
  const views = posts.filter((post) => knows(post, "views")).map((post) => post.views).sort((a, b) => b - a);
  return {
    median: medianOf(views),
    top: views.length ? views[Math.max(0, Math.ceil(views.length / 10) - 1)] : 0,
  };
}

export function activeFilterCount(filters: PostFilters) {
  return Number(filters.kind !== "all") + Number(filters.minViews > 0) + Number(filters.minEngagement > 0) + Number(filters.perf !== "all");
}

export function applyPostFilters<T extends Post>(posts: T[], filters: PostFilters): T[] {
  const thresholds = filters.perf === "all" ? null : perfThresholds(posts);
  return posts.filter((post) => {
    if (filters.kind !== "all" && post.kind !== filters.kind) return false;
    const needsViews = filters.minViews > 0 || filters.minEngagement > 0 || filters.perf !== "all";
    if (needsViews && !knows(post, "views")) return false;
    if (post.views < filters.minViews) return false;
    if (filters.minEngagement > 0 && (!measured(post) || engagementPercent(post) < filters.minEngagement)) return false;
    if (thresholds && post.views < (filters.perf === "top" ? thresholds.top : thresholds.median)) return false;
    return true;
  });
}

export type PostKpis = {
  posts: number;
  /** Faux des qu'un post du lot a un compteur inconnu : les totaux sont partiels. */
  complete: boolean;
  views: number;
  avgViews: number;
  medianViews: number;
  bestViews: number;
  likes: number;
  comments: number;
  shares: number;
  engagement: number;
  /** Posts par semaine entre le premier et le dernier post date du lot. */
  cadence: number;
};

export function postKpis(posts: Post[]): PostKpis {
  const known = posts.filter(measured);
  const views = known.reduce((n, post) => n + post.views, 0);
  const likes = known.reduce((n, post) => n + post.likes, 0);
  const comments = known.reduce((n, post) => n + post.comments, 0);
  const shares = known.reduce((n, post) => n + post.shares, 0);
  const dates = posts.map((post) => post.createdAt).filter((date) => date > 0);
  const weeks = dates.length > 1 ? Math.max(1, (Math.max(...dates) - Math.min(...dates)) / (7 * 86400)) : 0;
  return {
    posts: posts.length,
    complete: known.length === posts.length,
    views,
    avgViews: known.length ? Math.round(views / known.length) : 0,
    medianViews: medianOf(known.map((post) => post.views)),
    bestViews: known.reduce((n, post) => Math.max(n, post.views), 0),
    likes,
    comments,
    shares,
    engagement: views ? Math.round(((likes + comments + shares) / views) * 1000) / 10 : 0,
    cadence: weeks ? Math.round((dates.length / weeks) * 10) / 10 : 0,
  };
}
