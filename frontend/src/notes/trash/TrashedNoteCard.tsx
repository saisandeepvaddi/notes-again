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
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Trash2Icon, UndoIcon } from "lucide-react";
import { useState } from "react";
import { usePermanentDeleteNote } from "../hooks/usePermanentDeleteNote";
import { useRestoreNote } from "../hooks/useRestoreNote";
import type { NoteItem } from "../new-note-form/types";
import type { CardSelection } from "../NoteCard";
import { NoteContent } from "../NoteContent";
import { SelectCheckbox, selectionClickCapture } from "../selection/SelectCheckbox";

interface TrashedNoteCardProps {
  note: NoteItem;
  select?: CardSelection;
}

export function TrashedNoteCard({ note, select }: TrashedNoteCardProps) {
  const { mutateAsync: restoreNote, isPending: isRestoring } = useRestoreNote({
    noteId: note.id,
  });
  const { mutateAsync: permanentlyDeleteNote, isPending: isDeleting } = usePermanentDeleteNote({
    noteId: note.id,
  });
  const [open, setOpen] = useState(false);

  const restore = async () => {
    try {
      await restoreNote();
    } catch (error) {
      console.error("error:", error);
      toast.add({ type: "error", priority: "high", description: "Failed to restore note" });
    }
  };

  const deleteForever = async () => {
    try {
      await permanentlyDeleteNote();
      setOpen(false);
    } catch (error) {
      console.error("error:", error);
      setOpen(false);
      toast.add({ type: "error", priority: "high", description: "Failed to delete note" });
    }
  };

  return (
    <Card
      className={cn(
        "h-fit",
        select?.selected && "bg-primary/5 ring-2 ring-primary",
        select?.selecting && "cursor-pointer",
      )}
      data-selecting={select?.selecting ?? false}
      onClickCapture={select && selectionClickCapture(select.selecting, select.onToggle)}
    >
      <CardHeader className="flex items-center gap-2">
        {select && (
          <SelectCheckbox
            revealOnHover
            label={`Select ${note.name}`}
            checked={select.selected}
            onToggle={select.onToggle}
          />
        )}
        <h2 className="truncate font-serif font-semibold text-sm">{note.name}</h2>
      </CardHeader>
      <CardContent>
        <div className="relative max-h-28 overflow-hidden">
          <NoteContent markdown={note.content} className="text-xs" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-card to-transparent" />
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button size="sm" variant="outline" onClick={restore} disabled={isRestoring}>
          <UndoIcon /> Restore
        </Button>
        <AlertDialog open={open}>
          <AlertDialogTrigger
            render={
              <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
                <Trash2Icon /> Delete Forever
              </Button>
            }
          />
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Trash2Icon />
              </AlertDialogMedia>
              <AlertDialogTitle>Delete forever?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes "{note.name}" and its review history. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setOpen(false)} disabled={isDeleting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={deleteForever} disabled={isDeleting}>
                Delete Forever
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
