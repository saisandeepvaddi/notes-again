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
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { format } from "date-fns";
import { useState } from "react";
import { CreateTokenDialog } from "./CreateTokenDialog";
import type { ApiToken } from "./types";
import { useApiTokens } from "./useApiTokens";
import { useRevokeApiToken } from "./useRevokeApiToken";

const day = (iso: string) => format(new Date(iso), "MMM d, yyyy");

function RevokeButton({ token }: { token: ApiToken }) {
  const [open, setOpen] = useState(false);
  const { mutateAsync, isPending } = useRevokeApiToken();

  const revoke = async () => {
    try {
      await mutateAsync(token.id);
      setOpen(false);
      toast.add({ type: "success", description: `Revoked "${token.name}"` });
    } catch (error) {
      setOpen(false);
      toast.add({
        type: "error",
        priority: "high",
        description: error instanceof Error ? error.message : "Failed to revoke token",
      });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button variant="destructive" size="sm">
            Revoke
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke “{token.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Anything using this token stops working immediately. This can't be undone; you'd need to
            create a new token.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={revoke} disabled={isPending}>
            Revoke token
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ApiTokens() {
  const { data: tokens } = useApiTokens();

  return (
    <section className="flex max-w-xl flex-col gap-3" aria-labelledby="api-tokens-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="api-tokens-heading" className="text-sm font-medium">
            API tokens
          </h2>
          <p className="text-xs text-muted-foreground">
            Let tools like the browser extension save notes to your account. A token can only create
            notes, projects and tags.
          </p>
        </div>
        <CreateTokenDialog />
      </div>

      {tokens.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
          No tokens yet.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center justify-between gap-4 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{token.name}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{token.prefix}…</span>
                  {" · "}created {day(token.created_at)}
                  {" · "}
                  {token.last_used_at ? `last used ${day(token.last_used_at)}` : "never used"}
                  {" · "}
                  {token.expires_at ? `expires ${day(token.expires_at)}` : "never expires"}
                </p>
              </div>
              <RevokeButton token={token} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
