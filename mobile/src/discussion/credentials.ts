import * as SecureStore from "expo-secure-store";
import { useEffect, useSyncExternalStore } from "react";
import { credentialSnapshot, credentialServerSnapshot, initializeCredentials, subscribeCredentials, type CredentialVault } from "@web/discussion/credentials";

const KEY = "notes-again.discussion.v1";
const vault: CredentialVault = {
  load: () => SecureStore.getItemAsync(KEY),
  save: (value) => SecureStore.setItemAsync(KEY, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

export function useDiscussionCredentials() {
  const state = useSyncExternalStore(subscribeCredentials, credentialSnapshot, credentialServerSnapshot);
  useEffect(() => { void initializeCredentials(vault); }, []);
  return state;
}
