import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { onIdTokenChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { auth, firebaseEnabled } from "@/lib/firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseEnabled);

  useEffect(() => {
    if (!auth) {
      return;
    }
    return onIdTokenChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const value: AuthState = {
    user,
    loading,
    signIn: async (email, password) => {
      if (!auth) {
        return;
      }
      await signInWithEmailAndPassword(auth, email, password);
    },
    signOutUser: async () => {
      if (!auth) {
        return;
      }
      await signOut(auth);
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
