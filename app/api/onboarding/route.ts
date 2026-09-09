import { readSession, setSessionCookie } from "@/lib/auth";
import { analyzeBusiness, AnalyzeError, enrichTikTok } from "@/lib/business-analyzer";
import { rotateOnboardingKey } from "@/lib/api-keys";
import { savePublicImage } from "@/lib/media-files";
import { publicUser, readStore, updateStore } from "@/lib/store";
import type { BusinessProfile } from "@/lib/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 60;

const analyzeSchema = z.object({ action: z.literal("analyze"), url: z.string().trim().min(2).max(300) });

const tiktokSchema = z.object({ action: z.literal("tiktok"), handle: z.string().trim().min(2).max(80) });

const profileSchema = z.object({
  action: z.literal("profile"),
  name: z.string().trim().min(1).max(40),
  company: z.string().trim().min(1).max(60),
  /** data:image/... URL, at most ~1.5 MB once decoded. */
  logo: z.string().max(2_200_000).optional().nullable(),
});

const businessSchema = z.object({
  action: z.literal("business"),
  business: z.object({
    name: z.string().trim().min(1).max(60),
    url: z.string().trim().max(300),
    kind: z.enum(["saas", "ecommerce", "mobile_app", "creator", "agency", "service", "media", "other"]),
    logo: z.string().max(2000).optional(),
    tagline: z.string().max(200).optional(),
    description: z.string().max(400).optional(),
    language: z.string().max(5).optional(),
    brandColor: z.string().max(9).optional(),
    keywords: z.array(z.string().max(40)).max(12),
    socials: z
      .array(
        z.object({
          platform: z.enum(["tiktok", "instagram", "youtube", "x", "linkedin", "facebook"]),
          url: z.string().max(300),
          handle: z.string().max(60),
        }),
      )
      .max(8),
    signals: z.array(z.string().max(30)).max(10),
    tiktok: z
      .object({
        handle: z.string(),
        nickname: z.string(),
        avatar: z.string(),
        followers: z.number(),
        likes: z.number(),
        videos: z.number(),
        avgViews: z.number(),
        photoShare: z.number(),
        source: z.enum(["tiktok", "api"]),
      })
      .nullable()
      .optional(),
    goal: z.enum(["sell", "installs", "awareness", "traffic", "monetize", "leads"]).optional(),
    cadence: z.enum(["daily", "3w", "weekly", "unsure"]).optional(),
    analyzedAt: z.string(),
  }),
});

const keySchema = z.object({ action: z.literal("key") });
const progressSchema = z.object({ action: z.literal("progress"), step: z.number().int().min(0).max(3) });

const finishSchema = z.object({
  action: z.literal("finish"),
  heardFrom: z.array(z.string().max(30)).max(10).default([]),
});

const schema = z.discriminatedUnion("action", [analyzeSchema, tiktokSchema, profileSchema, businessSchema, keySchema, progressSchema, finishSchema]);

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await readStore();
  const user = data.users.find((item) => item.id === session.id);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ user: publicUser(user), company: user.business?.name || "", logo: user.business?.logo || "", step: user.onboarding?.step || 0, heardFrom: user.onboarding?.heardFrom || [] });
}

async function storeLogo(dataUrl: string | null | undefined) {
  if (!dataUrl) return "";
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return "";
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 1_500_000) return "";
  return savePublicImage(bytes, match[1]);
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const body = parsed.data;
  if (body.action === "progress") {
    await updateStore(data => { const user = data.users.find(item => item.id === session.id); if (user) user.onboarding = { ...user.onboarding, step: body.step }; });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "analyze") {
    try {
      const business = await analyzeBusiness(body.url);
      return NextResponse.json({ business });
    } catch (error) {
      const code = error instanceof AnalyzeError ? error.code : "unreachable";
      return NextResponse.json({ error: code }, { status: code === "invalid_url" ? 400 : 502 });
    }
  }

  if (body.action === "key") {
    const created = await rotateOnboardingKey(session.id);
    if (!created) return NextResponse.json({ error: "limit" }, { status: 400 });
    return NextResponse.json({ token: created.token });
  }

  if (body.action === "tiktok") {
    const tiktok = await enrichTikTok(body.handle);
    return NextResponse.json({ tiktok });
  }

  if (body.action === "profile") {
    const logo = await storeLogo(body.logo);
    const user = await updateStore((data) => {
      const item = data.users.find((entry) => entry.id === session.id);
      if (!item) return null;
      item.name = body.name;
      const base: BusinessProfile = item.business || {
        name: body.company,
        url: "",
        kind: "other",
        keywords: [],
        socials: [],
        signals: [],
        analyzedAt: new Date().toISOString(),
      };
      item.business = { ...base, name: body.company, logo: logo || base.logo };
      return item;
    });
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ user: publicUser(user) });
  }

  if (body.action === "business") {
    const user = await updateStore((data) => {
      const item = data.users.find((entry) => entry.id === session.id);
      if (!item) return null;
      // Un logo deja televerse par l'utilisateur l'emporte sur celui trouve sur le site.
      const uploaded = item.business?.logo && item.business.logo.startsWith("/api/i/") ? item.business.logo : "";
      item.business = { ...body.business, tiktok: body.business.tiktok ?? null, logo: uploaded || body.business.logo };
      return item;
    });
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ user: publicUser(user) });
  }

  // finish
  const current = (await readStore()).users.find(item => item.id === session.id);
  if (!current?.name?.trim() || !current.business?.name?.trim() || !current.business?.analyzedAt) return NextResponse.json({ error: "profile_incomplete" }, { status: 400 });
  const user = await updateStore((data) => {
    const item = data.users.find((entry) => entry.id === session.id);
    if (!item) return null;
    // Every business is here to sell, at the maximum daily rhythm: no question asked.
    if (item.business) {
      item.business.goal = item.business.goal || "sell";
      item.business.cadence = item.business.cadence || "daily";
    }
    item.onboarding = { ...(item.onboarding || {}), completedAt: new Date().toISOString(), heardFrom: body.heardFrom };
    return item;
  });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const pub = publicUser(user);
  await setSessionCookie(pub);
  return NextResponse.json({ user: pub });
}
