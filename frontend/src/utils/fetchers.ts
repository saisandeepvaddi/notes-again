import { auth, getAuthToken } from "@/lib/firebase";

export const isDevEnv = () => import.meta.env.MODE === "development";

export const getURL = () => {
  const isDev = isDevEnv();
  if (!isDev) {
    return "/api";
  }

  const PROTOCOL = isDev ? "http" : "https";
  const SERVER_IP = isDev ? import.meta.env.VITE_SERVER_IP : "";
  const SERVER_PORT = isDev ? import.meta.env.VITE_SERVER_PORT : "";
  return `${PROTOCOL}://${SERVER_IP}:${SERVER_PORT}/api`;
};

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

// The Firebase ID token is attached by getHeaders(). A 401 back from the API
// means it's no longer valid — drop the session so the login screen returns.
const handleResponse = async (response: Response, url: string) => {
  if (response.status === 401 && !isDevEnv()) {
    await auth?.signOut().catch(() => {});
  }
  if (!response.ok) {
    // FastAPI error bodies are {"detail": "..."} -- surface that message when
    // present instead of just the status code.
    const detail = await response
      .clone()
      .json()
      .then((body: unknown) =>
        typeof body === "object" && body !== null && "detail" in body
          ? String((body as { detail: unknown }).detail)
          : null,
      )
      .catch(() => null);
    throw new Error(detail ?? `Error with ${url} with code: ${response.status}`);
  }
  // 204 No Content has no body -- response.json() throws on an empty body,
  // which would otherwise surface as a false "failed" error even though the
  // request succeeded (hit by delete_note/permanently_delete_note/empty_trash).
  if (response.status === 204) {
    return null;
  }
  return await response.json();
};

interface FetcherOptions {
  headers?: Record<string, string>;
}
export const getFetcher = (url: string, options?: FetcherOptions) => async () => {
  const response = await fetch(`${getURL()}${url}`, {
    headers: await getHeaders(options?.headers),
  });
  return handleResponse(response, url);
};

export const postFetcher = (url: string, options?: FetcherOptions) => async (body?: string) => {
  const response = await fetch(`${getURL()}${url}`, {
    method: "POST",
    headers: await getHeaders(options?.headers),
    body,
  });
  return handleResponse(response, url);
};

export const patchFetcher = (url: string, options?: FetcherOptions) => async (body?: string) => {
  const response = await fetch(`${getURL()}${url}`, {
    method: "PATCH",
    headers: await getHeaders(options?.headers),
    body,
  });
  return handleResponse(response, url);
};

export const deleteFetcher = (url: string, options?: FetcherOptions) => async (body?: string) => {
  const response = await fetch(`${getURL()}${url}`, {
    method: "DELETE",
    headers: await getHeaders(options?.headers),
    body,
  });
  return handleResponse(response, url);
};
