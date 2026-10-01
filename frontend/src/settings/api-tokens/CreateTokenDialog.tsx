import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { CheckIcon, CopyIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { EXPIRY_OPTIONS, SCOPE_OPTIONS, type CreatedApiToken, type TokenScope } from "./types";
import { useCreateApiToken } from "./useCreateApiToken";

const DEFAULT_SCOPE: TokenScope = "capture";
const DEFAULT_EXPIRY = "365";

const scopeOption = (scope: TokenScope) =>
  SCOPE_OPTIONS.find((option) => option.value === scope) ?? SCOPE_OPTIONS[0];

export function CreateTokenDialog() {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<TokenScope>(DEFAULT_SCOPE);
  const [name, setName] = useState(scopeOption(DEFAULT_SCOPE).defaultName);
  const [expiry, setExpiry] = useState(DEFAULT_EXPIRY);
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const [copied, setCopied] = useState(false);
  const { mutateAsync, isPending } = useCreateApiToken();

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setScope(DEFAULT_SCOPE);
      setName(scopeOption(DEFAULT_SCOPE).defaultName);
      setExpiry(DEFAULT_EXPIRY);
      setCreated(null);
      setCopied(false);
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    try {
      setCreated(
        await mutateAsync({
          name: name.trim(),
          expiresInDays: expiry === "never" ? null : Number(expiry),
          scope,
        }),
      );
    } catch (error) {
      toast.add({
        type: "error",
        priority: "high",
        description: error instanceof Error ? error.message : "Failed to create token",
      });
    }
  };

  const changeScope = (next: TokenScope) => {
    if (name.trim() === scopeOption(scope).defaultName) {
      setName(scopeOption(next).defaultName);
    }
    setScope(next);
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
    } catch {
      toast.add({
        type: "error",
        description: "Couldn't copy. Select the token and copy it by hand.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon /> Create token
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your token now</DialogTitle>
              <DialogDescription>
                This is the only time it's shown.{" "}
                {created.scope === "app"
                  ? "Paste it into the mobile app along with this server's address."
                  : "Paste it into the extension's options page."}{" "}
                If you lose it, revoke it and create a new one.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Input
                readOnly
                value={created.token}
                aria-label="API token"
                className="font-mono"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button variant="outline" onClick={copy} aria-label="Copy token">
                {copied ? <CheckIcon /> : <CopyIcon />}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <DialogHeader>
              <DialogTitle>Create an API token</DialogTitle>
              <DialogDescription>
                For tools that can't sign in, like the browser extension or the mobile app.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5 text-xs font-medium">
              Access
              <Select
                items={SCOPE_OPTIONS}
                value={scope}
                onValueChange={(value) => value && changeScope(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="font-normal text-muted-foreground">{scopeOption(scope).description}</p>
            </div>
            <label className="grid gap-1.5 text-xs font-medium">
              Name
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                autoFocus
              />
            </label>
            <div className="grid gap-1.5 text-xs font-medium">
              Expires
              <Select
                items={EXPIRY_OPTIONS}
                value={expiry}
                onValueChange={(value) => value && setExpiry(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending || !name.trim()}>
                {isPending ? "Creating…" : "Create token"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
