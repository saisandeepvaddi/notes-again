import { getAuthToken } from "@/lib/firebase";

export const UNAUTHORIZED_EVENT = "notes-again:unauthorized";

export const isDevEnv = () => import.meta.env.MODE === "development";

export const getURL = () => {
  const isDev = isDevEnv();
  if (!isDev) {
    return "/api";
  }

  const browserHost =
    typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : "localhost";
  const SERVER_IP = import.meta.env.VITE_SERVER_IP || browserHost;
  const SERVER_PORT = import.meta.env.VITE_SERVER_PORT || "8000";
  return `http://${SERVER_IP}:${SERVER_PORT}/api`;
};

const REQUEST_TIMEOUT_MS = 10_000;

async function request(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(
        `The server at ${getURL()} did not respond within ${Math.round(timeoutMs / 1000)}s. Is the backend running?`,
      );
    }
    if (error instanceof TypeError) {
      throw new Error(
        `Could not reach the server at ${getURL()}. Is the backend running on that port?`,
      );
    }
    throw error;
  }
}

export const getHeaders = async (customHeaders?: Record<string, string>) => {
  const headers = new Headers({
    "Content-Type": "application/json",
    ...customHeaders,
  });
  const token = await getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const handleResponse = async (response: Response, url: string) => {
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!response.ok) {
    const detail = await response
      .clone()
      .json()
      .then((body: unknown) =>
        typeof body === "object" && body !== null && "detail" in body
          ? String((body as { detail: unknown }).detail)
          : null,
      )
      .catch(() => null);
    throw new ApiError(
      detail ?? `Error with ${url} with code: ${response.status}`,
      response.status,
    );
  }
  if (response.status === 204) {
    return null;
  }
  return await response.json();
};

interface FetcherOptions {
  headers?: Record<string, string>;
}
export const getFetcher = (url: string, options?: FetcherOptions) => async () => {
  const response = await request(`${getURL()}${url}`, {
    headers: await getHeaders(options?.headers),
    credentials: "include",
  });
  return handleResponse(response, url);
};

export const postFetcher = (url: string, options?: FetcherOptions) => async (body?: string) => {
  const response = await request(`${getURL()}${url}`, {
    method: "POST",
    headers: await getHeaders(options?.headers),
    credentials: "include",
    body,
  });
  return handleResponse(response, url);
};

export const patchFetcher = (url: string, options?: FetcherOptions) => async (body?: string) => {
  const response = await request(`${getURL()}${url}`, {
    method: "PATCH",
    headers: await getHeaders(options?.headers),
    credentials: "include",
    body,
  });
  return handleResponse(response, url);
};

export const putFetcher = (url: string, options?: FetcherOptions) => async (body?: string) => {
  const response = await request(`${getURL()}${url}`, {
    method: "PUT",
    headers: await getHeaders(options?.headers),
    credentials: "include",
    body,
  });
  return handleResponse(response, url);
};

export const deleteFetcher = (url: string, options?: FetcherOptions) => async (body?: string) => {
  const response = await request(`${getURL()}${url}`, {
    method: "DELETE",
    headers: await getHeaders(options?.headers),
    credentials: "include",
    body,
  });
  return handleResponse(response, url);
};
