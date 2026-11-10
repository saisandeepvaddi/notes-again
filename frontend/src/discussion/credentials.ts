import { CredentialsSchema, DEFAULT_CREDENTIALS, type Credentials } from "./core";

export interface CredentialVault {
  load(): Promise<string | null>;
  save(value: string): Promise<void>;
  clear(): Promise<void>;
}
interface Snapshot {
  config: Credentials;
  ready: boolean;
  remembered: boolean;
  error: string | null;
}
const initial: Snapshot = {
  config: DEFAULT_CREDENTIALS,
  ready: false,
  remembered: false,
  error: null,
};
let snapshot = initial;
let vault: CredentialVault | null = null;
let initialization: Promise<void> | null = null;
const listeners = new Set<() => void>();
const publish = (next: Snapshot) => {
  snapshot = next;
  listeners.forEach((listener) => listener());
};
export const credentialSnapshot = () => snapshot;
export const credentialServerSnapshot = () => initial;
export function subscribeCredentials(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function initializeCredentials(storage: CredentialVault | null) {
  if (initialization) return initialization;
  vault = storage;
  initialization = (async () => {
    try {
      const raw = await vault?.load();
      const config = raw ? CredentialsSchema.parse(JSON.parse(raw)) : DEFAULT_CREDENTIALS;
      publish({ config, ready: true, remembered: !!raw, error: null });
    } catch {
      publish({
        config: DEFAULT_CREDENTIALS,
        ready: true,
        remembered: false,
        error: "Could not read saved credentials. You can enter them again or clear the saved key.",
      });
    }
  })();
  return initialization;
}

export async function saveCredentials(value: Credentials, remember: boolean) {
  const config = CredentialsSchema.parse(value);
  if (remember && !vault)
    throw new Error("Secure credential storage is unavailable. Use a session-only key instead.");
  if (remember) await vault!.save(JSON.stringify(config));
  else await vault?.clear();
  publish({ config, ready: true, remembered: remember, error: null });
}

export async function forgetCredentials() {
  await vault?.clear();
  publish({ config: DEFAULT_CREDENTIALS, ready: true, remembered: false, error: null });
}
