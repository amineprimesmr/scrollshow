import { readStudioSession } from "@/lib/auth";
import { archiveProject, createProject, findProject, listProjects, publicProject, resolveProject } from "@/lib/projects";
import { PROJECT_COOKIE, readProjectCookie, setProjectCookie } from "@/lib/project-context";
import { readStore, updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

const createSchema = z.object({ action: z.literal("create"), name: z.string().trim().min(1).max(80) });
const selectSchema = z.object({ action: z.literal("select"), id: z.string().min(1).max(120) });
const renameSchema = z.object({ action: z.literal("rename"), id: z.string().min(1).max(120), name: z.string().trim().min(1).max(80) });
const archiveSchema = z.object({ action: z.literal("archive"), id: z.string().min(1).max(120) });
const bodySchema = z.discriminatedUnion("action", [createSchema, selectSchema, renameSchema, archiveSchema]);

export async function GET() {
  const session = await readStudioSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await readStore();
  const active = resolveProject(data, session.id, await readProjectCookie());
  return NextResponse.json({
    projects: listProjects(data, session.id).map(publicProject),
    activeId: active?.id || null,
  });
}

export async function POST(request: Request) {
  const session = await readStudioSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const body = parsed.data;

  const result = await updateStore((data) => {
    const user = data.users.find((item) => item.id === session.id);
    if (!user) return { error: "unauthorized" as const, status: 401 };

    if (body.action === "create") {
      const project = createProject(data, user, { name: body.name });
      return { project, status: 200 };
    }
    if (body.action === "select") {
      const project = findProject(data, session.id, body.id);
      if (!project) return { error: "not_found" as const, status: 404 };
      user.lastProjectId = project.id;
      return { project, status: 200 };
    }
    if (body.action === "rename") {
      const project = findProject(data, session.id, body.id);
      if (!project) return { error: "not_found" as const, status: 404 };
      project.name = body.name.trim().slice(0, 80);
      return { project, status: 200 };
    }
    const archived = archiveProject(data, session.id, body.id);
    if (!archived) return { error: "last_project" as const, status: 409 };
    return { project: null, status: 200, archived: true };
  });

  if ("error" in result && result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  if (body.action === "create" || body.action === "select") {
    if (result.project) await setProjectCookie(result.project.id);
  }
  if (body.action === "archive") (await cookies()).delete(PROJECT_COOKIE);

  const data = await readStore();
  const active = resolveProject(data, session.id, await readProjectCookie());
  return NextResponse.json({
    projects: listProjects(data, session.id).map(publicProject),
    activeId: active?.id || null,
  });
}
