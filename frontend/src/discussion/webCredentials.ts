import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useSyncExternalStore } from "react";
import {
  credentialServerSnapshot,
  credentialSnapshot,
  initializeCredentials,
  subscribeCredentials,
  type CredentialVault,
} from "./credentials";

const vault: CredentialVault = {
  load: () => invoke<string | null>("read_ai_key"),
  save: (value) => invoke("write_ai_key", { value }),
  clear: () => invoke("forget_ai_key"),
};

export function useCredentials() {
  const state = useSyncExternalStore(
    subscribeCredentials,
    credentialSnapshot,
    credentialServerSnapshot,
  );
  useEffect(() => {
    void initializeCredentials(isTauri() ? vault : null);
  }, []);
  return { ...state, canRemember: isTauri() };
}
