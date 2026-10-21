import { NoteGridSkeleton } from "@/components/PageSkeletons";
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
import { toast } from "@/components/ui/toast";
import { TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useEmptyTrash } from "../hooks/useEmptyTrash";
import { fetchNoteIds } from "../selection/fetchNoteIds";
import { SelectionBar } from "../selection/SelectionBar";
import { TrashSelectionActions } from "../selection/TrashSelectionActions";
import { useNoteSelection } from "../selection/useNoteSelection";
import { VirtualNoteGrid } from "../VirtualNoteGrid";
import { TrashedNoteCard } from "./TrashedNoteCard";
import { useTrashedNotes } from "./useTrashedNotes";

export function TrashList() {
  const { notes, total, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useTrashedNotes();
  const { mutateAsync: emptyTrash, isPending: isEmptying } = useEmptyTrash();
  const [open, setOpen] = useState(false);
  const selection = useNoteSelection(notes.map((note) => note.id));
  const selectAll = async () => {
    const { ids } = await fetchNoteIds({ deleted: true });
    selection.replace(ids);
  };

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
    return <NoteGridSkeleton label="Loading trash" />;
  }

  if (total === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed px-6 py-10">
        <TrashIcon className="size-6 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-base font-semibold tracking-tight">Trash is empty</h2>
          <p className="max-w-[60ch] text-sm text-muted-foreground">
            Notes you delete land here first, so nothing is lost by accident.
          </p>
        </div>
      </div>
    );
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
                <TrashIcon /> Empty Trash
              </Button>
            }
          />
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogMedia>
                <TrashIcon />
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
              <AlertDialogAction variant="destructive" onClick={clearAll} disabled={isEmptying}>
                Empty Trash
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <VirtualNoteGrid
        items={notes}
        renderItem={(note) => (
          <TrashedNoteCard
            note={note}
            select={{
              selected: selection.isSelected(note.id),
              selecting: selection.selectionMode,
              onToggle: (range) => selection.toggle(note.id, range),
            }}
          />
        )}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />
      {selection.selectionMode && (
        <SelectionBar
          count={selection.count}
          total={total}
          onSelectAll={selectAll}
          onClear={selection.clear}
        >
          <TrashSelectionActions
            ids={selection.ids}
            count={selection.count}
            onDone={selection.clear}
          />
        </SelectionBar>
      )}
    </div>
  );
}
