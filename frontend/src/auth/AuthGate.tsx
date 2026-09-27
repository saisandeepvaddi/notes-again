import { LoadingState } from "@/components/LoadingState";
import { Spinner } from "@/components/ui/spinner";
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
      <LoadingState label="Checking sign-in" className="grid min-h-dvh place-items-center">
        <Spinner className="text-muted-foreground" />
      </LoadingState>
    );
  }
  if (!user) {
    return <LoginScreen />;
  }
  return <>{children}</>;
}
