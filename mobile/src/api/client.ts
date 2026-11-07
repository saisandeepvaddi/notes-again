import { fetch } from "expo/fetch";
import type { z } from "zod";
import { currentConnection, saveConnection } from "./connection-store";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type UnauthorizedListener = () => void;
let onUnauthorized: UnauthorizedListener | null = null;

export function setUnauthorizedListener(listener: UnauthorizedListener | null) {
  onUnauthorized = listener;
}

export function normalizeServerUrl(input: string): string {
  const trimmed = input
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/, "");
  return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function errorDetail(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  return typeof body === "object" &&
    body !== null &&
    "detail" in body &&
    typeof body.detail === "string"
    ? body.detail
    : null;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  serverUrl?: string;
  token?: string | null;
  signal?: AbortSignal;
}

async function send(
  serverUrl: string,
  path: string,
  options: RequestOptions,
  headers: Record<string, string>,
): Promise<Response> {
  try {
    return (await fetch(`${serverUrl}/api${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "omit",
      signal: options.signal,
    })) as unknown as Response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError("Couldn't reach the server. Check your connection.", 0);
  }
}

export async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  const connection = currentConnection();
  const serverUrl = options.serverUrl ?? connection?.serverUrl;
  if (!serverUrl) throw new ApiError("Not connected to a server", 0);
  const token = options.token !== undefined ? options.token : connection?.token;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await send(serverUrl, path, options, headers);
  } catch (error) {
    const fallback = options.serverUrl === undefined ? connection?.fallbackUrl : null;
    if (!connection || !fallback || !(error instanceof ApiError)) throw error;
    response = await send(fallback, path, options, headers);
    await saveConnection({ ...connection, serverUrl: fallback, fallbackUrl: connection.serverUrl });
  }

  if (response.status === 401 && options.serverUrl === undefined) onUnauthorized?.();
  if (!response.ok) {
    throw new ApiError(
      (await errorDetail(response)) ?? `Request failed (${response.status})`,
      response.status,
    );
  }
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new ApiError("The server sent something that isn't Notes Again data.", response.status);
  }
}

export async function api<T extends z.ZodType>(
  schema: T,
  path: string,
  options?: RequestOptions,
): Promise<z.infer<T>> {
  const data = await request(path, options);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError("The server sent data this app doesn't understand.", 0);
  }
  return parsed.data;
}
