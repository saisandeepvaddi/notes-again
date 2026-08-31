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
