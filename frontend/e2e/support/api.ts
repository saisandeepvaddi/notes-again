import type { APIRequestContext } from "@playwright/test";

export const API_URL = "http://127.0.0.1:8210/api";

export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

interface ApiProject {
  id: number;
  name: string;
}

interface ApiTag {
  id: number;
  name: string;
  is_difficulty: boolean;
}

interface ApiNote {
  id: number;
  name: string;
  content: string;
  reminders: { id: number; remind_at: string; reviewed_at: string | null }[];
  tags: ApiTag[];
  project: ApiProject | null;
}

export async function createProject(request: APIRequestContext, name: string): Promise<ApiProject> {
  const response = await request.post(`${API_URL}/projects/create`, { data: { name } });
  return response.json();
}

export async function createTag(request: APIRequestContext, name: string): Promise<ApiTag> {
  const response = await request.post(`${API_URL}/tags/create`, { data: { name } });
  return response.json();
}

export async function createNote(
  request: APIRequestContext,
  options: {
    name: string;
    content?: string;
    difficulty?: "easy" | "medium" | "hard";
    tag_ids?: number[];
    project_id?: number | null;
    first_reminder_at?: string;
  },
): Promise<ApiNote> {
  const response = await request.post(`${API_URL}/notes/create`, {
    data: {
      content: "Seeded via the API for test setup.",
      difficulty: "medium",
      ...options,
    },
  });
  return response.json();
}
