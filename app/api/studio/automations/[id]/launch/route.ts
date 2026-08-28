import { readSession } from "@/lib/auth";
import { resolveStoreUserId } from "@/lib/local-user";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await updateStore((data) => {
    const userId = resolveStoreUserId(data, user);
    const automation = data.automations?.find((a) => a.id === id && a.userId === userId);
    if (!automation) return "not_found" as const;

    const channel = automation.channelId
      ? data.channels.find((c) => c.id === automation.channelId && c.userId === userId)
      : data.channels.find((c) => c.userId === userId && c.platform === "tiktok");
    if (!channel) return "no_channel" as const;

    // Only schedule the user's own real drafts — never fabricate content. Oldest
    // first so a queue drains fairly instead of always resurfacing the newest.
    const queue = data.posts
      .filter((post) => post.userId === userId && post.status === "draft")
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    if (!queue.length) return "no_content" as const;

    const target = queue.slice(0, automation.postsTarget);
    const now = new Date();
    target.forEach((post, index) => {
      const date = new Date(now);
      date.setDate(date.getDate() + (index + 1) * automation.scheduleDays);
      post.status = "scheduled";
      post.inCalendar = true;
      post.channelIds = [channel.id];
      post.date = date.toISOString().slice(0, 10);
      post.time = automation.postTime;
    });

    automation.status = "active";
    automation.postsGenerated += target.length;
    automation.updatedAt = new Date().toISOString();
    return { automation, scheduled: target.length, requested: automation.postsTarget };
  });

  if (result === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (result === "no_channel") return NextResponse.json({ error: "no_channel" }, { status: 400 });
  if (result === "no_content") return NextResponse.json({ error: "no_content" }, { status: 400 });
  return NextResponse.json(result);
}
