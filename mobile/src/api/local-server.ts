import NotesCore from "../../modules/notes-core/src/NotesCoreModule";
import type { Connection } from "./connection-store";

export const hasLocalServer = NotesCore !== null;

export async function startLocalServer(): Promise<Connection> {
  if (!NotesCore) throw new Error("This build doesn’t include the on-device notes server.");
  const { port, secret } = await NotesCore.start();
  return { serverUrl: `http://127.0.0.1:${port}`, token: secret, method: "local", username: null };
}

export async function restartLocalServer(): Promise<Connection> {
  await NotesCore?.stop();
  return startLocalServer();
}

export async function localServerAlive(serverUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${serverUrl}/healthz`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function syncLocalServer(connection: Connection): Promise<boolean> {
  try {
    const response = await fetch(`${connection.serverUrl}/api/sync/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${connection.token}` },
    });
    if (!response.ok) return false;
    const status = (await response.json()) as { connected?: boolean };
    return status.connected === true;
  } catch {
    return false;
  }
}
