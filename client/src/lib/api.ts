import type { User, Project, ProjectLink, LaunchChecklistItem, TechDebtItem, MrrEntry, Goal, ProjectStage, ProjectType, DashboardData, ProjectCountry, LegalItem, Note, Idea, FileRecord } from "./types";

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
  dashboard: {
    get: () => req<DashboardData>("/dashboard"),
  },
  ping: (url: string) =>
    req<{ status: "up" | "down"; latencyMs: number }>("/ping", { method: "POST", body: JSON.stringify({ url }) }),
  ideas: {
    list: () => req<Idea[]>("/ideas"),
    create: (data: { title: string; body: string }) =>
      req<Idea>("/ideas", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: { title: string; body: string }) =>
      req<Idea>(`/ideas/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => req<{ ok: true }>(`/ideas/${id}`, { method: "DELETE" }),
    promote: (id: string) =>
      req<{ idea: Idea; project: Project }>(`/ideas/${id}/promote`, { method: "POST" }),
  },
  files: {
    list: (projectId?: string) =>
      req<FileRecord[]>(`/files${projectId ? `?projectId=${projectId}` : ""}`),
    upload: async (file: File, projectId?: string): Promise<FileRecord> => {
      const form = new FormData();
      form.append("file", file);
      const url = `${BASE}/files${projectId ? `?projectId=${projectId}` : ""}`;
      const res = await fetch(url, { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    downloadUrl: (id: string) => `${BASE}/files/${id}/download`,
    delete: (id: string) => req<{ ok: true }>(`/files/${id}`, { method: "DELETE" }),
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
    techDebt: {
      list: (id: string) => req<TechDebtItem[]>(`/projects/${id}/tech-debt`),
      create: (id: string, note: string) =>
        req<TechDebtItem>(`/projects/${id}/tech-debt`, { method: "POST", body: JSON.stringify({ note }) }),
      update: (id: string, debtId: string, resolved: boolean) =>
        req<{ ok: true }>(`/projects/${id}/tech-debt/${debtId}`, { method: "PUT", body: JSON.stringify({ resolved }) }),
      delete: (id: string, debtId: string) =>
        req<{ ok: true }>(`/projects/${id}/tech-debt/${debtId}`, { method: "DELETE" }),
    },
    mrr: {
      list: (id: string) => req<MrrEntry[]>(`/projects/${id}/mrr`),
      create: (id: string, data: { mrr: number; user_count: number }) =>
        req<MrrEntry>(`/projects/${id}/mrr`, { method: "POST", body: JSON.stringify(data) }),
    },
    goals: {
      list: (id: string) => req<Goal[]>(`/projects/${id}/goals`),
      create: (id: string, data: Partial<Goal>) =>
        req<Goal>(`/projects/${id}/goals`, { method: "POST", body: JSON.stringify(data) }),
      update: (id: string, goalId: string, data: Partial<Goal>) =>
        req<{ ok: true }>(`/projects/${id}/goals/${goalId}`, { method: "PUT", body: JSON.stringify(data) }),
      delete: (id: string, goalId: string) =>
        req<{ ok: true }>(`/projects/${id}/goals/${goalId}`, { method: "DELETE" }),
    },
    countries: {
      list: (id: string) => req<ProjectCountry[]>(`/projects/${id}/countries`),
      add: (id: string, data: { country_code: string; country_name: string }) =>
        req<ProjectCountry>(`/projects/${id}/countries`, { method: "POST", body: JSON.stringify(data) }),
      remove: (id: string, cId: string) =>
        req<{ ok: true }>(`/projects/${id}/countries/${cId}`, { method: "DELETE" }),
    },
    legal: {
      list: (id: string) => req<LegalItem[]>(`/projects/${id}/legal`),
      create: (id: string, data: { country_code: string; item: string }) =>
        req<LegalItem>(`/projects/${id}/legal`, { method: "POST", body: JSON.stringify(data) }),
      update: (id: string, itemId: string, completed: boolean) =>
        req<{ ok: true }>(`/projects/${id}/legal/${itemId}`, { method: "PUT", body: JSON.stringify({ completed }) }),
      delete: (id: string, itemId: string) =>
        req<{ ok: true }>(`/projects/${id}/legal/${itemId}`, { method: "DELETE" }),
    },
    notes: {
      list: (id: string) => req<Note[]>(`/projects/${id}/notes`),
      create: (id: string, data: { content: string; is_build_log: boolean }) =>
        req<Note>(`/projects/${id}/notes`, { method: "POST", body: JSON.stringify(data) }),
      delete: (id: string, noteId: string) =>
        req<{ ok: true }>(`/projects/${id}/notes/${noteId}`, { method: "DELETE" }),
    },
  },
};
