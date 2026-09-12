import type { StoreData, StudioPost } from "./types";
import { inScope } from "./projects";

export class PostValidationError extends Error {
  status = 400;
}

export function postErrorResponse(error: unknown): never | Response {
  if (error instanceof PostValidationError) return Response.json({ error: error.message }, { status: error.message === "publication_locked" ? 409 : 400 });
  if (error instanceof Error && error.message === "media_access_denied") return Response.json({ error: "media_access_denied" }, { status: 403 });
  throw error;
}

export function assertEditable(post: StudioPost) {
  if (post.publishId || ["PREPARING", "INITIATING", "PROCESSING", "REVIEW_REQUIRED"].includes(post.publishState || "")) throw new PostValidationError("publication_locked");
}

/** Date et heure seules : ce qu'un deplacement dans le calendrier doit respecter. */
export function validateSchedule(post: Pick<StudioPost, "date" | "time">) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(post.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(post.time)) throw new PostValidationError("invalid_schedule");
  const d = new Date(post.date + "T12:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== post.date) throw new PostValidationError("invalid_schedule");
}

export function validatePost(data: StoreData, post: StudioPost) {
  if (!post.body.trim() || post.body.length > 2200) throw new PostValidationError("invalid_caption");
  validateSchedule(post);
  if (post.channelIds.some(id => ![...data.channels, ...data.accounts].some(c => c.id === id && inScope(c, { id: post.userId, projectId: post.projectId })))) throw new PostValidationError("channel_not_owned");
  if (post.status === "published" && post.publishState !== "PUBLISH_COMPLETE") throw new PostValidationError("published_status_reserved");
  if (post.status === "scheduled") {
    if (post.channelIds.length !== 1) throw new PostValidationError("select_one_connected_tiktok_account");
    if (!post.tiktok?.privacy) throw new PostValidationError("tiktok_options_required");
    if (!data.channels.some(c => c.id === post.channelIds[0] && c.platform === "tiktok" && c.connected && c.accessToken)) throw new PostValidationError("tiktok_not_connected");
  }
}
