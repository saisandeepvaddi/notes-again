import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "firebase/auth";
import { getFirebaseAuth, initFirebase, signInWithFirebase } from "@/lib/firebase";
import { UNAUTHORIZED_EVENT } from "@/utils/fetchers";
import {
  AUTH_STATUS_KEY,
  type AuthStatus,
  localSignIn,
  localSignOut,
  useAuthStatus,
} from "./authStatus";

interface AuthState {
  status: AuthStatus | undefined;
  error: Error | null;
  loading: boolean;
  firebaseUser: User | null;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: status, error: statusError, isPending, refetch } = useAuthStatus();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [firebaseError, setFirebaseError] = useState<Error | null>(null);

  const mode = status?.mode;
  const firebaseConfig = status?.firebase;

  useEffect(() => {
    if (mode !== "firebase") {
      return;
    }
    if (!firebaseConfig) {
      setFirebaseError(
        new Error(
          "The server is set to Firebase sign-in but its VITE_FIREBASE_* settings are missing.",
        ),
      );
      return;
    }
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    initFirebase(firebaseConfig)
      .then((auth) => {
        if (cancelled) {
          return;
        }
        unsubscribe = auth.onIdTokenChanged((user) => {
          setFirebaseUser(user);
          setFirebaseReady(true);
        });
      })
      .catch((error: unknown) => {
        setFirebaseError(error instanceof Error ? error : new Error("Couldn't load Firebase"));
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [mode, firebaseConfig]);

  useEffect(() => {
    const onUnauthorized = () => {
      if (mode === "firebase") {
        void getFirebaseAuth()
          ?.signOut()
          .catch(() => {});
      } else {
        void queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY });
      }
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [mode, queryClient]);

  const resetAfterAuthChange = async () => {
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== AUTH_STATUS_KEY[0] });
    await queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY });
  };

  const value: AuthState = {
    status,
    error: statusError ?? firebaseError,
    loading: isPending || (mode === "firebase" && !firebaseReady && !firebaseError),
    firebaseUser,
    signIn: async (identifier, password) => {
      if (mode === "firebase") {
        await signInWithFirebase(identifier, password);
        return;
      }
      await localSignIn(identifier, password);
      await resetAfterAuthChange();
    },
    signOutUser: async () => {
      if (mode === "proxy" || mode === "cloudflare-access") {
        if (status?.logout_url) {
          window.location.href = status.logout_url;
        }
        return;
      }
      if (mode === "firebase") {
        await getFirebaseAuth()?.signOut();
        queryClient.removeQueries({
          predicate: (query) => query.queryKey[0] !== AUTH_STATUS_KEY[0],
        });
        return;
      }
      await localSignOut();
      await resetAfterAuthChange();
    },
    retry: () => {
      void refetch();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
