import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash2Icon, UndoIcon } from "lucide-react";
import { useState } from "react";
import { notesLabel, useRunBulk } from "./useRunBulk";

interface TrashSelectionActionsProps {
  ids: () => number[];
  count: number;
  onDone: () => void;
}

export function TrashSelectionActions({ ids, count, onDone }: TrashSelectionActionsProps) {
  const { run, isPending } = useRunBulk(ids, onDone);
  const [confirming, setConfirming] = useState(false);
  const label = notesLabel(count);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => run({ action: "restore" }, (n) => `Restored ${notesLabel(n)}`)}
      >
        <UndoIcon /> Restore
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogTrigger
          render={
            <Button type="button" size="sm" variant="destructive">
              <Trash2Icon /> Delete forever
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete {label} forever?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {label} along with the review history. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={async () => {
                await run({ action: "permanent" }, (n) => `Permanently deleted ${notesLabel(n)}`);
                setConfirming(false);
              }}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
