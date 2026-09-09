import { cookies } from "next/headers";
import { readStore } from "./store";
import { PROJECT_COOKIE, resolveProject } from "./projects";
import type { Project } from "./types";

export { PROJECT_COOKIE };

export async function readProjectCookie() {
  return (await cookies()).get(PROJECT_COOKIE)?.value || null;
}

export async function setProjectCookie(projectId: string) {
  (await cookies()).set(PROJECT_COOKIE, projectId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Projet actif de la requete. Le cookie n'est qu'une preference : la
 * validation de propriete se fait en base, un identifiant etranger retombe
 * sur un projet du demandeur. */
export async function activeProject(userId: string): Promise<Project | null> {
  const data = await readStore();
  return resolveProject(data, userId, await readProjectCookie());
}
