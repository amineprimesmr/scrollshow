import { readSession } from "@/lib/auth";
import { resolveStoreUserId } from "@/lib/local-user";
import { readStore, updateStore } from "@/lib/store";
import type { Automation } from "@/lib/types";
import { NextResponse } from "next/server";

function defaultName() {
  const d = new Date();
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} Campaign`;
}

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await readStore();
  const userId = resolveStoreUserId(data, user);
  const automations = (data.automations || []).filter((item) => item.userId === userId);
  return NextResponse.json({ automations });
}

export async function POST() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date().toISOString();
  const automation = await updateStore((data) => {
    const userId = resolveStoreUserId(data, user);
    const channel = data.channels.find((c) => c.userId === userId && c.platform === "tiktok");
    const item: Automation = {
      id: crypto.randomUUID(),
      userId,
      name: defaultName(),
      status: "draft",
      channelId: channel?.id,
      postsTarget: 5,
      scheduleDays: 1,
      postTime: "18:00",
      postsGenerated: 0,
      createdAt: now,
      updatedAt: now,
    };
    data.automations ||= [];
    data.automations.unshift(item);
    return item;
  });
  return NextResponse.json({ automation });
}
