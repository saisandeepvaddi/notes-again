import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FIREBASE_DOCS_URL, useUpdateLocalAuth } from "./authStatus";
import { CredentialsForm } from "./CredentialsForm";

export default function SetupScreen({ username }: { username: string }) {
  const { mutateAsync } = useUpdateLocalAuth();
  const [disabling, setDisabling] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  async function turnLoginOff() {
    setDisableError(null);
    setDisabling(true);
    try {
      await mutateAsync({ enabled: false });
    } catch (err) {
      setDisableError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      setDisabling(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>How do you want to sign in?</CardTitle>
          <CardDescription>
            You signed in with a temporary password. Pick how this server should be protected. You
            can change it later in Settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="password">
            <TabsList className="mb-4">
              <TabsTrigger value="password">Username & password</TabsTrigger>
              <TabsTrigger value="none">No login</TabsTrigger>
              <TabsTrigger value="firebase">Firebase</TabsTrigger>
            </TabsList>
            <TabsContent value="password">
              <CredentialsForm
                initialUsername={username}
                submitLabel="Save and continue"
                onSubmit={async ({ username: nextUsername, password }) => {
                  await mutateAsync({ enabled: true, username: nextUsername, password });
                }}
              />
            </TabsContent>
            <TabsContent value="none" className="flex flex-col gap-3">
              <p className="text-sm">
                Anyone who can open this address can read and change your notes.
              </p>
              <p className="text-xs text-muted-foreground">
                Only pick this when the server is reachable from this computer alone, or sits behind
                something that already asks for a login, such as a VPN or your reverse proxy. You
                can turn login back on in Settings.
              </p>
              {disableError ? <p className="text-sm text-destructive">{disableError}</p> : null}
              <Button
                variant="outline"
                className="self-start"
                disabled={disabling}
                onClick={() => void turnLoginOff()}
              >
                {disabling ? "Saving…" : "Continue without login"}
              </Button>
            </TabsContent>
            <TabsContent value="firebase" className="flex flex-col gap-3">
              <p className="text-sm">Sign in with accounts you manage in a Firebase project.</p>
              <p className="text-xs text-muted-foreground">
                This needs a Firebase project and a few server settings, then a restart with{" "}
                <code>AUTH_MODE=firebase</code>. Until then, this server keeps using the temporary
                password.
              </p>
              <Button
                variant="outline"
                className="self-start"
                nativeButton={false}
                render={<a href={FIREBASE_DOCS_URL} target="_blank" rel="noreferrer" />}
              >
                Open the Firebase setup guide
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
