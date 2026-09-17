import type { AccountVideo } from "@/lib/types";

export type ResearchPostRow = {
  post: AccountVideo;
  account: { id: string; handle: string; avatar?: string; nickname?: string };
};

/** Filters only hide posts from a result set; they must never silently cap the
 * number of posts per creator or mix a different keyword into the current run. */
export function filterResearchPosts<T extends ResearchPostRow>(
  rows: T[],
  filters: {
    days: number;
    minPostViews: number;
    maxPostViews?: number | null;
    publishedAfter?: number | null;
    publishedBefore?: number | null;
    keptIds?: ReadonlySet<string>;
    leaving?: Readonly<Record<string, true>>;
    gone?: Readonly<Record<string, true>>;
  },
  now = Date.now(),
) {
  const hidden = { views: 0, unknownViews: 0, date: 0, unknownDate: 0, library: 0 };
  const posts: T[] = [];
  const seen = new Set<string>();
  const filteredViews = filters.minPostViews > 0 || filters.maxPostViews != null;
  const filteredDates = filters.days > 0 || filters.publishedAfter != null || filters.publishedBefore != null;
  const from = Math.max(filters.days > 0 ? now - filters.days * 86_400_000 : -Infinity, filters.publishedAfter ?? -Infinity);
  const to = Math.min(now, filters.publishedBefore ?? now);
  let total = 0;
  for (const row of rows) {
    const { post } = row;
    if (post.kind !== "photo" || seen.has(post.id)) continue;
    seen.add(post.id);
    total += 1;
    if (filters.gone?.[post.id] || (filters.keptIds?.has(post.id) && !filters.leaving?.[post.id])) {
      hidden.library += 1;
    } else if (filteredViews && (post.missingMetrics?.includes("views") || !Number.isFinite(post.views))) {
      hidden.unknownViews += 1;
    } else if (post.views < filters.minPostViews || (filters.maxPostViews != null && post.views > filters.maxPostViews)) {
      hidden.views += 1;
    } else if (filteredDates && (!Number.isFinite(post.createdAt) || post.createdAt <= 0)) {
      hidden.unknownDate += 1;
    } else if (post.createdAt * 1000 > to || (post.createdAt > 0 && post.createdAt * 1000 < from)) {
      hidden.date += 1;
    } else {
      posts.push(row);
    }
  }
  return { posts, hidden, total };
}

/** Date inputs describe full local calendar days, including the final day. */
export function researchDateBounds(from: string, to: string) {
  const parse = (value: string, end: boolean) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    if (end) date.setDate(date.getDate() + 1);
    return date.getTime() - (end ? 1 : 0);
  };
  return { publishedAfter: parse(from, false), publishedBefore: parse(to, true) };
}

/** Histograms describe measured, unique photo posts before display filters.
 * Unknown values do not become a misleading zero-height data point. */
export function researchHistogram(rows: ResearchPostRow[], field: "views" | "date", now = Date.now(), count = 12) {
  const values: number[] = [];
  const seen = new Set<string>();
  let unknown = 0;
  for (const { post } of rows) {
    if (post.kind !== "photo" || seen.has(post.id)) continue;
    seen.add(post.id);
    const value = field === "views" ? post.views : post.createdAt * 1000;
    if (!Number.isFinite(value) || value < 0 || (field === "views" && post.missingMetrics?.includes("views"))
      || (field === "date" && (value <= 0 || value > now))) { unknown += 1; continue; }
    values.push(value);
  }
  if (!values.length) return { bins: [], known: 0, unknown, min: null, max: null };
  const min = Math.min(...values), max = Math.max(...values);
  const scale = (value: number) => field === "views" ? Math.log10(value + 1) : value;
  const invert = (value: number) => field === "views" ? 10 ** value - 1 : value;
  const low = scale(min), high = scale(max);
  const binCount = min === max ? 1 : Math.max(1, count);
  const bins = Array.from({ length: binCount }, (_, index) => ({
    min: index === 0 ? min : invert(low + (high - low) * index / binCount),
    max: index === binCount - 1 ? max : invert(low + (high - low) * (index + 1) / binCount),
    count: 0,
  }));
  for (const value of values) {
    const index = high === low ? 0 : Math.min(binCount - 1, Math.floor((scale(value) - low) / (high - low) * binCount));
    bins[index].count += 1;
  }
  return { bins, known: values.length, unknown, min, max };
}

/** A slow poll that began before Stop must not put a terminal job back into
 * running. The server increments revision for every committed state change. */
export function mergeResearchJobs<T extends { id: string; revision: number; createdAt: string }>(
  current: T[],
  incoming: T[],
) {
  const jobs = new Map(current.map((job) => [job.id, job]));
  for (const job of incoming) {
    const previous = jobs.get(job.id);
    if (!previous || job.revision >= previous.revision) jobs.set(job.id, job);
  }
  return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
}
