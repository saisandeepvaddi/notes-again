import {
  CaptureError,
  type CaptureApi,
  type Lookups,
  type NoteDraft,
  type SavedNote,
  type UploadedMedia,
} from "./types";

export interface ExistingRoutesOptions {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
}

interface ProjectDto {
  id: number;
  name: string;
}
interface TagDto {
  id: number;
  name: string;
  is_difficulty: boolean;
}
interface NoteDto {
  id: number;
  name: string;
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function dedupeNames(names: string[]): string[] {
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (name && !out.some((existing) => sameName(existing, name))) {
      out.push(name);
    }
  }
  return out;
}

async function errorDetail(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("detail" in body)) {
    return null;
  }
  const { detail } = body as { detail: unknown };
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === "object" && d !== null && "msg" in d ? String(d.msg) : null))
      .filter(Boolean)
      .join("; ");
  }
  return null;
}

export function createExistingRoutesApi(options: ExistingRoutesOptions): CaptureApi {
  const { baseUrl, token } = options;
  const doFetch = options.fetch ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers = new Headers();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new CaptureError(
        "network",
        `Can't reach ${baseUrl}. Check the server URL in the extension options and that the server is running.`,
      );
    }
    if (response.status === 401) {
      throw new CaptureError(
        "auth",
        token
          ? "The server rejected your API token. It may have expired or been revoked: create a new one in the web app under Settings > API tokens."
          : "This server needs an API token. Create one in the web app under Settings > API tokens and paste it in the extension options.",
        401,
      );
    }
    if (response.status === 403) {
      throw new CaptureError("auth", (await errorDetail(response)) ?? "Not allowed.", 403);
    }
    if (!response.ok) {
      const detail = await errorDetail(response);
      throw new CaptureError("http", detail ?? `${method} ${path} failed (${response.status}).`, response.status);
    }
    return (await response.json()) as T;
  }

  return {
    async lookups(): Promise<Lookups> {
      const [projects, tags] = await Promise.all([
        request<ProjectDto[]>("GET", "/api/projects/list"),
        request<TagDto[]>("GET", "/api/tags/list"),
      ]);
      return {
        projects: projects.map((p) => p.name),
        tags: tags.filter((t) => !t.is_difficulty).map((t) => t.name),
      };
    },

    async saveNote(draft: NoteDraft): Promise<SavedNote> {
      const projectName = draft.project?.trim();
      const tagNames = dedupeNames(draft.tags);

      const [project, tags] = await Promise.all([
        projectName ? request<ProjectDto>("POST", "/api/projects/create", { name: projectName }) : null,
        Promise.all(tagNames.map((name) => request<TagDto>("POST", "/api/tags/create", { name }))),
      ]);

      const note = await request<NoteDto>("POST", "/api/notes/create", {
        name: draft.name,
        content: draft.content,
        tag_ids: tags.filter((t) => !t.is_difficulty).map((t) => t.id),
        project_id: project?.id ?? null,
        ...(draft.difficulty && { difficulty: draft.difficulty }),
        ...(draft.noteOnly && { in_review: false }),
      });
      return { id: note.id, name: note.name };
    },

    async attach(noteId: number, media: UploadedMedia): Promise<boolean> {
      try {
        const response = await doFetch(`${baseUrl}/api/notes/${noteId}/attachments`, {
          method: "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(media.name),
            "X-Attachment-Uid": media.uid,
          },
          body: media.blob,
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}
