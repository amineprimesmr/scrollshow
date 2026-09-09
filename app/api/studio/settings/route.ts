import { clearSessionCookie, hashPassword, readSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { isValidTimezone, resolveSettings } from "@/lib/settings";
import { findUserByEmail, publicUser, updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { readStore } from "@/lib/store";
import { queueDeletedMedia } from "@/lib/media-cleanup";
import { revokeAccessToken } from "@/lib/tiktok";
import { revokeAllForUser } from "@/lib/oauth";

const profileSchema = z.object({
  action: z.literal("profile"),
  name: z.string().trim().min(1).max(40),
  email: z.string().email().max(120),
});

const passwordSchema = z.object({
  action: z.literal("password"),
  currentPassword: z.string().min(1).max(80).optional(),
  newPassword: z.string().min(8).max(80),
});

const unlinkSchema = z.object({
  action: z.literal("unlink_google"),
});

const unlinkGithubSchema = z.object({
  action: z.literal("unlink_github"),
});

const preferencesSchema = z.object({
  action: z.literal("preferences"),
  locale: z.enum(["fr", "en"]),
  theme: z.enum(["light", "dark", "system"]).default("dark"),
  timezone: z.string().min(1).max(80),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  defaultPostTime: z.string().regex(/^\d{2}:\d{2}$/),
  defaultStatus: z.enum(["draft", "scheduled"]),
  autoAddMusic: z.boolean(),
  notifyPublishSuccess: z.boolean(),
  notifyPublishFailure: z.boolean(),
});

const schema = z.discriminatedUnion("action", [profileSchema, passwordSchema, unlinkSchema, unlinkGithubSchema, preferencesSchema]);

export async function PATCH(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const body = parsed.data;

  if (body.action === "profile") {
    const email = body.email.toLowerCase();
    if (email !== session.email.toLowerCase()) return NextResponse.json({ error: "email_change_requires_verification" }, { status: 400 });
    const updated = await updateStore((data) => {
      const user = data.users.find((item) => item.id === session.id);
      if (!user) return null;
      const taken = findUserByEmail(data, email);
      if (taken && taken.id !== user.id) return "exists" as const;
      user.name = body.name;
      user.email = email;
      return user;
    });
    if (updated === "exists") return NextResponse.json({ error: "exists" }, { status: 409 });
    if (!updated) return NextResponse.json({ error: "missing" }, { status: 404 });
    const pub = publicUser(updated);
    await setSessionCookie(pub);
    return NextResponse.json({ user: pub });
  }

  if (body.action === "password") {
    const updated = await updateStore(async (data) => {
      const user = data.users.find((item) => item.id === session.id);
      if (!user) return null;
      if (user.passwordHash) {
        if (!body.currentPassword || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
          return "bad_password" as const;
        }
      }
      user.passwordHash = await hashPassword(body.newPassword);
      revokeAllForUser(data, user.id);
      user.sessionVersion = (user.sessionVersion || 0) + 1;
      return user;
    });
    if (updated === "bad_password") return NextResponse.json({ error: "password" }, { status: 401 });
    if (!updated) return NextResponse.json({ error: "missing" }, { status: 404 });
    await setSessionCookie(publicUser(updated));
    return NextResponse.json({ user: publicUser(updated) });
  }

  if (body.action === "unlink_google" || body.action === "unlink_github") {
    const unlinkGoogle = body.action === "unlink_google";
    const updated = await updateStore((data) => {
      const user = data.users.find((item) => item.id === session.id);
      if (!user) return null;
      // Never leave an account with no way back in.
      const remaining = unlinkGoogle ? user.githubId : user.googleId;
      if (!user.passwordHash && !remaining) return "need_password" as const;
      if (unlinkGoogle) user.googleId = undefined;
      else user.githubId = undefined;
      return user;
    });
    if (updated === "need_password") return NextResponse.json({ error: "need_password" }, { status: 400 });
    if (!updated) return NextResponse.json({ error: "missing" }, { status: 404 });
    return NextResponse.json({ user: publicUser(updated) });
  }

  if (!isValidTimezone(body.timezone)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const updated = await updateStore((data) => {
    const user = data.users.find((item) => item.id === session.id);
    if (!user) return null;
    user.settings = {
      ...resolveSettings(user),
      locale: body.locale,
      theme: body.theme,
      timezone: body.timezone,
      weekStartsOn: body.weekStartsOn,
      defaultPostTime: body.defaultPostTime,
      defaultStatus: body.defaultStatus,
      autoAddMusic: body.autoAddMusic,
      notifyPublishSuccess: body.notifyPublishSuccess,
      notifyPublishFailure: body.notifyPublishFailure,
    };
    return user;
  });
  if (!updated) return NextResponse.json({ error: "missing" }, { status: 404 });
  return NextResponse.json({ user: publicUser(updated) });
}

export async function DELETE() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const claim = new Date().toISOString();
  const prepared = await updateStore(data => {
    const owner = data.users.find(u => u.id === session.id);
    if (!owner || owner.deletionPendingAt) return null;
    if (data.posts.some(p => p.userId === session.id && ["PREPARING", "INITIATING", "PROCESSING", "REVIEW_REQUIRED"].includes(p.publishState || ""))) return "publication_in_progress" as const;
    const channels = data.channels.filter(c => c.userId === session.id);
    if (channels.some(c => c.accessToken && c.platform !== "tiktok")) return "disconnect_other_platforms_first" as const;
    owner.deletionPendingAt = claim;
    return { owner: structuredClone(owner), channels: structuredClone(channels) };
  });
  if (!prepared) return NextResponse.json({ error: "missing_or_deletion_pending" }, { status: 409 });
  if (typeof prepared === "string") return NextResponse.json({ error: prepared }, { status: 409 });
  try {
    if (prepared.owner.stripeSubscriptionId) {
      const subscription = await stripe().subscriptions.retrieve(prepared.owner.stripeSubscriptionId);
      if (subscription.status !== "canceled") await stripe().subscriptions.cancel(subscription.id);
    }
    for (const channel of prepared.channels) if (channel.accessToken) await revokeAccessToken(channel.accessToken);
  } catch {
    await updateStore(data => { const owner = data.users.find(u => u.id === session.id); if (owner?.deletionPendingAt === claim) owner.deletionPendingAt = undefined; });
    return NextResponse.json({ error: "provider_cancellation_required_retry_or_contact_support" }, { status: 503 });
  }

  await updateStore((data) => {
    const owner = data.users.find(u => u.id === session.id);
    if (owner?.deletionPendingAt !== claim) throw new Error("deletion_claim_lost");
    queueDeletedMedia(data, { user: owner, posts: data.posts.filter(p => p.userId === session.id), media: data.media.filter(m => m.userId === session.id) });
    const channelIds = new Set(data.channels.filter(c => c.userId === session.id).map(c => c.id));
    data.pushSubscriptions = data.pushSubscriptions?.filter(s => s.userId !== session.id);
    data.warmedOrders = data.warmedOrders?.filter(o => o.userId !== session.id);
    data.videoStats = data.videoStats?.filter(s => !channelIds.has(s.channelId));
    data.channelStats = data.channelStats?.filter(s => !channelIds.has(s.channelId));
    data.users = data.users.filter((item) => item.id !== session.id);
    data.tiktokQrAttempts = (data.tiktokQrAttempts || []).filter((item) => item.userId !== session.id);
    data.channels = data.channels.filter((item) => item.userId !== session.id);
    data.posts = data.posts.filter((item) => item.userId !== session.id);
    data.media = data.media.filter((item) => item.userId !== session.id);
    data.apiKeys = data.apiKeys.filter((item) => item.userId !== session.id);
    data.accounts = data.accounts.filter((item) => item.userId !== session.id);
    data.runs = data.runs.filter((item) => item.userId !== session.id);
    data.researchJobs = data.researchJobs?.filter(item => item.userId !== session.id);
    data.formatStudies = data.formatStudies?.filter(item => item.userId !== session.id);
    data.publicationText = data.publicationText?.filter(item => item.userId !== session.id);
  });

  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
