import { startResearchSchema } from "./model";
import { startResearch } from "./jobs";
import type { SessionUser } from "../types";
import { z } from "zod";

/** The Studio searches photos. Even an old open tab must not accidentally
 * select the much slower account-analysis workflow or filter away the sample. */
export const studioSearchSchema = startResearchSchema.extend({ refresh: z.boolean().optional() })
  .transform(({ refresh, ...input }) => ({
    refresh: refresh === true,
    input: input.kind === "discover" ? {
      ...input, mode: "posts" as const, searchPages: 2, hashtagPivot: false,
      filters: { ...input.filters, days: 0, minPostViews: 0, minFollowers: 0 },
    } : input,
  }));

export function startStudioResearch(user: SessionUser, raw: unknown) {
  const { input, refresh } = studioSearchSchema.parse(raw);
  return startResearch(user, input, { reuseRecent: input.kind === "discover", refresh });
}
