import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { noteTitleText } from "@/notes/NoteTitle";
import {
  useConnectSync,
  useDisconnectSync,
  useIsDesktop,
  useRunSync,
  useSyncConflicts,
  syncedAgo,
  useSyncStatus,
  type SyncStatus,
} from "@/sync/syncApi";
import { CloudSlashIcon, WarningIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { type FormEvent, useId, useState } from "react";
import { parseConnectLink } from "../api-tokens/connectLink";

type Method = "password" | "token";

const METHODS: { value: Method; label: string }[] = [
  { value: "password", label: "Username and password" },
  { value: "token", label: "App token" },
];

function MethodPicker({ value, onChange }: { value: Method; onChange: (value: Method) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Sign in with"
      className="inline-flex w-fit rounded-lg bg-muted p-[3px]"
    >
      {METHODS.map((method) => (
        <button
          key={method.value}
          type="button"
          role="radio"
          aria-checked={value === method.value}
          onClick={() => onChange(method.value)}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium text-foreground/60 transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
            value === method.value && "bg-background text-foreground shadow-sm",
          )}
        >
          {method.label}
        </button>
      ))}
    </div>
  );
}

function Description({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function Field({ label, children, id }: { label: string; children: React.ReactNode; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function ConnectForm() {
  const id = useId();
  const [method, setMethod] = useState<Method>("password");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useConnectSync();

  const changeToken = (value: string) => {
    const link = parseConnectLink(value);
    if (link) {
      setUrl(link.server);
      setToken(link.token);
    } else {
      setToken(value);
    }
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await mutateAsync(
        method === "password"
          ? { url, username: username.trim(), password }
          : { url, token: token.trim() },
      );
      setPassword("");
      toast.add({ type: "success", description: "Connected. Your first sync is running." });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect. Try again.");
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Field label="Server address" id={`${id}-url`}>
        <Input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          placeholder="https://notes.example.com"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </Field>
      <MethodPicker value={method} onChange={setMethod} />
      {method === "password" ? (
        <>
          <Field label="Username" id={`${id}-username`}>
            <Input
              id={`${id}-username`}
              autoComplete="username"
              autoCapitalize="none"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Password" id={`${id}-password`}>
            <Input
              id={`${id}-password`}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Token or connect link" id={`${id}-token`}>
            <Input
              id={`${id}-token`}
              autoCapitalize="none"
              spellCheck={false}
              placeholder="nal_… or notesagain://connect?…"
              required
              value={token}
              onChange={(e) => changeToken(e.target.value)}
              className="font-mono"
            />
          </Field>
          <Description>
            For servers that sign in through Firebase, a proxy or Cloudflare Access. Create a
            full-access token in the server's Settings → API tokens and paste it, or its connect
            link, here.
          </Description>
        </>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Connecting…" : "Connect"}
      </Button>
    </form>
  );
}

function DisconnectButton({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const { mutateAsync, isPending } = useDisconnectSync();

  const disconnect = async () => {
    try {
      await mutateAsync();
      setOpen(false);
      toast.add({
        type: "success",
        description: "Disconnected. Your notes stay on this computer.",
      });
    } catch (error) {
      setOpen(false);
      toast.add({
        type: "error",
        priority: "high",
        description: error instanceof Error ? error.message : "Couldn't disconnect",
      });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline">Disconnect</Button>} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop syncing with {url}?</AlertDialogTitle>
          <AlertDialogDescription>
            Both this computer and the server keep every note they have now. Changes stop moving
            between them until you connect again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={disconnect} disabled={isPending}>
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConflictList() {
  const { data: conflicts = [] } = useSyncConflicts();
  if (conflicts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-medium">
        <WarningIcon className="size-3.5 text-destructive" />
        Changed in two places
      </h3>
      <Description>
        These notes were edited here and somewhere else before they could sync. Open one to compare
        the two versions and choose what to keep.
      </Description>
      <ul className="divide-y rounded-md border">
        {conflicts.map((conflict) => (
          <li key={conflict.note_id}>
            <Link
              to="/notes/$noteId"
              params={{ noteId: String(conflict.note_id) }}
              className="flex items-center justify-between gap-4 p-3 text-sm hover:bg-muted/40"
            >
              <span className="truncate font-medium">
                {noteTitleText(conflict.name).trim() || "Untitled"}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDistanceToNowStrict(new Date(conflict.detected_at), { addSuffix: true })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConnectedStatus({ status }: { status: SyncStatus }) {
  const { mutateAsync, isPending } = useRunSync();
  const url = status.url ?? "your server";
  const lastSynced = status.last_synced_at ? syncedAgo(status.last_synced_at) : null;

  const syncNow = async () => {
    try {
      const next = await mutateAsync();
      if (next.last_error) {
        toast.add({ type: "error", description: next.last_error });
      }
    } catch (error) {
      toast.add({
        type: "error",
        description: error instanceof Error ? error.message : "Couldn't sync",
      });
    }
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm">
          Syncing with <span className="font-medium break-all">{url}</span>
        </p>
        <Description>
          {status.username ? `Signed in as ${status.username}. ` : "Using an app token. "}
          {status.syncing || isPending
            ? "Syncing now…"
            : lastSynced
              ? `Last synced ${lastSynced}.`
              : "Not synced yet."}
        </Description>
      </div>
      {status.last_error ? (
        <Alert>
          <CloudSlashIcon />
          <AlertTitle>Last sync didn't finish</AlertTitle>
          <AlertDescription>
            {status.last_error} Your notes are safe on this computer.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex gap-2">
        <Button onClick={syncNow} disabled={isPending || status.syncing}>
          {isPending || status.syncing ? "Syncing…" : "Sync now"}
        </Button>
        <DisconnectButton url={url} />
      </div>
      <ConflictList />
    </>
  );
}

export function SyncSettings() {
  const isDesktop = useIsDesktop();
  const { data: status } = useSyncStatus();

  let body: React.ReactNode;
  if (!isDesktop) {
    body = (
      <Description>
        Sync is part of the desktop app. It keeps a copy of your notes on your computer that works
        offline and syncs with this server when it can.
      </Description>
    );
  } else if (!status) {
    body = null;
  } else if (status.connected) {
    body = <ConnectedStatus status={status} />;
  } else {
    body = (
      <>
        <Description>
          Your notes live on this computer and work offline. Connect your self-hosted Notes Again
          server to keep this computer, the web app and your phone in sync.
        </Description>
        <ConnectForm />
      </>
    );
  }

  return (
    <section className="flex max-w-md flex-col gap-3" aria-labelledby="sync-heading">
      <h2 id="sync-heading" className="text-sm font-medium">
        Sync
      </h2>
      {body}
    </section>
  );
}
