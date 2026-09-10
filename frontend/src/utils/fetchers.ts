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

export const getHeaders = (customHeaders?: Record<string, string>) =>
  new Headers({
    "Content-Type": "application/json",
    ...customHeaders,
  });

// Auth is handled at the edge by Cloudflare Access (same-origin cookie). If a
// request comes back 401 the Access session has expired — a full navigation lets
// Cloudflare bounce the user back through Google.
const handleResponse = async (response: Response, url: string) => {
  if (response.status === 401 && !isDevEnv()) {
    window.location.reload();
  }
  if (!response.ok) {
    throw new Error(`Error with ${url} with code: ${response.status}`);
  }
  return await response.json();
};

interface FetcherOptions {
  headers?: Record<string, string>;
}
export const getFetcher = (url: string, options?: FetcherOptions) => async () => {
  const response = await fetch(`${getURL()}${url}`, {
    headers: getHeaders(options?.headers),
  });
  return handleResponse(response, url);
};

export const postFetcher = (url: string, options?: FetcherOptions) => async (body?: string) => {
  const response = await fetch(`${getURL()}${url}`, {
    method: "POST",
    headers: getHeaders(options?.headers),
    body,
  });
  return handleResponse(response, url);
};

export const patchFetcher = (url: string, options?: FetcherOptions) => async (body?: string) => {
  const response = await fetch(`${getURL()}${url}`, {
    method: "PATCH",
    headers: getHeaders(options?.headers),
    body,
  });
  return handleResponse(response, url);
};

export const deleteFetcher = (url: string, options?: FetcherOptions) => async (body?: string) => {
  const response = await fetch(`${getURL()}${url}`, {
    method: "DELETE",
    headers: getHeaders(options?.headers),
    body,
  });
  return handleResponse(response, url);
};
