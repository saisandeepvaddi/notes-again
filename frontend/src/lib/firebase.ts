import { type FirebaseApp, initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

// Auth is active only when Firebase is configured. Local dev leaves these unset
// (the backend runs with AUTH_DISABLED=1); a production build without them is a
// misconfiguration, so fail loudly rather than shipping an unauthenticated app.
export const firebaseEnabled = Boolean(config.apiKey && config.authDomain && config.projectId);

if (import.meta.env.PROD && !firebaseEnabled && typeof window !== "undefined") {
  throw new Error(
    "Firebase config missing in production build — set VITE_FIREBASE_API_KEY / " +
      "VITE_FIREBASE_AUTH_DOMAIN / VITE_FIREBASE_PROJECT_ID at build time.",
  );
}

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;

if (firebaseEnabled) {
  app = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
  });
  authInstance = getAuth(app);
}

export const auth = authInstance;

export async function getAuthToken(): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) {
    return null;
  }
  return user.getIdToken();
}
