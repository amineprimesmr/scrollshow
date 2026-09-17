import { database, databaseEnabled } from "../database";
import { backfillProjects, inScope } from "../projects";
import { emptyStore, readStoreSlice } from "../store";
import type { SessionUser } from "../types";
import type { ResearchJob } from "./model";

/** A detail poll transfers only the requested user's job, not historical
 * account samples belonging to every research job in the store. */
export async function readResearchJobs(user: SessionUser, id?: string): Promise<ResearchJob[]> {
  if (!databaseEnabled()) {
    const data = await readStoreSlice(["researchJobs"]);
    return (data.researchJobs || []).filter(job => inScope(job, user) && (id === undefined || job.id === id));
  }

  const rows = await database()`
    SELECT COALESCE(s.data->'users', '[]'::jsonb) AS users,
      COALESCE(s.data->'projects', '[]'::jsonb) AS projects,
      COALESCE((
        SELECT jsonb_agg(entry.job ORDER BY entry.position)
        FROM jsonb_array_elements(COALESCE(s.data->'researchJobs', '[]'::jsonb))
          WITH ORDINALITY AS entry(job, position)
        WHERE entry.job->>'userId' = ${user.id}
          AND (${id ?? null}::text IS NULL OR entry.job->>'id' = ${id ?? null})
      ), '[]'::jsonb) AS research_jobs
    FROM scrollshow_state s WHERE s.id = 1`;
  if (!rows.length) throw new Error("database_not_migrated");
  // Legacy jobs without projectId belong to the original project, even after
  // the user switches projects or archives that original project. Apply the
  // same migration as readStoreSlice before checking the requested workspace.
  const data = backfillProjects({
    ...emptyStore(),
    users: rows[0].users,
    projects: rows[0].projects,
    researchJobs: rows[0].research_jobs,
  });
  return (data.researchJobs || []).filter(job => inScope(job, user));
}
