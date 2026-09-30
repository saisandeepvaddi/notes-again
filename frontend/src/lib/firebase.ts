import type { Auth } from "firebase/auth";

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
}

let authInstance: Auth | null = null;

export async function initFirebase(config: FirebaseWebConfig): Promise<Auth> {
  if (authInstance) {
    return authInstance;
  }
  const [{ initializeApp }, { getAuth }] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
  ]);
  authInstance = getAuth(initializeApp(config));
  return authInstance;
}

export function getFirebaseAuth(): Auth | null {
  return authInstance;
}

export async function signInWithFirebase(email: string, password: string) {
  if (!authInstance) {
    throw new Error("Firebase isn't initialised");
  }
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  await signInWithEmailAndPassword(authInstance, email, password);
}

export async function getAuthToken(): Promise<string | null> {
  const user = authInstance?.currentUser;
  if (!user) {
    return null;
  }
  return user.getIdToken();
}
