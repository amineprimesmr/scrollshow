import { clearSessionCookie, hashPassword, readSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { isValidTimezone, resolveSettings } from "@/lib/settings";
import { findUserByEmail, publicUser, updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";

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

const preferencesSchema = z.object({
  action: z.literal("preferences"),
  locale: z.enum(["fr", "en"]),
  timezone: z.string().min(1).max(80),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  defaultPostTime: z.string().regex(/^\d{2}:\d{2}$/),
  defaultPrivacy: z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]),
  defaultStatus: z.enum(["draft", "scheduled"]),
  disableComments: z.boolean(),
  disableDuet: z.boolean(),
  disableStitch: z.boolean(),
  autoAddMusic: z.boolean(),
  brandContent: z.boolean(),
  brandOrganic: z.boolean(),
});

const schema = z.discriminatedUnion("action", [profileSchema, passwordSchema, unlinkSchema, preferencesSchema]);

export async function PATCH(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const body = parsed.data;

  if (body.action === "profile") {
    const email = body.email.toLowerCase();
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
      return user;
    });
    if (updated === "bad_password") return NextResponse.json({ error: "password" }, { status: 401 });
    if (!updated) return NextResponse.json({ error: "missing" }, { status: 404 });
    return NextResponse.json({ user: publicUser(updated) });
  }

  if (body.action === "unlink_google") {
    const updated = await updateStore((data) => {
      const user = data.users.find((item) => item.id === session.id);
      if (!user) return null;
      if (!user.passwordHash) return "need_password" as const;
      user.googleId = undefined;
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
      timezone: body.timezone,
      weekStartsOn: body.weekStartsOn,
      defaultPostTime: body.defaultPostTime,
      defaultPrivacy: body.defaultPrivacy,
      defaultStatus: body.defaultStatus,
      disableComments: body.disableComments,
      disableDuet: body.disableDuet,
      disableStitch: body.disableStitch,
      autoAddMusic: body.autoAddMusic,
      brandContent: body.brandContent,
      brandOrganic: body.brandOrganic,
    };
    return user;
  });
  if (!updated) return NextResponse.json({ error: "missing" }, { status: 404 });
  return NextResponse.json({ user: publicUser(updated) });
}

export async function DELETE() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await updateStore((data) => {
    data.users = data.users.filter((item) => item.id !== session.id);
    data.channels = data.channels.filter((item) => item.userId !== session.id);
    data.posts = data.posts.filter((item) => item.userId !== session.id);
    data.media = data.media.filter((item) => item.userId !== session.id);
    data.apiKeys = data.apiKeys.filter((item) => item.userId !== session.id);
    data.accounts = data.accounts.filter((item) => item.userId !== session.id);
    data.runs = data.runs.filter((item) => item.userId !== session.id);
  });

  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
