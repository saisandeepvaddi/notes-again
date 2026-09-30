import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import LoginScreen from "./LoginScreen";
import ExternalSignInScreen from "./ExternalSignInScreen";
import SetupScreen from "./SetupScreen";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { status, error, loading, firebaseUser, retry } = useAuth();

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-sm font-medium">Can't reach the Notes Again server</p>
          <p className="text-xs text-muted-foreground">{error.message}</p>
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (loading || !status) {
    return (
      <LoadingState label="Checking sign-in" className="grid min-h-dvh place-items-center">
        <Spinner className="text-muted-foreground" />
      </LoadingState>
    );
  }
  if (status.mode === "firebase") {
    return firebaseUser ? <>{children}</> : <LoginScreen mode="firebase" />;
  }
  if (status.mode === "proxy" || status.mode === "cloudflare-access") {
    return status.authenticated ? <>{children}</> : <ExternalSignInScreen mode={status.mode} />;
  }
  if (status.mode === "local") {
    if (!status.authenticated) {
      return <LoginScreen mode="local" firstLaunch={status.setup_required} />;
    }
    if (status.setup_required) {
      return <SetupScreen username={status.username ?? "admin"} />;
    }
  }
  return <>{children}</>;
}
