import type { ReactNode } from "react";
import { firebaseEnabled } from "@/lib/firebase";
import { useAuth } from "./AuthProvider";
import LoginScreen from "./LoginScreen";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (!firebaseEnabled) {
    return <>{children}</>;
  }
  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Loading…</div>
    );
  }
  if (!user) {
    return <LoginScreen />;
  }
  return <>{children}</>;
}
