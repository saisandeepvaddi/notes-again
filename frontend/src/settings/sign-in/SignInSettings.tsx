import { type FormEvent, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { FIREBASE_DOCS_URL, useUpdateLocalAuth } from "@/auth/authStatus";
import { CredentialsForm } from "@/auth/CredentialsForm";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

function TurnOffLoginButton() {
  const { mutateAsync, isPending } = useUpdateLocalAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await mutateAsync({ enabled: false, currentPassword: password });
      setOpen(false);
      toast.add({ type: "success", description: "Login turned off" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't turn login off");
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setPassword("");
        setError(null);
      }}
    >
      <AlertDialogTrigger
        render={
          <Button variant="outline" size="sm">
            Turn off login
          </Button>
        }
      />
      <AlertDialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off login?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone who can open this address will be able to read and change your notes. Only do
              this if the server is private to you or sits behind another login.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            aria-label="Current password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={isPending}>
              Cancel
            </AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={isPending}>
              Turn off login
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Description({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export function SignInSettings() {
  const { status, firebaseUser } = useAuth();
  const { mutateAsync } = useUpdateLocalAuth();

  if (!status) {
    return null;
  }

  let body: React.ReactNode;
  if (status.configured_mode === "firebase") {
    body = (
      <Description>
        Signed in with Firebase as {firebaseUser?.email ?? "an unknown account"}. Accounts are
        managed in the Firebase console; see the{" "}
        <a href={FIREBASE_DOCS_URL} target="_blank" rel="noreferrer" className="underline">
          Firebase setup guide
        </a>
        .
      </Description>
    );
  } else if (status.configured_mode === "none") {
    body = (
      <Description>
        Login is turned off by the server's <code>AUTH_MODE=none</code> setting. Remove it and
        restart the server to sign in with a username and password.
      </Description>
    );
  } else if (status.mode === "none") {
    body = (
      <>
        <Description>
          Login is off. Anyone who can open this address can read and change your notes. Set a
          username and password to turn it back on.
        </Description>
        <CredentialsForm
          initialUsername="admin"
          submitLabel="Turn on login"
          onSubmit={async ({ username, password }) => {
            await mutateAsync({ enabled: true, username, password });
            toast.add({ type: "success", description: "Login turned on" });
          }}
        />
      </>
    );
  } else {
    body = (
      <>
        <Description>
          Signed in as {status.username}. Changing these signs out every other browser.
        </Description>
        <CredentialsForm
          key={status.username}
          initialUsername={status.username ?? ""}
          askCurrentPassword
          submitLabel="Update sign-in"
          onSubmit={async ({ username, password, currentPassword }) => {
            await mutateAsync({ enabled: true, username, password, currentPassword });
            toast.add({ type: "success", description: "Sign-in updated" });
          }}
        />
        <div className="flex items-center justify-between gap-4 border-t pt-3">
          <Description>Don't need a login? Turn it off for this server.</Description>
          <TurnOffLoginButton />
        </div>
      </>
    );
  }

  return (
    <section className="flex max-w-md flex-col gap-3" aria-labelledby="sign-in-heading">
      <h2 id="sign-in-heading" className="text-sm font-medium">
        Sign-in
      </h2>
      {body}
    </section>
  );
}
