import { NextResponse } from "next/server";
import { z } from "zod";
import { readStudioSession } from "@/lib/auth";
import { consumeLimit } from "@/lib/rate-limit";
import { indexPublicationText } from "@/lib/publication-text-index";

export const maxDuration = 120;
const schema = z.object({ key: z.string().regex(/^(ch|ac):[^:]+$/).max(150), days: z.union([z.literal("all"), z.number().int().min(1).max(3650)]).default("all"), retryFailed: z.boolean().default(false), priorityPostId: z.string().max(100).optional(), after: z.string().datetime().optional() });
export async function POST(request: Request) {
  const user = await readStudioSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (!await consumeLimit(`publication-text:${user.id}`, 120, 60000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  try {
    const result = await indexPublicationText(user, input.data.key, input.data.days === "all" ? null : input.data.days, input.data.retryFailed, input.data.priorityPostId);
    // Include work completed while the browser was paused or another tab was reading.
    // The cursor is derived from stored results, never from the request start time.
    const dates = result.updates.flatMap(v => v.slideTexts?.flatMap(s => s.updatedAt ? [s.updatedAt] : []) || []).sort();
    const cursor = dates.at(-1);
    const updates = input.data.after && !input.data.retryFailed ? result.updates.filter(v => v.slideTexts?.some(s => s.updatedAt && s.updatedAt >= input.data.after!)) : result.updates;
    return NextResponse.json({ ...result, updates, cursor });
  }
  catch (error) { const code = error instanceof Error ? error.message : "text_failed"; return NextResponse.json({ error: code }, { status: code === "missing" ? 404 : 503 }); }
}
