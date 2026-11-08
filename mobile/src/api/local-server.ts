import * as Crypto from "expo-crypto";
import NotesCore from "../../modules/notes-core/src/NotesCoreModule";
import type { Connection } from "./connection-store";

export const hasLocalServer = NotesCore !== null;

let secret: string | null = null;

function launchSecret(): string {
  if (!secret) {
    secret = Array.from(Crypto.getRandomBytes(32), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }
  return secret;
}

export async function startLocalServer(): Promise<Connection> {
  if (!NotesCore) throw new Error("This build doesn’t include the on-device notes server.");
  const token = launchSecret();
  const port = await NotesCore.start(`${NotesCore.dataDirectory}/notes-again.db`, token);
  return { serverUrl: `http://127.0.0.1:${port}`, token, method: "local", username: null };
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
