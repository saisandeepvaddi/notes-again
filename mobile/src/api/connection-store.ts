import * as SecureStore from "expo-secure-store";
import { z } from "zod";

export const ConnectionSchema = z.object({
  serverUrl: z.string(),
  token: z.string().nullable(),
  method: z.enum(["password", "token", "open"]),
  username: z.string().nullable().default(null),
});
export type Connection = z.infer<typeof ConnectionSchema>;

const KEY = "notes-again.connection";

const storage = {
  get: (): Promise<string | null> =>
    process.env.EXPO_OS === "web"
      ? Promise.resolve(globalThis.localStorage?.getItem(KEY) ?? null)
      : SecureStore.getItemAsync(KEY),
  set: (value: string): Promise<void> =>
    process.env.EXPO_OS === "web"
      ? Promise.resolve(globalThis.localStorage?.setItem(KEY, value))
      : SecureStore.setItemAsync(KEY, value),
  remove: (): Promise<void> =>
    process.env.EXPO_OS === "web"
      ? Promise.resolve(globalThis.localStorage?.removeItem(KEY))
      : SecureStore.deleteItemAsync(KEY),
};

let current: Connection | null = null;

export const currentConnection = () => current;

export async function loadConnection(): Promise<Connection | null> {
  try {
    const raw = await storage.get();
    current = raw ? ConnectionSchema.parse(JSON.parse(raw)) : null;
  } catch {
    current = null;
  }
  return current;
}

export async function saveConnection(connection: Connection) {
  await storage.set(JSON.stringify(connection));
  current = connection;
}

export async function clearConnection() {
  await storage.remove();
  current = null;
}
