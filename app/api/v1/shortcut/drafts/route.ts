import { after } from "next/server";
import { agentResponse, bearerToken } from "@/lib/agent-http";
import { resolveApiKey } from "@/lib/api-keys";
import { hasStudioAccess } from "@/lib/plans";
import { readStoreSlice } from "@/lib/store";
import { drainShortcutJobs, shortcutJobs } from "@/lib/shortcut-queue";
import { textDraftManifest } from "@/lib/tiktok-draft-manifest";
import { consumeLimit } from "@/lib/rate-limit";

export const maxDuration = 300;

/** Read-only export for the local companion; it never schedules or publishes. */
export async function GET(request: Request) {
  const token = bearerToken(request);
  const user = token ? await resolveApiKey(token) : null;
  if (!user || !hasStudioAccess(user.plan)) return agentResponse({ error: "unauthorized" }, 401);
  if (!await consumeLimit(`api:${user.id}`, 120, 60000)) return agentResponse({ error: "rate_limited" }, 429);
  after(async () => { await drainShortcutJobs(user); });
  const data = await readStoreSlice(["posts"], { userId: user.id });
  const drafts = [];
  for (const source of data.posts) {
    if (source.userId !== user.id || (user.projectId && source.projectId !== user.projectId) || source.recreation?.mode !== "texts" || source.recreation.status !== "done") continue;
    const result = data.posts.find(post => post.id === source.recreation?.resultPostId && post.userId === user.id && post.projectId === source.projectId && post.status === "draft");
    if (!result?.recipe) continue;
    try { drafts.push(textDraftManifest(result.id, result.body, result.recipe, source.recipe?.slides.length || 0)); }
    catch { /* A later edit can make a draft unsuitable for native transfer. */ }
  }
  const response = agentResponse({ drafts, imports: await shortcutJobs(user), pilot: { requiresForeground: true, validated: false } });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
