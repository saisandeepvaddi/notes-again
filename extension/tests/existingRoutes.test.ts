import { describe, expect, it, vi } from "vitest";
import { createExistingRoutesApi } from "../lib/api/existingRoutes";
import { CaptureError } from "../lib/api/types";

interface Call {
  method: string;
  path: string;
  body: unknown;
  auth: string | null;
}

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

describe("saveNote", () => {
  it("resolves project and tags by name, then creates the note with their ids", async () => {
    const { calls, fetchImpl } = fakeServer({
      "POST /api/projects/create": (b) => ({ json: { id: 7, name: b.name } }),
      "POST /api/tags/create": (b) => ({ json: { id: b.name === "rust" ? 1 : 2, name: b.name, is_difficulty: false } }),
      "POST /api/notes/create": () => ({ json: { id: 99, name: "A post" } }),
    });
    const api = createExistingRoutesApi({ baseUrl: "http://s", token: "", fetch: fetchImpl });

    const saved = await api.saveNote({
      name: "A post",
      content: "https://a.dev\n\nbody",
      project: "  Reading ",
      tags: ["rust", "Rust", " web "],
      sourceUrl: "https://a.dev",
    });

    expect(saved).toEqual({ id: 99, name: "A post" });
    const tagCalls = calls.filter((c) => c.path === "/api/tags/create");
    expect(tagCalls.map((c) => c.body)).toEqual([{ name: "rust" }, { name: "web" }]);
    expect(calls.find((c) => c.path === "/api/projects/create")?.body).toEqual({ name: "Reading" });
    expect(calls.at(-1)).toMatchObject({
      path: "/api/notes/create",
      body: { name: "A post", content: "https://a.dev\n\nbody", tag_ids: [1, 2], project_id: 7 },
    });
  });

  it("asks for a note-only note only when the draft says so", async () => {
    const { calls, fetchImpl } = fakeServer({ "POST /api/notes/create": () => ({ json: { id: 1, name: "n" } }) });
    const api = createExistingRoutesApi({ baseUrl: "http://s", token: "", fetch: fetchImpl });
    await api.saveNote({ name: "n", content: "c", project: null, tags: [], sourceUrl: "" });
    await api.saveNote({ name: "n", content: "c", project: null, tags: [], noteOnly: true, sourceUrl: "" });
    expect(calls[0]?.body).not.toHaveProperty("in_review");
    expect(calls[1]?.body).toMatchObject({ in_review: false });
  });

  it("skips project/tag calls when there are none, and sends no project", async () => {
    const { calls, fetchImpl } = fakeServer({ "POST /api/notes/create": () => ({ json: { id: 1, name: "n" } }) });
    const api = createExistingRoutesApi({ baseUrl: "http://s", token: "", fetch: fetchImpl });
    await api.saveNote({ name: "n", content: "c", project: null, tags: [], sourceUrl: "" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({ tag_ids: [], project_id: null });
  });

  it("never attaches a difficulty tag as a regular tag", async () => {
    const { calls, fetchImpl } = fakeServer({
      "POST /api/tags/create": () => ({ json: { id: 5, name: "Easy", is_difficulty: true } }),
      "POST /api/notes/create": () => ({ json: { id: 1, name: "n" } }),
    });
    const api = createExistingRoutesApi({ baseUrl: "http://s", token: "", fetch: fetchImpl });
    await api.saveNote({ name: "n", content: "c", project: null, tags: ["Easy"], sourceUrl: "" });
    expect(calls.at(-1)?.body).toMatchObject({ tag_ids: [] });
  });

  it("surfaces FastAPI's detail message on failure", async () => {
    const { fetchImpl } = fakeServer({ "POST /api/notes/create": () => ({ status: 400, json: { detail: "Project not found" } }) });
    const api = createExistingRoutesApi({ baseUrl: "http://s", token: "", fetch: fetchImpl });
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
    const api = createExistingRoutesApi({ baseUrl: "http://s", token: "", fetch: fetchImpl });
    await expect(api.saveNote({ name: "n", content: "c", project: null, tags: [], sourceUrl: "" })).rejects.toThrow("field required; bad type");
  });

  it("reports an unreachable server as a network error naming the URL", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
    const api = createExistingRoutesApi({ baseUrl: "http://down:1", token: "", fetch: fetchImpl });
    const err = await api.lookups().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CaptureError);
    expect(err).toMatchObject({ kind: "network" });
    expect((err as Error).message).toContain("http://down:1");
  });
});

describe("auth handling", () => {
  const routes = { "GET /api/projects/list": () => ({ json: [] }), "GET /api/tags/list": () => ({ json: [] }) };

  it("sends the API token as a Bearer credential", async () => {
    const { calls, fetchImpl } = fakeServer(routes);
    const api = createExistingRoutesApi({ baseUrl: "http://s", token: "nal_abc", fetch: fetchImpl });
    await api.lookups();
    expect(calls.every((c) => c.auth === "Bearer nal_abc")).toBe(true);
  });

  it("sends no Authorization header when there is no token (server with auth disabled)", async () => {
    const { calls, fetchImpl } = fakeServer(routes);
    const api = createExistingRoutesApi({ baseUrl: "http://s", token: "", fetch: fetchImpl });
    await api.lookups();
    expect(calls.every((c) => c.auth === null)).toBe(true);
  });

  it("a rejected token says it may be expired or revoked, and where to make a new one", async () => {
    const { fetchImpl } = fakeServer({ "GET /api/projects/list": () => ({ status: 401, json: {} }), "GET /api/tags/list": () => ({ json: [] }) });
    const api = createExistingRoutesApi({ baseUrl: "http://s", token: "nal_old", fetch: fetchImpl });
    const err = await api.lookups().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CaptureError);
    expect(err).toMatchObject({ kind: "auth", status: 401 });
    expect((err as Error).message).toMatch(/expired or been revoked/);
    expect((err as Error).message).toContain("Settings > API tokens");
  });

  it("with no token configured, a 401 says the server needs one", async () => {
    const { fetchImpl } = fakeServer({ "GET /api/projects/list": () => ({ status: 401, json: {} }), "GET /api/tags/list": () => ({ json: [] }) });
    const api = createExistingRoutesApi({ baseUrl: "http://s", token: "", fetch: fetchImpl });
    await expect(api.lookups()).rejects.toMatchObject({ kind: "auth", message: expect.stringContaining("needs an API token") });
  });

  it("does not retry a 401 (a bad token won't get better)", async () => {
    const { calls, fetchImpl } = fakeServer({ "GET /api/projects/list": () => ({ status: 401, json: {} }), "GET /api/tags/list": () => ({ json: [] }) });
    const api = createExistingRoutesApi({ baseUrl: "http://s", token: "nal_x", fetch: fetchImpl });
    await api.lookups().catch(() => {});
    expect(calls.filter((c) => c.path === "/api/projects/list")).toHaveLength(1);
  });

  it("a 403 (account not allowed, or out-of-scope) surfaces the server's reason as an auth error", async () => {
    const { fetchImpl } = fakeServer({ "GET /api/projects/list": () => ({ status: 403, json: { detail: "This account is not allowed" } }), "GET /api/tags/list": () => ({ json: [] }) });
    const api = createExistingRoutesApi({ baseUrl: "http://s", token: "nal_x", fetch: fetchImpl });
    await expect(api.lookups()).rejects.toMatchObject({ kind: "auth", status: 403, message: "This account is not allowed" });
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
    const api = createExistingRoutesApi({ baseUrl: "http://s", token: "", fetch: fetchImpl });
    await expect(api.lookups()).resolves.toEqual({ projects: ["Reading"], tags: ["rust"] });
  });
});
