import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { hasChanges, lineDiff } from "./lineDiff";
import { useRestoreRevision, useRevision, useRevisionList } from "./useRevisions";

interface Props {
  noteId: number;
  name: string;
  content: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  onRestored(text: { name: string; content: string }): void;
}

const formatTime = (value: string) =>
  new Date(`${value.replace(" ", "T")}Z`).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

export function RevisionsPanel({ noteId, name, content, open, onOpenChange, onRestored }: Props) {
  const list = useRevisionList(noteId, open);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const revision = useRevision(noteId, selected);
  const restore = useRestoreRevision(noteId);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setConfirming(false);
    }
  }, [open]);

  const diff = useMemo(
    () => (revision.data ? lineDiff(revision.data.content, content) : []),
    [revision.data, content],
  );
  const nameChanged = !!revision.data && revision.data.name !== name;

  const doRestore = async () => {
    if (selected === null) return;
    try {
      const restored = await restore.mutateAsync(selected);
      onRestored({ name: restored.name, content: restored.content });
      toast.add({
        type: "success",
        description: "Earlier version restored. Your previous text is in History.",
      });
      onOpenChange(false);
    } catch {
      toast.add({
        type: "error",
        description: "Could not restore that version. Nothing was changed.",
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="shrink-0 pr-12">
          <SheetTitle>History</SheetTitle>
          <SheetDescription>
            Earlier saved versions of this note's text. Restoring keeps your current text in
            History.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6">
          {list.error && (
            <Alert variant="destructive">
              <AlertDescription>Could not load history.</AlertDescription>
            </Alert>
          )}
          {list.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No earlier versions yet. A version is kept before an edit when the note hasn't been
              snapshotted for ten minutes; the latest 50 are kept.
            </p>
          )}
          <ul className="flex flex-col gap-1" aria-label="Earlier versions">
            {list.data?.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={selected === item.id}
                  onClick={() => {
                    setSelected(item.id);
                    setConfirming(false);
                  }}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted",
                    selected === item.id && "bg-muted",
                  )}
                >
                  <span>{formatTime(item.created_at)}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.characters.toLocaleString()} characters
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected !== null && revision.isPending && (
            <p role="status" className="text-xs text-muted-foreground">
              Loading version…
            </p>
          )}
          {revision.data && (
            <section
              className="flex min-w-0 flex-col gap-3"
              aria-label="Comparison with current text"
            >
              <p className="text-xs text-muted-foreground">
                Compared with your current text: <span className="text-destructive">removed</span>{" "}
                lines are only in the earlier version, <span className="text-primary">added</span>{" "}
                lines are only in the current one.
              </p>
              {nameChanged && (
                <p className="text-sm">
                  Title then: <strong>{revision.data.name || "Untitled"}</strong>
                </p>
              )}
              {!hasChanges(diff) && !nameChanged ? (
                <p className="text-sm text-muted-foreground">Identical to the current text.</p>
              ) : (
                <pre className="max-h-96 overflow-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap wrap-break-word">
                  {diff.map((line, index) => (
                    <div
                      key={index}
                      className={cn(
                        line.kind === "removed" && "bg-destructive/10 text-destructive",
                        line.kind === "added" && "bg-primary/10 text-primary",
                      )}
                    >
                      {line.kind === "removed" ? "− " : line.kind === "added" ? "+ " : "  "}
                      {line.text}
                    </div>
                  ))}
                </pre>
              )}
              {confirming ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => void doRestore()} disabled={restore.isPending}>
                    {restore.isPending ? "Restoring…" : "Restore this version"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setConfirming(false)}
                    disabled={restore.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button variant="outline" onClick={() => setConfirming(true)}>
                  Restore…
                </Button>
              )}
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
