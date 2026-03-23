import type { User, Project, ProjectLink, LaunchChecklistItem, ProjectStage, ProjectType } from "./types";

const BASE = "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(body.error ?? res.statusText), { status: res.status });
  }
  return res.json();
}

export const api = {
  auth: {
    register: (data: { name: string; email: string; password: string }) =>
      req<User>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      req<User>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
    logout: () => req<{ ok: true }>("/auth/logout", { method: "POST" }),
    me: () => req<User>("/auth/me"),
  },
  projects: {
    list: () => req<Project[]>("/projects"),
    get: (id: string) => req<Project>(`/projects/${id}`),
    create: (data: { name: string; description?: string; url?: string; type: ProjectType; stage: ProjectStage; tech_stack: string[] }) =>
      req<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Omit<Project, "id" | "user_id" | "created_at">>) =>
      req<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => req<{ ok: true }>(`/projects/${id}`, { method: "DELETE" }),
    links: {
      list: (id: string) => req<ProjectLink[]>(`/projects/${id}/links`),
      create: (id: string, data: { label: string; url: string; icon?: string }) =>
        req<ProjectLink>(`/projects/${id}/links`, { method: "POST", body: JSON.stringify(data) }),
      delete: (id: string, linkId: string) =>
        req<{ ok: true }>(`/projects/${id}/links/${linkId}`, { method: "DELETE" }),
    },
    checklist: {
      list: (id: string) => req<LaunchChecklistItem[]>(`/projects/${id}/launch-checklist`),
      create: (id: string, item: string) =>
        req<LaunchChecklistItem>(`/projects/${id}/launch-checklist`, { method: "POST", body: JSON.stringify({ item }) }),
      update: (id: string, itemId: string, completed: boolean) =>
        req<{ ok: true }>(`/projects/${id}/launch-checklist/${itemId}`, { method: "PUT", body: JSON.stringify({ completed }) }),
      delete: (id: string, itemId: string) =>
        req<{ ok: true }>(`/projects/${id}/launch-checklist/${itemId}`, { method: "DELETE" }),
    },
  },
};
