import { readSession, setSessionCookie } from "@/lib/auth";
import { analyzeBusiness, AnalyzeError, enrichTikTok } from "@/lib/business-analyzer";
import { savePublicImage } from "@/lib/media-files";
import { createProject, findProject, publicProject, resolveProject } from "@/lib/projects";
import { PROJECT_COOKIE, setProjectCookie } from "@/lib/project-context";
import { publicUser, readStore, updateStore } from "@/lib/store";
import type { Project } from "@/lib/types";
import type { BusinessProfile } from "@/lib/types";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 60;

const analyzeSchema = z.object({ action: z.literal("analyze"), url: z.string().trim().min(2).max(300) });

const tiktokSchema = z.object({ action: z.literal("tiktok"), handle: z.string().trim().min(2).max(80) });

const projectRef = z.string().trim().min(1).max(120).optional();

const profileSchema = z.object({
  action: z.literal("profile"),
  project: projectRef,
  name: z.string().trim().min(1).max(40),
  company: z.string().trim().min(1).max(60),
  /** data:image/... URL, at most ~1.5 MB once decoded. */
  logo: z.string().max(2_200_000).optional().nullable(),
});

const businessSchema = z.object({
  action: z.literal("business"),
  /** "new" cree un brouillon de projet ; un id reprend un brouillon existant. */
  project: projectRef,
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

const progressSchema = z.object({ action: z.literal("progress"), project: projectRef, step: z.number().int().min(0).max(4) });

const finishSchema = z.object({
  action: z.literal("finish"),
  project: projectRef,
  heardFrom: z.array(z.string().max(30)).max(10).default([]),
});

const schema = z.discriminatedUnion("action", [analyzeSchema, tiktokSchema, profileSchema, businessSchema, progressSchema, finishSchema]);

export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await readStore();
  const user = data.users.find((item) => item.id === session.id);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ref = new URL(request.url).searchParams.get("project");

  // Onboarding d'un projet : "new" part de zero, un id reprend un brouillon.
  if (ref) {
    if (ref === "new") return NextResponse.json({ user: publicUser(user), project: null, company: "", logo: "", business: null, step: 0 });
    const project = findProject(data, user.id, ref);
    if (!project) return NextResponse.json({ error: "project_not_found" }, { status: 404 });
    return NextResponse.json({
      user: publicUser(user),
      project: publicProject(project),
      company: project.name,
      logo: project.logo || project.business?.logo || "",
      business: project.business,
      step: project.completedAt ? 0 : project.onboardingStep || 0,
    });
  }

  // Onboarding du compte : il alimente le projet actif (le premier, pour un compte neuf).
  const active = resolveProject(data, user.id, (await cookies()).get(PROJECT_COOKIE)?.value);
  const business = active?.business || user.business || null;
  return NextResponse.json({
    user: publicUser(user),
    project: active ? publicProject(active) : null,
    company: business?.name || active?.name || "",
    logo: active?.logo || business?.logo || "",
    business,
    step: user.onboarding?.step || 0,
    heardFrom: user.onboarding?.heardFrom || [],
  });
}

/** Projet cible d'une ecriture d'onboarding. Sans reference : le projet actif du
 * compte. Avec un id : ce projet, s'il appartient bien au demandeur. */
function targetProject(data: Parameters<typeof resolveProject>[0], userId: string, ref: string | undefined, cookie: string | undefined): Project | null {
  if (ref && ref !== "new") return findProject(data, userId, ref);
  return resolveProject(data, userId, cookie);
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
  const projectCookie = (await cookies()).get(PROJECT_COOKIE)?.value;
  const projectMode = "project" in body && Boolean(body.project);

  if (body.action === "progress") {
    await updateStore(data => {
      const user = data.users.find(item => item.id === session.id);
      if (!user) return;
      if (projectMode) { const project = targetProject(data, user.id, body.project, projectCookie); if (project && !project.completedAt) project.onboardingStep = body.step; }
      else user.onboarding = { ...user.onboarding, step: body.step };
    });
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


  if (body.action === "tiktok") {
    const tiktok = await enrichTikTok(body.handle);
    return NextResponse.json({ tiktok });
  }

  if (body.action === "profile") {
    const logo = await storeLogo(body.logo);
    const result = await updateStore((data) => {
      const item = data.users.find((entry) => entry.id === session.id);
      if (!item) return null;
      const project = targetProject(data, item.id, body.project, projectCookie);
      if (projectMode && !project) return { missing: true as const };
      // Le prenom est au niveau du compte : un nouveau projet n'y touche pas.
      if (!projectMode) item.name = body.name;
      const base: BusinessProfile = project?.business || item.business || {
        name: body.company,
        url: "",
        kind: "other",
        keywords: [],
        socials: [],
        signals: [],
        analyzedAt: new Date().toISOString(),
      };
      const business = { ...base, name: body.company, logo: logo || base.logo };
      if (project) {
        project.name = body.company;
        project.business = business;
        if (logo) project.logo = logo;
      }
      // Copie de compatibilite : seulement tant que le compte n'a jamais eu de business.
      if (!projectMode && (!item.business || !body.project)) item.business = business;
      return { user: item, project };
    });
    if (!result) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if ("missing" in result) return NextResponse.json({ error: "project_not_found" }, { status: 404 });
    return NextResponse.json({ user: publicUser(result.user), project: result.project ? publicProject(result.project) : null });
  }

  if (body.action === "business") {
    const result = await updateStore((data) => {
      const item = data.users.find((entry) => entry.id === session.id);
      if (!item) return null;
      const incoming = { ...body.business, tiktok: body.business.tiktok ?? null };
      if (body.project === "new") {
        // Brouillon : il n'est pas actif tant que l'onboarding n'est pas termine,
        // pour ne pas laisser le studio sur un projet a moitie configure.
        const previous = item.lastProjectId;
        const project = createProject(data, item, { name: incoming.name, business: incoming, logo: incoming.logo });
        project.onboardingStep = 1;
        item.lastProjectId = previous;
        return { user: item, project };
      }
      const project = targetProject(data, item.id, body.project, projectCookie);
      if (projectMode && !project) return { missing: true as const };
      const current = project?.business || item.business;
      // Un logo deja televerse par l'utilisateur l'emporte sur celui trouve sur le site.
      const uploaded = current?.logo && current.logo.startsWith("/api/i/") ? current.logo : "";
      const business = { ...incoming, logo: uploaded || incoming.logo };
      if (project) {
        project.business = business;
        if (!project.completedAt || !project.name) project.name = business.name || project.name;
      }
      if (!projectMode) item.business = business;
      return { user: item, project };
    });
    if (!result) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if ("missing" in result) return NextResponse.json({ error: "project_not_found" }, { status: 404 });
    return NextResponse.json({ user: publicUser(result.user), project: result.project ? publicProject(result.project) : null });
  }

  // finish — projet : le brouillon devient complet et actif.
  if (projectMode) {
    const finished = await updateStore((data) => {
      const item = data.users.find((entry) => entry.id === session.id);
      if (!item) return null;
      const project = targetProject(data, item.id, body.project, projectCookie);
      if (!project) return { missing: true as const };
      if (!project.business?.name?.trim() || !project.business.analyzedAt) return { incomplete: true as const };
      project.business.goal = project.business.goal || "sell";
      project.business.cadence = project.business.cadence || "daily";
      project.completedAt = project.completedAt || new Date().toISOString();
      project.onboardingStep = undefined;
      item.lastProjectId = project.id;
      return { user: item, project };
    });
    if (!finished) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if ("missing" in finished) return NextResponse.json({ error: "project_not_found" }, { status: 404 });
    if ("incomplete" in finished) return NextResponse.json({ error: "profile_incomplete" }, { status: 400 });
    await setProjectCookie(finished.project.id);
    return NextResponse.json({ user: publicUser(finished.user), project: publicProject(finished.project) });
  }

  // finish — compte : le premier projet est complet, le compte est onboarde.
  const snapshot = await readStore();
  const current = snapshot.users.find(item => item.id === session.id);
  const activeBusiness = resolveProject(snapshot, session.id, projectCookie)?.business || current?.business;
  if (!current?.name?.trim() || !activeBusiness?.name?.trim() || !activeBusiness?.analyzedAt) return NextResponse.json({ error: "profile_incomplete" }, { status: 400 });
  const user = await updateStore((data) => {
    const item = data.users.find((entry) => entry.id === session.id);
    if (!item) return null;
    const project = resolveProject(data, item.id, projectCookie);
    // Every business is here to sell, at the maximum daily rhythm: no question asked.
    for (const business of [item.business, project?.business]) {
      if (!business) continue;
      business.goal = business.goal || "sell";
      business.cadence = business.cadence || "daily";
    }
    if (project) {
      project.completedAt = project.completedAt || new Date().toISOString();
      if (!project.business && item.business) project.business = item.business;
      if (project.business && (!project.name || project.name === item.name)) project.name = project.business.name || project.name;
    }
    item.onboarding = { ...(item.onboarding || {}), completedAt: new Date().toISOString(), heardFrom: body.heardFrom };
    return item;
  });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const pub = publicUser(user);
  await setSessionCookie(pub);
  return NextResponse.json({ user: pub });
}
