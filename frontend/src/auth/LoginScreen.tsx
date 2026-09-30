import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "./AuthProvider";

function firebaseMessageFor(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "That doesn't look like an email address.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Wrong email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again later.";
    default:
      return "Couldn't sign in. Try again.";
  }
}

function messageFor(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return firebaseMessageFor(String(error.code));
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Couldn't sign in. Try again.";
}

interface LoginScreenProps {
  mode: "local" | "firebase";
  firstLaunch?: boolean;
}

export default function LoginScreen({ mode, firstLaunch = false }: LoginScreenProps) {
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState(firstLaunch ? "admin" : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isLocal = mode === "local";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(identifier, password);
    } catch (err) {
      setError(messageFor(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Notes Again</CardTitle>
          <CardDescription>
            {firstLaunch
              ? "First launch: sign in as admin with the password printed in the server logs. You'll choose your own sign-in next."
              : "Sign in to continue."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <Input
              type={isLocal ? "text" : "email"}
              autoComplete="username"
              autoCapitalize="none"
              placeholder={isLocal ? "Username" : "Email"}
              aria-label={isLocal ? "Username" : "Email"}
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              aria-label="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
