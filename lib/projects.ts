import type { BusinessProfile, Project, PublicProject, PublicUser, SessionUser, StoreData, User } from "./types";

export const PROJECT_COOKIE = "ss_project";

/** Entites possedees par un projet. Toute nouvelle collection scopee doit etre
 * ajoutee ici, sinon la retro-migration la laisserait orpheline. */
const OWNED = ["accounts", "runs", "channels", "posts", "media", "apiKeys"] as const;

export function projectName(user: User): string {
  const business = user.business?.name?.trim();
  if (business) return business;
  const name = user.name?.trim();
  if (name) return name;
  return user.email.split("@")[0] || "Projet";
}

/** Cree le projet par defaut d'un utilisateur et lui rattache tout son contenu.
 * Idempotent : sans effet si l'utilisateur a deja au moins un projet. */
/** Un compte est considere onboarde des qu'un signal le prouve : le flag, ou un
 * business deja analyse (comptes anterieurs au flag, comptes de seed). */
function accountOnboardedAt(user: User): string | undefined {
  return user.onboarding?.completedAt || user.business?.analyzedAt || undefined;
}

export function ensureUserProjects(data: StoreData, user: User): Project {
  data.projects ||= [];
  const existing = data.projects.filter((item) => item.userId === user.id && !item.archivedAt);
  if (existing.length) {
    // Reparation idempotente : le projet migre d'un compte deja onboarde est
    // complet, meme s'il a ete ecrit avant que ce signal soit pris en compte.
    const migrated = existing.find((item) => item.id === `prj_${user.id}_1`);
    if (migrated && !migrated.completedAt) migrated.completedAt = accountOnboardedAt(user);
    const preferred = existing.find((item) => item.id === user.lastProjectId);
    return preferred || existing[0];
  }
  const project: Project = {
    id: `prj_${user.id}_1`,
    userId: user.id,
    name: projectName(user),
    logo: user.business?.logo,
    business: user.business || null,
    // Un compte deja onboarde a un projet complet ; un compte neuf le terminera.
    completedAt: accountOnboardedAt(user),
    createdAt: user.createdAt || new Date().toISOString(),
  };
  data.projects.push(project);
  for (const key of OWNED) {
    for (const row of data[key] || []) {
      if (row.userId === user.id && !row.projectId) row.projectId = project.id;
    }
  }
  return project;
}

/** Retro-remplit les projets de tous les utilisateurs. Appele par le store a
 * chaque lecture : une base anterieure aux projets devient valide sans script. */
export function backfillProjects(data: StoreData): StoreData {
  data.projects ||= [];
  for (const user of data.users) ensureUserProjects(data, user);
  return data;
}

export function listProjects(data: StoreData, userId: string): Project[] {
  return (data.projects || [])
    .filter((item) => item.userId === userId && !item.archivedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function findProject(data: StoreData, userId: string, projectId: string | undefined | null): Project | null {
  if (!projectId) return null;
  const found = (data.projects || []).find((item) => item.id === projectId && item.userId === userId && !item.archivedAt);
  return found || null;
}

/** Projet actif : celui demande s'il appartient bien a l'utilisateur, sinon le
 * dernier ouvert, sinon le premier. Un identifiant inconnu ne donne jamais
 * acces au projet d'un autre compte : il retombe silencieusement sur le sien. */
export function resolveProject(data: StoreData, userId: string, requested?: string | null): Project | null {
  const user = data.users.find((item) => item.id === userId);
  if (!user) return null;
  return findProject(data, userId, requested) || findProject(data, userId, user.lastProjectId) || listProjects(data, userId)[0] || null;
}

export function createProject(data: StoreData, user: User, input: { name: string; business?: BusinessProfile | null; logo?: string; completed?: boolean }): Project {
  data.projects ||= [];
  const project: Project = {
    id: `prj_${user.id}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    userId: user.id,
    name: input.name.trim().slice(0, 80) || projectName(user),
    logo: input.logo || input.business?.logo,
    business: input.business || null,
    completedAt: input.completed ? new Date().toISOString() : undefined,
    createdAt: new Date().toISOString(),
  };
  data.projects.push(project);
  user.lastProjectId = project.id;
  return project;
}

/** Un projet archive n'est plus listable, mais son contenu reste en base : la
 * suppression definitive du contenu d'un projet n'est pas offerte ici. */
export function archiveProject(data: StoreData, userId: string, projectId: string): Project | null {
  const project = findProject(data, userId, projectId);
  if (!project) return null;
  if (listProjects(data, userId).length <= 1) return null;
  project.archivedAt = new Date().toISOString();
  const user = data.users.find((item) => item.id === userId);
  if (user?.lastProjectId === projectId) user.lastProjectId = listProjects(data, userId)[0]?.id;
  return project;
}

export function publicProject(project: Project): PublicProject {
  return {
    id: project.id,
    name: project.name,
    logo: project.logo || project.business?.logo || "",
    business: project.business,
    completed: Boolean(project.completedAt),
    createdAt: project.createdAt,
  };
}

/** Attache le projet actif a un utilisateur de session. Le business expose est
 * celui du projet : c'est lui que le studio et les agents doivent lire. */
export function withProject<T extends PublicUser>(user: T, project: Project | null): T {
  if (!project) return { ...user, project: null };
  return { ...user, projectId: project.id, project: publicProject(project), business: project.business };
}

/** Une ligne appartient-elle au projet actif du demandeur ?
 * - jamais si elle est a un autre compte ;
 * - une ligne sans projet (jamais rattachee) reste visible : mieux vaut un
 *   contenu partage entre projets qu'un contenu qui disparait ;
 * - un demandeur sans projet actif (chemin ancien) voit tout son compte. */
export function inScope(row: { userId: string; projectId?: string }, user: Pick<SessionUser, "id" | "projectId">): boolean {
  if (row.userId !== user.id) return false;
  if (!user.projectId || !row.projectId) return true;
  return row.projectId === user.projectId;
}
