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
    // Usually resolves from Firebase's local session cache in well under the
    // reveal delay, so this is normally never seen; a slow check gets a quiet
    // spinner on blank paper rather than a word in the middle of the screen.
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
