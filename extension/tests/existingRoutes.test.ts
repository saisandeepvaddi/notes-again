import { describe, expect, it, vi } from "vitest";
import { createExistingRoutesApi } from "../lib/api/existingRoutes";
import { CaptureError } from "../lib/api/types";

interface Call {
  method: string;
  path: string;
  body: unknown;
  auth: string | null;
}

/** Fake server: routes by "METHOD /path" and records every call. */
function fakeServer(routes: Record<string, (body: any) => { status?: number; json: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname, body, auth: headers.get("Authorization") });
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) {
      return new Response(JSON.stringify({ detail: "no route" }), { status: 404 });
    }
    const { status = 200, json } = handler(body);
    return new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const noAuth = async () => ({});

describe("saveNote", () => {
  it("resolves project and tags by name, then creates the note with their ids", async () => {
    const { calls, fetchImpl } = fakeServer({
      "POST /api/projects/create": (b) => ({ json: { id: 7, name: b.name } }),
      "POST /api/tags/create": (b) => ({ json: { id: b.name === "rust" ? 1 : 2, name: b.name, is_difficulty: false } }),
      "POST /api/notes/create": () => ({ json: { id: 99, name: "A post" } }),
    });
    const api = createExistingRoutesApi({ baseUrl: "http://s", getAuthHeaders: noAuth, fetch: fetchImpl });

    const saved = await api.saveNote({
      name: "A post",
      content: "https://a.dev\n\nbody",
      project: "  Reading ",
      tags: ["rust", "Rust", " web "],
      sourceUrl: "https://a.dev",
    });

    expect(saved).toEqual({ id: 99, name: "A post" });
    // "rust" and "Rust" are one tag: created once.
    const tagCalls = calls.filter((c) => c.path === "/api/tags/create");
    expect(tagCalls.map((c) => c.body)).toEqual([{ name: "rust" }, { name: "web" }]);
    expect(calls.find((c) => c.path === "/api/projects/create")?.body).toEqual({ name: "Reading" });
    // The note is created last, with ids from the earlier calls.
    expect(calls.at(-1)).toMatchObject({
      path: "/api/notes/create",
      body: { name: "A post", content: "https://a.dev\n\nbody", tag_ids: [1, 2], project_id: 7 },
    });
  });

  it("skips project/tag calls when there are none, and sends no project", async () => {
    const { calls, fetchImpl } = fakeServer({ "POST /api/notes/create": () => ({ json: { id: 1, name: "n" } }) });
    const api = createExistingRoutesApi({ baseUrl: "http://s", getAuthHeaders: noAuth, fetch: fetchImpl });
    await api.saveNote({ name: "n", content: "c", project: null, tags: [], sourceUrl: "" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({ tag_ids: [], project_id: null });
  });

  it("never attaches a difficulty tag as a regular tag", async () => {
    const { calls, fetchImpl } = fakeServer({
      "POST /api/tags/create": () => ({ json: { id: 5, name: "Easy", is_difficulty: true } }),
      "POST /api/notes/create": () => ({ json: { id: 1, name: "n" } }),
    });
    const api = createExistingRoutesApi({ baseUrl: "http://s", getAuthHeaders: noAuth, fetch: fetchImpl });
    await api.saveNote({ name: "n", content: "c", project: null, tags: ["Easy"], sourceUrl: "" });
    expect(calls.at(-1)?.body).toMatchObject({ tag_ids: [] });
  });

  it("surfaces FastAPI's detail message on failure", async () => {
    const { fetchImpl } = fakeServer({ "POST /api/notes/create": () => ({ status: 400, json: { detail: "Project not found" } }) });
    const api = createExistingRoutesApi({ baseUrl: "http://s", getAuthHeaders: noAuth, fetch: fetchImpl });
    await expect(api.saveNote({ name: "n", content: "c", project: null, tags: [], sourceUrl: "" })).rejects.toMatchObject({
      kind: "http",
      message: "Project not found",
      status: 400,
    });
  });

  it("joins 422 validation messages", async () => {
    const { fetchImpl } = fakeServer({
      "POST /api/notes/create": () => ({ status: 422, json: { detail: [{ msg: "field required" }, { msg: "bad type" }] } }),
    });
    const api = createExistingRoutesApi({ baseUrl: "http://s", getAuthHeaders: noAuth, fetch: fetchImpl });
    await expect(api.saveNote({ name: "n", content: "c", project: null, tags: [], sourceUrl: "" })).rejects.toThrow("field required; bad type");
  });

  it("reports an unreachable server as a network error naming the URL", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
    const api = createExistingRoutesApi({ baseUrl: "http://down:1", getAuthHeaders: noAuth, fetch: fetchImpl });
    const err = await api.lookups().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CaptureError);
    expect(err).toMatchObject({ kind: "network" });
    expect((err as Error).message).toContain("http://down:1");
  });
});

describe("auth handling", () => {
  it("sends the auth headers it is given", async () => {
    const { calls, fetchImpl } = fakeServer({ "GET /api/projects/list": () => ({ json: [] }), "GET /api/tags/list": () => ({ json: [] }) });
    const api = createExistingRoutesApi({ baseUrl: "http://s", getAuthHeaders: async () => ({ Authorization: "Bearer t1" }), fetch: fetchImpl });
    await api.lookups();
    expect(calls.every((c) => c.auth === "Bearer t1")).toBe(true);
  });

  it("on a 401, force-refreshes the token and retries once", async () => {
    let served = 0;
    const { calls, fetchImpl } = fakeServer({
      "GET /api/projects/list": () => (served++ === 0 ? { status: 401, json: {} } : { json: [{ id: 1, name: "P" }] }),
      "GET /api/tags/list": () => ({ json: [] }),
    });
    const getAuthHeaders = vi.fn(async ({ forceRefresh }: { forceRefresh?: boolean } = {}) => ({
      Authorization: forceRefresh ? "Bearer fresh" : "Bearer stale",
    }));
    const api = createExistingRoutesApi({ baseUrl: "http://s", getAuthHeaders, fetch: fetchImpl });
    await expect(api.lookups()).resolves.toEqual({ projects: ["P"], tags: [] });
    expect(calls.filter((c) => c.path === "/api/projects/list").map((c) => c.auth)).toEqual(["Bearer stale", "Bearer fresh"]);
  });

  it("gives up with an auth error when the retry is also rejected", async () => {
    const { fetchImpl } = fakeServer({
      "GET /api/projects/list": () => ({ status: 401, json: {} }),
      "GET /api/tags/list": () => ({ json: [] }),
    });
    const api = createExistingRoutesApi({ baseUrl: "http://s", getAuthHeaders: noAuth, fetch: fetchImpl });
    await expect(api.lookups()).rejects.toMatchObject({ kind: "auth", status: 401 });
  });
});

describe("lookups", () => {
  it("returns project and tag names, hiding the difficulty tags", async () => {
    const { fetchImpl } = fakeServer({
      "GET /api/projects/list": () => ({ json: [{ id: 1, name: "Reading" }] }),
      "GET /api/tags/list": () => ({
        json: [
          { id: 1, name: "Easy", is_difficulty: true },
          { id: 2, name: "rust", is_difficulty: false },
        ],
      }),
    });
    const api = createExistingRoutesApi({ baseUrl: "http://s", getAuthHeaders: noAuth, fetch: fetchImpl });
    await expect(api.lookups()).resolves.toEqual({ projects: ["Reading"], tags: ["rust"] });
  });
});
