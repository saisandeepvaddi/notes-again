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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useEmptyTrash } from "../hooks/useEmptyTrash";
import { VirtualNoteGrid } from "../VirtualNoteGrid";
import { TrashedNoteCard } from "./TrashedNoteCard";
import { useTrashedNotes } from "./useTrashedNotes";

export function TrashList() {
  const { notes, total, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useTrashedNotes();
  const { mutateAsync: emptyTrash, isPending: isEmptying } = useEmptyTrash();
  const [open, setOpen] = useState(false);

  const clearAll = async () => {
    try {
      await emptyTrash();
      setOpen(false);
    } catch (error) {
      console.error("error:", error);
      setOpen(false);
      toast.add({ type: "error", priority: "high", description: "Failed to empty trash" });
    }
  };

  if (isPending) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner /> Loading...
      </div>
    );
  }

  if (total === 0) {
    return <p className="text-muted-foreground">Trash is empty.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString()} note{total === 1 ? "" : "s"} in trash
        </p>
        <AlertDialog open={open}>
          <AlertDialogTrigger
            render={
              <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
                <Trash2Icon /> Empty Trash
              </Button>
            }
          />
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Trash2Icon />
              </AlertDialogMedia>
              <AlertDialogTitle>Empty trash?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes all {total.toLocaleString()} note{total === 1 ? "" : "s"}{" "}
                in the trash and their review history. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setOpen(false)} disabled={isEmptying}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={clearAll} disabled={isEmptying}>
                Empty Trash
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <VirtualNoteGrid
        items={notes}
        renderItem={(note) => <TrashedNoteCard note={note} />}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />
    </div>
  );
}
