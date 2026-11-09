export const CONNECT_LINK_PREFIX = "notesagain://connect?";

export interface ConnectLink {
  server: string;
  token: string;
  alt?: string;
  fp?: string;
}

export function buildConnectLink({ server, token, alt, fp }: ConnectLink): string {
  let link = `${CONNECT_LINK_PREFIX}server=${encodeURIComponent(server)}&token=${encodeURIComponent(token)}`;
  if (alt) link += `&alt=${encodeURIComponent(alt)}`;
  if (fp) link += `&fp=${encodeURIComponent(fp)}`;
  return link;
}

export function parseConnectLink(text: string): ConnectLink | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(CONNECT_LINK_PREFIX)) return null;
  const params = new Map<string, string>();
  for (const pair of trimmed.slice(CONNECT_LINK_PREFIX.length).split("&")) {
    const [key = "", value = ""] = pair.split("=");
    try {
      params.set(key, decodeURIComponent(value));
    } catch {
      return null;
    }
  }
  const server = params.get("server")?.trim();
  const token = params.get("token")?.trim();
  if (!server || !token?.startsWith("nal_")) return null;
  const alt = params.get("alt")?.trim();
  const fp = params.get("fp")?.trim();
  return { server, token, ...(alt ? { alt } : {}), ...(fp ? { fp } : {}) };
}
