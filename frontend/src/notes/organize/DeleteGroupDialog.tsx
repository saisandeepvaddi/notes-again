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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useState, type ReactElement } from "react";
import { useDeleteGroup, type GroupKind } from "../hooks/useDeleteGroup";

interface DeleteGroupDialogProps {
  kind: GroupKind;
  id: number;
  name: string;
  noteCount: number;
  // The button that opens the dialog.
  trigger: ReactElement;
}

const plural = (count: number) => `${count.toLocaleString()} note${count === 1 ? "" : "s"}`;

export function DeleteGroupDialog({ kind, id, name, noteCount, trigger }: DeleteGroupDialogProps) {
  const [open, setOpen] = useState(false);
  const [deleteNotes, setDeleteNotes] = useState(false);
  const { mutateAsync: deleteGroup, isPending } = useDeleteGroup(kind);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const searchKey = kind === "project" ? "projectId" : "tagId";
  const isFiltered = useRouterState({
    select: (state) =>
      state.location.pathname === "/notes" &&
      (state.location.search as Record<string, unknown>)[searchKey] === id,
  });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setDeleteNotes(false);
      // The count shown is what "delete its notes" will act on, so make sure
      // it's current (notes are added/trashed elsewhere without touching it).
      void queryClient.invalidateQueries({ queryKey: [kind === "project" ? "projects" : "tags"] });
    }
  };

  const confirm = async () => {
    try {
      const result = await deleteGroup({ id, deleteNotes });
      setOpen(false);
      if (isFiltered) {
        // The list being viewed is filtered by the thing that no longer exists.
        void navigate({ to: "/notes", search: (prev) => ({ ...prev, [searchKey]: undefined }) });
      }
      toast.add({
        type: "success",
        description:
          result.notes_trashed > 0
            ? `Deleted ${kind} "${name}" and moved ${plural(result.notes_trashed)} to Trash`
            : `Deleted ${kind} "${name}"`,
      });
    } catch (error) {
      setOpen(false);
      toast.add({
        type: "error",
        priority: "high",
        description: error instanceof Error ? error.message : `Failed to delete ${kind}`,
      });
    }
  };

  const description =
    noteCount === 0
      ? `The ${kind} is removed. It has no notes.`
      : deleteNotes
        ? `The ${kind} is removed and its ${plural(noteCount)} move to Trash.`
        : kind === "project"
          ? `The project is removed. Its ${plural(noteCount)} stay in All Notes, with no project.`
          : `The tag is removed from its ${plural(noteCount)}. The notes themselves stay.`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            Delete {kind} “{name}”?
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {noteCount > 0 && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border p-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={deleteNotes}
              disabled={isPending}
              onCheckedChange={(checked) => setDeleteNotes(checked === true)}
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Also delete its {plural(noteCount)}</span>
              <span className="text-xs text-muted-foreground">
                They move to Trash, where you can restore them
                {kind === "project" ? " (without a project)" : " (without this tag)"}.
              </span>
            </span>
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm} disabled={isPending}>
            {deleteNotes && noteCount > 0
              ? `Delete ${kind} & ${plural(noteCount)}`
              : `Delete ${kind}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
